import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSchedule, currentRoundIndex, roundProgress, shuffle, toIcs } from "../shared/domain/rotation";
import { client, setup, type TestEnv } from "./helpers";

describe("rotation maths", () => {
  const order = ["a", "b", "c", "d"];
  it("builds weekly, fortnightly and monthly schedules with a constant pot", () => {
    const w = buildSchedule({ startDate: "2026-01-30", frequency: "weekly", amountMinor: 10_000, order });
    expect(w.map((r) => r.date)).toEqual(["2026-01-30", "2026-02-06", "2026-02-13", "2026-02-20"]);
    expect(w.every((r) => r.potMinor === 40_000)).toBe(true);
    expect(buildSchedule({ startDate: "2026-01-30", frequency: "biweekly", amountMinor: 1, order })[1].date).toBe("2026-02-13");
    expect(buildSchedule({ startDate: "2026-01-31", frequency: "monthly", amountMinor: 1, order })[1].date).toBe("2026-02-28");
  });
  it("tracks progress excluding the recipient", () => {
    const [r] = buildSchedule({ startDate: "2026-01-01", frequency: "weekly", amountMinor: 5000, order });
    const p = roundProgress(r, order, ["b", "c"], 5000);
    expect(p).toEqual({ paid: 2, expected: 3, collectedMinor: 10_000, complete: false });
    expect(roundProgress(r, order, ["b", "c", "d"], 5000).complete).toBe(true);
  });
  it("finds the current round", () => {
    const s = buildSchedule({ startDate: "2026-01-01", frequency: "weekly", amountMinor: 1, order });
    expect(currentRoundIndex(s, "2025-12-01")).toBe(0);
    expect(currentRoundIndex(s, "2026-01-09")).toBe(2);
    expect(currentRoundIndex(s, "2027-01-01")).toBe(4);
  });
  it("shuffles without losing anyone", () => {
    const out = shuffle(order, () => 0.42);
    expect([...out].sort()).toEqual(order);
  });
  it("exports an iCalendar file", () => {
    const ics = toIcs({ name: "Friends", currencyLabel: (m) => `GHS ${m / 100}`, schedule: buildSchedule({ startDate: "2026-03-01", frequency: "monthly", amountMinor: 100, order }), members: order.map((id) => ({ id, name: id.toUpperCase() })) });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260301");
    expect(ics).toContain("A receives GHS 4");
  });
});

describe("public circle API", () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await setup();
  });
  afterAll(async () => env.handle.close());

  const members = ["Ama", "Kofi", "Esi", "Yaw"].map((name, i) => ({ id: `m${i}`, name }));
  const circle = { name: "Friday Friends", currency: "GHS", amountMinor: 20_000, frequency: "weekly", startDate: "2026-06-05", members, order: ["m2", "m0", "m3", "m1"] };

  async function raw(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await env.app.request(path, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  }

  it("creates a circle, captures the lead, and only the token holder can edit", async () => {
    const created = await raw("POST", "/api/public/circles", { circle, organizer: { name: "Ama Mensah", email: "Ama@Example.com", marketingConsent: true } });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const { slug, editToken } = created.body;
    expect(editToken).toBeTruthy();

    const pub = await raw("GET", `/api/public/circles/${slug}`);
    expect(pub.body.canEdit).toBe(false);
    expect(pub.body.editToken).toBeUndefined();
    expect(pub.body.circle.members).toHaveLength(4);

    expect((await raw("PATCH", `/api/public/circles/${slug}`, { payments: { "0": ["m0"] } })).status).toBe(403);
    expect((await raw("PATCH", `/api/public/circles/${slug}`, { payments: { "0": ["m0"] } }, { "x-edit-token": "wrong".repeat(8) })).status).toBe(403);

    const upd = await raw("PATCH", `/api/public/circles/${slug}`, { payments: { "0": ["m0", "m1", "ghost"], "9": ["m0"] } }, { "x-edit-token": editToken });
    expect(upd.status).toBe(200);
    expect(upd.body.payments).toEqual({ "0": ["m0", "m1"] });
  });

  it("rejects an order that doesn't cover every member", async () => {
    const bad = await raw("POST", "/api/public/circles", { circle: { ...circle, order: ["m0", "m0", "m1", "m2"] }, organizer: { name: "X Y", email: "x@y.com" } });
    expect(bad.status).toBe(422);
  });

  it("upserts one lead per email and shows it to platform admins, and records conversion on signup", async () => {
    await raw("POST", "/api/public/circles", { circle: { ...circle, name: "Second circle" }, organizer: { name: "Ama M.", email: "ama@example.com" } });
    const root = client(env);
    await root.post("/api/auth/signup", { name: "Platform Root", email: "root@fundly.test", password: "root-password-1", fund: { name: "Ops Fund", currency: "GHS", minContributionMinor: 100, sharePriceMinor: 100 } });
    let leads = await root.get("/api/admin/leads");
    expect(leads.status).toBe(200);
    expect(leads.body.total).toBe(1);
    expect(leads.body.items[0]).toMatchObject({ email: "ama@example.com", marketingConsent: true, circles: 2 });

    const ama = client(env);
    await ama.post("/api/auth/signup", { name: "Ama Mensah", email: "ama@example.com", password: "ama-password-1", fund: { name: "Ama's Fund", currency: "GHS", minContributionMinor: 100, sharePriceMinor: 100 } });
    leads = await root.get("/api/admin/leads");
    expect(leads.body.stats.converted).toBe(1);

    expect((await ama.get("/api/admin/leads")).status).toBe(403);
  });
});

describe("organiser link emails", () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await setup();
  });
  afterAll(async () => env.handle.close());

  const members = ["Ama", "Kofi", "Esi"].map((name, i) => ({ id: `m${i}`, name }));
  const circle = { name: "Book Club <Susu>", currency: "GHS", amountMinor: 10_000, frequency: "monthly", startDate: "2026-07-01", members, order: ["m1", "m0", "m2"] };

  async function raw(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await env.app.request(path, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  }
  const tokenFrom = (html: string) => html.match(/#edit=([\w-]+)/)?.[1];

  it("emails the organiser a working private link and the share link", async () => {
    const created = await raw("POST", "/api/public/circles", { circle, organizer: { name: "Ama Mensah", email: "ama@example.com" } });
    expect(created.body.emailSent).toBe(true);
    const mail = env.mailer.outbox[0];
    expect(mail.to).toBe("ama@example.com");
    expect(mail.subject).toContain("Book Club");
    // Links use the configured app URL, and user text is HTML-escaped.
    expect(mail.html).toContain(`http://localhost:5173/c/${created.body.slug}#edit=${created.body.editToken}`);
    expect(mail.html).toContain("Book Club &lt;Susu&gt;");
    expect(mail.html).not.toContain("<Susu>");
    expect(mail.text).toContain(`/c/${created.body.slug}`);
  });

  it("recovers links without invalidating old ones, and doesn't reveal unknown emails", async () => {
    const created = await raw("POST", "/api/public/circles", { circle, organizer: { name: "Kofi", email: "kofi@example.com" } });
    const oldToken = created.body.editToken;
    const before = env.mailer.outbox.length;

    const unknown = await raw("POST", "/api/public/circles/recover", { email: "nobody@example.com" });
    const known = await raw("POST", "/api/public/circles/recover", { email: "KOFI@example.com" });
    expect(unknown.status).toBe(202);
    expect(known.status).toBe(202);
    expect(unknown.body).toEqual(known.body);
    expect(env.mailer.outbox.length).toBe(before + 1);

    const newToken = tokenFrom(env.mailer.outbox[0].html)!;
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(oldToken);
    for (const t of [oldToken, newToken]) {
      const v = await raw("GET", `/api/public/circles/${created.body.slug}`, undefined, { "x-edit-token": t });
      expect(v.body.canEdit).toBe(true);
    }
  });

  it("still saves the circle when the email provider fails", async () => {
    const send = env.mailer.send;
    env.mailer.send = async () => {
      throw new Error("provider down");
    };
    const created = await raw("POST", "/api/public/circles", { circle, organizer: { name: "Esi", email: "esi@example.com" } });
    env.mailer.send = send;
    expect(created.status).toBe(201);
    expect(created.body.emailSent).toBe(false);
    expect(created.body.editToken).toBeTruthy();
  });
});
