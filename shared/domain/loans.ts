import { addMonthsToDate } from "../period";
import { splitEvenly, type Minor } from "../money";

/**
 * Loans use flat (straight-line) interest fixed at approval:
 *   interest = principal × annual rate × (term / 12)
 * The same formula is used everywhere — quotes, approvals, balances — so there is one source of truth.
 */
export function flatInterest(principalMinor: Minor, rateBps: number, termMonths: number): Minor {
  return Math.round((principalMinor * rateBps * termMonths) / (10_000 * 12));
}

export interface LoanQuote {
  principalMinor: Minor;
  interestMinor: Minor;
  totalMinor: Minor;
  installmentMinor: Minor;
  termMonths: number;
}

export function quoteLoan(principalMinor: Minor, rateBps: number, termMonths: number): LoanQuote {
  const interestMinor = flatInterest(principalMinor, rateBps, termMonths);
  const totalMinor = principalMinor + interestMinor;
  return {
    principalMinor,
    interestMinor,
    totalMinor,
    installmentMinor: Math.ceil(totalMinor / termMonths),
    termMonths,
  };
}

export interface ScheduleRow {
  n: number;
  dueOn: string;
  principalMinor: Minor;
  interestMinor: Minor;
  installmentMinor: Minor;
  balanceAfterMinor: Minor;
}

export function repaymentSchedule(
  principalMinor: Minor,
  interestMinor: Minor,
  termMonths: number,
  startDate: string,
): ScheduleRow[] {
  const principalParts = splitEvenly(principalMinor, termMonths);
  const interestParts = splitEvenly(interestMinor, termMonths);
  let balance = principalMinor + interestMinor;
  return principalParts.map((p, i) => {
    const installment = p + interestParts[i];
    balance -= installment;
    return {
      n: i + 1,
      dueOn: addMonthsToDate(startDate, i + 1),
      principalMinor: p,
      interestMinor: interestParts[i],
      installmentMinor: installment,
      balanceAfterMinor: balance,
    };
  });
}

export interface LoanBalances {
  principalMinor: Minor;
  interestMinor: Minor;
  penaltyMinor: Minor;
  totalMinor: Minor;
}

export interface LoanLedgerState {
  principalMinor: Minor;
  interestMinor: Minor;
  penaltiesMinor: Minor;
  paidPrincipalMinor: Minor;
  paidInterestMinor: Minor;
  paidPenaltyMinor: Minor;
}

export function outstanding(s: LoanLedgerState): LoanBalances {
  const principalMinor = Math.max(0, s.principalMinor - s.paidPrincipalMinor);
  const interestMinor = Math.max(0, s.interestMinor - s.paidInterestMinor);
  const penaltyMinor = Math.max(0, s.penaltiesMinor - s.paidPenaltyMinor);
  return { principalMinor, interestMinor, penaltyMinor, totalMinor: principalMinor + interestMinor + penaltyMinor };
}

export interface RepaymentAllocation {
  penaltyMinor: Minor;
  interestMinor: Minor;
  principalMinor: Minor;
}

/**
 * Split a repayment: penalties are cleared first, then the rest is shared between
 * interest and principal in proportion to what is still owed on each. That matches
 * how a flat-rate schedule amortises, so early payoff doesn't front-load interest.
 */
export function allocateRepayment(due: LoanBalances, amountMinor: Minor): RepaymentAllocation {
  if (amountMinor <= 0) throw new Error("Repayment must be positive");
  if (amountMinor > due.totalMinor) throw new Error("Repayment exceeds the outstanding balance");

  const penaltyMinor = Math.min(amountMinor, due.penaltyMinor);
  const rest = amountMinor - penaltyMinor;
  const base = due.interestMinor + due.principalMinor;
  if (rest === 0 || base === 0) return { penaltyMinor, interestMinor: 0, principalMinor: 0 };

  if (rest === base) return { penaltyMinor, interestMinor: due.interestMinor, principalMinor: due.principalMinor };
  let interestMinor = Math.round((rest * due.interestMinor) / base);
  interestMinor = Math.min(interestMinor, due.interestMinor);
  let principalMinor = rest - interestMinor;
  if (principalMinor > due.principalMinor) {
    interestMinor += principalMinor - due.principalMinor;
    principalMinor = due.principalMinor;
  }
  return { penaltyMinor, interestMinor, principalMinor };
}

/** Amount scheduled to have been paid by `asOf`, used to flag arrears. */
export function scheduledPaidBy(schedule: ScheduleRow[], asOf: string): Minor {
  return schedule.filter((r) => r.dueOn <= asOf).reduce((s, r) => s + r.installmentMinor, 0);
}
