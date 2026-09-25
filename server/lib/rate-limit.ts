import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./context";
import { AppError } from "./http";

/**
 * Fixed-window, in-process limiter for auth endpoints. Good for a single
 * instance; when running several instances behind a load balancer, swap the
 * Map for Redis (INCR + EXPIRE) — the middleware signature stays the same.
 */
export function rateLimit(opts: { windowMs: number; max: number; key: string }): MiddlewareHandler<AppEnv> {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return async (c, next) => {
    if (process.env.NODE_ENV === "test") return next();
    const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim() || c.req.header("x-real-ip") || "local";
    const k = `${opts.key}:${ip}`;
    const now = Date.now();
    const cur = hits.get(k);
    if (!cur || cur.resetAt < now) {
      hits.set(k, { count: 1, resetAt: now + opts.windowMs });
      if (hits.size > 10_000) for (const [key, v] of hits) if (v.resetAt < now) hits.delete(key);
    } else if (++cur.count > opts.max) {
      c.header("Retry-After", String(Math.ceil((cur.resetAt - now) / 1000)));
      throw new AppError(429, "rate_limited", "Too many attempts. Please wait a few minutes and try again.");
    }
    await next();
  };
}
