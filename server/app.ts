import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { requireAuth, requireTenant } from "./lib/auth";
import type { AppEnv, Deps } from "./lib/context";
import { AppError } from "./lib/http";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { claimRoutes } from "./routes/claims";
import { dataRoutes } from "./routes/data";
import { fundRoutes } from "./routes/fund";
import { loanRoutes } from "./routes/loans";
import { memberRoutes } from "./routes/members";
import { paymentRoutes } from "./routes/payments";
import { publicRoutes } from "./routes/public";
import { learnRoutes } from "./learn/routes";
import { savingsRoutes } from "./routes/savings";
import { completePayment } from "./services/payments";

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>();

  app.use("*", secureHeaders({ crossOriginResourcePolicy: "same-origin" }));
  app.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });

  // CSRF defence in depth: cookies are SameSite=Lax, bodies must be JSON (forcing a CORS
  // preflight cross-site), and state-changing requests from a foreign Origin are rejected.
  app.use("/api/*", async (c, next) => {
    const m = c.req.method;
    if (m !== "GET" && m !== "HEAD" && !c.req.path.startsWith("/api/webhooks/")) {
      const origin = c.req.header("origin");
      if (origin) {
        const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
        const allowed = [deps.config.appUrl, `http://${host}`, `https://${host}`];
        if (!allowed.includes(origin)) throw new AppError(403, "bad_origin", "Cross-site request blocked");
      }
    }
    await next();
  });

  app.get("/api/health", async (c) => c.json({ ok: true, provider: deps.payments.name }));

  // Server-rendered knowledge base, sitemap, robots.txt and RSS (indexable without JavaScript).
  app.route("/", learnRoutes);

  app.route("/api/auth", authRoutes);
  app.route("/api/public", publicRoutes);

  // Development only: read emails the dev mailer "sent" without a real provider.
  const outbox = (deps.mailer as { outbox?: { id: string; to: string; subject: string; sentAt: string; html: string; tag: string }[] }).outbox;
  if (outbox && !deps.config.isProd) {
    app.get("/api/dev/outbox", (c) => c.json(outbox.map(({ html: _html, ...m }) => m)));
    app.get("/api/dev/outbox/:id", (c) => {
      const m = outbox.find((x) => x.id === c.req.param("id")) ?? (c.req.param("id") === "latest" ? outbox[0] : undefined);
      return m ? c.html(m.html) : c.text("No such email", 404);
    });
  }

  const admin = new Hono<AppEnv>();
  admin.use("*", requireAuth);
  admin.route("/", adminRoutes);
  app.route("/api/admin", admin);

  // Everything under /api/t/:tenantId is tenant-scoped by requireTenant.
  const t = new Hono<AppEnv>();
  t.use("*", requireAuth, requireTenant);
  t.route("/", fundRoutes);
  t.route("/", dataRoutes);
  t.route("/members", memberRoutes);
  t.route("/contributions", savingsRoutes);
  t.route("/loans", loanRoutes);
  t.route("/claims", claimRoutes);
  t.route("/payments", paymentRoutes);
  app.route("/api/t/:tenantId", t);

  app.post("/api/webhooks/:provider", async (c) => {
    if (c.req.param("provider") !== deps.payments.name) return c.json({ ok: false }, 404);
    const raw = await c.req.text();
    const evt = deps.payments.parseWebhook(raw, c.req.raw.headers);
    if (!evt) return c.json({ ok: false }, 400);
    try {
      await completePayment(deps, deps.payments.name, evt.reference, evt);
    } catch (err) {
      if (err instanceof AppError && err.status === 404) return c.json({ ok: true, ignored: true });
      throw err;
    }
    return c.json({ ok: true });
  });

  app.notFound((c) => (c.req.path.startsWith("/api/") ? c.json({ error: { code: "not_found", message: "Not found" } }, 404) : c.text("Not found", 404)));

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
    }
    // Unique-constraint races surface as a clean 409 instead of a 500.
    const pgCode = (err as { code?: string; cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code;
    if (pgCode === "23505") return c.json({ error: { code: "conflict", message: "That record already exists" } }, 409);
    console.error("[api] unhandled", err);
    return c.json({ error: { code: "internal", message: "Something went wrong. Please try again." } }, 500);
  });

  return app;
}
