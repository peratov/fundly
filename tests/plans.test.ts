import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { notifications, tenants } from "../server/db/schema";
import { hmacSha512Hex } from "../server/lib/crypto";
import { paystackProvider } from "../server/payments/provider";
import { applyPlanLifecycle } from "../server/services/billing";
import { addMemberWithLogin, client, setup, type Client, type TestEnv } from "./helpers";

/*
 * Pricing model: Free forever up to 25 active members, with no online collection.
 * Growth and Pro unlock in-app mobile money, AI assistance and more members, and are
 * prepaid through a hosted checkout. Lapsed plans fall back to Free after a grace period.
 */

const pay = { purpose: "contribution", periods: ["2026-05"], amountPerPeriodMinor: 5000, phone: "+233241234567", network: "mtn" } as const;

async function freeFund(env: TestEnv, email: string) {
  const c = client(env);
  const r = await c.post("/api/auth/signup", {
    name: "Ama Owusu",
    email,
    password: "correct-horse-battery",
    fund: { name: "Class of '12 Fund", currency: "GHS", minContributionMinor: 3000, sharePriceMinor: 2400 },
  });
  if (r.status !== 201) throw new Error(r.text);
  return { c, tenantId: r.body.createdTenantId as string, base: `/api/t/${r.body.createdTenantId}` };
}

async function fill(c: Client, base: string, n: number, prefix: string) {
  for (let i = 0; i < n; i++) {
    const r = await c.post(`${base}/members`, { name: `${prefix} Member ${i + 1}`, joinedOn: "2024-01-01" });
    if (r.status !== 201) throw new Error(`member ${i + 1}: ${r.text}`);
  }
}

describe("Free plan", () => {
  let env: TestEnv;
  let owner: Client;
  let base: string;
  beforeAll(async () => {
    env = await setup();
    ({ c: owner, base } = await freeFund(env, "free@fund.test"));
  });
  afterAll(async () => env.handle.close());

  it("new funds start on Free forever, with no expiry", async () => {
    const s = await owner.get(`${base}/settings`);
    expect(s.body.plan).toBe("free");
    expect(s.body.status).toBe("active");
    expect(s.body.planExpiresAt).toBeNull();
    // Nothing locks after 14 days any more: months later the fund still works.
    env.clock.set("2027-02-26T10:00:00Z");
    try {
      expect((await owner.post(`${base}/members`, { name: "Months Later", joinedOn: "2027-01-01" })).status).toBe(201);
    } finally {
      env.clock.set("2026-05-26T10:00:00Z");
    }
  });

  it("allows 25 active members and refuses the 26th with an upgrade hint", async () => {
    // Owner + "Months Later" = 2 so far.
    await fill(owner, base, 23, "Free");
    const over = await owner.post(`${base}/members`, { name: "Number Twenty-Six", joinedOn: "2024-01-01" });
    expect(over.status).toBe(402);
    expect(over.body.error.code).toBe("plan_limit");
    expect(over.body.error.details).toMatchObject({ limit: 25, current: 25, plan: "free" });
    // Imports are checked up front, even on a dry run.
    const imp = await owner.post(`${base}/import/members`, { csv: "name,joined_on\nKofi A,2024-01-01\n", dryRun: true });
    expect(imp.status).toBe(402);
  });

  it("frees a seat when a member exits", async () => {
    const list = await owner.get(`${base}/members?q=Free Member 1&pageSize=1`);
    expect((await owner.post(`${base}/members/${list.body.items[0].id}/exit`)).status).toBe(200);
    expect((await owner.post(`${base}/members`, { name: "Seat Reused", joinedOn: "2024-01-01" })).status).toBe(201);
  });

  it("members can't collect money through the integration; the treasurer still records payments", async () => {
    const r = await owner.post(`${base}/payments`, pay);
    expect(r.status).toBe(402);
    expect(r.body.error.code).toBe("plan_feature");
    const me = await owner.get(`${base}/me`);
    expect((await owner.post(`${base}/contributions`, { membershipId: me.body.member.id, period: "2026-05", amountMinor: 5000, method: "cash" })).status).toBe(201);
  });

  it("uses the template assistant on Free", async () => {
    const me = await owner.get(`${base}/me`);
    const a = await owner.post(`${base}/members/${me.body.member.id}/assessment`);
    expect(a.body.source).toBe("template");
  });

  it("only the owner can see billing", async () => {
    // The fund is full, so free a seat for the new member first.
    const list = await owner.get(`${base}/members?q=Free Member 2&pageSize=1`);
    await owner.post(`${base}/members/${list.body.items[0].id}/exit`);
    const member = await addMemberWithLogin(env, owner, base, { name: "Plain Member", email: "plain@fund.test", joinedOn: "2024-01-01" });
    expect((await member.c.get(`${base}/billing`)).status).toBe(403);
    expect((await owner.get(`${base}/billing`)).status).toBe(200);
  });
});

describe("Upgrading, renewing and lapsing (self-serve billing enabled)", () => {
  let env: TestEnv;
  let owner: Client;
  let base: string;
  let tenantId: string;
  beforeAll(async () => {
    env = await setup(undefined, { config: { selfServeBilling: true } });
    ({ c: owner, base, tenantId } = await freeFund(env, "grow@fund.test"));
    await fill(owner, base, 24, "Grow");
  });
  afterAll(async () => env.handle.close());

  it("shows usage and prices in the fund's currency", async () => {
    const b = await owner.get(`${base}/billing`);
    expect(b.body.usage).toEqual({ members: 25, limit: 25 });
    expect(b.body.prices.growth.month).toEqual({ amountMinor: 19900, currency: "GHS", months: 1 });
    expect(b.body.prices.growth.year.amountMinor).toBe(199000); // ten months for a year
  });

  it("a declined checkout changes nothing", async () => {
    const co = await owner.post(`${base}/billing/checkout`, { plan: "growth", interval: "month" });
    expect(co.status, co.text).toBe(201);
    expect(co.body.simulated).toBe(true);
    const r = await owner.post(`${base}/billing/simulate`, { reference: co.body.reference, outcome: "failed" });
    expect(r.body.status).toBe("failed");
    expect((await owner.get(`${base}/settings`)).body.plan).toBe("free");
    expect((await owner.post(`${base}/billing/simulate`, { reference: co.body.reference, outcome: "succeeded" })).status).toBe(409);
  });

  it("paying for Growth unlocks more members and online collection immediately", async () => {
    const co = await owner.post(`${base}/billing/checkout`, { plan: "growth", interval: "month" });
    const done = await owner.post(`${base}/billing/simulate`, { reference: co.body.reference, outcome: "succeeded" });
    expect(done.body.status).toBe("succeeded");
    expect(done.body.paidThrough).toBe("2026-06-26");
    const s = await owner.get(`${base}/settings`);
    expect(s.body.plan).toBe("growth");
    expect(s.body.planExpiresAt).toBe("2026-06-26");
    expect((await owner.post(`${base}/members`, { name: "Number Twenty-Six", joinedOn: "2024-01-01" })).status).toBe(201);
    expect((await owner.post(`${base}/payments`, pay)).status).toBe(201);
    const notes = await owner.get(`${base}/notifications`);
    expect(notes.body.items.some((n: { title: string }) => n.title === "You're on Growth")).toBe(true);
  });

  it("renewing early stacks the new term on the old one", async () => {
    const co = await owner.post(`${base}/billing/checkout`, { plan: "growth", interval: "year" });
    expect(co.body.amountMinor).toBe(199000);
    await owner.post(`${base}/billing/simulate`, { reference: co.body.reference, outcome: "succeeded" });
    expect((await owner.get(`${base}/settings`)).body.planExpiresAt).toBe("2027-06-26");
  });

  it("reminds the owner before the end and falls back to Free after the grace period", async () => {
    const db = env.handle.db;
    await db.update(tenants).set({ planExpiresAt: "2026-06-02" }).where(eq(tenants.id, tenantId));
    expect((await applyPlanLifecycle(db, "2026-05-26")).reminded).toBeGreaterThanOrEqual(1);
    const reminders = await db.select().from(notifications).where(eq(notifications.tenantId, tenantId));
    expect(reminders.some((n) => n.title === "Your plan ends in 7 days")).toBe(true);

    // Still Growth during the 7-day grace period...
    expect((await applyPlanLifecycle(db, "2026-06-09")).downgraded).toBe(0);
    expect((await owner.get(`${base}/settings`)).body.plan).toBe("growth");
    // ...then Free. Nothing is deleted; the fund just can't grow or collect online.
    expect((await applyPlanLifecycle(db, "2026-06-10")).downgraded).toBe(1);
    const s = await owner.get(`${base}/settings`);
    expect(s.body.plan).toBe("free");
    expect((await owner.get(`${base}/members?pageSize=200`)).body.total).toBe(26);
    expect((await owner.post(`${base}/members`, { name: "Too Many", joinedOn: "2024-01-01" })).status).toBe(402);
    expect((await owner.post(`${base}/payments`, pay)).status).toBe(402);
  });

  it("won't sell a plan that's too small for the fund", async () => {
    await env.handle.db.update(tenants).set({ plan: "pro", planExpiresAt: null }).where(eq(tenants.id, tenantId));
    await fill(owner, base, 125, "Big");
    const r = await owner.post(`${base}/billing/checkout`, { plan: "growth", interval: "month" });
    expect(r.status).toBe(422);
    expect((await owner.post(`${base}/billing/checkout`, { plan: "pro", interval: "month" })).status).toBe(201);
  });
});

describe("Paystack subscription checkout and webhook", () => {
  const SECRET = "sk_test_awafund";
  let env: TestEnv;
  let owner: Client;
  let base: string;
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  beforeAll(async () => {
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      calls.push({ url, body });
      return new Response(JSON.stringify({ status: true, data: { authorization_url: `https://checkout.paystack.com/${body.reference}` } }), { status: 200 });
    }) as typeof fetch;
    env = await setup(undefined, { payments: paystackProvider(SECRET, fakeFetch), config: { selfServeBilling: true } });
    ({ c: owner, base } = await freeFund(env, "paystack@fund.test"));
  });
  afterAll(async () => env.handle.close());

  it("sends the owner to Paystack and upgrades on the signed webhook", async () => {
    const co = await owner.post(`${base}/billing/checkout`, { plan: "pro", interval: "month" });
    expect(co.status, co.text).toBe(201);
    expect(co.body.url).toBe(`https://checkout.paystack.com/${co.body.reference}`);
    expect(calls[0].url).toBe("https://api.paystack.co/transaction/initialize");
    expect(calls[0].body).toMatchObject({ amount: 49900, currency: "GHS", reference: co.body.reference });
    expect(String(calls[0].body.callback_url)).toContain(`/billing?reference=${co.body.reference}`);

    const payload = JSON.stringify({ event: "charge.success", data: { reference: co.body.reference, amount: 49900 } });
    const bad = await env.app.request("/api/webhooks/paystack", { method: "POST", body: payload, headers: { "x-paystack-signature": "nope" } });
    expect(bad.status).toBe(400);
    const ok = await env.app.request("/api/webhooks/paystack", { method: "POST", body: payload, headers: { "x-paystack-signature": hmacSha512Hex(SECRET, payload) } });
    expect(ok.status).toBe(200);
    expect((await owner.get(`${base}/settings`)).body.plan).toBe("pro");
    // Webhooks are retried by gateways: a replay is harmless.
    await env.app.request("/api/webhooks/paystack", { method: "POST", body: payload, headers: { "x-paystack-signature": hmacSha512Hex(SECRET, payload) } });
    expect((await owner.get(`${base}/settings`)).body.planExpiresAt).toBe("2026-06-26");
  });

  it("rejects a webhook whose amount doesn't match", async () => {
    const co = await owner.post(`${base}/billing/checkout`, { plan: "pro", interval: "year" });
    const payload = JSON.stringify({ event: "charge.success", data: { reference: co.body.reference, amount: 100 } });
    await env.app.request("/api/webhooks/paystack", { method: "POST", body: payload, headers: { "x-paystack-signature": hmacSha512Hex(SECRET, payload) } });
    const b = await owner.get(`${base}/billing`);
    expect(b.body.history.find((h: { reference: string }) => h.reference === co.body.reference).status).toBe("failed");
    expect(b.body.planExpiresAt).toBe("2026-06-26");
  });
});

describe("Contact sales (the default)", () => {
  let env: TestEnv;
  let owner: Client;
  let base: string;
  beforeAll(async () => {
    env = await setup(undefined, { config: { salesEmail: "sales@awafund.test" } });
    ({ c: owner, base } = await freeFund(env, "sales@fund.test"));
  });
  afterAll(async () => env.handle.close());

  it("quotes no prices and hides self-serve checkout", async () => {
    const b = await owner.get(`${base}/billing`);
    expect(b.status).toBe(200);
    expect(b.body.selfServe).toBe(false);
    expect(b.body.prices).toBeNull();
    expect(b.body.usage).toEqual({ members: 1, limit: 25 });
    expect((await owner.post(`${base}/billing/checkout`, { plan: "growth", interval: "month" })).status).toBe(404);
    expect((await owner.post(`${base}/billing/simulate`, { reference: "AWA-SUB-XXXXXXXX", outcome: "succeeded" })).status).toBe(404);
  });

  it("records a sales enquiry as a lead and emails the sales inbox", async () => {
    const visitor = client(env);
    const r = await visitor.post("/api/public/sales", { name: "Kojo Mensah", email: "kojo@alumni.test", phone: "+233201234567", fundName: "Achimota '05", members: 140, plan: "growth", message: "We collect dues monthly.", source: "pricing" });
    expect(r.status, r.text).toBe(201);
    const mail = env.mailer.outbox[0];
    expect(mail.to).toBe("sales@awafund.test");
    expect(mail.subject).toContain("Achimota '05");
    expect(mail.text).toContain("Members: 140");
    expect(mail.html).toContain("We collect dues monthly.");
    // A second enquiry from the same person updates their lead instead of duplicating it.
    expect((await visitor.post("/api/public/sales", { name: "Kojo Mensah", email: "kojo@alumni.test", members: 160, source: "billing" })).status).toBe(201);
    const root = client(env);
    await root.post("/api/auth/signup", { name: "Platform Root", email: "root@awafund.test", password: "root-password-1", fund: { name: "Ops", currency: "GHS", minContributionMinor: 100, sharePriceMinor: 100 } });
    const leads = await root.get("/api/admin/leads?q=kojo");
    expect(leads.body.total).toBe(1);
    expect(leads.body.items[0]).toMatchObject({ source: "sales", meta: { members: 160 } });
  });

  it("validates enquiries", async () => {
    expect((await client(env).post("/api/public/sales", { name: "K", email: "not-an-email" })).status).toBe(422);
  });
});
