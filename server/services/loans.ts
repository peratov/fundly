import { and, eq, inArray, sql } from "drizzle-orm";
import { OPEN_LOAN_STATUSES, OUTSTANDING_LOAN_STATUSES, type PaymentMethod } from "../../shared/enums";
import { allocateRepayment, outstanding, quoteLoan, repaymentSchedule, scheduledPaidBy } from "../../shared/domain/loans";
import { formatMoney } from "../../shared/money";
import { addMonthsToDate } from "../../shared/period";
import type { Db } from "../db/client";
import { loanPenalties, loanRepayments, loanReviews, loans, memberships } from "../db/schema";
import type { Actor, Tenant } from "../lib/context";
import { conflict, forbidden, notFound, unprocessable } from "../lib/http";
import { postJournal } from "../lib/ledger";
import { audit, nextRef, notifyMember, notifyRoles } from "../lib/records";
import { memberSnapshot } from "./members";

export type Loan = typeof loans.$inferSelect;

export function loanBalances(l: Loan) {
  return outstanding({
    principalMinor: l.principalMinor,
    interestMinor: l.interestMinor,
    penaltiesMinor: l.penaltiesMinor,
    paidPrincipalMinor: l.paidPrincipalMinor,
    paidInterestMinor: l.paidInterestMinor,
    paidPenaltyMinor: l.paidPenaltyMinor,
  });
}

export function loanView(l: Loan, today: string) {
  const balance = loanBalances(l);
  const schedule = l.disbursedOn ? repaymentSchedule(l.principalMinor, l.interestMinor, l.termMonths, l.disbursedOn) : [];
  const paid = l.paidPrincipalMinor + l.paidInterestMinor;
  const arrearsMinor = l.disbursedOn ? Math.max(0, scheduledPaidBy(schedule, today) - paid) : 0;
  return {
    ...l,
    balance,
    schedule,
    arrearsMinor,
    maturesOn: l.disbursedOn ? addMonthsToDate(l.disbursedOn, l.termMonths) : null,
    totalRepayableMinor: l.principalMinor + l.interestMinor + l.penaltiesMinor,
  };
}

async function loadLoan(tx: Db, tenantId: string, id: string, lock = false) {
  const q = tx.select().from(loans).where(and(eq(loans.tenantId, tenantId), eq(loans.id, id)));
  const [l] = lock ? await q.for("update") : await q;
  if (!l) throw notFound("Loan");
  return l;
}

// ---------------------------------------------------------------- application

export async function applyForLoan(
  tx: Db,
  tenant: Tenant,
  actor: Actor,
  input: { membershipId: string; productCode: string; principalMinor: number; termMonths: number; purpose: string; requestSpecialReview: boolean; asOf: Date },
) {
  const product = tenant.settings.loanProducts.find((p) => p.code === input.productCode && p.active);
  if (!product) throw unprocessable("Unknown or inactive loan product");
  if (input.termMonths > product.maxTermMonths) throw unprocessable(`${product.name} allows at most ${product.maxTermMonths} months`);
  if (input.principalMinor > product.maxAmountMinor) throw unprocessable(`${product.name} is capped at ${formatMoney(product.maxAmountMinor, tenant.currency)}`);

  // Serialize applications per member so two concurrent requests can't both pass the "no open loan" rule.
  await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.id, input.membershipId)).for("update");
  const snap = await memberSnapshot(tx, tenant, input.membershipId, input.asOf);
  if (snap.member.status !== "active") throw unprocessable("Member has exited the fund");

  const openCount = snap.loans.filter((l) => OPEN_LOAN_STATUSES.includes(l.status)).length;
  if (openCount >= tenant.settings.loanPolicy.maxOpenLoans) throw conflict("This member already has an open loan or application");

  const limitOk = input.principalMinor <= snap.eligibility.limitMinor;
  if ((!snap.eligibility.eligible || !limitOk) && !input.requestSpecialReview) {
    const reasons = snap.eligibility.checks.filter((c) => !c.ok).map((c) => c.label);
    if (!limitOk) reasons.push(`amount above limit of ${formatMoney(snap.eligibility.limitMinor, tenant.currency)}`);
    throw unprocessable(`Not eligible: ${reasons.join("; ")}. You can request a special committee review instead.`, { checks: snap.eligibility.checks });
  }
  const q = quoteLoan(input.principalMinor, product.rateBps, input.termMonths);
  const ref = await nextRef(tx, tenant.id, "loan", "L");
  const [loan] = await tx
    .insert(loans)
    .values({
      tenantId: tenant.id,
      ref,
      membershipId: input.membershipId,
      productCode: product.code,
      productName: product.name,
      principalMinor: q.principalMinor,
      rateBps: product.rateBps,
      termMonths: input.termMonths,
      interestMinor: q.interestMinor,
      purpose: input.purpose,
      specialReview: !snap.eligibility.eligible || !limitOk,
      status: "pending_committee",
    })
    .returning();

  const amount = formatMoney(q.principalMinor, tenant.currency);
  await audit(tx, tenant.id, actor, {
    action: "loan.applied",
    entityType: "loan",
    entityId: loan.id,
    summary: `${snap.member.name} applied for ${product.name} ${ref}: ${amount} over ${input.termMonths} months${loan.specialReview ? " (special review)" : ""}`,
    data: { productCode: product.code, principalMinor: q.principalMinor, termMonths: input.termMonths, score: snap.score.total },
  });
  await notifyRoles(tx, tenant.id, ["credit_committee"], {
    kind: "loan_review",
    title: `Loan ${ref} needs review`,
    body: `${snap.member.name} requested ${amount} (${product.name}) for "${input.purpose}".`,
    link: `/loans/${loan.id}`,
  });
  await notifyMember(tx, tenant.id, input.membershipId, {
    kind: "loan_update",
    title: `Application ${ref} received`,
    body: `Your ${product.name} request for ${amount} is with the credit committee.`,
    link: "/portal/loans",
  });
  return loan;
}

// ---------------------------------------------------------------- committee review

export async function reviewLoan(tx: Db, tenant: Tenant, actor: Actor, loanId: string, input: { decision: "approve" | "decline"; notes: string }) {
  const loan = await loadLoan(tx, tenant.id, loanId, true);
  if (loan.status !== "pending_committee") throw conflict("This loan is no longer awaiting committee review");
  if (!actor.membershipId) throw forbidden();
  if (loan.membershipId === actor.membershipId) throw forbidden("You can't review your own loan application");

  const inserted = await tx
    .insert(loanReviews)
    .values({ tenantId: tenant.id, loanId, reviewerMembershipId: actor.membershipId, reviewerName: actor.name, decision: input.decision, notes: input.notes })
    .onConflictDoNothing()
    .returning();
  if (!inserted.length) throw conflict("You have already reviewed this application");

  const reviews = await tx.select().from(loanReviews).where(eq(loanReviews.loanId, loanId));
  const quorum = tenant.settings.loanPolicy.committeeQuorum;
  const approvals = reviews.filter((r) => r.decision === "approve").length;
  const declines = reviews.length - approvals;
  const advanced = reviews.length >= quorum;
  if (advanced) await tx.update(loans).set({ status: "pending_manager" }).where(eq(loans.id, loanId));

  await audit(tx, tenant.id, actor, {
    action: "loan.reviewed",
    entityType: "loan",
    entityId: loanId,
    summary: `${actor.name} recommended ${input.decision.toUpperCase()} on ${loan.ref}: ${input.notes}`,
    data: { decision: input.decision, approvals, declines, quorum },
  });
  if (advanced) {
    await notifyRoles(tx, tenant.id, ["manager", "owner"], {
      kind: "loan_decision",
      title: `Loan ${loan.ref} ready for decision`,
      body: `Committee finished review: ${approvals} approve, ${declines} decline.`,
      link: `/loans/${loanId}`,
    });
  }
  return { advanced, approvals, declines, quorum };
}

// ---------------------------------------------------------------- manager decision

export async function decideLoan(
  tx: Db,
  tenant: Tenant,
  actor: Actor,
  loanId: string,
  input: { decision: "approve" | "decline"; notes: string; disbursedOn: string },
) {
  const loan = await loadLoan(tx, tenant.id, loanId, true);
  // Approval needs the committee's recommendation first; a manager may decline at any review stage
  // (e.g. the member is leaving, or the application is plainly outside policy).
  if (input.decision === "approve" && loan.status !== "pending_manager") {
    throw conflict(loan.status === "pending_committee" ? "The credit committee must review this loan before it can be approved" : "This loan is not awaiting a manager decision");
  }
  if (input.decision === "decline" && loan.status !== "pending_manager" && loan.status !== "pending_committee") throw conflict("Only applications in review can be declined");
  if (loan.membershipId === actor.membershipId) throw forbidden("You can't decide on your own loan");

  const approve = input.decision === "approve";
  const [updated] = await tx
    .update(loans)
    .set({
      status: approve ? "active" : "declined",
      decisionNotes: input.notes || null,
      decidedBy: actor.userId,
      decidedAt: new Date(),
      disbursedOn: approve ? input.disbursedOn : null,
      closedOn: approve ? null : input.disbursedOn,
    })
    .where(eq(loans.id, loanId))
    .returning();

  const [m] = await tx.select({ name: memberships.name }).from(memberships).where(eq(memberships.id, loan.membershipId));
  const amount = formatMoney(loan.principalMinor, tenant.currency);
  if (approve) {
    await postJournal(tx, {
      tenantId: tenant.id,
      occurredOn: input.disbursedOn,
      memo: `Loan ${loan.ref} disbursed — ${m.name}`,
      sourceType: "loan_disbursement",
      sourceId: loan.id,
      createdBy: actor.userId,
      lines: [
        { account: "loans_receivable", debit: loan.principalMinor, membershipId: loan.membershipId },
        { account: "cash", credit: loan.principalMinor },
      ],
    });
  }
  await audit(tx, tenant.id, actor, {
    action: approve ? "loan.approved" : "loan.declined",
    entityType: "loan",
    entityId: loanId,
    summary: `${approve ? "Approved and disbursed" : "Declined"} ${loan.ref} for ${m.name} (${amount})${input.notes ? `: ${input.notes}` : ""}`,
  });
  await notifyMember(tx, tenant.id, loan.membershipId, {
    kind: "loan_update",
    title: approve ? `Loan ${loan.ref} approved` : `Loan ${loan.ref} declined`,
    body: approve ? `${amount} has been approved and disbursed. First instalment is due in one month.` : `Your application was not approved.${input.notes ? ` Reason: ${input.notes}` : ""}`,
    link: "/portal/loans",
  });
  return updated;
}

// ---------------------------------------------------------------- servicing

export async function recordRepayment(
  tx: Db,
  tenant: Tenant,
  actor: Actor,
  loanId: string,
  input: { amountMinor: number; paidOn: string; method: PaymentMethod; paymentId?: string | null },
) {
  const loan = await loadLoan(tx, tenant.id, loanId, true);
  if (!OUTSTANDING_LOAN_STATUSES.includes(loan.status)) throw conflict(`Loan ${loan.ref} is not open for repayments`);
  const due = loanBalances(loan);
  if (input.amountMinor > due.totalMinor) {
    throw unprocessable(`Amount exceeds the outstanding balance of ${formatMoney(due.totalMinor, tenant.currency)}`);
  }
  const a = allocateRepayment(due, input.amountMinor);
  const settled = input.amountMinor === due.totalMinor;
  const after = { ...loan, paidPrincipalMinor: loan.paidPrincipalMinor + a.principalMinor, paidInterestMinor: loan.paidInterestMinor + a.interestMinor };
  const caughtUp = loan.status === "overdue" && loanView(after, input.paidOn).arrearsMinor === 0 && loanBalances(after).penaltyMinor - a.penaltyMinor <= 0;

  await tx.insert(loanRepayments).values({
    tenantId: tenant.id,
    loanId,
    amountMinor: input.amountMinor,
    principalMinor: a.principalMinor,
    interestMinor: a.interestMinor,
    penaltyMinor: a.penaltyMinor,
    paidOn: input.paidOn,
    method: input.method,
    paymentId: input.paymentId ?? null,
    recordedBy: actor.userId,
  });
  const [updated] = await tx
    .update(loans)
    .set({
      paidPrincipalMinor: sql`${loans.paidPrincipalMinor} + ${a.principalMinor}`,
      paidInterestMinor: sql`${loans.paidInterestMinor} + ${a.interestMinor}`,
      paidPenaltyMinor: sql`${loans.paidPenaltyMinor} + ${a.penaltyMinor}`,
      status: settled ? "repaid" : caughtUp ? "active" : loan.status,
      closedOn: settled ? input.paidOn : null,
    })
    .where(eq(loans.id, loanId))
    .returning();

  const [m] = await tx.select({ name: memberships.name }).from(memberships).where(eq(memberships.id, loan.membershipId));
  await postJournal(tx, {
    tenantId: tenant.id,
    occurredOn: input.paidOn,
    memo: `Repayment on ${loan.ref} — ${m.name}`,
    sourceType: "loan_repayment",
    sourceId: loan.id,
    createdBy: actor.userId,
    lines: [
      { account: "cash", debit: input.amountMinor },
      { account: "loans_receivable", credit: a.principalMinor, membershipId: loan.membershipId },
      { account: "interest_income", credit: a.interestMinor },
      { account: "penalty_income", credit: a.penaltyMinor },
    ],
  });
  await audit(tx, tenant.id, actor, {
    action: "loan.repayment",
    entityType: "loan",
    entityId: loanId,
    summary: `Repayment of ${formatMoney(input.amountMinor, tenant.currency)} on ${loan.ref} (${m.name})${settled ? " — loan fully repaid" : ""}`,
    data: a,
  });
  if (settled) {
    await notifyMember(tx, tenant.id, loan.membershipId, { kind: "loan_update", title: `Loan ${loan.ref} fully repaid`, body: "Congratulations — your loan is settled.", link: "/portal/loans" });
  }
  return updated;
}

/** Penalties are tracked on the loan and recognised as income when collected (cash basis). */
export async function applyPenalty(tx: Db, tenant: Tenant, actor: Actor, loanId: string, input: { amountMinor: number; reason: string }) {
  const loan = await loadLoan(tx, tenant.id, loanId, true);
  if (!OUTSTANDING_LOAN_STATUSES.includes(loan.status)) throw conflict("Penalties can only be applied to outstanding loans");
  await tx.insert(loanPenalties).values({ tenantId: tenant.id, loanId, amountMinor: input.amountMinor, reason: input.reason, createdBy: actor.userId });
  const [updated] = await tx
    .update(loans)
    .set({ penaltiesMinor: sql`${loans.penaltiesMinor} + ${input.amountMinor}`, status: loan.status === "active" ? "overdue" : loan.status })
    .where(eq(loans.id, loanId))
    .returning();
  const amount = formatMoney(input.amountMinor, tenant.currency);
  await audit(tx, tenant.id, actor, { action: "loan.penalty", entityType: "loan", entityId: loanId, summary: `Penalty of ${amount} on ${loan.ref}: ${input.reason}` });
  await notifyMember(tx, tenant.id, loan.membershipId, { kind: "loan_update", title: `Penalty applied to ${loan.ref}`, body: `${amount}: ${input.reason}`, link: "/portal/loans" });
  return updated;
}

/** Move a loan between active / defaulted / written-off. A write-off moves the unpaid principal to expense. */
export async function changeLoanStatus(tx: Db, tenant: Tenant, actor: Actor, loanId: string, input: { status: "active" | "defaulted" | "written_off"; reason: string; today: string }) {
  const loan = await loadLoan(tx, tenant.id, loanId, true);
  if (!OUTSTANDING_LOAN_STATUSES.includes(loan.status)) throw conflict("Only outstanding loans can change status");
  if (loan.status === input.status) return loan;
  const [updated] = await tx
    .update(loans)
    .set({ status: input.status, closedOn: input.status === "written_off" ? input.today : null })
    .where(eq(loans.id, loanId))
    .returning();
  if (input.status === "written_off") {
    const principalLeft = loan.principalMinor - loan.paidPrincipalMinor;
    if (principalLeft > 0) {
      await postJournal(tx, {
        tenantId: tenant.id,
        occurredOn: input.today,
        memo: `Write-off ${loan.ref}: ${input.reason}`,
        sourceType: "loan_write_off",
        sourceId: loan.id,
        createdBy: actor.userId,
        lines: [
          { account: "write_off_expense", debit: principalLeft },
          { account: "loans_receivable", credit: principalLeft, membershipId: loan.membershipId },
        ],
      });
    }
  }
  await audit(tx, tenant.id, actor, { action: `loan.${input.status}`, entityType: "loan", entityId: loanId, summary: `${loan.ref} marked ${input.status.replace("_", " ")}: ${input.reason}` });
  return updated;
}

/**
 * Flag active loans that have fallen behind schedule. Safe to run repeatedly
 * (e.g. nightly); it only moves active → overdue.
 */
export async function flagOverdueLoans(tx: Db, tenant: Tenant, actor: Actor, today: string) {
  const active = await tx.select().from(loans).where(and(eq(loans.tenantId, tenant.id), inArray(loans.status, ["active"])));
  const late = active.filter((l) => loanView(l, today).arrearsMinor > 0);
  for (const l of late) {
    await tx.update(loans).set({ status: "overdue" }).where(eq(loans.id, l.id));
    await notifyMember(tx, tenant.id, l.membershipId, { kind: "loan_update", title: `Loan ${l.ref} is overdue`, body: "A scheduled instalment has been missed. Please pay to avoid penalties.", link: "/portal/loans" });
  }
  if (late.length) {
    await audit(tx, tenant.id, actor, { action: "loan.overdue_scan", entityType: "loan", summary: `${late.length} loan(s) flagged overdue: ${late.map((l) => l.ref).join(", ")}` });
  }
  return late.length;
}
