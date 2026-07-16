/**
 * Drizzle Kit configuration.
 * Used for `drizzle-kit` introspect/generate against the Supabase database.
 * The authoritative schema is the 001_init.sql migration deployed via Supabase.
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      process.env.SUPABASE_DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5432/postgres",
  },
  verbose: true,
  strict: true,
});
