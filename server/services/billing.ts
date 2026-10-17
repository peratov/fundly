import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { formatMoney } from "../../shared/money";
import { GRACE_DAYS, PLANS, isPaid, planInfo, priceFor, type BillingInterval, type PaidPlanId } from "../../shared/plans";
import type { Db } from "../db/client";
import { billingPayments, memberships, tenants } from "../db/schema";
import type { Actor, Deps, Tenant } from "../lib/context";
import { randomToken } from "../lib/crypto";
import { AppError, conflict, notFound, unprocessable } from "../lib/http";
import { audit, notifyRoles } from "../lib/records";

/*
 * Plans and subscription billing. Free is free forever up to 25 active members;
 * Growth and Pro are prepaid by the month or year through a hosted checkout.
 * When a paid term lapses (after a grace period) the fund falls back to Free:
 * nothing is deleted or locked, it just can't add members past the limit or
 * collect money online until it renews.
 */

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const addMonthsIso = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
};

export const entitlements = (tenant: Pick<Tenant, "plan">) => planInfo(tenant.plan);

export async function activeMemberCount(db: Db, tenantId: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(memberships).where(and(eq(memberships.tenantId, tenantId), eq(memberships.status, "active")));
  return n;
}

/** 402 with an upgrade hint when adding `adding` members would pass the plan's limit. */
export async function assertCanAddMembers(db: Db, tenant: Tenant, adding = 1) {
  const plan = entitlements(tenant);
  if (plan.memberLimit === null) return;
  const current = await activeMemberCount(db, tenant.id);
  if (current + adding > plan.memberLimit) {
    const room = Math.max(0, plan.memberLimit - current);
    throw new AppError(
      402,
      "plan_limit",
      `The ${plan.name} plan includes up to ${plan.memberLimit} members and this fund has ${current}.${adding > 1 ? ` There's room for ${room} more.` : ""} Upgrade to add more members.`,
      { limit: plan.memberLimit, current, plan: plan.id },
    );
  }
}

export function assertOnlinePayments(tenant: Tenant) {
  if (!entitlements(tenant).onlinePayments) {
    throw new AppError(402, "plan_feature", "Paying by mobile money in the app is part of the Growth plan. Pay your treasurer directly and they'll record it, or ask your fund owner to upgrade.", { feature: "onlinePayments", plan: tenant.plan });
  }
}

export async function billingOverview(db: Db, tenant: Tenant, today: string) {
  const [members, history] = await Promise.all([
    activeMemberCount(db, tenant.id),
    db.select().from(billingPayments).where(eq(billingPayments.tenantId, tenant.id)).orderBy(desc(billingPayments.createdAt)).limit(24),
  ]);
  const plan = entitlements(tenant);
  const expires = tenant.planExpiresAt;
  const daysLeft = expires ? Math.round((Date.parse(`${expires}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) : null;
  return {
    plan: plan.id,
    planExpiresAt: expires,
    daysLeft,
    inGrace: daysLeft !== null && daysLeft < 0,
    graceEndsOn: expires ? addDays(expires, GRACE_DAYS) : null,
    usage: { members, limit: plan.memberLimit },
    currency: tenant.currency,
    prices: {
      growth: { month: priceFor("growth", "month", tenant.currency), year: priceFor("growth", "year", tenant.currency) },
      pro: { month: priceFor("pro", "month", tenant.currency), year: priceFor("pro", "year", tenant.currency) },
    },
    history,
  };
}

export async function startCheckout(deps: Deps, tenant: Tenant, actor: Actor & { email: string }, input: { plan: PaidPlanId; interval: BillingInterval }) {
  const { db, payments: provider, config } = deps;
  // Moving down to a smaller plan only makes sense if the fund fits in it.
  const limit = PLANS[input.plan].memberLimit;
  if (limit !== null) {
    const members = await activeMemberCount(db, tenant.id);
    if (members > limit) throw unprocessable(`This fund has ${members} members, more than the ${PLANS[input.plan].name} plan's ${limit}. Choose Pro instead.`);
  }
  const price = priceFor(input.plan, input.interval, tenant.currency);
  const reference = `AWA-SUB-${randomToken(9).replace(/[^A-Za-z0-9]/g, "").slice(0, 12).toUpperCase()}`;
  const [row] = await db
    .insert(billingPayments)
    .values({ tenantId: tenant.id, reference, provider: provider.name, plan: input.plan, interval: input.interval, months: price.months, amountMinor: price.amountMinor, currency: price.currency, createdBy: actor.userId })
    .returning();
  const callbackUrl = `${config.appUrl}/f/${tenant.id}/billing?reference=${reference}`;
  const { url } = await provider.checkout({
    reference,
    amountMinor: price.amountMinor,
    currency: price.currency,
    email: actor.email,
    callbackUrl,
    metadata: { kind: "subscription", tenantId: tenant.id, plan: input.plan, interval: input.interval },
  });
  return { reference: row.reference, url, simulated: provider.simulated, amountMinor: price.amountMinor, currency: price.currency };
}

/**
 * Applies a subscription payment exactly once. Paid time stacks: renewing early, or
 * upgrading, adds the new term to whatever is left (an upgrade starts the higher plan now).
 */
export async function completeBillingPayment(deps: Deps, reference: string, outcome: { status: "succeeded" | "failed"; amountMinor: number; failureReason?: string }) {
  const today = deps.clock.now().toISOString().slice(0, 10);
  return deps.db.transaction(async (tx) => {
    const [bp] = await tx.select().from(billingPayments).where(eq(billingPayments.reference, reference)).for("update");
    if (!bp) throw notFound("Subscription payment");
    if (bp.status !== "pending") return bp;
    const actor: Actor = { userId: null, name: `Billing (${bp.provider})` };

    if (outcome.status === "failed" || outcome.amountMinor !== bp.amountMinor) {
      const reason = outcome.status === "failed" ? (outcome.failureReason ?? "Declined") : `Amount mismatch: expected ${bp.amountMinor}, received ${outcome.amountMinor}`;
      const [failed] = await tx.update(billingPayments).set({ status: "failed", completedAt: new Date() }).where(eq(billingPayments.id, bp.id)).returning();
      await audit(tx, bp.tenantId, actor, { action: "billing.failed", entityType: "fund", entityId: bp.tenantId, summary: `Subscription payment ${bp.reference} failed: ${reason}` });
      return failed;
    }

    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, bp.tenantId)).for("update");
    const current = tenant.planExpiresAt && tenant.planExpiresAt >= today && isPaid(tenant.plan) ? tenant.planExpiresAt : null;
    // Same plan: extend from the current end date. Upgrade or new subscription: start today.
    const from = current && tenant.plan === bp.plan ? current : today;
    const paidThrough = addMonthsIso(from, bp.months);

    await tx.update(tenants).set({ plan: bp.plan, planExpiresAt: paidThrough, status: "active" }).where(eq(tenants.id, tenant.id));
    const [done] = await tx.update(billingPayments).set({ status: "succeeded", paidThrough, completedAt: new Date() }).where(eq(billingPayments.id, bp.id)).returning();
    const amount = formatMoney(bp.amountMinor, bp.currency);
    await audit(tx, tenant.id, actor, { action: "billing.paid", entityType: "fund", entityId: tenant.id, summary: `${PLANS[bp.plan].name} plan paid (${amount}, ${bp.months} month${bp.months === 1 ? "" : "s"}), active until ${paidThrough}` });
    await notifyRoles(tx, tenant.id, ["owner"], { kind: "billing", title: `You're on ${PLANS[bp.plan].name}`, body: `Thanks! Your plan is paid through ${paidThrough}.`, link: "/billing" });
    return done;
  });
}

export const isBillingReference = (reference: string) => reference.startsWith("AWA-SUB-");

/**
 * Daily: remind owners before a paid term ends, and move funds whose grace period has
 * passed back to Free. Returns what changed for logging.
 */
export async function applyPlanLifecycle(db: Db, today: string) {
  const reminders = [7, 1, 0].map((d) => addDays(today, d));
  const due = await db.select().from(tenants).where(and(ne(tenants.plan, "free"), inArray(tenants.planExpiresAt, reminders)));
  for (const t of due) {
    const days = Math.round((Date.parse(`${t.planExpiresAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
    await notifyRoles(db, t.id, ["owner"], {
      kind: "billing",
      title: days === 0 ? "Your plan ends today" : `Your plan ends in ${days} day${days === 1 ? "" : "s"}`,
      body: `Renew ${planInfo(t.plan).name} to keep mobile money collection and your member limit. After ${GRACE_DAYS} days' grace the fund moves to the Free plan; nothing is deleted.`,
      link: "/billing",
    });
  }

  const cutoff = addDays(today, -GRACE_DAYS);
  const lapsed = await db.select().from(tenants).where(and(ne(tenants.plan, "free"), sql`${tenants.planExpiresAt} < ${cutoff}`));
  for (const t of lapsed) {
    await db.transaction(async (tx) => {
      await tx.update(tenants).set({ plan: "free", planExpiresAt: null }).where(eq(tenants.id, t.id));
      await audit(tx, t.id, { userId: null, name: "Billing" }, { action: "billing.downgraded", entityType: "fund", entityId: t.id, summary: `${planInfo(t.plan).name} plan lapsed on ${t.planExpiresAt}; moved to Free` });
      await notifyRoles(tx, t.id, ["owner"], { kind: "billing", title: "Your fund is now on the Free plan", body: "Your records are all still here. Renew any time to switch mobile money collection back on.", link: "/billing" });
    });
  }
  return { reminded: due.length, downgraded: lapsed.length };
}

export function assertPendingCheckout(row: { status: string } | undefined) {
  if (!row) throw notFound("Subscription payment");
  if (row.status !== "pending") throw conflict("This payment has already been processed");
}
