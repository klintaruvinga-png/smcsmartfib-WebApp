/**
 * Trade journal query helpers (SMC-06).
 *
 * Record-keeping only. This layer never places trades — it persists and
 * retrieves journal entries and feeds the risk-limit evaluation workflow.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../index";
import { trades, type NewTrade, type Trade } from "../schema";

const startOfToday = () => sql`date_trunc('day', now() AT TIME ZONE 'UTC')`;

export async function insertTrade(input: NewTrade): Promise<Trade> {
  const [row] = await db.insert(trades).values(input).returning();
  return row;
}

export async function listTrades(
  userId: string,
  opts: { limit?: number; status?: "open" | "closed" | "cancelled" } = {},
): Promise<Trade[]> {
  const conditions = [eq(trades.userId, userId)];
  if (opts.status) conditions.push(eq(trades.status, opts.status));
  return db
    .select()
    .from(trades)
    .where(and(...conditions))
    .orderBy(desc(trades.openedAt))
    .limit(opts.limit ?? 100);
}

export async function getTrade(userId: string, id: number): Promise<Trade | undefined> {
  const [row] = await db
    .select()
    .from(trades)
    .where(and(eq(trades.userId, userId), eq(trades.id, id)));
  return row;
}

export async function updateTrade(
  userId: string,
  id: number,
  patch: Partial<NewTrade>,
): Promise<Trade | undefined> {
  const [row] = await db
    .update(trades)
    .set(patch)
    .where(and(eq(trades.userId, userId), eq(trades.id, id)))
    .returning();
  return row;
}

export async function deleteTrade(userId: string, id: number): Promise<boolean> {
  const deleted = await db
    .delete(trades)
    .where(and(eq(trades.userId, userId), eq(trades.id, id)))
    .returning({ id: trades.id });
  return deleted.length > 0;
}

/** Open trades for a user as of now (used by the risk gate). */
export async function getOpenTrades(userId: string): Promise<Trade[]> {
  return db
    .select()
    .from(trades)
    .where(and(eq(trades.userId, userId), eq(trades.status, "open")))
    .orderBy(desc(trades.openedAt));
}

/** Realized PnL for the current UTC day (closed trades only). */
export async function getTodaysRealizedPnl(userId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${trades.pnl}), 0)`,
    })
    .from(trades)
    .where(
      and(
        eq(trades.userId, userId),
        eq(trades.status, "closed"),
        gte(trades.closedAt, startOfToday()),
      ),
    );
  return Number(row?.total ?? 0);
}
