import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { CLAIM_STATUSES } from "../../shared/enums";
import { claimCreateSchema, claimDecisionSchema, listQuerySchema } from "../../shared/schemas";
import { claims, memberships } from "../db/schema";
import { requirePerm } from "../lib/auth";
import { actorOf, type AppEnv, today } from "../lib/context";
import { paged, parseBody, parseQuery } from "../lib/http";
import { decideClaim, fileClaim } from "../services/claims";

export const claimRoutes = new Hono<AppEnv>();

claimRoutes.get("/", async (c) => {
  requirePerm(c, "claims:read", "claims:decide");
  const q = parseQuery(c, listQuerySchema.extend({ status: z.enum(CLAIM_STATUSES).optional() }));
  const tenant = c.get("tenant");
  const { db } = c.get("deps");
  const conds: SQL[] = [eq(claims.tenantId, tenant.id)];
  if (q.status) conds.push(eq(claims.status, q.status));
  if (q.q) conds.push(sql`(${memberships.name} ilike ${`%${q.q}%`} or ${claims.ref} ilike ${`%${q.q}%`})`);
  const where = and(...conds);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(claims).innerJoin(memberships, eq(memberships.id, claims.membershipId)).where(where);
  const rows = await db
    .select({ claim: claims, memberName: memberships.name, memberNo: memberships.memberNo, welfarePackageId: memberships.welfarePackageId })
    .from(claims)
    .innerJoin(memberships, eq(memberships.id, claims.membershipId))
    .where(where)
    .orderBy(sql`${claims.status} = 'pending' desc`, desc(claims.createdAt))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  return c.json(paged(rows.map((r) => ({ ...r.claim, memberName: r.memberName, memberNo: r.memberNo, welfarePackageId: r.welfarePackageId })), total, q.page, q.pageSize));
});

claimRoutes.post("/", async (c) => {
  const input = await parseBody(c, claimCreateSchema);
  const self = c.get("membership");
  const membershipId = input.membershipId ?? self.id;
  if (membershipId !== self.id) requirePerm(c, "claims:decide");
  const { db, clock } = c.get("deps");
  const claim = await db.transaction((tx) => fileClaim(tx, c.get("tenant"), actorOf(c), { ...input, membershipId, asOf: clock.now() }));
  return c.json(claim, 201);
});

claimRoutes.post("/:id/decision", async (c) => {
  requirePerm(c, "claims:decide");
  const input = await parseBody(c, claimDecisionSchema);
  const { db, clock } = c.get("deps");
  const claim = await db.transaction((tx) => decideClaim(tx, c.get("tenant"), actorOf(c), c.req.param("id"), { ...input, today: today(c), asOf: clock.now() }));
  return c.json(claim);
});
