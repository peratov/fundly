/**
 * Applies pending database migrations and exits. Serverless deploys run this at build
 * time (scripts/vercel/build.mjs); the long-running server also migrates on start.
 *
 *   npm run db:migrate
 */
import { existsSync } from "node:fs";
import { loadConfig } from "../config";
import { openDb } from "../db/client";

if (existsSync(".env")) process.loadEnvFile(".env");
const config = loadConfig();
const { close } = await openDb({ url: config.databaseUrl, dataDir: config.dataDir, migrate: true });
await close();
console.log(`[migrate] database is up to date (${config.databaseUrl ? "postgres" : `pglite ${config.dataDir}`})`);
