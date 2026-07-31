import { defineEventHandler, readBody, createError, setHeader } from "h3";
import { requireAuth } from "../../../lib/auth/middleware";
import { getRiskLimits, getRiskContext } from "../../../lib/db/queries/risk";
import { evaluateTradeSchema } from "../../../lib/risk/schemas";
import { evaluateTrade } from "../../../lib/risk/engine";

export default defineEventHandler(async (event) => {
  const payload = await requireAuth(event);
  if (!payload.sub) {
    throw createError({ statusCode: 401, message: "Invalid token: missing subject" });
  }
  setHeader(event, "Cache-Control", "no-store, no-cache, must-revalidate, private");

  if (event.method !== "POST") {
    throw createError({ statusCode: 405, message: "Method not allowed" });
  }

  const body = await readBody(event);
  const parsed = evaluateTradeSchema.safeParse(body);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: "Invalid evaluation payload",
      data: parsed.error.flatten(),
    });
  }

  const limits = await getRiskLimits(payload.sub);
  if (!limits) {
    // No limits configured: gate open by default, but surface that limits are unset.
    return {
      allowed: true,
      reasons: ["No risk limits configured — defaulting to allowed"],
      context: null,
      configured: false,
    };
  }

  const ctx = await getRiskContext(payload.sub);
  const openTrades = ctx.openTrades.map((t) => ({
    symbol: t.symbol,
    lotSize: Number(t.lotSize),
    pnl: t.pnl === null ? null : t.pnl === undefined ? undefined : Number(t.pnl),
  }));
  const evaluation = evaluateTrade(
    {
      dailyLossLimit: Number(limits.dailyLossLimit),
      maxOpenPositions: Number(limits.maxOpenPositions),
      maxPositionSize: Number(limits.maxPositionSize),
      maxPerSymbolExposure: Number(limits.maxPerSymbolExposure),
    },
    { openTrades, todaysPnl: ctx.todaysPnl },
    parsed.data,
  );

  return { ...evaluation, configured: true };
});
