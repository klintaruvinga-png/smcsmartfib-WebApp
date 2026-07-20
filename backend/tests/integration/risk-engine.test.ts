import { describe, it, expect } from "vitest";
import { evaluateTrade } from "../../src/lib/risk/engine";

const baseLimits = {
  dailyLossLimit: 500,
  maxOpenPositions: 3,
  maxPositionSize: 2,
  maxPerSymbolExposure: 5,
};

describe("evaluateTrade", () => {
  it("allows a trade within all limits", () => {
    const result = evaluateTrade(
      baseLimits,
      { openTrades: [], todaysPnl: 0 },
      { symbol: "XAUUSD", direction: "long", lotSize: 1 }
    );
    expect(result.allowed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("blocks when max open positions exceeded", () => {
    const result = evaluateTrade(
      baseLimits,
      {
        openTrades: [
          { symbol: "EURUSD", lotSize: 1 },
          { symbol: "GBPUSD", lotSize: 1 },
          { symbol: "USDJPY", lotSize: 1 },
        ],
        todaysPnl: 0,
      },
      { symbol: "XAUUSD", direction: "long", lotSize: 1 }
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("max 3"))).toBe(true);
  });

  it("blocks when position size exceeds limit", () => {
    const result = evaluateTrade(
      baseLimits,
      { openTrades: [], todaysPnl: 0 },
      { symbol: "XAUUSD", direction: "long", lotSize: 5 }
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("max position size"))).toBe(true);
  });

  it("blocks when per-symbol exposure exceeded", () => {
    const result = evaluateTrade(
      baseLimits,
      { openTrades: [{ symbol: "XAUUSD", lotSize: 4 }], todaysPnl: 0 },
      { symbol: "XAUUSD", direction: "long", lotSize: 2 }
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("exposure"))).toBe(true);
  });

  it("blocks when daily loss limit breached", () => {
    const result = evaluateTrade(
      baseLimits,
      { openTrades: [], todaysPnl: -450 },
      { symbol: "XAUUSD", direction: "long", lotSize: 1, estimatedRisk: 100 }
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("daily loss limit"))).toBe(true);
  });

  it("treats closed trades (with pnl) as not open", () => {
    // A trade with a pnl value is closed; should not count toward open positions.
    const result = evaluateTrade(
      baseLimits,
      { openTrades: [{ symbol: "EURUSD", lotSize: 1, pnl: 50 }], todaysPnl: 50 },
      { symbol: "XAUUSD", direction: "long", lotSize: 1 }
    );
    expect(result.allowed).toBe(true);
  });
});
