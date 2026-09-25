/**
 * Captures the live demo fixtures that power the homepage's real-product previews
 * and the no-signup demo at /f/demo.
 *
 * It logs in to a running API as two seeded demo users (a fund owner and a member),
 * records the real JSON responses of every screen, swaps the fund id for "demo" /
 * "demo-member", and writes web/public/demo/fixtures.json. Because the data comes from
 * the real API, the previews are always the real product UI with real shapes.
 *
 *   npm run db:seed && npm run dev      # in one terminal
 *   npm run demo:capture                # in another
 */
import { writeFileSync } from "node:fs";

const API = process.env.API_URL ?? "http://localhost:3000/api";
const ORIGIN = process.env.APP_URL ?? "http://localhost:5173";
const PASSWORD = "fundly-demo";
const OUT = new URL("../web/public/demo/fixtures.json", import.meta.url);

async function login(email) {
  const res = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ email, password: PASSWORD }) });
  if (!res.ok) throw new Error(`Login failed for ${email} (${res.status}). Is the API running and seeded (npm run db:seed)?`);
  const cookie = res.headers.get("set-cookie").split(";")[0];
  const me = await res.json();
  const get = async (path) => {
    const r = await fetch(`${API}${path}`, { headers: { cookie } });
    if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${await r.text()}`);
    return r.json();
  };
  return { me, get };
}

/** Same normalisation the browser uses: path + sorted, non-empty query params. */
export function keyOf(path) {
  const [p, q = ""] = path.split("?");
  const params = [...new URLSearchParams(q)].filter(([, v]) => v !== "").sort(([a], [b]) => a.localeCompare(b));
  return params.length ? `${p}?${new URLSearchParams(params)}` : p;
}

const addMonths = (period, n) => {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

async function capture(persona, email, alias) {
  const { me, get } = await login(email);
  const fund = me.funds[0];
  const T = fund.tenantId;
  const base = `/t/${T}`;
  const out = {};
  const save = async (path) => {
    out[keyOf(path.replace(base, `/t/${alias}`))] = await get(path);
  };

  await save(`${base}/me`);
  await save(`${base}/settings`);
  await save(`${base}/notifications`);
  await save(`${base}/payments?mine=true&pageSize=200`);
  const mine = out[`/t/${alias}/me`];
  for (const l of mine.loans ?? []) await save(`${base}/loans/${l.id}`);

  if (persona === "owner") {
    const overview = await get(`${base}/overview`);
    out[`/t/${alias}/overview`] = overview;
    const period = overview.period;
    // Lists are captured whole; the browser filters and paginates them like the API would.
    for (const status of ["active", "exited"]) await save(`${base}/members?pageSize=200&status=${status}`);
    await save(`${base}/loans?pageSize=200`);
    await save(`${base}/claims?pageSize=200`);
    await save(`${base}/shares?pageSize=200`);
    await save(`${base}/payments?pageSize=200`);
    await save(`${base}/audit?pageSize=200`);
    await save(`${base}/contributions?pageSize=200`);
    for (const back of [0, 6, 12]) await save(`${base}/contributions/grid?months=6&pageSize=200&to=${addMonths(period, -back)}`);
    const year = period.slice(0, 4);
    await save(`${base}/reports/summary?from=${year}-01-01&to=${new Date().toISOString().slice(0, 10)}`);
    for (const m of out[keyOf(`/t/${alias}/members?pageSize=200&status=active`)].items) await save(`${base}/members/${m.id}`);
    for (const l of out[keyOf(`/t/${alias}/loans?pageSize=200`)].items) await save(`${base}/loans/${l.id}`);
    // Stable aliases for the homepage tour, so its links survive a re-seed with new ids.
    const loansList = out[keyOf(`/t/${alias}/loans?pageSize=200`)].items;
    const inReview = loansList.find((l) => l.status === "pending_committee") ?? loansList.find((l) => l.status === "pending_manager") ?? loansList[0];
    if (inReview) out[`/t/${alias}/loans/featured`] = out[`/t/${alias}/loans/${inReview.id}`];
    const membersList = out[keyOf(`/t/${alias}/members?pageSize=200&status=active`)].items;
    const star = [...membersList].filter((m) => m.standing === "active").sort((a, b) => b.savingsMinor - a.savingsMinor)[0];
    if (star) out[`/t/${alias}/members/featured`] = out[`/t/${alias}/members/${star.id}`];
  }

  const auth = { ...me, funds: [{ ...fund, tenantId: alias }] };
  // Swap the real fund id everywhere (links in notifications, audit data, …).
  const json = JSON.stringify({ auth, responses: out }).replaceAll(T, alias);
  return JSON.parse(json);
}

const owner = await capture("owner", "mawuli@dzolali.test", "demo");
const member = await capture("member", "edem@dzolali.test", "demo-member");
const fixtures = {
  capturedAt: new Date().toISOString(),
  personas: { demo: owner.auth, "demo-member": member.auth },
  responses: { ...owner.responses, ...member.responses },
};
writeFileSync(OUT, JSON.stringify(fixtures));
const kb = Math.round(Buffer.byteLength(JSON.stringify(fixtures)) / 1024);
console.log(`Wrote ${Object.keys(fixtures.responses).length} responses (${kb} KB) to web/public/demo/fixtures.json`);
