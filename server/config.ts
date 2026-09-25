export interface Config {
  port: number;
  databaseUrl?: string;
  dataDir: string;
  appUrl: string;
  isProd: boolean;
  paymentProvider: "mock" | "paystack";
  paystackSecretKey?: string;
  anthropicApiKey?: string;
  platformAdminEmails: string[];
  sessionDays: number;
  emailProvider: "dev" | "resend" | "smtp";
  emailFrom: string;
  resendApiKey?: string;
  smtpUrl?: string;
}

export function loadConfig(rawEnv: NodeJS.ProcessEnv = process.env): Config {
  // A copied .env.example leaves keys blank ("KEY="); treat blank as unset so defaults apply.
  const env = Object.fromEntries(Object.entries(rawEnv).filter(([, v]) => v !== undefined && v.trim() !== "")) as NodeJS.ProcessEnv;
  const provider = (env.PAYMENT_PROVIDER ?? "mock") as Config["paymentProvider"];
  if (provider === "paystack" && !env.PAYSTACK_SECRET_KEY) {
    throw new Error("PAYMENT_PROVIDER=paystack requires PAYSTACK_SECRET_KEY");
  }
  const isProd = env.NODE_ENV === "production";
  const emailProvider = (env.EMAIL_PROVIDER ?? "dev") as Config["emailProvider"];
  if (!["mock", "paystack"].includes(provider)) throw new Error(`Unknown PAYMENT_PROVIDER "${provider}"`);
  if (!["dev", "resend", "smtp"].includes(emailProvider)) throw new Error(`Unknown EMAIL_PROVIDER "${emailProvider}"`);
  if (emailProvider === "resend" && !env.RESEND_API_KEY) throw new Error("EMAIL_PROVIDER=resend requires RESEND_API_KEY");
  if (emailProvider === "smtp" && !env.SMTP_URL) throw new Error("EMAIL_PROVIDER=smtp requires SMTP_URL");
  if (isProd && emailProvider === "dev") console.warn("[config] EMAIL_PROVIDER=dev in production — emails will NOT be delivered.");
  if (isProd && provider === "mock") {
    console.warn("[config] PAYMENT_PROVIDER=mock in production — payments will be simulated.");
  }
  return {
    // PORT is what hosting platforms set in production; in dev it may belong to the Vite server.
    port: Number(env.API_PORT ?? (env.NODE_ENV === "production" ? env.PORT : undefined) ?? 3000),
    databaseUrl: env.DATABASE_URL || undefined,
    dataDir: env.DATA_DIR ?? ".data/pglite",
    // Hosts like Render expose the public URL themselves; an explicit APP_URL (custom domain) wins.
    appUrl: (env.APP_URL ?? env.RENDER_EXTERNAL_URL ?? "http://localhost:5173").replace(/\/$/, ""),
    isProd,
    paymentProvider: provider,
    paystackSecretKey: env.PAYSTACK_SECRET_KEY || undefined,
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
    platformAdminEmails: (env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
    sessionDays: Number(env.SESSION_DAYS ?? 14),
    emailProvider,
    emailFrom: env.EMAIL_FROM ?? "Fundly <hello@fundly.app>",
    resendApiKey: env.RESEND_API_KEY || undefined,
    smtpUrl: env.SMTP_URL || undefined,
  };
}
