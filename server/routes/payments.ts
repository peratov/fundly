import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { listQuerySchema, paymentInitSchema } from "../../shared/schemas";
import { memberships, payments, users } from "../db/schema";
import { hasPerm } from "../lib/auth";
import type { AppEnv, Ctx } from "../lib/context";
import { forbidden, notFound, paged, parseBody, parseQuery } from "../lib/http";
import { completePayment, initiatePayment, simulateOutcome } from "../services/payments";

export const paymentRoutes = new Hono<AppEnv>();

paymentRoutes.get("/", async (c) => {
  const q = parseQuery(c, listQuerySchema.extend({ mine: z.enum(["true", "false"]).optional() }));
  const tenant = c.get("tenant");
  const { db } = c.get("deps");
  const conds: SQL[] = [eq(payments.tenantId, tenant.id)];
  if (q.mine === "true" || !hasPerm(c, "payments:read")) conds.push(eq(payments.membershipId, c.get("membership").id));
  if (q.q) conds.push(sql`(${memberships.name} ilike ${`%${q.q}%`} or ${payments.providerRef} ilike ${`%${q.q}%`})`);
  const where = and(...conds);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(payments).innerJoin(memberships, eq(memberships.id, payments.membershipId)).where(where);
  const rows = await db
    .select({ payment: payments, memberName: memberships.name })
    .from(payments)
    .innerJoin(memberships, eq(memberships.id, payments.membershipId))
    .where(where)
    .orderBy(desc(payments.createdAt))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  return c.json({ ...paged(rows.map((r) => ({ ...r.payment, memberName: r.memberName })), total, q.page, q.pageSize), simulated: c.get("deps").payments.simulated });
});

/** Members pay for themselves; the gateway prompts their phone. */
paymentRoutes.post("/", async (c) => {
  const input = await parseBody(c, paymentInitSchema);
  const deps = c.get("deps");
  const [user] = await deps.db.select({ email: users.email }).from(users).where(eq(users.id, c.get("user").id));
  const result = await initiatePayment(deps, c.get("tenant"), c.get("membership"), user.email, input);
  return c.json({ ...result, simulated: deps.payments.simulated }, 201);
});

async function ownOrManaged(c: Ctx, id: string) {
  const { db } = c.get("deps");
  const [p] = await db.select().from(payments).where(and(eq(payments.tenantId, c.get("tenant").id), eq(payments.id, id)));
  if (!p) throw notFound("Payment");
  if (p.membershipId !== c.get("membership").id && !hasPerm(c, "payments:read")) throw forbidden();
  return p;
}

paymentRoutes.get("/:id", async (c) => c.json(await ownOrManaged(c, c.req.param("id"))));

/** Poll the gateway for a final status — covers webhooks that are delayed or lost. */
paymentRoutes.post("/:id/refresh", async (c) => {
  const p = await ownOrManaged(c, c.req.param("id"));
  const deps = c.get("deps");
  if (p.status !== "pending" || deps.payments.simulated) return c.json(p);
  const evt = await deps.payments.verify(p.providerRef);
  if (!evt) return c.json(p);
  return c.json(await completePayment(deps, p.provider, p.providerRef, evt));
});

/** Dev-only: approve or decline a simulated MoMo prompt, exercising the same completion path as a real webhook. */
paymentRoutes.post("/:id/simulate", async (c) => {
  const p = await ownOrManaged(c, c.req.param("id"));
  const { outcome } = await parseBody(c, z.object({ outcome: z.enum(["succeeded", "failed"]) }));
  const deps = c.get("deps");
  return c.json(await simulateOutcome(deps, deps.db, p.tenantId, p.id, outcome));
});
