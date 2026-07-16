import { z } from "zod";
import { getMarketDataByUserId, type MarketDataRow } from "../db/queries";

const querySchema = z.object({
  symbol: z.string().min(1).max(24),
  timeframe: z.enum(["M15", "H1", "H4", "D1"]).optional(),
  family: z.enum(["LTF_SF", "HTF_AF"]).optional(),
});

export class MarketDataError extends Error {
  constructor(public statusCode: number, message: string, public data?: unknown) {
    super(message);
    this.name = "MarketDataError";
  }
}

export async function fetchMarketData(userId: string, rawQuery: unknown) {
  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw new MarketDataError(400, "Invalid query parameters", parsed.error.flatten());
  }
  const { symbol, timeframe, family } = parsed.data;
  const sym = symbol.toUpperCase();

  const rows: MarketDataRow[] = await getMarketDataByUserId(userId, sym, timeframe, 200);
  const filtered = family ? rows.filter((r) => r.family === family) : rows;

  // Group by timeframe -> family -> levels[] (matches WordPress response shape).
  const fibs: Record<string, Record<string, Array<{ ratio: number; price: number; calculated_at: string }>>> = {};
  for (const row of filtered) {
    fibs[row.timeframe] ??= {};
    fibs[row.timeframe][row.family] ??= [];
    fibs[row.timeframe][row.family].push({
      ratio: row.ratio,
      price: row.price,
      calculated_at: row.calculatedAt,
    });
  }

  return { ok: true, symbol: sym, fibs };
}
