// Stand-in for @electric-sql/pglite in the Vercel bundle. The embedded database is for local
// development only; on Vercel the app always connects to Postgres through DATABASE_URL.
export const types = {};
export class PGlite {
  constructor() {
    throw new Error("DATABASE_URL is not set. The embedded development database isn't available on Vercel.");
  }
}
