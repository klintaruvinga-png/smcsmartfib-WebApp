import { describe, expect, it } from "vitest";
import { normalizeSymbolForWatchlistComparison } from "./useSniperData";

describe("normalizeSymbolForWatchlistComparison", () => {
  it("matches known broker suffix variants against canonical watchlist symbols", () => {
    const fxWatchlistSet = new Set(["EURUSD"].map(normalizeSymbolForWatchlistComparison));
    const metalsWatchlistSet = new Set(["XAUUSD"].map(normalizeSymbolForWatchlistComparison));

    expect(fxWatchlistSet.has(normalizeSymbolForWatchlistComparison("EURUSD.r"))).toBe(true);
    expect(fxWatchlistSet.has(normalizeSymbolForWatchlistComparison("eurusd"))).toBe(true);
    expect(metalsWatchlistSet.has(normalizeSymbolForWatchlistComparison("XAUUSD+"))).toBe(true);
  });

  it("does not collapse distinct symbols into the same comparison key", () => {
    expect(normalizeSymbolForWatchlistComparison("GBPUSD")).not.toBe(
      normalizeSymbolForWatchlistComparison("EURUSD"),
    );
  });
});
