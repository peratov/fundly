import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { CONTRIBUTION_STATUSES } from "../../shared/enums";
import { PERIOD_RE, addMonths, periodOf, periodRange } from "../../shared/period";
import { closePeriodSchema, contributionCorrectSchema, contributionCreateSchema, listQuerySchema } from "../../shared/schemas";
import { contributions, memberships } from "../db/schema";
import { requirePerm } from "../lib/auth";
import { actorOf, type AppEnv, today } from "../lib/context";
import { badRequest, paged, parseBody, parseQuery } from "../lib/http";
import { closePeriod, correctContribution, recordContribution } from "../services/savings";

export const savingsRoutes = new Hono<AppEnv>();

savingsRoutes.get("/", async (c) => {
  requirePerm(c, "contributions:read");
  const q = parseQuery(
    c,
    listQuerySchema.extend({
      period: z.string().regex(PERIOD_RE).optional(),
      membershipId: z.string().uuid().optional(),
      status: z.enum(CONTRIBUTION_STATUSES).optional(),
    }),
  );
  const tenant = c.get("tenant");
  const { db } = c.get("deps");
  const conds: SQL[] = [eq(contributions.tenantId, tenant.id)];
  if (q.period) conds.push(eq(contributions.period, q.period));
  if (q.membershipId) conds.push(eq(contributions.membershipId, q.membershipId));
  if (q.status) conds.push(eq(contributions.status, q.status));
  if (q.q) conds.push(sql`${memberships.name} ilike ${`%${q.q}%`}`);
  const where = and(...conds);

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(contributions).innerJoin(memberships, eq(memberships.id, contributions.membershipId)).where(where);
  const items = await db
    .select({ contribution: contributions, memberName: memberships.name, memberNo: memberships.memberNo })
    .from(contributions)
    .innerJoin(memberships, eq(memberships.id, contributions.membershipId))
    .where(where)
    .orderBy(desc(contributions.period), asc(memberships.name))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  return c.json(paged(items.map((r) => ({ ...r.contribution, memberName: r.memberName, memberNo: r.memberNo })), total, q.page, q.pageSize));
});

/** Member × month matrix for the register view. Paginated by member so it scales with fund size. */
savingsRoutes.get("/grid", async (c) => {
  requirePerm(c, "contributions:read");
  const tenant = c.get("tenant");
  const { db, clock } = c.get("deps");
  const q = parseQuery(c, listQuerySchema.extend({ to: z.string().regex(PERIOD_RE).optional(), months: z.coerce.number().int().min(1).max(24).default(6) }));
  const to = q.to ?? periodOf(clock.now());
  const from = addMonths(to, -(q.months - 1));
  const periods = periodRange(from, to);

  const where = and(eq(memberships.tenantId, tenant.id), eq(memberships.status, "active"), q.q ? sql`${memberships.name} ilike ${`%${q.q}%`}` : undefined);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(memberships).where(where);
  const members = await db
    .select({ id: memberships.id, name: memberships.name, memberNo: memberships.memberNo, standing: memberships.standing, joinedOn: memberships.joinedOn })
    .from(memberships)
    .where(where)
    .orderBy(asc(memberships.name))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  const cells = members.length
    ? await db
        .select({ id: contributions.id, membershipId: contributions.membershipId, period: contributions.period, amountMinor: contributions.amountMinor, status: contributions.status })
        .from(contributions)
        .where(and(eq(contributions.tenantId, tenant.id), inArray(contributions.membershipId, members.map((m) => m.id)), sql`${contributions.period} between ${from} and ${to}`))
    : [];
  return c.json({ periods, ...paged(members, total, q.page, q.pageSize), cells });
});

savingsRoutes.post("/", async (c) => {
  requirePerm(c, "contributions:write");
  const input = await parseBody(c, contributionCreateSchema);
  const { db } = c.get("deps");
  const row = await db.transaction((tx) => recordContribution(tx, c.get("tenant"), actorOf(c), { ...input, today: today(c) }));
  return c.json(row, 201);
});

savingsRoutes.patch("/:id", async (c) => {
  requirePerm(c, "contributions:write");
  const input = await parseBody(c, contributionCorrectSchema);
  const { db } = c.get("deps");
  const row = await db.transaction((tx) => correctContribution(tx, c.get("tenant"), actorOf(c), c.req.param("id"), { ...input, today: today(c) }));
  return c.json(row);
});

savingsRoutes.post("/close-period", async (c) => {
  requirePerm(c, "contributions:write");
  const { period } = await parseBody(c, closePeriodSchema);
  const { db, clock } = c.get("deps");
  if (period >= periodOf(clock.now())) throw badRequest("You can only close a month that has ended");
  const res = await db.transaction((tx) => closePeriod(tx, c.get("tenant"), actorOf(c), period));
  return c.json(res);
});
