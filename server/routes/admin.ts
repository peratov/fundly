import { desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { listQuerySchema, tenantAdminUpdateSchema } from "../../shared/schemas";
import { circles, leads, tenants, users } from "../db/schema";
import { toCsvLine } from "../lib/csv";
import { requirePlatformAdmin } from "../lib/auth";
import type { AppEnv } from "../lib/context";
import { notFound, paged, parseBody, parseQuery } from "../lib/http";
import { audit } from "../lib/records";

/** Platform operator console: every fund on the platform, their plan and health. */
export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use("*", requirePlatformAdmin);

adminRoutes.get("/tenants", async (c) => {
  const q = parseQuery(c, listQuerySchema);
  const { db } = c.get("deps");
  const where = q.q ? sql`${tenants.name} ilike ${`%${q.q}%`}` : undefined;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(tenants).where(where);
  const rows = await db
    .select({
      tenant: tenants,
      members: sql<number>`(select count(*)::int from memberships m where m.tenant_id = "tenants"."id" and m.status = 'active')`,
      cashMinor: sql<string>`(select coalesce(sum(debit_minor - credit_minor), 0) from journal_lines jl where jl.tenant_id = "tenants"."id" and jl.account = 'cash')`,
      owner: sql<string>`(select m.email from memberships m where m.tenant_id = "tenants"."id" and 'owner' = any(m.roles) order by m.created_at limit 1)`,
      lastActivity: sql<string>`(select max(created_at) from audit_events a where a.tenant_id = "tenants"."id")`,
    })
    .from(tenants)
    .where(where)
    .orderBy(desc(tenants.createdAt))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  const [stats] = await db
    .select({
      funds: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${tenants.status} = 'active')::int`,
      trial: sql<number>`count(*) filter (where ${tenants.status} = 'trial')::int`,
      suspended: sql<number>`count(*) filter (where ${tenants.status} in ('suspended', 'cancelled'))::int`,
      users: sql<number>`(select count(*)::int from ${users})`,
    })
    .from(tenants);
  return c.json({
    stats,
    ...paged(
      rows.map((r) => ({ ...r.tenant, settings: undefined, members: r.members, cashMinor: Number(r.cashMinor), owner: r.owner, lastActivity: r.lastActivity })),
      total,
      q.page,
      q.pageSize,
    ),
  });
});

adminRoutes.patch("/tenants/:id", async (c) => {
  const input = await parseBody(c, tenantAdminUpdateSchema);
  const { db } = c.get("deps");
  const user = c.get("user");
  const [t] = await db.transaction(async (tx) => {
    const r = await tx.update(tenants).set(input).where(eq(tenants.id, c.req.param("id"))).returning();
    if (!r.length) throw notFound("Fund");
    await audit(tx, r[0].id, { userId: user.id, name: `${user.name} (platform)` }, { action: "platform.tenant_updated", entityType: "fund", entityId: r[0].id, summary: `Platform admin updated subscription: ${JSON.stringify(input)}` });
    return r;
  });
  return c.json({ ...t, settings: undefined });
});

adminRoutes.get("/leads", async (c) => {
  const q = parseQuery(c, listQuerySchema);
  const { db } = c.get("deps");
  const where = q.q ? sql`(${leads.email} ilike ${`%${q.q}%`} or ${leads.name} ilike ${`%${q.q}%`})` : undefined;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(leads).where(where);
  const items = await db
    .select({
      lead: leads,
      circles: sql<number>`(select count(*)::int from circles ci where ci.lead_id = "leads"."id")`,
      views: sql<number>`(select coalesce(sum(ci.views), 0)::int from circles ci where ci.lead_id = "leads"."id")`,
    })
    .from(leads)
    .where(where)
    .orderBy(desc(leads.createdAt))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  const [stats] = await db
    .select({
      leads: sql<number>`count(*)::int`,
      consented: sql<number>`count(*) filter (where ${leads.marketingConsent})::int`,
      converted: sql<number>`count(*) filter (where ${leads.convertedUserId} is not null)::int`,
      last7: sql<number>`count(*) filter (where ${leads.createdAt} > now() - interval '7 days')::int`,
      circles: sql<number>`(select count(*)::int from ${circles})`,
    })
    .from(leads);
  return c.json({ stats, ...paged(items.map((r) => ({ ...r.lead, circles: r.circles, views: r.views })), total, q.page, q.pageSize) });
});

adminRoutes.get("/leads.csv", async (c) => {
  const rows = await c.get("deps").db.select().from(leads).orderBy(desc(leads.createdAt));
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="fundly-leads.csv"`);
  return c.body(
    "﻿" +
      toCsvLine(["email", "name", "phone", "source", "marketing_consent", "converted", "created_at", "details"]) +
      rows.map((l) => toCsvLine([l.email, l.name, l.phone, l.source, l.marketingConsent, !!l.convertedUserId, l.createdAt, l.meta])).join(""),
  );
});
