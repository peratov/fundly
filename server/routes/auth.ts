import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { Hono } from "hono";
import { defaultSettings } from "../../shared/settings";
import { acceptInviteSchema, loginSchema, signupSchema, type SignupInput } from "../../shared/schemas";
import type { Db } from "../db/client";
import { periodOf } from "../../shared/period";
import { invites, leads, memberships, sharePrices, tenants, users } from "../db/schema";
import { endSession, requireAuth, startSession } from "../lib/auth";
import type { AppEnv, Ctx } from "../lib/context";
import { hashPassword, sha256, verifyPassword } from "../lib/crypto";
import { AppError, conflict, notFound, parseBody, unauthorized } from "../lib/http";
import { rateLimit } from "../lib/rate-limit";
import { audit, nextRef } from "../lib/records";

export const authRoutes = new Hono<AppEnv>();

const limitAuth = rateLimit({ windowMs: 15 * 60_000, max: 20, key: "auth" });

function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "fund";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

async function userPayload(c: Ctx, userId: string) {
  const { db } = c.get("deps");
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const funds = await db
    .select({
      tenantId: tenants.id,
      name: tenants.name,
      shortName: tenants.shortName,
      currency: tenants.currency,
      status: tenants.status,
      plan: tenants.plan,
      trialEndsAt: tenants.trialEndsAt,
      membershipId: memberships.id,
      memberName: memberships.name,
      roles: memberships.roles,
    })
    .from(memberships)
    .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")))
    .orderBy(tenants.name);
  return { user: { id: user.id, email: user.email, name: user.name, isPlatformAdmin: user.isPlatformAdmin }, funds };
}

type FundInput = SignupInput["fund"];

/** Provision a fund: tenant row, opening share price and the creator's owner membership. */
async function createFund(tx: Db, user: { id: string; name: string; email: string }, fund: FundInput, now: Date) {
  const today = now.toISOString().slice(0, 10);
  const settings = defaultSettings(fund.minContributionMinor);
  const trialEnds = new Date(now.getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
  const [tenant] = await tx
    .insert(tenants)
    .values({ slug: slugify(fund.name), name: fund.name, shortName: fund.shortName || null, currency: fund.currency, settings, trialEndsAt: trialEnds })
    .returning();
  await tx.insert(sharePrices).values({ tenantId: tenant.id, effectivePeriod: periodOf(now), priceMinor: fund.sharePriceMinor });
  const [membership] = await tx
    .insert(memberships)
    .values({
      tenantId: tenant.id,
      userId: user.id,
      memberNo: await nextRef(tx, tenant.id, "member", "M"),
      name: user.name,
      email: user.email,
      joinedOn: today,
      roles: ["owner", "member"],
      welfarePackageId: settings.defaultWelfarePackageId,
    })
    .returning();
  await audit(tx, tenant.id, { userId: user.id, name: user.name, membershipId: membership.id }, {
    action: "fund.created",
    entityType: "fund",
    entityId: tenant.id,
    summary: `${user.name} created ${fund.name} (${fund.currency})`,
  });
  return tenant;
}

authRoutes.post("/signup", limitAuth, async (c) => {
  const input = await parseBody(c, signupSchema);
  const { db, config, clock } = c.get("deps");
  const now = clock.now();

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email));
    if (existing) throw conflict("An account with this email already exists. Sign in instead.");
    const [user] = await tx
      .insert(users)
      .values({ email: input.email, name: input.name, passwordHash: await hashPassword(input.password), isPlatformAdmin: config.platformAdminEmails.includes(input.email) })
      .returning();

    const tenant = await createFund(tx, user, input.fund, now);
    // Attribute the signup to any free-tool lead with the same email.
    await tx.update(leads).set({ convertedUserId: user.id }).where(and(eq(leads.email, input.email), isNull(leads.convertedUserId)));
    return { user, tenant };
  });

  await startSession(c, result.user.id);
  return c.json({ ...(await userPayload(c, result.user.id)), createdTenantId: result.tenant.id }, 201);
});

authRoutes.post("/login", limitAuth, async (c) => {
  const input = await parseBody(c, loginSchema);
  const { db, config } = c.get("deps");
  const [user] = await db.select().from(users).where(eq(users.email, input.email));
  // Always run a hash comparison so response time doesn't reveal which emails exist.
  const ok = user ? await verifyPassword(input.password, user.passwordHash) : await verifyPassword(input.password, "scrypt$AAAA$AAAA").then(() => false);
  if (!user || !ok) throw unauthorized("Incorrect email or password");
  const shouldBeAdmin = config.platformAdminEmails.includes(user.email);
  if (shouldBeAdmin !== user.isPlatformAdmin) await db.update(users).set({ isPlatformAdmin: shouldBeAdmin }).where(eq(users.id, user.id));
  await startSession(c, user.id);
  return c.json(await userPayload(c, user.id));
});

authRoutes.post("/funds", requireAuth, async (c) => {
  const fund = await parseBody(c, signupSchema.shape.fund);
  const { db, clock } = c.get("deps");
  const user = c.get("user");
  const tenant = await db.transaction((tx) => createFund(tx, user, fund, clock.now()));
  return c.json({ ...(await userPayload(c, user.id)), createdTenantId: tenant.id }, 201);
});

authRoutes.post("/logout", async (c) => {
  await endSession(c);
  return c.json({ ok: true });
});

authRoutes.get("/me", requireAuth, async (c) => c.json(await userPayload(c, c.get("user").id)));

// ---------------------------------------------------------------- invites

async function loadInvite(c: Ctx, token: string) {
  const { db, clock } = c.get("deps");
  const [row] = await db
    .select({ invite: invites, fundName: tenants.name, memberName: memberships.name, membershipUserId: memberships.userId })
    .from(invites)
    .innerJoin(tenants, eq(tenants.id, invites.tenantId))
    .innerJoin(memberships, eq(memberships.id, invites.membershipId))
    // An invite dies with the membership (exit) or when the member's email is changed.
    .where(and(eq(invites.tokenHash, sha256(token)), isNull(invites.acceptedAt), gt(invites.expiresAt, clock.now()), eq(memberships.status, "active"), eq(memberships.email, invites.email)));
  if (!row) throw notFound("Invitation (it may have expired or already been used)");
  return row;
}

authRoutes.get("/invites/:token", async (c) => {
  const row = await loadInvite(c, c.req.param("token"));
  const [existing] = await c.get("deps").db.select({ id: users.id }).from(users).where(eq(users.email, row.invite.email));
  return c.json({ fundName: row.fundName, memberName: row.memberName, email: row.invite.email, existingAccount: !!existing });
});

authRoutes.post("/invites/accept", limitAuth, async (c) => {
  const input = await parseBody(c, acceptInviteSchema);
  const row = await loadInvite(c, input.token);
  const { db, clock } = c.get("deps");

  const userId = await db.transaction(async (tx) => {
    let [user] = await tx.select().from(users).where(eq(users.email, row.invite.email));
    if (user) {
      if (!(await verifyPassword(input.password, user.passwordHash))) throw unauthorized("An account exists for this email — enter its password to join");
    } else {
      [user] = await tx.insert(users).values({ email: row.invite.email, name: input.name || row.memberName, passwordHash: await hashPassword(input.password) }).returning();
    }
    if (row.membershipUserId && row.membershipUserId !== user.id) throw new AppError(409, "conflict", "This membership is already linked to another account");
    const [other] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.tenantId, row.invite.tenantId), eq(memberships.userId, user.id), ne(memberships.id, row.invite.membershipId)));
    if (other) throw new AppError(409, "conflict", "This account is already linked to another member of this fund");
    await tx.update(memberships).set({ userId: user.id }).where(eq(memberships.id, row.invite.membershipId));
    await tx.update(invites).set({ acceptedAt: clock.now() }).where(eq(invites.tokenHash, row.invite.tokenHash));
    await audit(tx, row.invite.tenantId, { userId: user.id, name: row.memberName }, { action: "member.joined", entityType: "member", entityId: row.invite.membershipId, summary: `${row.memberName} accepted their invitation` });
    return user.id;
  });

  await startSession(c, userId);
  return c.json({ ...(await userPayload(c, userId)), joinedTenantId: row.invite.tenantId });
});
