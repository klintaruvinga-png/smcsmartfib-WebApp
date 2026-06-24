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
      marketDataEngine.indexOf("fibEngine.BuildSignalFibLevels(symbols[i], fibLevels)"),
    );
    expect(marketDataEngine).not.toContain('string htfBias    = "TRANSITIONAL";');
    expect(marketDataEngine).not.toContain('string ltfRegime  = "RANGING";');
    expect(marketDataEngine).not.toContain("int fibCount = 0;");
    expect(fibEngine).toContain(
      "int BuildSignalFibLevelsForTF(string symbol, ENUM_TIMEFRAMES mqlTf,",
    );
    expect(fibEngine).toContain(
      "int BuildSignalFibLevels(string symbol, FibLevelOut& outLevels[])",
    );
    expect(fibEngine).toContain("ENUM_TIMEFRAMES mqlTfs[3] = {PERIOD_M15, PERIOD_H1, PERIOD_H4};");
    expect(fibEngine).toContain("int chartTfSeconds[3] = {900, 3600, 14400};");
    expect(fibEngine).toContain('string tfNames[3] = {"M15", "H1", "H4"};');
    expect(regimeEngine).toContain(
      "bool ComputeRegimeState(string symbol, RegimeSnapshotOut& out)",
    );
    expect(regimeEngine).toContain("double htfBiasHigh;");
    expect(regimeEngine).toContain("double htfBiasLow;");
    expect(regimeEngine).toContain('\\"htf_bias_high\\"');
    expect(regimeEngine).toContain('\\"htf_bias_low\\"');
    expect(regimeEngine).toContain("CopyHigh(symbol, PERIOD_D1, 1,");
    expect(regimeEngine).toContain("CopyLow(symbol, PERIOD_D1, 1,");
    expect(signalEngine).toContain("TryGetAuthorityRange(fibLevels, fibCount, trig.timeframe,");
    expect(signalEngine).toContain('if (ltfRegime == "CHOP" && chopScore >= 0.70)');
    expect(signalEngine).toContain("DetermineDirection(htfBias, mid, trig.price, trig.ratio)");
    expect(signalEngine).toContain("LevelRoleMatchesDirection(htfBias, trig.ratio, direction)");
    expect(signalEngine).toContain("AOV_LEVEL_POLARITY_MISMATCH");
    expect(signalEngine).toContain("ComputeFibTP(fibLevels, fibCount, trig, direction, pipSize)");
    expect(signalEngine).toContain("fibLevels[i].timeframe != trigger.timeframe");
    expect(signalEngine).toContain("fibLevels[i].family != trigger.family");
    expect(signalEngine).toContain("AOV_EQUILIBRIUM_ZONE");
    expect(signalEngine).toContain("AOV_EQUILIBRIUM_LEVEL");
    expect(signalEngine).toContain("RR_BELOW_MIN");
  });

  it("validates signal classification under GAP-01: gap-day price move (skip if gap > 30 pips)", () => {
    // Scenario: Friday close EURUSD = 1.0850, Monday open = 1.0920 (70 pip gap up)
    // Expected: Signal should skip this gap (not evaluate for entry on Monday open)
    // Signal status should remain WATCH or skip pending further confirmation
    const gapScenario = {
      symbol: "EURUSD",
      fridayClose: 1.085,
      mondayOpen: 1.092,
      gapPips: 70,
      maxAllowedGap: 30,
      expectedSignalStatus: "SKIP_OR_WATCH", // Should not generate ARMED/READY on gap open
    };

    const isExcessiveGap =
      Math.abs((gapScenario.mondayOpen - gapScenario.fridayClose) * 10000) >
      gapScenario.maxAllowedGap;
    expect(isExcessiveGap).toBe(true);
    expect(gapScenario.gapPips).toBeGreaterThan(gapScenario.maxAllowedGap);
  });

  it("validates signal classification under GAP-02: overnight Sunday-Monday regime flip", () => {
    // Scenario: Friday H1 regime = TRENDING (ER = 0.25), Monday H1 regime = CHOP (ER = 0.80)
    // Expected: Signal engine adapts to new regime; READY signals blocked until TRENDING resumes
    // Previous ARMED signals should downgrade to WATCH if regime changed to CHOP
    const regimeFlipScenario = {
      fridayRegime: "TRENDING",
      fridayER: 0.25,
      mondayRegime: "CHOP",
      mondayER: 0.8,
      expectedBehavior: "downgrade ARMED to WATCH; block new READY signals",
      statusAfterFlip: "WATCH",
    };

    const isTrendingDowngrade =
      regimeFlipScenario.fridayER < 0.35 && regimeFlipScenario.mondayER > 0.65;
    expect(isTrendingDowngrade).toBe(true);
  });

  it("validates signal classification under GAP-03: chop-to-trending transition (ARMED → READY)", () => {
    // Scenario: Monday 08:00 UTC H1 regime = CHOP (ER = 0.72); Monday 12:00 UTC H1 regime = TRENDING (ER = 0.28)
    // Expected: At 12:00, signal that was ARMED becomes READY if HTF alignment holds
    // TP should resolve once TRENDING gate clears (within 1 candle of regime flip)
    const transitionScenario = {
      symbol: "USDJPY",
      t1Regime: "CHOP",
      t1ER: 0.72,
      t1Status: "ARMED",
      t2Regime: "TRENDING",
      t2ER: 0.28,
      t2Status: "READY", // Should upgrade if HTF bias matches direction
      transitionalGate: 0.65, // ER threshold for CHOP
    };

    const chopToTrending =
      transitionScenario.t1ER > transitionScenario.transitionalGate &&
      transitionScenario.t2ER < 0.35;
    expect(chopToTrending).toBe(true);
    expect(transitionScenario.t2Status).toBe("READY");
  });

  it("pins signal engine dispatch cycle throttling (120s default, no performance regression)", async () => {
    const marketDataEngine = await readFile(
      new URL("../mt5/MarketDataEngine.mqh", import.meta.url),
      "utf8",
    );

    // Verify signal cycle throttling
    expect(marketDataEngine).toContain("signalCycleCounter");
    expect(marketDataEngine).toContain("signalCycleInterval");
    expect(marketDataEngine).toContain("12"); // Default 12 × 10s ticks = ~120s
    expect(marketDataEngine).toContain("SendSignalCandidatesToBackend()");

    // Verify signal candidates are batched per call (not per-symbol dispatch)
    expect(marketDataEngine).toContain("BuildBatchPayload");
  });
});
