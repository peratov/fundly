import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { bootstrap } from "./bootstrap";

if (existsSync(".env")) process.loadEnvFile(".env");

const { app, config, close, mailer } = await bootstrap();

// In production the API also serves the built SPA.
const webDir = path.resolve("dist/web");
if (config.isProd && existsSync(webDir)) {
  const indexHtml = readFileSync(path.join(webDir, "index.html"), "utf8");
  app.use("/assets/*", serveStatic({ root: "./dist/web" }));
  app.get("*", serveStatic({ root: "./dist/web" }));
  app.get("*", (c) => c.html(indexHtml));
}

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[fundly] API on http://localhost:${info.port} · db=${config.databaseUrl ? "postgres" : `pglite(${config.dataDir})`} · payments=${config.paymentProvider} · ai=${config.anthropicApiKey ? "claude" : "templates"} · email=${mailer.name}`);
});

const shutdown = async () => {
  server.close();
  await close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
