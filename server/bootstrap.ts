import { createApp } from "./app";
import { loadConfig } from "./config";
import { openDb } from "./db/client";
import { claudeAssistant, templateAssistant } from "./lib/assistant";
import { systemClock } from "./lib/context";
import { devMailer, resendMailer, smtpMailer } from "./email/mailer";
import { mockProvider, paystackProvider } from "./payments/provider";

/**
 * Builds the API with its real dependencies. Shared by the long-running Node
 * server (server/main.ts) and the Vercel function (scripts/vercel/handler.ts).
 */
export async function bootstrap(opts: { migrate?: boolean; serverless?: boolean } = {}) {
  const config = loadConfig();
  const { db, close } = await openDb({ url: config.databaseUrl, dataDir: config.dataDir, migrate: opts.migrate ?? true, serverless: opts.serverless });

  const mailer =
    config.emailProvider === "resend"
      ? resendMailer(config.resendApiKey!, config.emailFrom)
      : config.emailProvider === "smtp"
        ? await smtpMailer(config.smtpUrl!, config.emailFrom)
        : devMailer({ dir: opts.serverless ? undefined : ".data/outbox", log: true });

  const app = createApp({
    db,
    config,
    clock: systemClock,
    payments: config.paymentProvider === "paystack" ? paystackProvider(config.paystackSecretKey!) : mockProvider(),
    assistant: config.anthropicApiKey ? claudeAssistant(config.anthropicApiKey) : templateAssistant,
    mailer,
  });
  return { app, config, db, close, mailer };
}
