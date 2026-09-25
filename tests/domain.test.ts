import { describe, expect, it } from "vitest";
import { allocateRepayment, flatInterest, outstanding, quoteLoan, repaymentSchedule } from "../shared/domain/loans";
import { classifyPayment, creditScore, loanEligibility, standingFor, trailingMissed, welfareRemaining } from "../shared/domain/members";
import { MICRO, microSharesFor, priceForPeriod, sharesValueMinor } from "../shared/domain/shares";
import { formatMoney, splitEvenly, toMinor } from "../shared/money";
import { addMonths, addMonthsToDate, monthsBetween, periodRange } from "../shared/period";
import { defaultSettings, fundSettingsSchema } from "../shared/settings";

describe("money", () => {
  it("converts without float drift", () => {
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(toMinor("1,234.56")).toBe(123456);
  });
  it("splits evenly with exact total", () => {
    const parts = splitEvenly(1000, 3);
    expect(parts).toEqual([333, 333, 334]);
    expect(parts.reduce((a, b) => a + b)).toBe(1000);
  });
  it("formats currency", () => {
    expect(formatMoney(123456, "GHS")).toBe("GHS 1,234.56");
  });
});

describe("periods", () => {
  it("adds months across years", () => {
    expect(addMonths("2025-11", 3)).toBe("2026-02");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(periodRange("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
  it("clamps month-end dates", () => {
    expect(addMonthsToDate("2026-01-31", 1)).toBe("2026-02-28");
  });
  it("counts whole months", () => {
    expect(monthsBetween("2025-01-15", "2025-07-14")).toBe(5);
    expect(monthsBetween("2025-01-15", "2025-07-15")).toBe(6);
  });
});

describe("loans", () => {
  it("uses flat interest pro-rated by term", () => {
    // 5,000 at 15% for 12 months = 750; for 6 months = 375
    expect(flatInterest(500_000, 1500, 12)).toBe(75_000);
    expect(flatInterest(500_000, 1500, 6)).toBe(37_500);
  });
  it("builds a schedule that sums to the total", () => {
    const q = quoteLoan(300_000, 800, 10);
    const rows = repaymentSchedule(q.principalMinor, q.interestMinor, 10, "2026-01-15");
    expect(rows).toHaveLength(10);
    expect(rows.reduce((s, r) => s + r.installmentMinor, 0)).toBe(q.totalMinor);
    expect(rows.at(-1)!.balanceAfterMinor).toBe(0);
    expect(rows[0].dueOn).toBe("2026-02-15");
  });
  it("allocates penalties first then pro-rata", () => {
    const due = outstanding({ principalMinor: 100_000, interestMinor: 10_000, penaltiesMinor: 5_000, paidPrincipalMinor: 0, paidInterestMinor: 0, paidPenaltyMinor: 0 });
    const a = allocateRepayment(due, 16_000);
    expect(a.penaltyMinor).toBe(5_000);
    expect(a.interestMinor + a.principalMinor).toBe(11_000);
    expect(a.interestMinor).toBe(1_000);
  });
  it("settles exactly on full payoff and rejects overpayment", () => {
    const due = outstanding({ principalMinor: 333, interestMinor: 7, penaltiesMinor: 0, paidPrincipalMinor: 0, paidInterestMinor: 0, paidPenaltyMinor: 0 });
    expect(allocateRepayment(due, 340)).toEqual({ penaltyMinor: 0, interestMinor: 7, principalMinor: 333 });
    expect(() => allocateRepayment(due, 341)).toThrow();
  });
});

describe("shares", () => {
  const prices = [
    { effectivePeriod: "2019-01", priceMinor: 2000 },
    { effectivePeriod: "2022-01", priceMinor: 2400 },
  ];
  it("uses effective-dated prices", () => {
    expect(priceForPeriod(prices, "2021-12")).toBe(2000);
    expect(priceForPeriod(prices, "2022-01")).toBe(2400);
    expect(priceForPeriod(prices, "2018-05")).toBe(2000);
  });
  it("computes micro-shares exactly", () => {
    expect(microSharesFor(2800, 2000)).toBe(1.4 * MICRO);
    expect(sharesValueMinor(10 * MICRO, 2400)).toBe(24_000);
  });
});

describe("member rules", () => {
  const rules = { behindAfterMissed: 2, voidAfterMissed: 3 };
  it("derives standing from trailing missed periods", () => {
    const h = [
      { period: "2026-01", status: "on_time" as const },
      { period: "2026-02", status: "missed" as const },
      { period: "2026-03", status: "missed" as const },
    ];
    expect(trailingMissed(h)).toBe(2);
    expect(standingFor(2, rules)).toBe("behind");
    expect(standingFor(3, rules)).toBe("voided");
    expect(standingFor(1, rules)).toBe("active");
  });
  it("classifies payments against the due day", () => {
    expect(classifyPayment("2026-05", "2026-05-05", 10)).toBe("on_time");
    expect(classifyPayment("2026-05", "2026-05-22", 10)).toBe("late");
    expect(classifyPayment("2026-05", "2026-04-28", 10)).toBe("advance");
    expect(classifyPayment("2026-05", "2026-06-01", 10)).toBe("late");
  });
  it("scores a long-standing, regular member highly", () => {
    const contributions = periodRange("2023-01", "2026-04").map((period) => ({ period, amountMinor: 12_000, status: "on_time" as const }));
    const s = creditScore({ joinedOn: "2023-01-01", attendancePct: 95, standing: "active", minContributionMinor: 3000, contributions, loans: [], asOf: new Date("2026-05-01") });
    expect(s.total).toBe(200 + 200 + 200 + 200 + 190);
  });
  it("gates eligibility and clamps the limit", () => {
    const policy = defaultSettings().loanPolicy;
    const e = loanEligibility({ standing: "active", joinedOn: "2020-01-01", score: 800, totalSavingsMinor: 1_000_000, openLoans: [], asOf: new Date("2026-05-01"), policy });
    expect(e.eligible).toBe(true);
    expect(e.limitMinor).toBe(policy.maxLimitMinor);
    const b = loanEligibility({ standing: "behind", joinedOn: "2026-03-01", score: 300, totalSavingsMinor: 0, openLoans: [{ status: "active" }], asOf: new Date("2026-05-01"), policy });
    expect(b.eligible).toBe(false);
    expect(b.checks.filter((c) => !c.ok)).toHaveLength(4);
    expect(b.limitMinor).toBe(0);
  });
  it("tracks welfare limits per claim type", () => {
    const pkg = defaultSettings().welfarePackages[0];
    const r = welfareRemaining(pkg, [{ type: "medical", amountMinor: 40_000 }]);
    expect(r.medical).toBe(60_000);
    expect(r.funeral).toBe(pkg.limits.funeral);
  });
});

describe("settings", () => {
  it("defaults are valid", () => {
    expect(fundSettingsSchema.safeParse(defaultSettings()).success).toBe(true);
  });
  it("rejects inconsistent thresholds", () => {
    const s = defaultSettings();
    s.standing.voidAfterMissed = 1;
    expect(fundSettingsSchema.safeParse(s).success).toBe(false);
  });
});
