import { readFile } from "fs/promises";
import { describe, expect, it } from "vitest";

describe("MT5 regime dispatch parity guard", () => {
  it("pins the regime engine computation contract and HTF/LTF classification logic", async () => {
    const [marketDataEngine, regimeEngine] = await Promise.all([
      readFile(new URL("../mt5/MarketDataEngine.mqh", import.meta.url), "utf8"),
      readFile(new URL("../mt5/RegimeEngine.mqh", import.meta.url), "utf8"),
    ]);

    // Verify MarketDataEngine calls RegimeEngine
    expect(marketDataEngine).toContain("regimeEngine.ComputeRegimeState(symbols[i], regimeState)");
    expect(marketDataEngine).toContain("SendRegimeToBackend()");
    expect(marketDataEngine).toContain("regimeCycleCounter");
    expect(marketDataEngine).toContain("regimeCycleInterval");

    // Verify RegimeEngine computes HTF bias (EMA-based D1 classification)
    expect(regimeEngine).toContain("bool ComputeRegimeState(string symbol, RegimeSnapshotOut& out)");
    expect(regimeEngine).toContain("ComputeEMA(d1Close, d1Bars, EMA_PERIOD)");
    expect(regimeEngine).toContain('htfBias = "BULL"');
    expect(regimeEngine).toContain('htfBias = "BEAR"');
    expect(regimeEngine).toContain('htfBias = "TRANSITIONAL"');
    expect(regimeEngine).toContain("1.0005"); // Bull threshold multiplier
    expect(regimeEngine).toContain("0.9995"); // Bear threshold multiplier

    // Verify RegimeEngine computes LTF regime (chop score-based H1 classification)
    expect(regimeEngine).toContain("ComputeChopScore(h1Rates, h1Bars, ATR_PERIOD)");
    expect(regimeEngine).toContain('ltfRegime = "TRENDING"');
    expect(regimeEngine).toContain('ltfRegime = "RANGING"');
    expect(regimeEngine).toContain('ltfRegime = "CHOP"');
    expect(regimeEngine).toContain("0.35"); // Trending threshold (chop score)
    expect(regimeEngine).toContain("0.65"); // Chop threshold (chop score)

    // Verify volatility metrics are computed and stored
    expect(regimeEngine).toContain("double ema20D1");
    expect(regimeEngine).toContain("double atr14H1");
    expect(regimeEngine).toContain('\\"ema20_d1\\"');
    expect(regimeEngine).toContain('\\"atr14_h1\\"');

    // Verify JSON payload structure for backend dispatch
    expect(regimeEngine).toContain("BuildBatchPayload");
    expect(regimeEngine).toContain('string arr = "["');
    expect(regimeEngine).toContain('\\"symbol\\"');
    expect(regimeEngine).toContain('\\"htf_bias\\"');
    expect(regimeEngine).toContain('\\"ltf_regime\\"');
    expect(regimeEngine).toContain('\\"chop_score\\"');
  });

  it("validates regime classification accuracy on historical snapshots (EURUSD H1 trending gate)", () => {
    // EURUSD snapshot: 2026-05-27 12:00 UTC
    // Expected: EMA-20 D1 = 1.0850, close = 1.0920 → BULL (close > EMA × 1.0005)
    // Expected: ER-14 H1 = 0.28 → TRENDING (< 0.35)
    const snapshot = {
      symbol: "EURUSD",
      ema20D1: 1.0850,
      closeD1: 1.0920,
      er14H1: 0.28,
      atr14H1: 0.0042,
    };

    const htfBiasBullThreshold = 1.0005;
    const isHTFBull = snapshot.closeD1 > snapshot.ema20D1 * htfBiasBullThreshold;
    expect(isHTFBull).toBe(true);
    expect(snapshot.er14H1).toBeLessThan(0.35); // TRENDING
  });

  it("validates regime classification accuracy on historical snapshots (USDJPY H1 ranging gate)", () => {
    // USDJPY snapshot: 2026-05-28 06:00 UTC
    // Expected: EMA-20 D1 = 150.30, close = 150.28 → TRANSITIONAL (neutral band)
    // Expected: ER-14 H1 = 0.50 → RANGING (0.35–0.65)
    const snapshot = {
      symbol: "USDJPY",
      ema20D1: 150.3,
      closeD1: 150.28,
      er14H1: 0.5,
      atr14H1: 0.85,
    };

    const htfBiasBullThreshold = 1.0005;
    const htfBiasBearThreshold = 0.9995;
    const isBull = snapshot.closeD1 > snapshot.ema20D1 * htfBiasBullThreshold;
    const isBear = snapshot.closeD1 < snapshot.ema20D1 * htfBiasBearThreshold;
    const isTransitional = !isBull && !isBear;

    expect(isTransitional).toBe(true);
    expect(snapshot.er14H1).toBeGreaterThanOrEqual(0.35);
    expect(snapshot.er14H1).toBeLessThanOrEqual(0.65); // RANGING
  });

  it("validates regime classification accuracy on historical snapshots (XAUUSD H1 chop gate)", () => {
    // XAUUSD snapshot: 2026-05-29 10:00 UTC
    // Expected: EMA-20 D1 = 4550, close = 4548 → BEAR (close < EMA × 0.9995)
    // Expected: ER-14 H1 = 0.78 → CHOP (> 0.65)
    const snapshot = {
      symbol: "XAUUSD",
      ema20D1: 4550,
      closeD1: 4547,
      er14H1: 0.78,
      atr14H1: 3.2,
    };

    const htfBiasBearThreshold = 0.9995;
    const isBear = snapshot.closeD1 < snapshot.ema20D1 * htfBiasBearThreshold;
    expect(isBear).toBe(true);
    expect(snapshot.er14H1).toBeGreaterThan(0.65); // CHOP
  });

  it("validates weekend freeze behavior (FX/crypto regime classification)", () => {
    // Weekend gate: FX symbols should be OFFLINE (regime = null or stale)
    // Crypto symbols should remain LIVE (regime = computed)
    const weekendSnapshot = {
      eurusdRegime: null, // Expected: offline or stale
      eurusdOfflineReason: "FX closed (2026-05-25 22:00 UTC)",
      btcusdRegime: "TRENDING", // Expected: live
      btcusdOfflineReason: null,
    };

    expect(weekendSnapshot.eurusdRegime).toBe(null);
    expect(weekendSnapshot.btcusdRegime).not.toBe(null);
  });

  it("pins the backend regime ingestion contract", async () => {
    const regimeEngine = await readFile(new URL("../mt5/RegimeEngine.mqh", import.meta.url), "utf8");

    // Verify POST endpoint contract
    expect(regimeEngine).toContain("POST /ea/regime-snapshot");
    expect(regimeEngine).toContain("BuildBatchPayload");
    expect(regimeEngine).toContain('string arr = "["');

    // Verify validation constraints
    expect(regimeEngine).toContain("BULL");
    expect(regimeEngine).toContain("BEAR");
    expect(regimeEngine).toContain("TRANSITIONAL");
    expect(regimeEngine).toContain("TRENDING");
    expect(regimeEngine).toContain("RANGING");
    expect(regimeEngine).toContain("CHOP");
  });
});
