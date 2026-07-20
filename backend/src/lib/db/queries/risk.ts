/**
 * Risk-limit query helpers (SMC-06 pre-trade gate).
 *
 * Persists per-user risk limits and retrieves the aggregates the risk engine
 * needs to evaluate a proposed trade. Never mutates trade state.
 */
import { eq } from "drizzle-orm";
import { db } from "../index";
import {
  riskLimits,
  trades,
  type NewRiskLimits,
  type RiskLimits,
} from "../schema";
import { getOpenTrades, getTodaysRealizedPnl } from "./journal";

export async function getRiskLimits(userId: string): Promise<RiskLimits | undefined> {
  const [row] = await db
    .select()
    .from(riskLimits)
    .where(eq(riskLimits.userId, userId));
  return row;
}

export async function upsertRiskLimits(
  userId: string,
  input: Partial<NewRiskLimits>
): Promise<RiskLimits> {
  const [row] = await db
    .insert(riskLimits)
    .values({ userId, ...input, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: riskLimits.userId,
      set: { ...input, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export interface RiskContext {
  openTrades: Awaited<ReturnType<typeof getOpenTrades>>;
  todaysPnl: number;
}

/** Aggregate the data the risk engine needs for one user. */
export async function getRiskContext(userId: string): Promise<RiskContext> {
  const [openTrades, todaysPnl] = await Promise.all([
    getOpenTrades(userId),
    getTodaysRealizedPnl(userId),
  ]);
  return { openTrades, todaysPnl };
}
