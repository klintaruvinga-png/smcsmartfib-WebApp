import { readFile } from "fs/promises";

import { describe, expect, it } from "vitest";

describe("MT5 signal dispatch parity guard", () => {
  it("uses authoritative fib and regime engine outputs instead of scaffold placeholders", async () => {
    const [marketDataEngine, fibEngine, regimeEngine] = await Promise.all([
      readFile(new URL("../mt5/MarketDataEngine.mqh", import.meta.url), "utf8"),
      readFile(new URL("../mt5/FibEngine.mqh", import.meta.url), "utf8"),
      readFile(new URL("../mt5/RegimeEngine.mqh", import.meta.url), "utf8"),
    ]);

    expect(marketDataEngine).toContain("fibEngine.BuildSignalFibLevels(symbols[i], fibLevels)");
    expect(marketDataEngine).toContain("regimeEngine.ComputeRegimeState(symbols[i], regimeState)");
    expect(marketDataEngine).not.toContain('string htfBias    = "TRANSITIONAL";');
    expect(marketDataEngine).not.toContain('string ltfRegime  = "RANGING";');
    expect(marketDataEngine).not.toContain("int fibCount = 0;");
    expect(fibEngine).toContain("int BuildSignalFibLevels(string symbol, FibLevelOut& outLevels[])");
    expect(regimeEngine).toContain("bool ComputeRegimeState(string symbol, RegimeSnapshotOut& out)");
  });
});
