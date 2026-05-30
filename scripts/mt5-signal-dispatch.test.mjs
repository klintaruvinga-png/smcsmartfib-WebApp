import { readFile } from "fs/promises";

import { describe, expect, it } from "vitest";

describe("MT5 signal dispatch parity guard", () => {
  it("pins the multi-timeframe signal input contract and retained AOV/RR guards", async () => {
    const [marketDataEngine, fibEngine, regimeEngine, signalEngine] = await Promise.all([
      readFile(new URL("../mt5/MarketDataEngine.mqh", import.meta.url), "utf8"),
      readFile(new URL("../mt5/FibEngine.mqh", import.meta.url), "utf8"),
      readFile(new URL("../mt5/RegimeEngine.mqh", import.meta.url), "utf8"),
      readFile(new URL("../mt5/SignalEngine.mqh", import.meta.url), "utf8"),
    ]);

    expect(marketDataEngine).toContain("fibEngine.BuildSignalFibLevels(symbols[i], fibLevels)");
    expect(marketDataEngine).toContain("regimeEngine.ComputeRegimeState(symbols[i], regimeState)");
    expect(marketDataEngine).toContain("if (!IsLive(symbols[i]))");
    expect(marketDataEngine.indexOf("if (!IsLive(symbols[i]))")).toBeLessThan(
      marketDataEngine.indexOf("fibEngine.BuildSignalFibLevels(symbols[i], fibLevels)")
    );
    expect(marketDataEngine).not.toContain('string htfBias    = "TRANSITIONAL";');
    expect(marketDataEngine).not.toContain('string ltfRegime  = "RANGING";');
    expect(marketDataEngine).not.toContain("int fibCount = 0;");
    expect(fibEngine).toContain(
      "int BuildSignalFibLevelsForTF(string symbol, ENUM_TIMEFRAMES mqlTf,"
    );
    expect(fibEngine).toContain("int BuildSignalFibLevels(string symbol, FibLevelOut& outLevels[])");
    expect(fibEngine).toContain('ENUM_TIMEFRAMES mqlTfs[3] = {PERIOD_M15, PERIOD_H1, PERIOD_H4};');
    expect(fibEngine).toContain('int chartTfSeconds[3] = {900, 3600, 14400};');
    expect(fibEngine).toContain('string tfNames[3] = {"M15", "H1", "H4"};');
    expect(regimeEngine).toContain("bool ComputeRegimeState(string symbol, RegimeSnapshotOut& out)");
    expect(signalEngine).toContain("TryGetAuthorityRange(fibLevels, fibCount, trig.timeframe,");
    expect(signalEngine).toContain("ComputeFibTP(fibLevels, fibCount, trig, direction, pipSize)");
    expect(signalEngine).toContain("fibLevels[i].timeframe != trigger.timeframe");
    expect(signalEngine).toContain("fibLevels[i].family != trigger.family");
    expect(signalEngine).toContain("AOV_EQUILIBRIUM_ZONE");
    expect(signalEngine).toContain("AOV_EQUILIBRIUM_LEVEL");
    expect(signalEngine).toContain("RR_BELOW_MIN");
  });
});
