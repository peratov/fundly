import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { BILLING_INTERVALS, PAID_PLANS } from "../../shared/plans";
import { billingPayments, users } from "../db/schema";
import { requirePerm } from "../lib/auth";
import { actorOf, type AppEnv, today } from "../lib/context";
import { conflict, parseBody } from "../lib/http";
import { assertPendingCheckout, billingOverview, completeBillingPayment, startCheckout } from "../services/billing";

/** A fund's plan and subscription: owners see usage, pay, renew and upgrade here. */
export const billingRoutes = new Hono<AppEnv>();

billingRoutes.get("/", async (c) => {
  requirePerm(c, "settings:write");
  const deps = c.get("deps");
  return c.json({ ...(await billingOverview(deps.db, c.get("tenant"), today(c))), simulated: deps.payments.simulated });
});

billingRoutes.post("/checkout", async (c) => {
  requirePerm(c, "settings:write");
  const input = await parseBody(c, z.object({ plan: z.enum(PAID_PLANS), interval: z.enum(BILLING_INTERVALS) }));
  const deps = c.get("deps");
  const [u] = await deps.db.select({ email: users.email }).from(users).where(eq(users.id, c.get("user").id));
  return c.json(await startCheckout(deps, c.get("tenant"), { ...actorOf(c), email: u.email }, input), 201);
});

/** Return from the hosted checkout: confirm with the gateway (the webhook may not have landed yet). */
billingRoutes.post("/verify", async (c) => {
  requirePerm(c, "settings:write");
  const { reference } = await parseBody(c, z.object({ reference: z.string().min(8).max(40) }));
  const deps = c.get("deps");
  const [row] = await deps.db.select().from(billingPayments).where(and(eq(billingPayments.tenantId, c.get("tenant").id), eq(billingPayments.reference, reference)));
  if (row && row.status !== "pending") return c.json(row);
  assertPendingCheckout(row);
  const evt = await deps.payments.verify(reference);
  if (!evt) return c.json(row);
  return c.json(await completeBillingPayment(deps, reference, evt));
});

/** Dev simulator only: approve or decline a checkout without a real gateway. */
billingRoutes.post("/simulate", async (c) => {
  requirePerm(c, "settings:write");
  const input = await parseBody(c, z.object({ reference: z.string().min(8).max(40), outcome: z.enum(["succeeded", "failed"]) }));
  const deps = c.get("deps");
  if (!deps.payments.simulated) throw conflict("Simulation is only available with the mock payment provider");
  const [row] = await deps.db.select().from(billingPayments).where(and(eq(billingPayments.tenantId, c.get("tenant").id), eq(billingPayments.reference, input.reference)));
  assertPendingCheckout(row);
  return c.json(await completeBillingPayment(deps, input.reference, { status: input.outcome, amountMinor: row!.amountMinor, failureReason: input.outcome === "failed" ? "Declined (simulated)" : undefined }));
});
