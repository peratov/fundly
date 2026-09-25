import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { tenants } from "../server/db/schema";
import { periodRange } from "../shared/period";
import { addMemberWithLogin, client, setup, signupFund, type Client, type TestEnv } from "./helpers";

let env: TestEnv;
let owner: Client;
let base: string;
let tenantId: string;

beforeAll(async () => {
  env = await setup();
  ({ c: owner, base, tenantId } = await signupFund(env));
});
afterAll(async () => env.handle.close());

async function trialBalance() {
  const r = await owner.get(`${base}/reports/summary?from=2000-01-01&to=2030-12-31`);
  expect(r.status).toBe(200);
  return r.body;
}

describe("auth & tenancy", () => {
  it("signup creates the fund with the caller as owner", async () => {
    const me = await owner.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.funds).toHaveLength(1);
    expect(me.body.funds[0].roles).toEqual(["owner", "member"]);
  });

  it("rejects bad credentials and duplicate signups", async () => {
    const c = client(env);
    expect((await c.post("/api/auth/login", { email: "owner@fund.test", password: "wrong" })).status).toBe(401);
    const dup = await c.post("/api/auth/signup", { name: "X Y", email: "owner@fund.test", password: "password123", fund: { name: "Other", currency: "GHS", minContributionMinor: 100, sharePriceMinor: 100 } });
    expect(dup.status).toBe(409);
  });

  it("isolates tenants: another fund's owner cannot see this fund", async () => {
    const other = await signupFund(env, "other@fund.test", "Other Owner");
    expect((await other.c.get(`${base}/members`)).status).toBe(404);
    expect((await other.c.get(`${base}/overview`)).status).toBe(404);
    expect((await owner.get(`${other.base}/members`)).status).toBe(404);
  });

  it("requires auth", async () => {
    expect((await client(env).get(`${base}/members`)).status).toBe(401);
  });

  it("blocks cross-site writes by Origin", async () => {
    const res = await env.app.request("/api/auth/logout", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" } });
    expect(res.status).toBe(403);
  });
});

describe("savings, standing and the ledger", () => {
  let peaceId: string;

  it("records contributions, buys shares and books a balanced journal", async () => {
    const m = await owner.post(`${base}/members`, { name: "Peace Gbagbo", email: "peace@fund.test", joinedOn: "2025-01-10", welfarePackageId: "bronze" });
    expect(m.status).toBe(201);
    peaceId = m.body.member.id;
    expect(m.body.member.memberNo).toBe("M-0002");

    for (const period of periodRange("2025-01", "2026-02")) {
      const r = await owner.post(`${base}/contributions`, { membershipId: peaceId, period, amountMinor: 5000, paidOn: `${period}-05`, method: "cash" });
      expect(r.status, r.text).toBe(201);
    }
    const detail = await owner.get(`${base}/members/${peaceId}`);
    // 14 months × (50 - 2 premium) = 672.00 in savings; 672 / 24 = 28 shares
    expect(detail.body.totals.savingsMinor).toBe(14 * 4800);
    expect(detail.body.totals.microShares).toBe(28_000_000);

    const tb = await trialBalance();
    expect(tb.closing.cash).toBe(14 * 5000);
    expect(tb.closing.member_savings + tb.closing.welfare_reserve).toBe(tb.closing.cash);
  });

  it("refuses double payment for the same month and enforces the minimum", async () => {
    const dup = await owner.post(`${base}/contributions`, { membershipId: peaceId, period: "2026-01", amountMinor: 5000, method: "cash" });
    expect(dup.status).toBe(409);
    const low = await owner.post(`${base}/contributions`, { membershipId: peaceId, period: "2026-03", amountMinor: 100, method: "cash" });
    expect(low.status).toBe(422);
  });

  it("closing periods marks missed months and moves standing to behind, then voided", async () => {
    expect((await owner.post(`${base}/contributions/close-period`, { period: "2026-03" })).status).toBe(200);
    expect((await owner.post(`${base}/contributions/close-period`, { period: "2026-04" })).status).toBe(200);
    let d = await owner.get(`${base}/members/${peaceId}`);
    expect(d.body.member.standing).toBe("behind");
    // Idempotent
    const again = await owner.post(`${base}/contributions/close-period`, { period: "2026-04" });
    expect(again.body.markedMissed).toBe(0);
    // The current month cannot be closed yet
    expect((await owner.post(`${base}/contributions/close-period`, { period: "2026-05" })).status).toBe(400);

    // Paying a missed month late restores standing
    const pay = await owner.post(`${base}/contributions`, { membershipId: peaceId, period: "2026-04", amountMinor: 5000, method: "cash" });
    expect(pay.status).toBe(201);
    expect(pay.body.status).toBe("late");
    d = await owner.get(`${base}/members/${peaceId}`);
    expect(d.body.member.standing).toBe("active");
  });

  it("corrections reverse and re-book without breaking the books", async () => {
    const list = await owner.get(`${base}/contributions?membershipId=${peaceId}&period=2026-02`);
    const id = list.body.items[0].id;
    const before = await trialBalance();
    const r = await owner.patch(`${base}/contributions/${id}`, { amountMinor: 8000, status: "on_time", reason: "Receipt showed 80" });
    expect(r.status, r.text).toBe(200);
    const after = await trialBalance();
    expect(after.closing.cash - before.closing.cash).toBe(3000);
    // Correct twice — net booking must still equal the latest figure
    await owner.patch(`${base}/contributions/${id}`, { amountMinor: 6000, status: "on_time", reason: "Second fix" });
    const final = await trialBalance();
    expect(final.closing.cash - before.closing.cash).toBe(1000);
  });
});

describe("loan lifecycle", () => {
  let member: { c: Client; id: string };
  let committee: { c: Client; id: string };
  let loanId: string;

  beforeAll(async () => {
    member = await addMemberWithLogin(env, owner, base, { name: "Edem Alornyo", email: "edem@fund.test", joinedOn: "2021-02-15" });
    committee = await addMemberWithLogin(env, owner, base, { name: "Abigail Dogbey", email: "abigail@fund.test", joinedOn: "2019-03-10", roles: ["credit_committee"] });
    for (const period of periodRange("2023-01", "2026-04")) {
      await owner.post(`${base}/contributions`, { membershipId: member.id, period, amountMinor: 10000, paidOn: `${period}-03`, method: "cash" });
    }
  });

  it("a plain member cannot see the member register", async () => {
    expect((await member.c.get(`${base}/members`)).status).toBe(403);
    expect((await member.c.get(`${base}/me`)).status).toBe(200);
  });

  it("member applies, committee reviews, manager approves and disburses", async () => {
    const me = await member.c.get(`${base}/me`);
    expect(me.body.eligibility.eligible).toBe(true);

    const apply = await member.c.post(`${base}/loans`, { productCode: "personal", principalMinor: 300_000, termMonths: 6, purpose: "Land purchase down-payment" });
    expect(apply.status, apply.text).toBe(201);
    loanId = apply.body.id;
    expect(apply.body.ref).toBe("L-0001");
    expect(apply.body.interestMinor).toBe(15_000); // 3000 × 10% × 6/12

    // A second open application is refused
    expect((await member.c.post(`${base}/loans`, { productCode: "emergency", principalMinor: 10_000, termMonths: 1, purpose: "Second loan attempt" })).status).toBe(409);
    // Manager can't skip the committee
    expect((await owner.post(`${base}/loans/${loanId}/decision`, { decision: "approve" })).status).toBe(409);
    // Borrower can't review their own loan (and lacks the permission anyway)
    expect((await member.c.post(`${base}/loans/${loanId}/reviews`, { decision: "approve", notes: "me" })).status).toBe(403);

    const review = await committee.c.post(`${base}/loans/${loanId}/reviews`, { decision: "approve", notes: "Strong record" });
    expect(review.status, review.text).toBe(200);
    expect(review.body.advanced).toBe(true);
    expect((await committee.c.post(`${base}/loans/${loanId}/reviews`, { decision: "approve", notes: "again" })).status).toBe(409);

    const cashBefore = (await trialBalance()).closing.cash;
    const decide = await owner.post(`${base}/loans/${loanId}/decision`, { decision: "approve", notes: "Approved", disbursedOn: "2026-05-26" });
    expect(decide.status, decide.text).toBe(200);
    expect(decide.body.status).toBe("active");
    const tb = await trialBalance();
    expect(cashBefore - tb.closing.cash).toBe(300_000);
    expect(tb.closing.loans_receivable).toBe(300_000);

    const notes = await member.c.get(`${base}/notifications`);
    expect(notes.body.items.some((n: any) => n.title.includes("approved"))).toBe(true);
  });

  it("flags overdue, applies penalties, and a full payoff closes the loan", async () => {
    env.clock.set("2026-08-01T10:00:00Z");
    const scan = await owner.post(`${base}/loans/scan-overdue`);
    expect(scan.body.flagged).toBe(1);
    expect((await owner.post(`${base}/loans/${loanId}/penalties`, { amountMinor: 5000, reason: "Late instalment" })).status).toBe(200);

    let loan = await owner.get(`${base}/loans/${loanId}`);
    expect(loan.body.status).toBe("overdue");
    expect(loan.body.balance.totalMinor).toBe(300_000 + 15_000 + 5000);
    expect((await owner.post(`${base}/loans/${loanId}/repayments`, { amountMinor: 999_999 })).status).toBe(422);

    const pay = await owner.post(`${base}/loans/${loanId}/repayments`, { amountMinor: 320_000, paidOn: "2026-08-01" });
    expect(pay.status, pay.text).toBe(200);
    expect(pay.body.status).toBe("repaid");

    const tb = await trialBalance();
    expect(tb.closing.loans_receivable).toBe(0);
    expect(tb.closing.interest_income).toBe(15_000);
    expect(tb.closing.penalty_income).toBe(5000);
    env.clock.set("2026-05-26T10:00:00Z");
  });
});

describe("welfare claims", () => {
  it("enforces package limits and pays out from the welfare reserve", async () => {
    const m = await addMemberWithLogin(env, owner, base, { name: "Comfort Mensah", email: "comfort@fund.test", joinedOn: "2024-01-01" });
    await owner.post(`${base}/contributions`, { membershipId: m.id, period: "2026-04", amountMinor: 5000, method: "cash" });
    const tooMuch = await m.c.post(`${base}/claims`, { type: "medical", amountRequestedMinor: 500_000, description: "Hospital bill" });
    expect(tooMuch.status).toBe(422);
    const ok = await m.c.post(`${base}/claims`, { type: "medical", amountRequestedMinor: 80_000, description: "Malaria treatment" });
    expect(ok.status, ok.text).toBe(201);
    const decision = await owner.post(`${base}/claims/${ok.body.id}/decision`, { decision: "approve", amountApprovedMinor: 60_000, notes: "Receipts verified" });
    expect(decision.status, decision.text).toBe(200);
    const me = await m.c.get(`${base}/me`);
    expect(me.body.welfare.remaining.medical).toBe(100_000 - 60_000);
    expect((await owner.post(`${base}/claims/${ok.body.id}/decision`, { decision: "approve" })).status).toBe(409);
  });
});

describe("mobile money payments", () => {
  it("allocates a successful payment exactly once", async () => {
    const m = await addMemberWithLogin(env, owner, base, { name: "Kofi Tsikata", email: "kofi@fund.test", joinedOn: "2025-06-01" });
    const init = await m.c.post(`${base}/payments`, { purpose: "contribution", periods: ["2026-05", "2026-06"], amountPerPeriodMinor: 3000, phone: "024 555 0000", network: "mtn" });
    expect(init.status, init.text).toBe(201);
    expect(init.body.payment.status).toBe("pending");
    expect(init.body.payment.amountMinor).toBe(6000);

    const id = init.body.payment.id;
    const ok = await m.c.post(`${base}/payments/${id}/simulate`, { outcome: "succeeded" });
    expect(ok.body.status).toBe("succeeded");
    const again = await m.c.post(`${base}/payments/${id}/simulate`, { outcome: "succeeded" });
    expect(again.body.status).toBe("succeeded");

    const list = await owner.get(`${base}/contributions?membershipId=${m.id}`);
    expect(list.body.total).toBe(2);
    expect(list.body.items.every((x: any) => x.method === "momo")).toBe(true);
  });

  it("records a failed payment without touching the books", async () => {
    const before = (await trialBalance()).closing.cash;
    const c = client(env);
    await c.post("/api/auth/login", { email: "kofi@fund.test", password: "member-password-1" });
    const init = await c.post(`${base}/payments`, { purpose: "contribution", periods: ["2026-07"], amountPerPeriodMinor: 3000, phone: "024 555 0000", network: "mtn" });
    const fail = await c.post(`${base}/payments/${init.body.payment.id}/simulate`, { outcome: "failed" });
    expect(fail.body.status).toBe("failed");
    expect((await trialBalance()).closing.cash).toBe(before);
  });
});

describe("imports, exports and audit", () => {
  it("validates CSV in a dry run, then imports", async () => {
    const csv = "name,email,joined_on,member_no\nSenyo Kwaku,senyo@fund.test,2019-06-20,DZ-003\nBad Row,,not-a-date,\n";
    const dry = await owner.post(`${base}/import/members`, { csv, dryRun: true });
    expect(dry.body.errors).toHaveLength(1);
    const good = await owner.post(`${base}/import/members`, { csv: "name,email,joined_on,member_no\nSenyo Kwaku,senyo@fund.test,2019-06-20,DZ-003\n", dryRun: false });
    expect(good.body.imported).toBe(1);

    const contribs = "member_no,period,amount\nDZ-003,2026-01,40\nDZ-003,2026-02,40\n";
    const imp = await owner.post(`${base}/import/contributions`, { csv: contribs, dryRun: false });
    expect(imp.status, imp.text).toBe(200);
    expect(imp.body.imported).toBe(2);
  });

  it("streams CSV exports and neutralises formula injection", async () => {
    await owner.post(`${base}/members`, { name: "=HYPERLINK(evil)", joinedOn: "2026-01-01" });
    const res = await owner.get(`${base}/export/members.csv`);
    expect(res.status).toBe(200);
    expect(res.text).toContain("member_no,name");
    expect(res.text).toContain("'=HYPERLINK(evil)");
  });

  it("keeps an audit trail of every change", async () => {
    const r = await owner.get(`${base}/audit?pageSize=200`);
    const actions = new Set(r.body.items.map((a: any) => a.action));
    for (const a of ["fund.created", "member.created", "contribution.recorded", "contribution.corrected", "loan.applied", "loan.reviewed", "loan.approved", "loan.repayment", "claim.approved", "payment.succeeded", "period.closed"]) {
      expect(actions, a).toContain(a);
    }
  });

  it("books always balance", async () => {
    const tb = await trialBalance();
    const assets = (tb.closing.cash ?? 0) + (tb.closing.loans_receivable ?? 0);
    const claimsOnAssets = (tb.closing.member_savings ?? 0) + (tb.closing.welfare_reserve ?? 0) + (tb.closing.interest_income ?? 0) + (tb.closing.penalty_income ?? 0) - (tb.closing.write_off_expense ?? 0);
    expect(assets).toBe(claimsOnAssets);
  });
});

describe("subscriptions & platform admin", () => {
  it("an expired trial blocks writes but still allows reads", async () => {
    await env.handle.db.update(tenants).set({ status: "trial", trialEndsAt: "2026-06-09" }).where(eq(tenants.id, tenantId));
    env.clock.set("2026-07-01T10:00:00Z");
    expect((await owner.get(`${base}/members`)).status).toBe(200);
    const w = await owner.post(`${base}/members`, { name: "Late Joiner", joinedOn: "2026-06-01" });
    expect(w.status).toBe(402);
    env.clock.set("2026-05-26T10:00:00Z");
  });

  it("only platform admins reach the operator console", async () => {
    expect((await owner.get("/api/admin/tenants")).status).toBe(403);
    const root = client(env);
    await root.post("/api/auth/signup", { name: "Platform Root", email: "root@fund.test".replace("fund", "fundly"), password: "root-password-1", fund: { name: "Ops Sandbox", currency: "GHS", minContributionMinor: 100, sharePriceMinor: 100 } });
    const list = await root.get("/api/admin/tenants");
    expect(list.status).toBe(200);
    expect(list.body.stats.funds).toBeGreaterThanOrEqual(3);
    const upd = await root.patch(`/api/admin/tenants/${tenantId}`, { status: "active", plan: "standard" });
    expect(upd.body.status).toBe("active");
  });
});
