import { and, eq, gt } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Role } from "../../shared/enums";
import { permissionsFor, type Permission } from "../../shared/permissions";
import { memberships, sessions, tenants, users } from "../db/schema";
import type { AppEnv, Ctx } from "./context";
import { randomToken, sha256 } from "./crypto";
import { AppError, forbidden, notFound, unauthorized } from "./http";

export const SESSION_COOKIE = "fundly_session";

export async function startSession(c: Ctx, userId: string) {
  const { db, config, clock } = c.get("deps");
  const token = randomToken();
  const expiresAt = new Date(clock.now().getTime() + config.sessionDays * 86_400_000);
  await db.insert(sessions).values({ tokenHash: sha256(token), userId, expiresAt });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "Lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(c: Ctx) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.get("deps").db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Resolves the session cookie to a user. Sessions live in the DB, so any app instance can serve any request. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) throw unauthorized();
  const { db, clock } = c.get("deps");
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, clock.now())));
  if (!row) throw unauthorized("Your session has expired. Please sign in again.");
  // PLATFORM_ADMIN_EMAILS is the source of truth: removing an email revokes access on the next request, not the next login.
  const isAdmin = c.get("deps").config.platformAdminEmails.includes(row.user.email);
  if (isAdmin !== row.user.isPlatformAdmin) {
    await db.update(users).set({ isPlatformAdmin: isAdmin }).where(eq(users.id, row.user.id));
    row.user.isPlatformAdmin = isAdmin;
  }
  c.set("user", row.user);
  await next();
};

/**
 * Every tenant route is mounted under /api/t/:tenantId. This middleware is the
 * single choke point for tenant isolation: it loads the caller's membership in
 * that tenant (or rejects), and all downstream queries filter on c.get("tenant").id.
 */
export const requireTenant: MiddlewareHandler<AppEnv> = async (c, next) => {
  const tenantId = c.req.param("tenantId");
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) throw notFound("Fund");
  const { db, clock } = c.get("deps");
  const user = c.get("user");
  const [row] = await db
    .select({ tenant: tenants, membership: memberships })
    .from(memberships)
    .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, user.id), eq(memberships.status, "active")));
  if (!row) throw notFound("Fund");

  const { tenant, membership } = row;
  const isWrite = c.req.method !== "GET";
  if (isWrite && !user.isPlatformAdmin) {
    if (tenant.status === "suspended" || tenant.status === "cancelled") {
      throw new AppError(402, "tenant_inactive", "This fund's subscription is inactive. Contact the fund owner.");
    }
    const today = clock.now().toISOString().slice(0, 10);
    if (tenant.status === "trial" && tenant.trialEndsAt && tenant.trialEndsAt < today) {
      throw new AppError(402, "trial_expired", "This fund's free trial has ended. Upgrade to keep recording activity.");
    }
  }

  const roles = membership.roles as Role[];
  c.set("tenant", tenant);
  c.set("membership", membership);
  c.set("roles", roles);
  c.set("perms", permissionsFor(roles));
  await next();
};

export function requirePerm(c: Ctx, ...perms: Permission[]) {
  const have = c.get("perms");
  if (!perms.some((p) => have.has(p))) throw forbidden();
}

export function hasPerm(c: Ctx, perm: Permission): boolean {
  return c.get("perms").has(perm);
}

export const requirePlatformAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("user").isPlatformAdmin) throw forbidden();
  await next();
};
