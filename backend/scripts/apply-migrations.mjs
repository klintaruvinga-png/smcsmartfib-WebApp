// Apply backend SQL migrations (001-005) to a live Postgres (Supabase) database.
//
// Uses the `postgres` driver (same as the backend runtime) so it works with the
// Supabase connection string directly. Migrations are idempotent (IF NOT EXISTS /
// IF EXISTS) and MUST run in numeric order.
//
// Usage:
//   DIRECT_DATABASE_URL=postgresql://...:5432/postgres node scripts/apply-migrations.mjs
//   (falls back to DATABASE_URL if DIRECT_DATABASE_URL is not set)
//
// Prefer the DIRECT connection (port 5432) for DDL/function creation. The pooler
// (port 6543) works for runtime queries but is less reliable for migrations.

import postgres from "postgres";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "src", "lib", "db", "migrations");

const connectionString =
  process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || "";

if (!connectionString) {
  console.error(
    "[apply-migrations] DIRECT_DATABASE_URL / DATABASE_URL is not set. Aborting."
  );
  process.exit(1);
}

const sql = postgres(connectionString, { prepare: false, max: 1 });

function listMigrations() {
  return readdirSync(migrationsDir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();
}

async function main() {
  const files = listMigrations();
  if (files.length === 0) {
    console.error(`[apply-migrations] No migrations found in ${migrationsDir}`);
    process.exit(1);
  }
  console.log(`[apply-migrations] Found ${files.length} migrations: ${files.join(", ")}`);

  for (const file of files) {
    const path = join(migrationsDir, file);
    const ddl = readFileSync(path, "utf8");
    console.log(`[apply-migrations] Applying ${file} ...`);
    // Run each migration as a single transaction so it is all-or-nothing.
    await sql.unsafe(ddl);
    console.log(`[apply-migrations]   ${file} OK`);
  }

  // Verify
  const tables = await sql.unsafe(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('users','fib_levels','ea_sessions','refresh_sessions','trades','risk_limits')
     ORDER BY table_name`
  );
  console.log(
    `[apply-migrations] Present tables: ${tables.map((t) => t.table_name).join(", ") || "(none)"}`
  );
  await sql.end();
  console.log("[apply-migrations] Done.");
}

main().catch(async (err) => {
  console.error("[apply-migrations] FAILED:", err.message);
  try {
    await sql.end();
  } catch {}
  process.exit(1);
});
