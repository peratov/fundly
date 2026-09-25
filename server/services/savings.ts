import { and, asc, eq, sql } from "drizzle-orm";
import type { ContributionStatus, PaymentMethod } from "../../shared/enums";
import { classifyPayment, standingFor, trailingMissed } from "../../shared/domain/members";
import { microSharesFor, priceForPeriod, type SharePrice } from "../../shared/domain/shares";
import { formatMoney } from "../../shared/money";
import { formatPeriod } from "../../shared/period";
import type { Db } from "../db/client";
import { contributions, memberships, shareEntries, sharePrices } from "../db/schema";
import type { Actor, Tenant } from "../lib/context";
import { conflict, notFound, unprocessable } from "../lib/http";
import { postJournal, reverseJournalsFor } from "../lib/ledger";
import { audit, notifyMember } from "../lib/records";

export async function loadSharePrices(db: Db, tenantId: string): Promise<SharePrice[]> {
  return db
    .select({ effectivePeriod: sharePrices.effectivePeriod, priceMinor: sharePrices.priceMinor })
    .from(sharePrices)
    .where(eq(sharePrices.tenantId, tenantId))
    .orderBy(asc(sharePrices.effectivePeriod));
}

async function loadMember(tx: Db, tenantId: string, membershipId: string) {
  const [m] = await tx.select().from(memberships).where(and(eq(memberships.tenantId, tenantId), eq(memberships.id, membershipId)));
  if (!m) throw notFound("Member");
  return m;
}

export interface RecordContributionInput {
  membershipId: string;
  period: string;
  amountMinor: number;
  status?: ContributionStatus;
  paidOn?: string;
  method: PaymentMethod;
  paymentId?: string | null;
  note?: string;
  today: string;
}

/**
 * Record a contribution for one member-period. A previously "missed" period can be
 * settled later (the row is upgraded), but a paid period can't be paid twice — the
 * unique (tenant, member, period) index guarantees that even under concurrent requests.
 */
export async function recordContribution(tx: Db, tenant: Tenant, actor: Actor, input: RecordContributionInput) {
  const member = await loadMember(tx, tenant.id, input.membershipId);
  if (member.status !== "active") throw unprocessable("Member has exited the fund");
  const s = tenant.settings;

  const missed = input.status === "missed" || input.amountMinor === 0;
  if (!missed && input.amountMinor < s.minContributionMinor) {
    throw unprocessable(`Minimum contribution is ${formatMoney(s.minContributionMinor, tenant.currency)}`);
  }

  const [existing] = await tx
    .select()
    .from(contributions)
    .where(and(eq(contributions.tenantId, tenant.id), eq(contributions.membershipId, member.id), eq(contributions.period, input.period)));
  if (existing && existing.status !== "missed") throw conflict(`${formatPeriod(input.period)} is already paid for ${member.name}`);
  if (existing && missed) throw conflict(`${formatPeriod(input.period)} is already marked missed`);

  const paidOn = missed ? null : (input.paidOn ?? input.today);
  const status: ContributionStatus = missed ? "missed" : (input.status ?? classifyPayment(input.period, paidOn!, s.contributionDueDay));
  const pkg = s.welfarePackages.find((p) => p.id === member.welfarePackageId) ?? s.welfarePackages[0];
  const premiumMinor = missed ? 0 : Math.min(pkg.monthlyPremiumMinor, input.amountMinor);
  const amountMinor = missed ? 0 : input.amountMinor;

  const values = {
    amountMinor,
    premiumMinor,
    status,
    paidOn,
    method: missed ? null : input.method,
    paymentId: input.paymentId ?? null,
    note: input.note ?? null,
    recordedBy: actor.userId,
  };
  const [row] = existing
    ? await tx.update(contributions).set(values).where(eq(contributions.id, existing.id)).returning()
    : await tx.insert(contributions).values({ tenantId: tenant.id, membershipId: member.id, period: input.period, ...values }).returning();

  if (!missed) await bookContribution(tx, tenant, actor, row, member.name);
  await refreshStanding(tx, tenant, actor, member.id);

  await audit(tx, tenant.id, actor, {
    action: missed ? "contribution.missed" : "contribution.recorded",
    entityType: "contribution",
    entityId: row.id,
    summary: missed
      ? `Marked ${formatPeriod(input.period)} as missed for ${member.name}`
      : `Recorded ${formatMoney(amountMinor, tenant.currency)} (${status.replace("_", " ")}) for ${member.name}, ${formatPeriod(input.period)}`,
    data: { period: input.period, amountMinor, method: input.method },
  });
  return row;
}

/** Shares + journal for a paid contribution. */
async function bookContribution(tx: Db, tenant: Tenant, actor: Actor, row: typeof contributions.$inferSelect, memberName: string) {
  const prices = await loadSharePrices(tx, tenant.id);
  const net = row.amountMinor - row.premiumMinor;
  const micro = microSharesFor(net, priceForPeriod(prices, row.period));
  if (micro > 0) {
    await tx.insert(shareEntries).values({ tenantId: tenant.id, membershipId: row.membershipId, microShares: micro, source: "contribution", refId: row.id, createdBy: actor.userId });
  }
  await postJournal(tx, {
    tenantId: tenant.id,
    occurredOn: row.paidOn!,
    memo: `Contribution ${formatPeriod(row.period)} — ${memberName}`,
    sourceType: "contribution",
    sourceId: row.id,
    createdBy: actor.userId,
    lines: [
      { account: "cash", debit: row.amountMinor },
      { account: "member_savings", credit: net, membershipId: row.membershipId },
      { account: "welfare_reserve", credit: row.premiumMinor, membershipId: row.membershipId },
    ],
  });
}

/** Correct a contribution: reverse its books and shares, then re-book with the new figures. */
export async function correctContribution(
  tx: Db,
  tenant: Tenant,
  actor: Actor,
  id: string,
  input: { amountMinor: number; status: ContributionStatus; reason: string; today: string },
) {
  const [row] = await tx.select().from(contributions).where(and(eq(contributions.tenantId, tenant.id), eq(contributions.id, id)));
  if (!row) throw notFound("Contribution");
  const member = await loadMember(tx, tenant.id, row.membershipId);
  const missed = input.status === "missed";
  if (!missed && input.amountMinor < tenant.settings.minContributionMinor) {
    throw unprocessable(`Minimum contribution is ${formatMoney(tenant.settings.minContributionMinor, tenant.currency)}`);
  }

  await reverseJournalsFor(tx, { tenantId: tenant.id, sourceId: row.id, occurredOn: input.today, memo: `Correction: ${input.reason}`, createdBy: actor.userId });
  const [net] = await tx
    .select({ micro: sql<string>`coalesce(sum(${shareEntries.microShares}), 0)` })
    .from(shareEntries)
    .where(and(eq(shareEntries.tenantId, tenant.id), eq(shareEntries.refId, row.id)));
  if (Number(net.micro) !== 0) {
    await tx.insert(shareEntries).values({ tenantId: tenant.id, membershipId: row.membershipId, microShares: -Number(net.micro), source: "adjustment", refId: row.id, reason: input.reason, createdBy: actor.userId });
  }

  const pkg = tenant.settings.welfarePackages.find((p) => p.id === member.welfarePackageId) ?? tenant.settings.welfarePackages[0];
  const [updated] = await tx
    .update(contributions)
    .set({
      amountMinor: missed ? 0 : input.amountMinor,
      premiumMinor: missed ? 0 : Math.min(pkg.monthlyPremiumMinor, input.amountMinor),
      status: input.status,
      paidOn: missed ? null : (row.paidOn ?? input.today),
      method: missed ? null : (row.method ?? "cash"),
      note: `Corrected: ${input.reason}`,
    })
    .where(eq(contributions.id, row.id))
    .returning();
  if (!missed) await bookContribution(tx, tenant, actor, updated, member.name);
  await refreshStanding(tx, tenant, actor, member.id);

  await audit(tx, tenant.id, actor, {
    action: "contribution.corrected",
    entityType: "contribution",
    entityId: row.id,
    summary: `Corrected ${member.name}'s ${formatPeriod(row.period)} from ${formatMoney(row.amountMinor, tenant.currency)} (${row.status}) to ${formatMoney(updated.amountMinor, tenant.currency)} (${updated.status}): ${input.reason}`,
    data: { before: { amountMinor: row.amountMinor, status: row.status }, after: { amountMinor: updated.amountMinor, status: updated.status } },
  });
  return updated;
}

/** Recompute standing from the member's history and persist + notify on change. */
export async function refreshStanding(tx: Db, tenant: Tenant, actor: Actor, membershipId: string) {
  const history = await tx
    .select({ period: contributions.period, status: contributions.status })
    .from(contributions)
    .where(and(eq(contributions.tenantId, tenant.id), eq(contributions.membershipId, membershipId)))
    .orderBy(sql`${contributions.period} desc`)
    .limit(Math.max(tenant.settings.standing.voidAfterMissed, 1) + 1);
  const next = standingFor(trailingMissed(history), tenant.settings.standing);
  const [m] = await tx.select({ standing: memberships.standing, name: memberships.name }).from(memberships).where(eq(memberships.id, membershipId));
  if (!m || m.standing === next) return next;

  await tx.update(memberships).set({ standing: next }).where(eq(memberships.id, membershipId));
  await audit(tx, tenant.id, actor, {
    action: "member.standing_changed",
    entityType: "member",
    entityId: membershipId,
    summary: `${m.name}'s standing changed from ${m.standing} to ${next}`,
  });
  await notifyMember(tx, tenant.id, membershipId, {
    kind: "standing",
    title: next === "active" ? "You're back in good standing" : `Your standing is now ${next}`,
    body: next === "active" ? "Thanks for bringing your contributions up to date." : "Please clear your missed contributions to restore full access to loans.",
    link: "/portal",
  });
  return next;
}

/**
 * Close a period: every active member without a record for it gets a "missed"
 * entry and their standing is recomputed. Idempotent — running it twice is a no-op.
 * Intended to be run by a manager or a monthly scheduled job.
 */
export async function closePeriod(tx: Db, tenant: Tenant, actor: Actor, period: string) {
  const missing = await tx
    .select({ id: memberships.id, name: memberships.name })
    .from(memberships)
    .where(
      and(
        eq(memberships.tenantId, tenant.id),
        eq(memberships.status, "active"),
        sql`${memberships.joinedOn} <= (${period} || '-28')::date`,
        sql`not exists (select 1 from ${contributions} c where c.tenant_id = ${tenant.id} and c.membership_id = "memberships"."id" and c.period = ${period})`,
      ),
    );
  if (missing.length) {
    await tx.insert(contributions).values(missing.map((m) => ({ tenantId: tenant.id, membershipId: m.id, period, amountMinor: 0, premiumMinor: 0, status: "missed" as const, recordedBy: actor.userId })));
    for (const m of missing) await refreshStanding(tx, tenant, actor, m.id);
  }
  // Scheduled runs repeat daily; only record them when they actually changed something.
  if (!missing.length && !actor.userId) return { markedMissed: 0 };
  await audit(tx, tenant.id, actor, {
    action: "period.closed",
    entityType: "period",
    entityId: period,
    summary: `Closed ${formatPeriod(period)}: ${missing.length} member(s) marked missed`,
    data: { missed: missing.map((m) => m.name) },
  });
  return { markedMissed: missing.length };
}
