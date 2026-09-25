/**
 * Vercel Function entry: the same Hono app as server/main.ts, as one serverless function.
 * scripts/vercel/build.mjs bundles this file into .vercel/output/functions/api.func.
 *
 * Routing (see build.mjs): static files come from Vercel's CDN; /api/*, /learn*,
 * /sitemap.xml and /robots.txt are rewritten here with the original path in `__p`.
 */
import { getRequestListener } from "@hono/node-server";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The knowledge base's Markdown ships inside the function bundle, next to this file.
process.env.LEARN_DIR ??= path.join(path.dirname(fileURLToPath(import.meta.url)), "content/learn");

// Built once per instance and reused across requests. Migrations run at build time, not here.
const ready = import("../../server/bootstrap").then((m) => m.bootstrap({ migrate: false, serverless: true }));
ready.catch((err) => console.error("[fundly] startup failed:", err));

export default getRequestListener(async (incoming) => {
  let req = incoming;
  const url = new URL(req.url);
  const original = url.searchParams.get("__p");
  if (original !== null) {
    url.pathname = original;
    url.searchParams.delete("__p");
    req = new Request(url, { method: req.method, headers: req.headers, body: req.body, signal: req.signal, duplex: "half" } as RequestInit);
  }

  let app;
  try {
    ({ app } = await ready);
  } catch {
    const message = process.env.DATABASE_URL
      ? "The server failed to start. Check the function logs."
      : "DATABASE_URL is not set. Add a Postgres database (e.g. Neon) to this Vercel project and redeploy.";
    return Response.json({ error: { code: "unavailable", message } }, { status: 503 });
  }
  return app.fetch(req);
});
