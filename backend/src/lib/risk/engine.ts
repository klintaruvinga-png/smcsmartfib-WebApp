/**
 * Risk engine (SMC-06 pre-trade gate).
 *
 * Pure function: given a user's risk limits, current open trades, today's
 * realized PnL, and a proposed trade, decide whether the trade passes the
 * risk gate. No I/O, no side effects — fully unit-testable.
 *
 * This module NEVER places trades. It only advises. The MT5 EA remains the
 * execution authority.
 */

export interface ProposedTrade {
  symbol: string;
  direction: "long" | "short";
  lotSize: number;
  /** Estimated risk for this trade in account currency (entry - stop distance * lot * contract size). Optional; if provided, used for exposure checks. */
  estimatedRisk?: number;
}

export interface RiskLimitValues {
  dailyLossLimit: number;
  maxOpenPositions: number;
  maxPositionSize: number;
  maxPerSymbolExposure: number;
}

export interface RiskEvaluation {
  allowed: boolean;
  reasons: string[];
  context: {
    openPositions: number;
    todaysPnl: number;
    projectedDailyPnl: number;
    symbolExposure: number;
  };
}

export function evaluateTrade(
  limits: RiskLimitValues,
  ctx: { openTrades: Array<{ symbol: string; lotSize: number; pnl?: number | null }>; todaysPnl: number },
  proposed: ProposedTrade
): RiskEvaluation {
  const reasons: string[] = [];

  const openPositions = ctx.openTrades.filter((t) => t.pnl === undefined || t.pnl === null).length;
  const symbolExposure = ctx.openTrades
    .filter((t) => t.symbol === proposed.symbol)
    .reduce((sum, t) => sum + Number(t.lotSize), 0);

  const projectedDailyPnl = ctx.todaysPnl - (proposed.estimatedRisk ?? 0);

  // 1. Max open positions
  if (openPositions + 1 > limits.maxOpenPositions) {
    reasons.push(
      `Open positions ${openPositions + 1} would exceed max ${limits.maxOpenPositions}`
    );
  }

  // 2. Max position size
  if (limits.maxPositionSize > 0 && proposed.lotSize > limits.maxPositionSize) {
    reasons.push(
      `Lot size ${proposed.lotSize} exceeds max position size ${limits.maxPositionSize}`
    );
  }

  // 3. Per-symbol exposure
  if (
    limits.maxPerSymbolExposure > 0 &&
    symbolExposure + proposed.lotSize > limits.maxPerSymbolExposure
  ) {
    reasons.push(
      `Symbol ${proposed.symbol} exposure ${symbolExposure + proposed.lotSize} would exceed max ${limits.maxPerSymbolExposure}`
    );
  }

  // 4. Daily loss limit
  if (limits.dailyLossLimit > 0 && projectedDailyPnl < -limits.dailyLossLimit) {
    reasons.push(
      `Projected daily PnL ${projectedDailyPnl.toFixed(2)} breaches daily loss limit ${limits.dailyLossLimit}`
    );
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    context: {
      openPositions,
      todaysPnl: ctx.todaysPnl,
      projectedDailyPnl,
      symbolExposure,
    },
  };
}
