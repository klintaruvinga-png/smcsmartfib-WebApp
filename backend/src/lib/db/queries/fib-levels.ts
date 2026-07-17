/**
 * Fib level persistence and read queries for the SMC SuperFIB backend.
 *
 * These functions back the EA ingest endpoint and the dashboard's market data
 * feed. Rows are scoped per-user (resolved from the EA API key) for WordPress
 * parity, and ingest mirrors WordPress `wpdb->replace` via an ON CONFLICT
 * (DO UPDATE) upsert on the `fib_lookup` unique index: the latest value per
 * (user, symbol, timeframe, family, ratio) wins.
 */
import { eq, desc, and, sql } from "drizzle-orm";
import { db } from "../index";
import { users, fibLevels } from "../schema";
import type { FibFamily, FibTimeframe } from "../schema";

/** A single fib level supplied by the EA for a (symbol, timeframe). */
export type FibLevelInput = {
  family: FibFamily;
  ratio: number;
  price: number;
};

/** Flat fib level row as returned to callers. ratio/price are numbers. */
export type MarketFibLevel = {
  id: number;
  family: FibFamily;
  ratio: number;
  price: number;
  source: string;
  trend: string | null;
  calculatedAt: string;
};

/** Market data row that also carries its timeframe so callers can group by it. */
export type MarketDataRow = MarketFibLevel & { timeframe: FibTimeframe };

/**
 * Resolve the internal user UUID from an EA API key. Rows are scoped per-user
 * for WordPress parity. Throws if the key is unknown.
 */
export async function resolveUserIdByApiKey(eaApiKey: string): Promise<string> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.eaApiKey, eaApiKey));
  if (!row) throw new Error(`No user found for EA API key`);
  return row.id;
}

/**
 * Batch upsert fib levels for one (symbol, timeframe) from the EA, applying
 * `trend` to every level. Mirrors WordPress wpdb->replace: latest value per
 * (user, symbol, tf, family, ratio) wins. The upsert is wrapped in a
 * transaction so a partial failure leaves no half-written rows.
 */
export async function createFibLevel(
  eaApiKey: string,
  symbol: string,
  timeframe: FibTimeframe,
  trend: string | null,
  levels: FibLevelInput[],
  calculatedAt?: Date
): Promise<void> {
  const userId = await resolveUserIdByApiKey(eaApiKey);

  const rows = levels.map((l) => ({
    userId,
    eaApiKey,
    symbol,
    timeframe,
    family: l.family,
    // Drizzle models `decimal` columns as `string` for insert, so coerce.
    ratio: String(l.ratio),
    price: String(l.price),
    source: "mt5" as const,
    trend,
    calculatedAt: calculatedAt || new Date(),
    receivedAt: new Date(),
  }));

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(fibLevels)
        .values(rows)
        .onConflictDoUpdate({
          target: [
            fibLevels.userId,
            fibLevels.symbol,
            fibLevels.timeframe,
            fibLevels.family,
            fibLevels.ratio,
          ],
          set: {
            price: sql`excluded.price`,
            trend: sql`excluded.trend`,
            receivedAt: new Date(),
          },
        });
    });
  } catch (err) {
    console.error("[fib-levels] createFibLevel failed:", err);
    throw err;
  }
}

/**
 * Latest flat rows for a symbol/timeframe, newest first, capped at `limit`
 * (default 50). ratio/price are returned as numbers.
 */
export async function getLatestFibLevels(
  eaApiKey: string,
  symbol: string,
  timeframe: FibTimeframe,
  limit = 50
): Promise<MarketFibLevel[]> {
  const userId = await resolveUserIdByApiKey(eaApiKey);

  const rows = await db
    .select()
    .from(fibLevels)
    .where(
      and(
        eq(fibLevels.userId, userId),
        eq(fibLevels.symbol, symbol),
        eq(fibLevels.timeframe, timeframe)
      )
    )
    .orderBy(desc(fibLevels.calculatedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    family: row.family,
    ratio: Number(row.ratio),
    price: Number(row.price),
    source: row.source,
    trend: row.trend,
    calculatedAt: row.calculatedAt.toISOString(),
  }));
}

/**
 * Dashboard-shaped market data: flat recent rows for the symbol/timeframe,
 * newest first, capped at `limit` (default 50), ratio/price as numbers.
 * Returns the same row shape as getLatestFibLevels; the dashboard groups by
 * family client-side. Provided as a distinct named entry point per the plan.
 */
export async function getMarketData(
  eaApiKey: string,
  symbol: string,
  timeframe: FibTimeframe,
  limit = 50
): Promise<MarketFibLevel[]> {
  // Same query shape as getLatestFibLevels; kept as a distinct named entry
  // point for the dashboard per the migration plan.
  return getLatestFibLevels(eaApiKey, symbol, timeframe, limit);
}

/**
 * Dashboard market-data getter keyed by internal user id (JWT `sub`).
 * Newest-first, capped at `limit` (default 200); ratio/price as numbers.
 * `timeframe` and `family` are optional: when omitted, rows for all timeframes/families are returned.
 * Each row includes its `timeframe` so the dashboard can group by it.
 *
 * Scoping note: Per the confirmed architecture, the dashboard login account owns the EA license.
 * EA-submitted fib levels are stored under the EA account's userId (resolved from EA API key).
 * The JWT `sub` passed here equals that same userId, so the filter correctly returns the user's own data.
 * This is intentional per the single-account model where dashboard identity owns EA license.
 */
export async function getMarketDataByUserId(
  userId: string,
  symbol: string,
  timeframe?: FibTimeframe,
  family?: FibFamily,
  limit = 200
): Promise<MarketDataRow[]> {
  const conditions = [
    eq(fibLevels.userId, userId),
    eq(fibLevels.symbol, symbol),
  ];
  if (timeframe) {
    conditions.push(eq(fibLevels.timeframe, timeframe));
  }
  if (family) {
    conditions.push(eq(fibLevels.family, family));
  }

  const rows = await db
    .select()
    .from(fibLevels)
    .where(and(...conditions))
    .orderBy(desc(fibLevels.calculatedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    family: row.family,
    ratio: Number(row.ratio),
    price: Number(row.price),
    source: row.source,
    trend: row.trend,
    calculatedAt: row.calculatedAt.toISOString(),
    timeframe: row.timeframe,
  }));
}
