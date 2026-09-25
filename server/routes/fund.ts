import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { OUTSTANDING_LOAN_STATUSES } from "../../shared/enums";
import { MICRO, currentPrice, sharesValueMinor } from "../../shared/domain/shares";
import { formatMoney } from "../../shared/money";
import { addMonths, formatPeriod, periodOf, periodRange } from "../../shared/period";
import { fundSettingsSchema } from "../../shared/settings";
import { fundProfileSchema, listQuerySchema, profileUpdateSchema, shareGrantSchema, sharePriceSchema } from "../../shared/schemas";
import { auditEvents, claims, contributions, loans, memberships, notifications, payments, shareEntries, sharePrices, tenants } from "../db/schema";
import { rowsOf } from "../db/client";
import { requirePerm } from "../lib/auth";
import { actorOf, type AppEnv, today } from "../lib/context";
import { forbidden, paged, parseBody, parseQuery, unprocessable } from "../lib/http";
import { accountBalances } from "../lib/ledger";
import { audit } from "../lib/records";
import { loanView } from "../services/loans";
import { memberSnapshot } from "../services/members";
import { loadSharePrices } from "../services/savings";

export const fundRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------- dashboard

fundRoutes.get("/overview", async (c) => {
  requirePerm(c, "members:read");
  const tenant = c.get("tenant");
  const { db, clock } = c.get("deps");
  const period = periodOf(clock.now());
  const from = addMonths(period, -11);

  const [balances, standing, collected, trend, loanCounts, pendingClaims, attention, activity] = await Promise.all([
    accountBalances(db, tenant.id),
    db.select({ standing: memberships.standing, n: sql<number>`count(*)::int` }).from(memberships).where(and(eq(memberships.tenantId, tenant.id), eq(memberships.status, "active"))).groupBy(memberships.standing),
    db
      .select({ paid: sql<number>`count(*) filter (where ${contributions.status} <> 'missed')::int`, amount: sql<string>`coalesce(sum(${contributions.amountMinor}), 0)` })
      .from(contributions)
      .where(and(eq(contributions.tenantId, tenant.id), eq(contributions.period, period))),
    db
      .select({ period: contributions.period, amount: sql<string>`sum(${contributions.amountMinor})`, paid: sql<number>`count(*) filter (where ${contributions.status} <> 'missed')::int`, missed: sql<number>`count(*) filter (where ${contributions.status} = 'missed')::int` })
      .from(contributions)
      .where(and(eq(contributions.tenantId, tenant.id), sql`${contributions.period} between ${from} and ${period}`))
      .groupBy(contributions.period),
    db.select({ status: loans.status, n: sql<number>`count(*)::int` }).from(loans).where(eq(loans.tenantId, tenant.id)).groupBy(loans.status),
    db.select({ n: sql<number>`count(*)::int` }).from(claims).where(and(eq(claims.tenantId, tenant.id), eq(claims.status, "pending"))),
    db.select({ n: sql<number>`count(*)::int` }).from(payments).where(and(eq(payments.tenantId, tenant.id), eq(payments.status, "succeeded"), sql`${payments.failureReason} is not null`)),
    db.select().from(auditEvents).where(eq(auditEvents.tenantId, tenant.id)).orderBy(desc(auditEvents.createdAt)).limit(8),
  ]);

  const byStanding = Object.fromEntries(standing.map((s) => [s.standing, s.n])) as Record<string, number>;
  const activeMembers = standing.reduce((a, s) => a + s.n, 0);
  const trendMap = new Map(trend.map((t) => [t.period, t]));
  const loanBy = Object.fromEntries(loanCounts.map((l) => [l.status, l.n])) as Record<string, number>;

  return c.json({
    period,
    balances,
    members: { active: activeMembers, behind: byStanding.behind ?? 0, voided: byStanding.voided ?? 0 },
    thisMonth: { paidCount: collected[0]?.paid ?? 0, collectedMinor: Number(collected[0]?.amount ?? 0), expectedCount: activeMembers },
    trend: periodRange(from, period).map((p) => ({
      period: p,
      label: formatPeriod(p),
      collectedMinor: Number(trendMap.get(p)?.amount ?? 0),
      paid: trendMap.get(p)?.paid ?? 0,
      missed: trendMap.get(p)?.missed ?? 0,
    })),
    queues: {
      pendingCommittee: loanBy.pending_committee ?? 0,
      pendingManager: loanBy.pending_manager ?? 0,
      overdue: (loanBy.overdue ?? 0) + (loanBy.defaulted ?? 0),
      activeLoans: loanBy.active ?? 0,
      pendingClaims: pendingClaims[0]?.n ?? 0,
      unallocatedPayments: attention[0]?.n ?? 0,
    },
    activity,
  });
});

// ---------------------------------------------------------------- settings

fundRoutes.get("/settings", async (c) => {
  const tenant = c.get("tenant");
  const prices = await loadSharePrices(c.get("deps").db, tenant.id);
  return c.json({ id: tenant.id, name: tenant.name, shortName: tenant.shortName, currency: tenant.currency, status: tenant.status, plan: tenant.plan, trialEndsAt: tenant.trialEndsAt, settings: tenant.settings, sharePrices: prices });
});

fundRoutes.put("/settings", async (c) => {
  requirePerm(c, "settings:write");
  const settings = await parseBody(c, fundSettingsSchema);
  const tenant = c.get("tenant");
  const { db } = c.get("deps");
  const used = await db.select({ id: memberships.welfarePackageId }).from(memberships).where(eq(memberships.tenantId, tenant.id)).groupBy(memberships.welfarePackageId);
  const missing = used.map((u) => u.id).filter((id) => !settings.welfarePackages.some((p) => p.id === id));
  if (missing.length) throw unprocessable(`Welfare package(s) still assigned to members: ${missing.join(", ")}`);
  await db.transaction(async (tx) => {
    await tx.update(tenants).set({ settings }).where(eq(tenants.id, tenant.id));
    await audit(tx, tenant.id, actorOf(c), { action: "settings.updated", entityType: "fund", entityId: tenant.id, summary: "Updated fund rules and products", data: { before: tenant.settings, after: settings } });
  });
  return c.json({ ok: true });
});

fundRoutes.put("/profile", async (c) => {
  requirePerm(c, "settings:write");
  const input = await parseBody(c, fundProfileSchema);
  const tenant = c.get("tenant");
  const { db } = c.get("deps");
  await db.transaction(async (tx) => {
    await tx.update(tenants).set({ name: input.name, shortName: input.shortName || null }).where(eq(tenants.id, tenant.id));
    await audit(tx, tenant.id, actorOf(c), { action: "fund.renamed", entityType: "fund", entityId: tenant.id, summary: `Renamed fund to ${input.name}` });
  });
  return c.json({ ok: true });
});

fundRoutes.post("/share-prices", async (c) => {
  requirePerm(c, "settings:write");
  const input = await parseBody(c, sharePriceSchema);
  const tenant = c.get("tenant");
  const { db } = c.get("deps");
  await db.transaction(async (tx) => {
    await tx
      .insert(sharePrices)
      .values({ tenantId: tenant.id, ...input })
      .onConflictDoUpdate({ target: [sharePrices.tenantId, sharePrices.effectivePeriod], set: { priceMinor: input.priceMinor } });
    await audit(tx, tenant.id, actorOf(c), { action: "shares.price_set", entityType: "fund", entityId: tenant.id, summary: `Share price ${formatMoney(input.priceMinor, tenant.currency)} effective ${formatPeriod(input.effectivePeriod)}` });
  });
  return c.json(await loadSharePrices(db, tenant.id));
});

// ---------------------------------------------------------------- shares

fundRoutes.get("/shares", async (c) => {
  requirePerm(c, "members:read");
  const tenant = c.get("tenant");
  const { db } = c.get("deps");
  const q = parseQuery(c, listQuerySchema);
  const prices = await loadSharePrices(db, tenant.id);
  const price = prices.length ? currentPrice(prices) : 0;
  const [tot] = await db.select({ micro: sql<string>`coalesce(sum(${shareEntries.microShares}), 0)` }).from(shareEntries).where(eq(shareEntries.tenantId, tenant.id));
  const totalMicro = Number(tot.micro);
  const where = and(eq(memberships.tenantId, tenant.id), q.q ? sql`${memberships.name} ilike ${`%${q.q}%`}` : undefined);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(memberships).where(where);
  const rows = await db
    .select({
      id: memberships.id,
      name: memberships.name,
      memberNo: memberships.memberNo,
      status: memberships.status,
      micro: sql<string>`coalesce((select sum(se.micro_shares) from ${shareEntries} se where se.tenant_id = ${tenant.id} and se.membership_id = "memberships"."id"), 0)`,
      granted: sql<string>`coalesce((select sum(se.micro_shares) from ${shareEntries} se where se.tenant_id = ${tenant.id} and se.membership_id = "memberships"."id" and se.source = 'grant'), 0)`,
    })
    .from(memberships)
    .where(where)
    .orderBy(sql`5 desc`, asc(memberships.name))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  return c.json({
    sharePriceMinor: price,
    sharePrices: prices,
    totalMicroShares: totalMicro,
    totalValueMinor: sharesValueMinor(totalMicro, price),
    ...paged(
      rows.map((r) => ({ ...r, microShares: Number(r.micro), grantedMicroShares: Number(r.granted), valueMinor: sharesValueMinor(Number(r.micro), price), pct: totalMicro ? (Number(r.micro) / totalMicro) * 100 : 0 })),
      total,
      q.page,
      q.pageSize,
    ),
  });
});

fundRoutes.post("/shares/grants", async (c) => {
  requirePerm(c, "shares:write");
  const input = await parseBody(c, shareGrantSchema);
  const tenant = c.get("tenant");
  const { db } = c.get("deps");
  const [m] = await db.select({ name: memberships.name, status: memberships.status }).from(memberships).where(and(eq(memberships.tenantId, tenant.id), eq(memberships.id, input.membershipId)));
  if (!m) throw unprocessable("Unknown member");
  if (m.status !== "active") throw unprocessable("Shares can only be granted to active members");
  const micro = Math.round(input.shares * MICRO);
  if (micro < 0) {
    const [held] = await db.select({ micro: sql<string>`coalesce(sum(${shareEntries.microShares}), 0)` }).from(shareEntries).where(and(eq(shareEntries.tenantId, tenant.id), eq(shareEntries.membershipId, input.membershipId)));
    if (Number(held.micro) + micro < 0) throw unprocessable(`${m.name} only holds ${(Number(held.micro) / MICRO).toLocaleString("en", { maximumFractionDigits: 4 })} shares`);
  }
  if (input.membershipId === c.get("membership").id) throw forbidden("You can't grant shares to yourself");
  await db.transaction(async (tx) => {
    await tx.insert(shareEntries).values({ tenantId: tenant.id, membershipId: input.membershipId, microShares: micro, source: "grant", reason: input.reason, createdBy: c.get("user").id });
    await audit(tx, tenant.id, actorOf(c), { action: "shares.granted", entityType: "member", entityId: input.membershipId, summary: `${input.shares > 0 ? "Granted" : "Removed"} ${Math.abs(input.shares)} bonus shares ${input.shares > 0 ? "to" : "from"} ${m.name}: ${input.reason}` });
  });
  return c.json({ ok: true }, 201);
});

// ---------------------------------------------------------------- my portal

fundRoutes.get("/me", async (c) => {
  const tenant = c.get("tenant");
  const me = c.get("membership");
  const { db, clock } = c.get("deps");
  const snap = await memberSnapshot(db, tenant, me.id, clock.now());
  const t = today(c);
  const [myClaims, pending] = await Promise.all([
    db.select().from(claims).where(and(eq(claims.tenantId, tenant.id), eq(claims.membershipId, me.id))).orderBy(desc(claims.createdAt)),
    db.select().from(payments).where(and(eq(payments.tenantId, tenant.id), eq(payments.membershipId, me.id), eq(payments.status, "pending"))).orderBy(desc(payments.createdAt)),
  ]);

  // Suggest what to pay next: any missed months, then the current month if unpaid, then next month.
  const current = periodOf(clock.now());
  const paidOrMissed = new Map(snap.contributions.map((x) => [x.period, x.status]));
  const due = [
    ...snap.contributions.filter((x) => x.status === "missed").map((x) => x.period),
    ...[current, addMonths(current, 1)].filter((p) => !paidOrMissed.has(p) && p >= periodOf(snap.member.joinedOn)),
  ];
  return c.json({
    ...snap,
    loans: snap.loans.map((l) => loanView(l, t)),
    claims: myClaims,
    pendingPayments: pending,
    duePeriods: [...new Set(due)].sort(),
    loanProducts: tenant.settings.loanProducts.filter((p) => p.active),
    welfarePackages: tenant.settings.welfarePackages,
    minContributionMinor: tenant.settings.minContributionMinor,
    simulatedPayments: c.get("deps").payments.simulated,
  });
});

fundRoutes.patch("/me", async (c) => {
  const input = await parseBody(c, profileUpdateSchema);
  if (!Object.keys(input).length) throw unprocessable("Nothing to update");
  const tenant = c.get("tenant");
  const me = c.get("membership");
  if (input.welfarePackageId && !tenant.settings.welfarePackages.some((p) => p.id === input.welfarePackageId)) throw unprocessable("Unknown welfare package");
  const { db } = c.get("deps");
  const [m] = await db.transaction(async (tx) => {
    const r = await tx.update(memberships).set(input).where(eq(memberships.id, me.id)).returning();
    await audit(tx, tenant.id, actorOf(c), { action: "member.profile_updated", entityType: "member", entityId: me.id, summary: `${me.name} updated their profile (${Object.keys(input).join(", ")})` });
    return r;
  });
  return c.json(m);
});

// ---------------------------------------------------------------- audit & notifications

fundRoutes.get("/audit", async (c) => {
  requirePerm(c, "audit:read", "members:write");
  const q = parseQuery(c, listQuerySchema.extend({ entityType: z.string().max(40).optional(), entityId: z.string().max(64).optional() }));
  const tenant = c.get("tenant");
  const { db } = c.get("deps");
  const where = and(
    eq(auditEvents.tenantId, tenant.id),
    q.entityType ? eq(auditEvents.entityType, q.entityType) : undefined,
    q.entityId ? eq(auditEvents.entityId, q.entityId) : undefined,
    q.q ? sql`(${auditEvents.summary} ilike ${`%${q.q}%`} or ${auditEvents.actorName} ilike ${`%${q.q}%`} or ${auditEvents.action} ilike ${`%${q.q}%`})` : undefined,
  );
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(auditEvents).where(where);
  const items = await db.select().from(auditEvents).where(where).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  return c.json(paged(items, total, q.page, q.pageSize));
});

fundRoutes.get("/notifications", async (c) => {
  const { db } = c.get("deps");
  const where = and(eq(notifications.userId, c.get("user").id), eq(notifications.tenantId, c.get("tenant").id));
  const [items, [{ unread }]] = await Promise.all([
    db.select().from(notifications).where(where).orderBy(desc(notifications.createdAt)).limit(30),
    db.select({ unread: sql<number>`count(*)::int` }).from(notifications).where(and(where, isNull(notifications.readAt))),
  ]);
  return c.json({ items, unread });
});

fundRoutes.post("/notifications/read", async (c) => {
  const { ids } = await parseBody(c, z.object({ ids: z.array(z.string().uuid()).max(100).optional() }));
  const { db, clock } = c.get("deps");
  await db
    .update(notifications)
    .set({ readAt: clock.now() })
    .where(and(eq(notifications.userId, c.get("user").id), eq(notifications.tenantId, c.get("tenant").id), isNull(notifications.readAt), ids?.length ? inArray(notifications.id, ids) : undefined));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- reports

fundRoutes.get("/reports/summary", async (c) => {
  requirePerm(c, "reports:read");
  const q = parseQuery(c, z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }));
  if (q.from > q.to) throw unprocessable("The start date must be on or before the end date");
  const tenant = c.get("tenant");
  const { db } = c.get("deps");
  const [flows, closing, opening, loanBook, contribStats, claimStats] = await Promise.all([
    db.execute(sql`
      select je.source_type, jl.account, sum(jl.debit_minor) as debit, sum(jl.credit_minor) as credit
      from journal_lines jl join journal_entries je on je.id = jl.entry_id
      where jl.tenant_id = ${tenant.id} and je.occurred_on between ${q.from} and ${q.to}
      group by je.source_type, jl.account`),
    accountBalances(db, tenant.id, { to: q.to }),
    accountBalances(db, tenant.id, { to: new Date(new Date(q.from).getTime() - 86_400_000).toISOString().slice(0, 10) }),
    db.select().from(loans).where(and(eq(loans.tenantId, tenant.id), inArray(loans.status, OUTSTANDING_LOAN_STATUSES))),
    db
      .select({ paid: sql<number>`count(*) filter (where ${contributions.status} <> 'missed')::int`, late: sql<number>`count(*) filter (where ${contributions.status} = 'late')::int`, missed: sql<number>`count(*) filter (where ${contributions.status} = 'missed')::int` })
      .from(contributions)
      .where(and(eq(contributions.tenantId, tenant.id), sql`${contributions.period} between ${q.from.slice(0, 7)} and ${q.to.slice(0, 7)}`)),
    db
      .select({ approved: sql<number>`count(*) filter (where ${claims.status} = 'approved')::int`, rejected: sql<number>`count(*) filter (where ${claims.status} = 'rejected')::int` })
      .from(claims)
      .where(and(eq(claims.tenantId, tenant.id), sql`${claims.decidedAt}::date between ${q.from} and ${q.to}`)),
  ]);
  const rows = rowsOf<{ source_type: string; account: string; debit: string; credit: string }>(flows);
  const sum = (sourceType: string, account: string, side: "debit" | "credit") =>
    rows.filter((r) => (sourceType === "*" || r.source_type === sourceType) && r.account === account).reduce((a, r) => a + Number(r[side]), 0);

  const t = today(c);
  const views = loanBook.map((l) => loanView(l, t));
  return c.json({
    range: q,
    inflows: {
      contributionsMinor: sum("contribution", "cash", "debit") - sum("reversal", "cash", "credit"),
      savingsMinor: sum("*", "member_savings", "credit") - sum("*", "member_savings", "debit"),
      welfarePremiumsMinor: sum("*", "welfare_reserve", "credit") - sum("reversal", "welfare_reserve", "debit"),
      loanRepaymentsMinor: sum("loan_repayment", "cash", "debit"),
      principalRecoveredMinor: sum("loan_repayment", "loans_receivable", "credit"),
      interestIncomeMinor: sum("loan_repayment", "interest_income", "credit"),
      penaltyIncomeMinor: sum("loan_repayment", "penalty_income", "credit"),
    },
    outflows: {
      loansDisbursedMinor: sum("loan_disbursement", "cash", "credit"),
      welfarePaidMinor: sum("claim_payout", "cash", "credit"),
      writeOffsMinor: sum("loan_write_off", "write_off_expense", "debit"),
    },
    opening,
    closing,
    loanBook: {
      count: views.length,
      outstandingMinor: views.reduce((a, l) => a + l.balance.totalMinor, 0),
      arrearsMinor: views.reduce((a, l) => a + l.arrearsMinor, 0),
      atRisk: views.filter((l) => l.status !== "active").length,
    },
    contributions: contribStats[0],
    claims: claimStats[0],
  });
});
