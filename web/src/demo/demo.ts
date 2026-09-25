import { ApiError } from "../lib/api";

/*
 * Demo mode: the real app, running on a snapshot of the seeded demo fund.
 *
 * Any page under /f/demo (a fund owner's view) or /f/demo-member (a member's view)
 * answers API calls from web/public/demo/fixtures.json instead of the server. That
 * snapshot is captured from the real API by `npm run demo:capture`, so the
 * homepage previews and the no-signup demo are the actual product UI, not mock-ups.
 * Nothing is sent to the server and nothing is saved.
 */

type Fixtures = { capturedAt: string; personas: Record<string, unknown>; responses: Record<string, unknown> };

export const DEMO_PERSONA = (typeof location !== "undefined" && location.pathname.match(/^\/f\/(demo(?:-member)?)(?:\/|$)/)?.[1]) || null;
export const IS_DEMO = DEMO_PERSONA !== null;
/** Shown inside a homepage frame rather than as a full page. */
export const IS_EMBED = IS_DEMO && typeof window !== "undefined" && window.self !== window.top;

let fixtures: Promise<Fixtures> | null = null;
export const loadDemoFixtures = () =>
  (fixtures ??= fetch("/demo/fixtures.json").then((r) => {
    if (!r.ok) throw new ApiError(503, "demo_unavailable", "The demo is unavailable right now");
    return r.json() as Promise<Fixtures>;
  }));

/** Path plus sorted, non-empty query params; must match scripts/capture-demo.mjs. */
function keyOf(path: string) {
  const [p, q = ""] = path.split("?");
  const params = [...new URLSearchParams(q)].filter(([, v]) => v !== "").sort(([a], [b]) => a.localeCompare(b));
  return params.length ? `${p}?${new URLSearchParams(params)}` : p;
}

// Query params that select a different snapshot rather than filter one.
const SELECTORS = new Set(["mine", "status", "to", "from", "months"]);
// Params the demo applies itself to list items, like the API's WHERE clauses.
const FILTERS = ["status", "standing", "role", "type"];

export const DEMO_WRITE_MESSAGE = "This is a demo fund, so nothing is saved. Start a free trial to run your own.";

export async function demoRequest<T>(method: string, path: string): Promise<T> {
  const f = await loadDemoFixtures();
  if (method !== "GET") {
    if (path.endsWith("/notifications/read")) return { ok: true } as T;
    if (path === "/auth/logout") {
      window.location.href = "/";
      return { ok: true } as T;
    }
    throw new ApiError(403, "demo", DEMO_WRITE_MESSAGE);
  }
  if (path === "/auth/me") return f.personas[DEMO_PERSONA!] as T;

  // Each persona only sees its own fund's data.
  if (path.startsWith("/t/") && !path.startsWith(`/t/${DEMO_PERSONA}/`)) throw new ApiError(404, "not_found", "Fund not found");

  const exact = f.responses[keyOf(path)];
  if (exact) return structuredClone(exact) as T;

  const [p, q = ""] = path.split("?");
  const want = new URLSearchParams(q);
  // Pick the captured snapshot of this endpoint whose selecting params match best.
  let best: { key: string; score: number } | null = null;
  for (const key of Object.keys(f.responses)) {
    if (key.split("?")[0] !== p) continue;
    const have = new URLSearchParams(key.split("?")[1] ?? "");
    let score = 0;
    for (const [k, v] of have) if (SELECTORS.has(k)) score += want.get(k) === v ? 2 : -1;
    if (!best || score > best.score) best = { key, score };
  }
  if (!best) throw new ApiError(404, "not_found", "Not available in the demo");

  const data = structuredClone(f.responses[best.key]) as { items?: Record<string, unknown>[]; total?: number; page?: number; pageSize?: number; pages?: number };
  if (Array.isArray(data.items)) {
    let items = data.items;
    const text = want.get("q")?.trim().toLowerCase();
    if (text) items = items.filter((it) => JSON.stringify(it).toLowerCase().includes(text));
    for (const k of FILTERS) {
      const v = want.get(k);
      if (v && items[0] && k in items[0]) items = items.filter((it) => v.split(",").includes(String(it[k])));
    }
    const pageSize = Number(want.get("pageSize") ?? 25);
    const page = Number(want.get("page") ?? 1);
    data.total = items.length;
    data.pageSize = pageSize;
    data.page = page;
    data.pages = Math.max(1, Math.ceil(items.length / pageSize));
    data.items = items.slice((page - 1) * pageSize, page * pageSize);
  }
  return data as T;
}
