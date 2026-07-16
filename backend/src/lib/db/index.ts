/**
 * Drizzle ORM client for the SMC SuperFIB TanStack Start backend.
 * Connects to Supabase PostgreSQL via postgres.js (Supabase connection string).
 *
 * Uses the SERVICE ROLE key / DATABASE_URL for server-side ingest so RLS is
 * bypassed for EA writes (matching WordPress server-side persistence).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL ?? "";

if (!connectionString) {
  // Surface a clear error at boot rather than a cryptic connection failure.
  console.warn(
    "[db] DATABASE_URL / SUPABASE_DATABASE_URL is not set. " +
      "Database queries will fail until it is provided via .env.local."
  );
}

// `prepare: false` is required for Supabase connection pooling (PgBouncer).
const client = postgres(connectionString, {
  prepare: false,
  max: 10,
  idle_timeout: 20,
  connect_timeout: 15,
});

export const db = drizzle(client, { schema });
export { schema };
export { client as pgClient };
