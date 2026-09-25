import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "../server/db/schema";
import { addMemberWithLogin, client, setup, signupFund, type Client, type TestEnv } from "./helpers";

/*
 * Staff and operator flows that the main API suite doesn't exercise:
 * member management, invites, fund settings, shares, profile, notifications,
 * reports validation, and platform-admin access control.
 */

let env: TestEnv;
let owner: Client;
let base: string;
let tenantId: string;

beforeAll(async () => {
  env = await setup();
  ({ c: owner, base, tenantId } = await signupFund(env));
});
afterAll(async () => env.handle.close());

const inviteToken = (url: string) => url.split("/invite/")[1];

describe("member management", () => {
  it("updates a member, audits the change and refuses duplicate emails", async () => {
    const a = await owner.post(`${base}/members`, { name: "Kofi Boateng", email: "kofi@fund.test", joinedOn: "2022-01-10" });
    const b = await owner.post(`${base}/members`, { name: "Yaa Asantewaa", email: "yaa@fund.test", joinedOn: "2022-01-10" });
    expect(a.status).toBe(201);
    const upd = await owner.patch(`${base}/members/${a.body.member.id}`, { phone: "+233200000001", occupation: "Teacher" });
    expect(upd.status, upd.text).toBe(200);
    expect(upd.body.occupation).toBe("Teacher");
    expect((await owner.patch(`${base}/members/${a.body.member.id}`, { email: "yaa@fund.test" })).status).toBe(409);
    const log = await owner.get(`${base}/audit?entityId=${a.body.member.id}`);
    expect(log.body.items.some((e: any) => e.action === "member.updated" && e.summary.includes("occupation"))).toBe(true);
    expect(b.status).toBe(201);
  });

  it("keeps at least one owner", async () => {
    const me = await owner.get(`${base}/me`);
    const r = await owner.patch(`${base}/members/${me.body.member.id}`, { roles: ["manager"] });
    expect(r.status).toBe(422);
  });

  it("won't exit a member with a loan in review, and exits cleanly once it's declined", async () => {
    const m = await addMemberWithLogin(env, owner, base, { name: "Esi Owusu", email: "esi@fund.test", joinedOn: "2020-01-01" });
    for (const period of ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04"]) {
      await owner.post(`${base}/contributions`, { membershipId: m.id, period, amountMinor: 20000, paidOn: `${period}-02`, method: "cash" });
    }
    const loan = await m.c.post(`${base}/loans`, { productCode: "emergency", principalMinor: 10_000, termMonths: 1, purpose: "Emergency repair" });
    expect(loan.status, loan.text).toBe(201);

    const blocked = await owner.post(`${base}/members/${m.id}/exit`);
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.message).toMatch(/in review/);

    // Approval still needs the committee, but a manager can decline while it's in review.
    expect((await owner.post(`${base}/loans/${loan.body.id}/decision`, { decision: "approve" })).status).toBe(409);
    const declined = await owner.post(`${base}/loans/${loan.body.id}/decision`, { decision: "decline", notes: "Member leaving" });
    expect(declined.status, declined.text).toBe(200);
    expect(declined.body.status).toBe("declined");
    expect((await owner.post(`${base}/loans/${loan.body.id}/decision`, { decision: "decline" })).status).toBe(409);
    expect((await owner.post(`${base}/members/${m.id}/exit`)).status).toBe(200);
    expect((await owner.post(`${base}/members/${m.id}/exit`)).status).toBe(409);
    // Their login no longer opens the fund.
    expect((await m.c.get(`${base}/me`)).status).toBe(404);
  });
});

describe("invitations", () => {
  it("an invite stops working when the member exits", async () => {
    const created = await owner.post(`${base}/members`, { name: "Ama Serwaa", email: "ama@fund.test", joinedOn: "2023-01-01", sendInvite: true });
    const token = inviteToken(created.body.invite.url);
    expect((await client(env).get(`/api/auth/invites/${token}`)).status).toBe(200);
    expect((await owner.post(`${base}/members/${created.body.member.id}/exit`)).status).toBe(200);
    expect((await client(env).get(`/api/auth/invites/${token}`)).status).toBe(404);
    expect((await client(env).post("/api/auth/invites/accept", { token, password: "member-password-1" })).status).toBe(404);
  });

  it("an invite stops working when the member's email changes", async () => {
    const created = await owner.post(`${base}/members`, { name: "Kwame Nkansah", email: "kwame.old@fund.test", joinedOn: "2023-01-01", sendInvite: true });
    const oldToken = inviteToken(created.body.invite.url);
    await owner.patch(`${base}/members/${created.body.member.id}`, { email: "kwame@fund.test" });
    expect((await client(env).post("/api/auth/invites/accept", { token: oldToken, password: "member-password-1" })).status).toBe(404);
    // A fresh invite to the new address works.
    const again = await owner.post(`${base}/members/${created.body.member.id}/invite`);
    expect(again.status, again.text).toBe(200);
    expect(again.body.email).toBe("kwame@fund.test");
    const joined = await client(env).post("/api/auth/invites/accept", { token: inviteToken(again.body.url), password: "member-password-1" });
    expect(joined.status, joined.text).toBe(200);
    expect((await owner.post(`${base}/members/${created.body.member.id}/invite`)).status).toBe(409);
  });

  it("refuses to link one login to two members of the same fund", async () => {
    // Afia joins, then staff change her member email and create a duplicate record under her login email.
    const afia = await addMemberWithLogin(env, owner, base, { name: "Afia Mensah", email: "afia@fund.test", joinedOn: "2023-01-01" });
    await owner.patch(`${base}/members/${afia.id}`, { email: "afia.old@fund.test" });
    const dupe = await owner.post(`${base}/members`, { name: "Afia Mensah (duplicate)", email: "afia@fund.test", joinedOn: "2023-01-01", sendInvite: true });
    expect(dupe.status, dupe.text).toBe(201);
    const r = await client(env).post("/api/auth/invites/accept", { token: inviteToken(dupe.body.invite.url), password: "member-password-1" });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/already linked/);
  });
});

describe("fund settings, profile and shares", () => {
  it("saves settings, validates them and records the change", async () => {
    const s = await owner.get(`${base}/settings`);
    const settings = { ...s.body.settings, minContributionMinor: 4000 };
    const put = await owner.put(`${base}/settings`, settings);
    expect(put.status, put.text).toBe(200);
    expect((await owner.get(`${base}/settings`)).body.settings.minContributionMinor).toBe(4000);
    // The default welfare package must exist.
    expect((await owner.put(`${base}/settings`, { ...settings, defaultWelfarePackageId: "platinum" })).status).toBe(422);
    // Packages still assigned to members can't be removed.
    const inUse = settings.welfarePackages.filter((p: any) => p.id !== settings.defaultWelfarePackageId);
    if (inUse.length) {
      const r = await owner.put(`${base}/settings`, { ...settings, welfarePackages: settings.welfarePackages.filter((p: any) => p.id !== settings.defaultWelfarePackageId), defaultWelfarePackageId: inUse[0].id });
      expect(r.status).toBe(422);
    }
  });

  it("renames the fund", async () => {
    expect((await owner.put(`${base}/profile`, { name: "Dzolali'09 Welfare & Savings", shortName: "DZ09" })).status).toBe(200);
    expect((await owner.get(`${base}/settings`)).body.name).toBe("Dzolali'09 Welfare & Savings");
  });

  it("sets share prices and grants shares without letting holdings go negative", async () => {
    const prices = await owner.post(`${base}/share-prices`, { effectivePeriod: "2026-06", priceMinor: 2600 });
    expect(prices.status, prices.text).toBe(200);
    expect(prices.body.some((p: any) => p.effectivePeriod === "2026-06" && p.priceMinor === 2600)).toBe(true);

    const m = await owner.post(`${base}/members`, { name: "Adwoa Pokua", joinedOn: "2024-01-01" });
    const id = m.body.member.id;
    expect((await owner.post(`${base}/shares/grants`, { membershipId: id, shares: 10, reason: "Founding bonus" })).status).toBe(201);
    const tooMany = await owner.post(`${base}/shares/grants`, { membershipId: id, shares: -11, reason: "Correction" });
    expect(tooMany.status).toBe(422);
    expect((await owner.post(`${base}/shares/grants`, { membershipId: id, shares: -10, reason: "Correction" })).status).toBe(201);
    const me = await owner.get(`${base}/me`);
    expect((await owner.post(`${base}/shares/grants`, { membershipId: me.body.member.id, shares: 5, reason: "Self" })).status).toBe(403);
  });
});

describe("member self-service", () => {
  it("updates their own profile but not with an empty body or unknown package", async () => {
    const m = await addMemberWithLogin(env, owner, base, { name: "Peace Agbeko", email: "peace@fund.test", joinedOn: "2024-01-01" });
    const ok = await m.c.patch(`${base}/me`, { phone: "+233240000000", nextOfKin: { name: "Mercy Agbeko", phone: "+233240000001", relationship: "Sister" } });
    expect(ok.status, ok.text).toBe(200);
    expect(ok.body.phone).toBe("+233240000000");
    expect((await m.c.patch(`${base}/me`, {})).status).toBe(422);
    expect((await m.c.patch(`${base}/me`, { welfarePackageId: "nope" })).status).toBe(422);
  });

  it("marks notifications as read", async () => {
    const before = await owner.get(`${base}/notifications`);
    expect(before.status).toBe(200);
    expect((await owner.post(`${base}/notifications/read`, {})).status).toBe(200);
    expect((await owner.get(`${base}/notifications`)).body.unread).toBe(0);
  });
});

describe("reports", () => {
  it("rejects a backwards date range", async () => {
    expect((await owner.get(`${base}/reports/summary?from=2026-06-01&to=2026-01-01`)).status).toBe(422);
    expect((await owner.get(`${base}/reports/summary?from=2026-01-01&to=2026-06-30`)).status).toBe(200);
  });
});

describe("platform admin access", () => {
  it("revokes operator access as soon as an email leaves PLATFORM_ADMIN_EMAILS", async () => {
    const sneaky = client(env);
    await sneaky.post("/api/auth/signup", { name: "Former Operator", email: "former@fundly.test", password: "former-password-1", fund: { name: "Former Ops", currency: "GHS", minContributionMinor: 100, sharePriceMinor: 100 } });
    // Flagged as admin in the database (e.g. from an older config), but not in the current list.
    await env.handle.db.update(users).set({ isPlatformAdmin: true }).where(eq(users.email, "former@fundly.test"));
    expect((await sneaky.get("/api/admin/tenants")).status).toBe(403);
    expect((await sneaky.get("/api/auth/me")).body.user.isPlatformAdmin).toBe(false);
    const [u] = await env.handle.db.select().from(users).where(eq(users.email, "former@fundly.test"));
    expect(u.isPlatformAdmin).toBe(false);
  });

  it("lets an operator change a fund's status and records it in the fund's audit log", async () => {
    const root = client(env);
    await root.post("/api/auth/signup", { name: "Platform Root", email: "root@fundly.test", password: "root-password-1", fund: { name: "Ops Sandbox", currency: "GHS", minContributionMinor: 100, sharePriceMinor: 100 } });
    const r = await root.patch(`/api/admin/tenants/${tenantId}`, { status: "suspended" });
    expect(r.status, r.text).toBe(200);
    expect((await owner.post(`${base}/members`, { name: "Blocked Write", joinedOn: "2026-01-01" })).status).toBe(402);
    expect((await root.patch(`/api/admin/tenants/${tenantId}`, { status: "active" })).status).toBe(200);
    const log = await owner.get(`${base}/audit?q=platform`);
    expect(log.body.items.length).toBeGreaterThanOrEqual(2);
    expect((await root.get("/api/admin/leads")).status).toBe(200);
    const csv = await root.get("/api/admin/leads.csv");
    expect(csv.status).toBe(200);
    expect(csv.text.split("\n")[0]).toContain("email");
  });
});
