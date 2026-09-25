/**
 * Assembles a Vercel Build Output API (v3) deployment in .vercel/output:
 *
 *   static/                 the built SPA (dist/web): landing, app, demo; served from the CDN
 *   functions/api.func/     the Hono API as one bundled Node function (+ knowledge-base Markdown)
 *   config.json             routes: static first, then API/learn/sitemap to the function, else the SPA
 *
 * Runs after `npm run build` (see `npm run build:vercel`). When DATABASE_URL is available on a
 * production build, database migrations are applied here, before the new version goes live.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const OUT = ".vercel/output";
const FN = `${OUT}/functions/api.func`;

if (!existsSync("dist/web/index.html")) throw new Error("Run `npm run build` first (dist/web is missing)");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(FN, { recursive: true });

cpSync("dist/web", `${OUT}/static`, { recursive: true });
cpSync("content/learn", `${FN}/content/learn`, { recursive: true });

await build({
  entryPoints: ["scripts/vercel/handler.ts"],
  outfile: `${FN}/index.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // PGlite (the embedded dev database) is never used on Vercel, where DATABASE_URL is required.
  // A stub keeps its ~10 MB of WASM out of the function while the drizzle driver's import still resolves.
  alias: { "@electric-sql/pglite": "./scripts/vercel/no-pglite.mjs" },
  // Some bundled CommonJS packages (e.g. nodemailer) call require() for Node built-ins.
  banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
  logLevel: "warning",
});

writeFileSync(
  `${FN}/.vc-config.json`,
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, supportsResponseStreaming: true, maxDuration: 60 }, null, 2),
);

writeFileSync(
  `${OUT}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "^/assets/(.*)$", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
        {
          src: "^/(.*)$",
          headers: { "x-content-type-options": "nosniff", "x-frame-options": "SAMEORIGIN", "referrer-policy": "strict-origin-when-cross-origin" },
          continue: true,
        },
        { handle: "filesystem" },
        // Server-side routes. The original path travels in __p (the function restores it).
        { src: "^/(api/.*|learn(?:/.*)?|sitemap\\.xml|robots\\.txt)$", dest: "/api?__p=/$1" },
        // Everything else is the single-page app.
        { src: "^/.*$", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);
console.log(`[vercel] wrote ${OUT} (static + api function)`);

const onVercel = !!process.env.VERCEL;
const production = !onVercel || process.env.VERCEL_ENV === "production";
if (process.env.DATABASE_URL && production) {
  console.log("[vercel] applying database migrations…");
  const r = spawnSync("npx", ["tsx", "server/scripts/migrate.ts"], { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
} else if (onVercel) {
  console.warn(`[vercel] skipped migrations (${process.env.DATABASE_URL ? `${process.env.VERCEL_ENV} build` : "DATABASE_URL not set"})`);
}
