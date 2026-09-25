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
import { loadConfig } from "../config";
import { openDb } from "../db/client";
import { runScheduledJobs } from "../services/jobs";

if (existsSync(".env")) process.loadEnvFile(".env");
const config = loadConfig();
const { db, close } = await openDb({ url: config.databaseUrl, dataDir: config.dataDir });
const { failures } = await runScheduledJobs(db, new Date());
await close();
process.exit(failures ? 1 : 0);
