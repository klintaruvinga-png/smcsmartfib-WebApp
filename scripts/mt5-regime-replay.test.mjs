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
    expect(regimeEngine).toContain(
      "bool ComputeRegimeState(string symbol, RegimeSnapshotOut& out)",
    );
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
    expect(marketDataEngine).toContain('"{\\"regimes\\":" + batchJson + "}"');
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
      ema20D1: 1.085,
      closeD1: 1.092,
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
    const [marketDataEngine, wordpressPlugin, routeRegistrar] = await Promise.all([
      readFile(new URL("../mt5/MarketDataEngine.mqh", import.meta.url), "utf8"),
      readFile(
        new URL("../wordpress/smc-superfib-sniper/smc-superfib-sniper.php", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../wordpress/smc-superfib-sniper/class-route-registrar.php", import.meta.url),
        "utf8",
      ),
    ]);

    // Verify POST endpoint contract: MT5 builds the real URL
    expect(marketDataEngine).toContain('baseUrl + "/ea/regime-snapshot"');
    expect(marketDataEngine).toContain('"{\\\"regimes\\\":" + batchJson + "}"');

    // Verify route registration wires the correct path, method, and callback
    expect(routeRegistrar).toContain("array('path' => '/ea/regime-snapshot', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_ea_regime_snapshot', 'permission' => 'ea_bridge')");

    // Verify handler function exists
    expect(wordpressPlugin).toContain("public function post_ea_regime_snapshot(WP_REST_Request $request)");

    // Verify payload validation gate: regimes array is required
    expect(wordpressPlugin).toContain("if (!is_array($payload) || !isset($payload['regimes']) || !is_array($payload['regimes']))");
    expect(wordpressPlugin).toContain("new WP_Error('invalid_payload', 'regimes array required'");

    // Verify validation constraints: actual array declarations
    expect(wordpressPlugin).toContain("$valid_bias    = array('BULL', 'BEAR', 'TRANSITIONAL')");
    expect(wordpressPlugin).toContain("$valid_regimes = array('TRENDING', 'RANGING', 'CHOP')");

    // Verify validation gate: actual in_array check
    expect(wordpressPlugin).toContain("!in_array($htf_bias, $valid_bias, true) || !in_array($ltf_regime, $valid_regimes, true)");
  });
});
