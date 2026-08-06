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
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export type UserRole = "user" | "admin" | "ea";
export type FibSource = "mt5" | "manual" | "calculated";
export type EaSessionStatus = "connected" | "disconnected" | "error";
export type FibFamily = "LTF_SF" | "HTF_AF";
export type FibTimeframe = "M15" | "H1" | "H4" | "D1";

/**
 * Structured user preferences. Stored as a single JSONB column on `users`
 * (default '{}'). This normalizes the WordPress wp_usermeta key/value store
 * into one object for TanStack. The shadow-sync phase (gated) is responsible
 * for mapping individual usermeta keys into these fields.
 */
export type UserSettings = {
  notifications?: {
    email?: boolean;
    push?: boolean;
    tradeAlerts?: boolean;
  };
  theme?: "light" | "dark" | "system";
  watchlist?: string[];
  risk?: {
    maxRiskPercent?: number;
    defaultLotSize?: number;
    riskRewardRatio?: number;
  };
  riskAllocation?: {
    perTradePct?: number;
    dailyMaxPct?: number;
    ddCapPct?: number;
  };
  backendUrl?: string;
  apiKeyStatus?: "missing" | "ok" | "invalid" | "rate-limited" | "blocked" | "testing";
  refreshIntervalSec?: number;
  staleThresholdSec?: number;
  signalBoardSize?: 3 | 5 | 10;
};

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
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // Structured user preferences (notifications/theme/watchlist/risk).
  // Mirrors WordPress wp_usermeta normalized into one JSONB object.
  settings: jsonb("settings").$type<UserSettings>().notNull().default({}),
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
      .references(() => users.eaApiKey, { onUpdate: "cascade", onDelete: "cascade" }),
    symbol: varchar("symbol", { length: 24 }).notNull(),
    timeframe: varchar("timeframe", { length: 16 }).$type<FibTimeframe>().notNull(),
    family: varchar("family", { length: 16 }).$type<FibFamily>().notNull(),
    ratio: decimal("ratio", { precision: 10, scale: 4 }).notNull(),
    price: decimal("price", { precision: 20, scale: 8 }).notNull(),
    source: text("source").$type<FibSource>().notNull().default("mt5"),
    trend: text("trend"),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    lookupIdx: index("idx_fib_levels_lookup").on(
      table.userId,
      table.symbol,
      table.timeframe,
      table.family,
      table.calculatedAt.desc(),
    ),
    symbolTimeIdx: index("idx_fib_levels_symbol_time").on(
      table.userId,
      table.symbol,
      table.calculatedAt.desc(),
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
      table.ratio,
    ),
  }),
);

export const eaSessions = pgTable(
  "ea_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eaApiKey: text("ea_api_key")
      .notNull()
      .references(() => users.eaApiKey, { onUpdate: "cascade", onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    lastPing: timestamp("last_ping", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").$type<EaSessionStatus>().notNull().default("connected"),
  },
  (table) => ({
    eaIdx: index("idx_ea_sessions_ea").on(table.eaApiKey, table.status),
  }),
);

export const refreshSessions = pgTable(
  "refresh_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
    ipAddress: inet("ip_address"),
  },
  (table) => ({
    userIdIdx: index("idx_refresh_sessions_user").on(table.userId),
    expiresIdx: index("idx_refresh_sessions_expires").on(table.expiresAt),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type FibLevel = typeof fibLevels.$inferSelect;
export type NewFibLevel = typeof fibLevels.$inferInsert;
export type EaSession = typeof eaSessions.$inferSelect;
export type NewEaSession = typeof eaSessions.$inferInsert;
export type TradeDirection = "long" | "short";
export type TradeStatus = "open" | "closed" | "cancelled";

/**
 * Trade journal entry. Record-keeping only — this system never places trades.
 * The MT5 bridge / EA remains the execution authority; this table is the
 * single source of truth for post-trade analysis and risk-limit evaluation.
 */
export const trades = pgTable(
  "trades",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    symbol: varchar("symbol", { length: 24 }).notNull(),
    direction: text("direction").$type<TradeDirection>().notNull(),
    entryPrice: decimal("entry_price", { precision: 20, scale: 8 }).notNull(),
    exitPrice: decimal("exit_price", { precision: 20, scale: 8 }),
    lotSize: decimal("lot_size", { precision: 12, scale: 4 }).notNull(),
    pnl: decimal("pnl", { precision: 20, scale: 4 }),
    status: text("status").$type<TradeStatus>().notNull().default("open"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_trades_user").on(table.userId, table.openedAt.desc()),
    symbolIdx: index("idx_trades_symbol").on(table.userId, table.symbol),
    statusIdx: index("idx_trades_status").on(table.userId, table.status),
  }),
);

/**
 * Per-user risk limits for the pre-trade gate (SMC-06 risk workflow).
 * All monetary limits are in account currency.
 */
export const riskLimits = pgTable("risk_limits", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  dailyLossLimit: decimal("daily_loss_limit", { precision: 20, scale: 4 }).notNull().default("0"),
  maxOpenPositions: decimal("max_open_positions", { precision: 6, scale: 0 })
    .notNull()
    .default("5"),
  maxPositionSize: decimal("max_position_size", { precision: 12, scale: 4 }).notNull().default("0"),
  maxPerSymbolExposure: decimal("max_per_symbol_exposure", { precision: 12, scale: 4 })
    .notNull()
    .default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;
export type RiskLimits = typeof riskLimits.$inferSelect;
export type NewRiskLimits = typeof riskLimits.$inferInsert;

export type RefreshSession = typeof refreshSessions.$inferSelect;
export type NewRefreshSession = typeof refreshSessions.$inferInsert;
