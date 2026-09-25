import type { ClaimType, ContributionStatus, LoanStatus, Standing } from "../enums";
import { OPEN_LOAN_STATUSES } from "../enums";
import type { Minor } from "../money";
import { monthsBetween, periodOf, type Period } from "../period";
import type { FundSettings, WelfarePackage } from "../settings";

// ---------------------------------------------------------------- standing

/** Count missed periods at the end of the member's history (most recent first). */
export function trailingMissed(history: { period: Period; status: ContributionStatus }[]): number {
  const sorted = [...history].sort((a, b) => b.period.localeCompare(a.period));
  let n = 0;
  for (const c of sorted) {
    if (c.status !== "missed") break;
    n++;
  }
  return n;
}

export function standingFor(missedInARow: number, rules: FundSettings["standing"]): Standing {
  if (missedInARow >= rules.voidAfterMissed) return "voided";
  if (missedInARow >= rules.behindAfterMissed) return "behind";
  return "active";
}

/** Classify a payment against the period it covers and the fund's due day. */
export function classifyPayment(period: Period, paidOn: string, dueDay: number): ContributionStatus {
  const paidPeriod = periodOf(paidOn);
  if (paidPeriod < period) return "advance";
  if (paidPeriod > period) return "late";
  return Number(paidOn.slice(8, 10)) > dueDay ? "late" : "on_time";
}

// ---------------------------------------------------------------- credit score

export interface CreditInputs {
  joinedOn: string;
  attendancePct: number;
  standing: Standing;
  minContributionMinor: Minor;
  /** Contributions over the whole membership (amount 0 for missed). */
  contributions: { period: Period; amountMinor: Minor; status: ContributionStatus }[];
  loans: { status: LoanStatus; penaltiesMinor: Minor }[];
  asOf: Date;
}

export interface CreditScore {
  total: number;
  pillars: { key: string; label: string; points: number; max: number; note: string }[];
}

/**
 * 1,000-point score made of five 200-point pillars. It is deterministic and
 * explainable: every point can be traced back to a rule shown in the UI.
 */
export function creditScore(i: CreditInputs): CreditScore {
  const tenure = monthsBetween(i.joinedOn, i.asOf);
  const tenurePts = tenure >= 36 ? 200 : tenure >= 24 ? 150 : tenure >= 12 ? 100 : tenure >= 6 ? 50 : 0;

  const paid = i.contributions.filter((c) => c.status !== "missed");
  const avg = paid.length ? paid.reduce((s, c) => s + c.amountMinor, 0) / paid.length : 0;
  const min = i.minContributionMinor;
  const amountPts = avg > min * 2 ? 200 : avg > min ? 150 : avg >= min && avg > 0 ? 100 : 0;

  // Regularity looks at the last 12 recorded periods so old slips eventually stop counting.
  const recent = [...i.contributions].sort((a, b) => b.period.localeCompare(a.period)).slice(0, 12);
  const missed = recent.filter((c) => c.status === "missed").length;
  const late = recent.filter((c) => c.status === "late").length;
  let regularityPts = 200;
  if (missed >= 2 || i.standing !== "active") regularityPts = 50;
  else if (late > 2 || missed === 1) regularityPts = 100;
  if (recent.length === 0) regularityPts = 0;

  // Only loans that were actually disbursed say anything about repayment behaviour.
  const history = i.loans.filter((l) => !["pending_committee", "pending_manager", "declined"].includes(l.status));
  const bad = history.some((l) => l.status === "overdue" || l.status === "defaulted" || l.status === "written_off");
  const penalised = history.some((l) => l.penaltiesMinor > 0);
  const loanPts = bad ? 50 : penalised ? 100 : 200;

  const participationPts = Math.round(Math.max(0, Math.min(100, i.attendancePct)) * 2);

  const pillars = [
    { key: "tenure", label: "Membership length", points: tenurePts, max: 200, note: `${tenure} months as a member` },
    { key: "amount", label: "Contribution size", points: amountPts, max: 200, note: paid.length ? `Average ${(avg / 100).toFixed(2)} vs minimum ${(min / 100).toFixed(2)}` : "No contributions yet" },
    { key: "regularity", label: "Payment regularity", points: regularityPts, max: 200, note: `${missed} missed, ${late} late in last ${recent.length} periods` },
    { key: "loans", label: "Loan repayment", points: loanPts, max: 200, note: bad ? "Has an overdue or defaulted loan" : penalised ? "Penalties applied on past loans" : history.length ? "Clean repayment record" : "No loan history" },
    { key: "participation", label: "Participation", points: participationPts, max: 200, note: `${i.attendancePct}% meeting attendance` },
  ];
  return { total: pillars.reduce((s, p) => s + p.points, 0), pillars };
}

export function scoreBand(score: number): { label: string; tone: "good" | "ok" | "bad" } {
  if (score >= 750) return { label: "Excellent", tone: "good" };
  if (score >= 600) return { label: "Good", tone: "good" };
  if (score >= 450) return { label: "Fair", tone: "ok" };
  return { label: "Poor", tone: "bad" };
}

// ---------------------------------------------------------------- loan eligibility

export interface EligibilityInputs {
  standing: Standing;
  joinedOn: string;
  score: number;
  totalSavingsMinor: Minor;
  openLoans: { status: LoanStatus }[];
  asOf: Date;
  policy: FundSettings["loanPolicy"];
}

export interface Eligibility {
  eligible: boolean;
  limitMinor: Minor;
  checks: { label: string; ok: boolean; detail: string }[];
}

export function loanEligibility(i: EligibilityInputs): Eligibility {
  const tenure = monthsBetween(i.joinedOn, i.asOf);
  const open = i.openLoans.filter((l) => OPEN_LOAN_STATUSES.includes(l.status)).length;
  const checks = [
    { label: "Good standing", ok: i.standing === "active", detail: i.standing === "active" ? "Dues are up to date" : `Standing is ${i.standing}` },
    { label: `At least ${i.policy.minTenureMonths} months membership`, ok: tenure >= i.policy.minTenureMonths, detail: `${tenure} months` },
    { label: `Credit score ${i.policy.minCreditScore}+`, ok: i.score >= i.policy.minCreditScore, detail: `Score ${i.score}` },
    { label: "No other open loans", ok: open < i.policy.maxOpenLoans, detail: open ? `${open} open` : "None open" },
  ];
  const scoreFactor = Math.max(0.5, i.score / 1000);
  const raw = Math.round(i.totalSavingsMinor * i.policy.savingsMultiplier * scoreFactor);
  const limitMinor = i.standing === "active" ? Math.max(i.policy.minLimitMinor, Math.min(i.policy.maxLimitMinor, raw)) : 0;
  return { eligible: checks.every((c) => c.ok), limitMinor, checks };
}

// ---------------------------------------------------------------- welfare

export function welfareRemaining(
  pkg: WelfarePackage,
  approvedThisYear: { type: ClaimType; amountMinor: Minor }[],
): Record<ClaimType, Minor> {
  const used = (t: ClaimType) => approvedThisYear.filter((c) => c.type === t).reduce((s, c) => s + c.amountMinor, 0);
  return {
    medical: Math.max(0, pkg.limits.medical - used("medical")),
    funeral: Math.max(0, pkg.limits.funeral - used("funeral")),
    welfare: Math.max(0, pkg.limits.welfare - used("welfare")),
    emergency: Math.max(0, pkg.limits.emergency - used("emergency")),
  };
}
