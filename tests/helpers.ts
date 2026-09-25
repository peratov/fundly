import { eq } from "drizzle-orm";
import { createApp } from "../server/app";
import { tenants } from "../server/db/schema";
import { loadConfig } from "../server/config";
import { openDb, type DbHandle } from "../server/db/client";
import { templateAssistant } from "../server/lib/assistant";
import type { Clock } from "../server/lib/context";
import { devMailer } from "../server/email/mailer";
import { mockProvider } from "../server/payments/provider";

process.env.NODE_ENV = "test";

export interface TestEnv {
  app: ReturnType<typeof createApp>;
  handle: DbHandle;
  clock: Clock & { set(d: string): void };
  mailer: ReturnType<typeof devMailer>;
}

export async function setup(now = "2026-05-26T10:00:00Z"): Promise<TestEnv> {
  const handle = await openDb();
  let current = new Date(now);
  const clock = { now: () => current, set: (d: string) => (current = new Date(d)) };
  const config = { ...loadConfig({ NODE_ENV: "test", APP_URL: "http://localhost:5173" }), platformAdminEmails: ["root@fundly.test"], sessionDays: 365 };
  const mailer = devMailer();
  const app = createApp({ db: handle.db, config, clock, payments: mockProvider(), assistant: templateAssistant, mailer });
  return { app, handle, clock, mailer };
}

/** A tiny HTTP client with its own cookie jar — one per simulated user. */
export function client(env: TestEnv) {
  let cookie = "";
  async function call<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T; text: string }> {
    const res = await env.app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    let parsed: any = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* csv etc. */
    }
    return { status: res.status, body: parsed as T, text };
  }
  return {
    get: <T = any>(p: string) => call<T>("GET", p),
    post: <T = any>(p: string, b: unknown = {}) => call<T>("POST", p, b),
    patch: <T = any>(p: string, b: unknown) => call<T>("PATCH", p, b),
    put: <T = any>(p: string, b: unknown) => call<T>("PUT", p, b),
  };
}

export type Client = ReturnType<typeof client>;

export async function signupFund(env: TestEnv, email = "owner@fund.test", name = "Mawuli Awuku") {
  const c = client(env);
  const res = await c.post("/api/auth/signup", {
    name,
    email,
    password: "correct-horse-battery",
    fund: { name: "Dzolali'09 Savings Fund", shortName: "Dzolali'09", currency: "GHS", minContributionMinor: 3000, sharePriceMinor: 2400 },
  });
  if (res.status !== 201) throw new Error(`signup failed: ${res.text}`);
  // Tests move the clock around; keep the fund on a paid plan unless a test opts into trial behaviour.
  await env.handle.db.update(tenants).set({ status: "active", plan: "standard" }).where(eq(tenants.id, res.body.createdTenantId));
  return { c, tenantId: res.body.createdTenantId as string, base: `/api/t/${res.body.createdTenantId}` };
}

/** Create a member, invite them, accept the invite, and return their logged-in client. */
export async function addMemberWithLogin(env: TestEnv, owner: Client, base: string, m: { name: string; email: string; joinedOn: string; roles?: string[] }) {
  const created = await owner.post(`${base}/members`, { ...m, sendInvite: true });
  if (created.status !== 201) throw new Error(`create member failed: ${created.text}`);
  const token = (created.body.invite.url as string).split("/invite/")[1];
  const c = client(env);
  const accepted = await c.post("/api/auth/invites/accept", { token, password: "member-password-1" });
  if (accepted.status !== 200) throw new Error(`accept failed: ${accepted.text}`);
  return { c, id: created.body.member.id as string };
}
