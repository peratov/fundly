import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  close: () => Promise<void>;
}

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

/**
 * Production and staging use a real Postgres via DATABASE_URL.
 * Local dev and tests use PGlite (Postgres compiled to WASM), so the exact same
 * SQL and migrations run everywhere with no external service to install.
 */
export async function openDb(opts: { url?: string; dataDir?: string; migrationsDir?: string; migrate?: boolean; serverless?: boolean } = {}): Promise<DbHandle> {
  const runMigrations = opts.migrate ?? true;
  const folder = opts.migrationsDir ?? migrationsFolder;
  if (opts.url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    // Serverless instances are many and short-lived: keep few connections, and skip prepared
    // statements so transaction-mode poolers (Neon, Supabase, PgBouncer) work.
    const pooled = opts.serverless || /-pooler\.|pgbouncer=true|:6543\//.test(opts.url);
    const client = postgres(opts.url, {
      max: Number(process.env.DB_POOL_SIZE ?? (opts.serverless ? 3 : 10)),
      idle_timeout: opts.serverless ? 20 : undefined,
      prepare: !pooled,
      onnotice: () => {},
    });
    const db = drizzle(client, { schema });
    if (runMigrations) await migrate(db, { migrationsFolder: folder });
    return { db: db as unknown as Db, close: () => client.end() };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const release = opts.dataDir ? lockDataDir(opts.dataDir) : () => {};
  const client = opts.dataDir ? new PGlite(opts.dataDir) : new PGlite();
  const db = drizzle(client, { schema });
  try {
    if (runMigrations) await migrate(db, { migrationsFolder: folder });
  } catch (e) {
    release();
    throw e;
  }
  return {
    db: db as unknown as Db,
    close: async () => {
      await client.close();
      release();
    },
  };
}

/**
 * PGlite is single-process: two processes opening the same directory corrupt it.
 * Take a PID lock so a second `npm run dev`, seed or script fails with a clear
 * message instead. A lock left by a process that has since died is taken over.
 */
function lockDataDir(dataDir: string): () => void {
  mkdirSync(dataDir, { recursive: true });
  const lockFile = `${path.resolve(dataDir)}.lock`;
  let holder = 0;
  try {
    holder = Number(readFileSync(lockFile, "utf8"));
  } catch {
    /* no lock */
  }
  if (holder && holder !== process.pid && isAlive(holder)) {
    throw new Error(`The local database in ${dataDir} is already open in another process (pid ${holder}). Stop that process first (another "npm run dev", seed or script), or set DATABASE_URL to use Postgres.`);
  }
  writeFileSync(lockFile, String(process.pid));
  const release = () => {
    try {
      if (Number(readFileSync(lockFile, "utf8")) === process.pid) rmSync(lockFile);
    } catch {
      /* already gone */
    }
  };
  process.once("exit", release);
  return release;
}

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** `db.execute` returns an array on postgres-js and `{ rows }` on PGlite; normalise both. */
export function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : ((result as { rows: T[] }).rows ?? []);
}
