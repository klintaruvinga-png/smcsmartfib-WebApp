/**
 * Drizzle ORM schema for the SMC SuperFIB TanStack Start backend.
 * Mirrors the Supabase PostgreSQL migration 001_init.sql for Phase 4 parity.
 *
 * Note: role / source / status use TEXT + CHECK at the DB level (see 001_init.sql),
 * so we model them here as `text` with TS union types rather than pgEnum to avoid
 * Drizzle generating mismatched Postgres ENUM types.
 */
import {
  pgTable,
  bigserial,
  uuid,
  text,
  varchar,
  decimal,
  timestamp,
  inet,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export type UserRole = "user" | "admin" | "ea";
export type FibSource = "mt5" | "manual" | "calculated";
export type EaSessionStatus = "connected" | "disconnected" | "error";
export type FibFamily = "LTF_SF" | "HTF_AF";
export type FibTimeframe = "M15" | "H1" | "H4" | "D1";

export const users = pgTable("users", {
  // id mirrors Supabase auth.users.id (UUID). The FK to auth.users is enforced
  // at the database level by the 001_init.sql migration, not via Drizzle.
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  username: text("username").unique(),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  role: text("role").$type<UserRole>().notNull().default("user"),
  eaApiKey: text("ea_api_key").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fibLevels = pgTable(
  "fib_levels",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eaApiKey: text("ea_api_key")
      .notNull()
      .references(() => users.eaApiKey),
    symbol: varchar("symbol", { length: 24 }).notNull(),
    timeframe: varchar("timeframe", { length: 16 }).$type<FibTimeframe>().notNull(),
    family: varchar("family", { length: 16 }).$type<FibFamily>().notNull(),
    ratio: decimal("ratio", { precision: 10, scale: 4 }).notNull(),
    price: decimal("price", { precision: 20, scale: 8 }).notNull(),
    source: text("source").$type<FibSource>().notNull().default("mt5"),
    calculatedAt: timestamp("calculated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    lookupIdx: index("idx_fib_levels_lookup").on(
      table.userId,
      table.symbol,
      table.timeframe,
      table.family,
      table.calculatedAt.desc()
    ),
    symbolTimeIdx: index("idx_fib_levels_symbol_time").on(
      table.userId,
      table.symbol,
      table.calculatedAt.desc()
    ),
    // Matches WordPress wp_smc_sf_fib_levels UNIQUE KEY fib_lookup exactly.
    // calculated_at is excluded so the EA ingest endpoint upserts (ON CONFLICT
    // DO UPDATE) the latest value per (user, symbol, tf, family, ratio),
    // mirroring WordPress wpdb->replace semantics.
    uniq: uniqueIndex("fib_lookup").on(
      table.userId,
      table.symbol,
      table.timeframe,
      table.family,
      table.ratio
    ),
  })
);

export const eaSessions = pgTable(
  "ea_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eaApiKey: text("ea_api_key")
      .notNull()
      .references(() => users.eaApiKey),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    connectedAt: timestamp("connected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastPing: timestamp("last_ping", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").$type<EaSessionStatus>().notNull().default("connected"),
  },
  (table) => ({
    eaIdx: index("idx_ea_sessions_ea").on(table.eaApiKey, table.status),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type FibLevel = typeof fibLevels.$inferSelect;
export type NewFibLevel = typeof fibLevels.$inferInsert;
export type EaSession = typeof eaSessions.$inferSelect;
export type NewEaSession = typeof eaSessions.$inferInsert;
