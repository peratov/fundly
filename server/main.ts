import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { openDb } from "./db/client";
import { claudeAssistant, templateAssistant } from "./lib/assistant";
import { systemClock } from "./lib/context";
import { devMailer, resendMailer, smtpMailer } from "./email/mailer";
import { mockProvider, paystackProvider } from "./payments/provider";

if (existsSync(".env")) process.loadEnvFile(".env");

const config = loadConfig();
const { db, close } = await openDb({ url: config.databaseUrl, dataDir: config.dataDir });

const mailer =
  config.emailProvider === "resend"
    ? resendMailer(config.resendApiKey!, config.emailFrom)
    : config.emailProvider === "smtp"
      ? await smtpMailer(config.smtpUrl!, config.emailFrom)
      : devMailer({ dir: ".data/outbox", log: true });

const app = createApp({
  db,
  config,
  clock: systemClock,
  payments: config.paymentProvider === "paystack" ? paystackProvider(config.paystackSecretKey!) : mockProvider(),
  assistant: config.anthropicApiKey ? claudeAssistant(config.anthropicApiKey) : templateAssistant,
  mailer,
});

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
