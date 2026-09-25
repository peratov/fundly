import { asc, gt } from "drizzle-orm";
import { addMonths, periodOf } from "../../shared/period";
import type { Db } from "../db/client";
import { tenants } from "../db/schema";
import type { Actor } from "../lib/context";
import { flagOverdueLoans } from "./loans";
import { closePeriod } from "./savings";

/**
 * Daily maintenance across every active fund, shared by `npm run jobs` (cron,
 * Kubernetes, Render) and the /api/cron/daily endpoint (Vercel Cron).
 *
 * - flags loans that fell behind schedule as overdue
 * - after the fund's due day, closes last month: unpaid members are marked missed
 *
 * Funds are processed one at a time, each in its own transaction, so one fund's
 * failure never blocks the rest. Everything is idempotent, so reruns are safe.
 */
export async function runScheduledJobs(db: Db, now: Date, log: (msg: string) => void = console.log) {
  const today = now.toISOString().slice(0, 10);
  const lastMonth = addMonths(periodOf(now), -1);
  const actor: Actor = { userId: null, name: "Scheduled job" };
  const BATCH = 100;

  let cursor = "00000000-0000-0000-0000-000000000000";
  let processed = 0;
  let failures = 0;
  for (;;) {
    const batch = await db.select().from(tenants).where(gt(tenants.id, cursor)).orderBy(asc(tenants.id)).limit(BATCH);
    if (!batch.length) break;
    cursor = batch.at(-1)!.id;

    for (const tenant of batch.filter((t) => ["active", "trial"].includes(t.status))) {
      try {
        await db.transaction(async (tx) => {
          const flagged = await flagOverdueLoans(tx, tenant, actor, today);
          // Give members until the due day to pay last month before it's closed.
          const closed = now.getUTCDate() > tenant.settings.contributionDueDay ? await closePeriod(tx, tenant, actor, lastMonth) : null;
          if (flagged || closed?.markedMissed) log(`[jobs] ${tenant.name}: ${flagged} overdue, ${closed?.markedMissed ?? 0} missed`);
        });
        processed++;
      } catch (err) {
        failures++;
        console.error(`[jobs] ${tenant.name} failed:`, err);
      }
    }
  }
  log(`[jobs] done: ${processed} funds processed, ${failures} failed`);
  return { processed, failures };
}
