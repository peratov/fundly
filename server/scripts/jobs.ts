/**
 * Scheduled maintenance across every active fund. Run it daily from cron,
 * a Kubernetes CronJob, Render/Fly scheduled machines, etc.:
 *
 *   npm run jobs
 *
 * - flags loans that fell behind schedule as overdue (daily)
 * - after the configured grace day, closes last month: unpaid members are marked
 *   missed and standings recomputed (idempotent, so running daily is safe)
 *
 * Funds are processed one at a time, each in its own transaction, so one
 * fund's failure never blocks the rest and locks stay short.
 */
import { existsSync } from "node:fs";
import { asc, gt } from "drizzle-orm";
import { addMonths, periodOf } from "../../shared/period";
import { loadConfig } from "../config";
import { openDb } from "../db/client";
import { tenants } from "../db/schema";
import type { Actor } from "../lib/context";
import { flagOverdueLoans } from "../services/loans";
import { closePeriod } from "../services/savings";

if (existsSync(".env")) process.loadEnvFile(".env");
const config = loadConfig();
const { db, close } = await openDb({ url: config.databaseUrl, dataDir: config.dataDir });

const now = new Date();
const today = now.toISOString().slice(0, 10);
const lastMonth = addMonths(periodOf(now), -1);
const actor: Actor = { userId: null, name: "Scheduled job" };
const BATCH = 100;

let cursor = "00000000-0000-0000-0000-000000000000";
let processed = 0;
let failures = 0;
for (;;) {
  const batch = await db
    .select()
    .from(tenants)
    .where(gt(tenants.id, cursor))
    .orderBy(asc(tenants.id))
    .limit(BATCH);
  if (!batch.length) break;
  cursor = batch.at(-1)!.id;

  for (const tenant of batch.filter((t) => ["active", "trial"].includes(t.status))) {
    try {
      await db.transaction(async (tx) => {
        const flagged = await flagOverdueLoans(tx, tenant, actor, today);
        // Give members until the due day to pay last month before it's closed.
        const closed = now.getUTCDate() > tenant.settings.contributionDueDay ? await closePeriod(tx, tenant, actor, lastMonth) : null;
        if (flagged || closed?.markedMissed) console.log(`[jobs] ${tenant.name}: ${flagged} overdue, ${closed?.markedMissed ?? 0} missed`);
      });
      processed++;
    } catch (err) {
      failures++;
      console.error(`[jobs] ${tenant.name} failed:`, err);
    }
  }
}

console.log(`[jobs] done: ${processed} funds processed, ${failures} failed`);
await close();
process.exit(failures ? 1 : 0);

