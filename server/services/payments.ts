import { and, eq } from "drizzle-orm";
import { formatMoney } from "../../shared/money";
import { formatPeriod } from "../../shared/period";
import type { PaymentInitInput } from "../../shared/schemas";
import type { Db } from "../db/client";
import { loans, memberships, payments, tenants } from "../db/schema";
import type { Actor, Deps, Membership, Tenant } from "../lib/context";
import { randomToken } from "../lib/crypto";
import { AppError, conflict, notFound, unprocessable } from "../lib/http";
import { audit, notifyMember, notifyRoles } from "../lib/records";
import { loanBalances } from "./loans";
import { recordContribution } from "./savings";
import { recordRepayment } from "./loans";

export type Payment = typeof payments.$inferSelect;

export async function initiatePayment(deps: Deps, tenant: Tenant, member: Membership, userEmail: string, input: PaymentInitInput) {
  const { db, payments: provider } = deps;
  let amountMinor: number;
  let target: Payment["target"];
  let description: string;

  if (input.purpose === "contribution") {
    if (input.amountPerPeriodMinor < tenant.settings.minContributionMinor) {
      throw unprocessable(`Minimum contribution is ${formatMoney(tenant.settings.minContributionMinor, tenant.currency)} per month`);
    }
    const periods = [...new Set(input.periods)].sort();
    amountMinor = input.amountPerPeriodMinor * periods.length;
    target = { periods };
    description = `Contribution for ${periods.map((p) => formatPeriod(p)).join(", ")}`;
  } else {
    const [loan] = await db.select().from(loans).where(and(eq(loans.tenantId, tenant.id), eq(loans.id, input.loanId), eq(loans.membershipId, member.id)));
    if (!loan) throw notFound("Loan");
    const due = loanBalances(loan).totalMinor;
    if (input.amountMinor > due) throw unprocessable(`Amount exceeds the outstanding balance of ${formatMoney(due, tenant.currency)}`);
    amountMinor = input.amountMinor;
    target = { loanId: loan.id };
    description = `Repayment on ${loan.ref}`;
  }

  const reference = `FND-${randomToken(9).replace(/[^A-Za-z0-9]/g, "").slice(0, 12).toUpperCase()}`;
  const [payment] = await db
    .insert(payments)
    .values({
      tenantId: tenant.id,
      membershipId: member.id,
      purpose: input.purpose,
      target,
      amountMinor,
      currency: tenant.currency,
      provider: provider.name,
      providerRef: reference,
      network: input.network,
      phone: input.phone,
    })
    .returning();

  let result;
  try {
    result = await provider.charge({
      reference,
      amountMinor,
      currency: tenant.currency,
      email: member.email ?? userEmail,
      phone: input.phone,
      network: input.network,
      metadata: { tenantId: tenant.id, paymentId: payment.id, description },
    });
  } catch (err) {
    result = { status: "failed" as const, failureReason: `Gateway unreachable: ${(err as Error).message}` };
  }

  if (result.status !== "pending") {
    await completePayment(deps, provider.name, reference, { status: result.status, amountMinor, failureReason: result.failureReason });
  }
  const [fresh] = await db.select().from(payments).where(eq(payments.id, payment.id));
  return { payment: fresh, displayText: result.displayText, description };
}

/**
 * Apply a gateway outcome. Idempotent: webhooks are retried by gateways and may
 * race with a manual "check status" — the row lock plus the pending-only guard
 * make sure money is allocated exactly once.
 */
export async function completePayment(
  deps: Deps,
  provider: string,
  reference: string,
  outcome: { status: "succeeded" | "failed"; amountMinor: number; failureReason?: string },
) {
  const today = deps.clock.now().toISOString().slice(0, 10);
  return deps.db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(and(eq(payments.provider, provider), eq(payments.providerRef, reference))).for("update");
    if (!payment) throw notFound("Payment");
    if (payment.status !== "pending") return payment;

    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, payment.tenantId));
    const [member] = await tx.select().from(memberships).where(eq(memberships.id, payment.membershipId));
    const actor: Actor = { userId: null, name: `Payment gateway (${provider})`, membershipId: undefined };
    const amount = formatMoney(payment.amountMinor, payment.currency);

    if (outcome.status === "failed") {
      const [p] = await tx.update(payments).set({ status: "failed", failureReason: outcome.failureReason ?? "Declined", completedAt: new Date() }).where(eq(payments.id, payment.id)).returning();
      await audit(tx, tenant.id, actor, { action: "payment.failed", entityType: "payment", entityId: payment.id, summary: `MoMo payment of ${amount} from ${member.name} failed: ${p.failureReason}` });
      await notifyMember(tx, tenant.id, member.id, { kind: "payment", title: "Payment failed", body: `Your payment of ${amount} did not go through. ${p.failureReason}`, link: "/portal" });
      return p;
    }

    if (outcome.amountMinor !== payment.amountMinor) {
      // Never trust a mismatched amount: park it for a human instead of allocating.
      const [p] = await tx.update(payments).set({ status: "succeeded", failureReason: `Amount mismatch: expected ${payment.amountMinor}, received ${outcome.amountMinor}. Needs manual allocation.`, completedAt: new Date() }).where(eq(payments.id, payment.id)).returning();
      await notifyRoles(tx, tenant.id, ["manager", "owner"], { kind: "payment", title: "Payment needs attention", body: p.failureReason!, link: "/payments" });
      return p;
    }

    let allocationError: string | null = null;
    try {
      // A savepoint: if allocation fails we still record that money arrived.
      await tx.transaction(async (sp) => {
        if (payment.purpose === "contribution") {
          const periods = payment.target.periods ?? [];
          const each = Math.floor(payment.amountMinor / periods.length);
          for (const [i, period] of periods.entries()) {
            const amt = i === periods.length - 1 ? payment.amountMinor - each * (periods.length - 1) : each;
            await recordContribution(sp, tenant, actor, { membershipId: member.id, period, amountMinor: amt, paidOn: today, method: "momo", paymentId: payment.id, today });
          }
        } else {
          await recordRepayment(sp, tenant, actor, payment.target.loanId!, { amountMinor: payment.amountMinor, paidOn: today, method: "momo", paymentId: payment.id });
        }
      });
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      allocationError = err.message;
    }

    const [p] = await tx
      .update(payments)
      .set({ status: "succeeded", failureReason: allocationError ? `Received but not allocated: ${allocationError}` : null, completedAt: new Date() })
      .where(eq(payments.id, payment.id))
      .returning();
    await audit(tx, tenant.id, actor, { action: "payment.succeeded", entityType: "payment", entityId: payment.id, summary: `Received ${amount} via MoMo from ${member.name} (${reference})${allocationError ? ` — NOT allocated: ${allocationError}` : ""}` });
    await notifyMember(tx, tenant.id, member.id, { kind: "payment", title: "Payment received", body: `Thank you! ${amount} was received (ref ${reference}).`, link: "/portal" });
    await notifyRoles(tx, tenant.id, ["manager", "owner"], {
      kind: "payment",
      title: allocationError ? "Payment needs manual allocation" : "Payment received",
      body: `${member.name} paid ${amount} via MoMo.${allocationError ? ` ${allocationError}` : ""}`,
      link: "/payments",
    });
    return p;
  });
}

export async function simulateOutcome(deps: Deps, db: Db, tenantId: string, paymentId: string, outcome: "succeeded" | "failed") {
  if (!deps.payments.simulated) throw conflict("Simulation is only available with the mock payment provider");
  const [p] = await db.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId)));
  if (!p) throw notFound("Payment");
  return completePayment(deps, p.provider, p.providerRef, { status: outcome, amountMinor: p.amountMinor, failureReason: outcome === "failed" ? "Declined by payer (simulated)" : undefined });
}
