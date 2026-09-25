import { and, asc, eq, sql } from "drizzle-orm";
import type { Standing } from "../../shared/enums";
import { OUTSTANDING_LOAN_STATUSES } from "../../shared/enums";
import { outstanding } from "../../shared/domain/loans";
import { creditScore, loanEligibility, welfareRemaining } from "../../shared/domain/members";
import { currentPrice, sharesValueMinor } from "../../shared/domain/shares";
import type { Db } from "../db/client";
import { claims, contributions, loans, memberships, shareEntries } from "../db/schema";
import type { Tenant } from "../lib/context";
import { notFound } from "../lib/http";
import { loadSharePrices } from "./savings";

/**
 * Everything the app needs to know about one member's financial position,
 * computed from normalized tables with a handful of indexed queries.
 */
export async function memberSnapshot(db: Db, tenant: Tenant, membershipId: string, asOf: Date, opts: { excludeLoanId?: string } = {}) {
  const [member] = await db.select().from(memberships).where(and(eq(memberships.tenantId, tenant.id), eq(memberships.id, membershipId)));
  if (!member) throw notFound("Member");

  const [contribs, memberLoans, shareRow, prices, claimRows] = await Promise.all([
    db
      .select({ id: contributions.id, period: contributions.period, amountMinor: contributions.amountMinor, premiumMinor: contributions.premiumMinor, status: contributions.status, paidOn: contributions.paidOn, method: contributions.method })
      .from(contributions)
      .where(and(eq(contributions.tenantId, tenant.id), eq(contributions.membershipId, membershipId)))
      .orderBy(asc(contributions.period)),
    db.select().from(loans).where(and(eq(loans.tenantId, tenant.id), eq(loans.membershipId, membershipId))).orderBy(sql`${loans.createdAt} desc`),
    db
      .select({ micro: sql<string>`coalesce(sum(${shareEntries.microShares}), 0)` })
      .from(shareEntries)
      .where(and(eq(shareEntries.tenantId, tenant.id), eq(shareEntries.membershipId, membershipId))),
    loadSharePrices(db, tenant.id),
    db
      .select({ type: claims.type, amountMinor: claims.amountApprovedMinor, createdAt: claims.createdAt, status: claims.status })
      .from(claims)
      .where(and(eq(claims.tenantId, tenant.id), eq(claims.membershipId, membershipId))),
  ]);

  const s = tenant.settings;
  const paid = contribs.filter((c) => c.status !== "missed");
  const totalContributedMinor = paid.reduce((a, c) => a + c.amountMinor, 0);
  const savingsMinor = paid.reduce((a, c) => a + c.amountMinor - c.premiumMinor, 0);
  const microShares = Number(shareRow[0]?.micro ?? 0);
  const priceMinor = prices.length ? currentPrice(prices) : 0;

  const score = creditScore({
    joinedOn: member.joinedOn,
    attendancePct: member.attendancePct,
    standing: member.standing as Standing,
    minContributionMinor: s.minContributionMinor,
    contributions: contribs,
    loans: memberLoans.map((l) => ({ status: l.status, penaltiesMinor: l.penaltiesMinor })),
    asOf,
  });
  const eligibility = loanEligibility({
    standing: member.standing as Standing,
    joinedOn: member.joinedOn,
    score: score.total,
    totalSavingsMinor: savingsMinor,
    // When assessing a specific application, that application shouldn't count against itself.
    openLoans: opts.excludeLoanId ? memberLoans.filter((l) => l.id !== opts.excludeLoanId) : memberLoans,
    asOf,
    policy: s.loanPolicy,
  });

  const year = asOf.getUTCFullYear();
  const pkg = s.welfarePackages.find((p) => p.id === member.welfarePackageId) ?? s.welfarePackages[0];
  const remaining = welfareRemaining(
    pkg,
    claimRows.filter((c) => c.status === "approved" && c.createdAt.getUTCFullYear() === year).map((c) => ({ type: c.type, amountMinor: c.amountMinor })),
  );

  const loanBalanceMinor = memberLoans
    .filter((l) => OUTSTANDING_LOAN_STATUSES.includes(l.status))
    .reduce((a, l) => a + outstanding({ principalMinor: l.principalMinor, interestMinor: l.interestMinor, penaltiesMinor: l.penaltiesMinor, paidPrincipalMinor: l.paidPrincipalMinor, paidInterestMinor: l.paidInterestMinor, paidPenaltyMinor: l.paidPenaltyMinor }).totalMinor, 0);

  return {
    member,
    contributions: contribs,
    loans: memberLoans,
    totals: {
      totalContributedMinor,
      savingsMinor,
      welfarePremiumsMinor: totalContributedMinor - savingsMinor,
      microShares,
      sharePriceMinor: priceMinor,
      shareValueMinor: sharesValueMinor(microShares, priceMinor),
      loanBalanceMinor,
      paidPeriods: paid.length,
      missedPeriods: contribs.length - paid.length,
    },
    score,
    eligibility,
    welfare: { package: pkg, remaining },
  };
}

export type MemberSnapshot = Awaited<ReturnType<typeof memberSnapshot>>;
