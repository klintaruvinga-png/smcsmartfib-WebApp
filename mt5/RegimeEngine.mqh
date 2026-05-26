#ifndef REGIME_ENGINE_MQH
#define REGIME_ENGINE_MQH

//+------------------------------------------------------------------+
//| RegimeEngine — Phase 5: Regime & Chop Engine                    |
//|                                                                  |
//| Computes per-symbol:                                             |
//|   • htf_bias  — BULL / BEAR / TRANSITIONAL  (D1 EMA-20 anchor) |
//|   • ltf_regime — TRENDING / RANGING / CHOP  (H1 ADX-proxy)     |
//|   • chop_score — 0.00 (pure trend) → 1.00 (pure chop)          |
//|   • ema20_d1   — current EMA-20 price on D1                    |
//|   • atr14_h1   — ATR-14 on H1 (volatility gate)                |
//|                                                                  |
//| Parity target: matches PHP build_symbol_state() regime output   |
//| so Pine ↔ MT5 regime comparison in Phase 6 is meaningful.       |
//+------------------------------------------------------------------+
class RegimeEngine
{
private:
    enum
    {
        // EMA lookback for D1 bias computation.
        EMA_PERIOD = 20,
        // ATR lookback for H1 chop score.
        ATR_PERIOD = 14,
        // Minimum bars required to compute a valid result.
        MIN_BARS = 25
    };

    // ATR-multiple threshold that separates TRENDING from RANGING.
    // A bar whose range > ATR * TREND_THRESHOLD is classified as directional.
    static const double TREND_THRESHOLD; // = 0.8, defined below class

    // Chop score bucket boundaries.
    // chop_score < CHOP_LOWER → TRENDING
    // CHOP_LOWER ≤ chop_score ≤ CHOP_UPPER → RANGING
    // chop_score > CHOP_UPPER → CHOP
    static const double CHOP_LOWER; // = 0.35
    static const double CHOP_UPPER; // = 0.65

public:
    RegimeEngine() {}
    ~RegimeEngine() {}

    // ----------------------------------------------------------------
    // ComputeRegimeJson
    //
    // Build the JSON object for one symbol to be embedded in the
    // batch payload sent to POST /ea/regime-snapshot.
    //
    // symbol           — raw broker symbol
    // normalizedSymbol — canonical symbol (e.g. "EURUSD")
    // userId           — WordPress user_id (included in payload)
    //
    // Returns JSON object string, or "" on fatal error.
    // ----------------------------------------------------------------
    string ComputeRegimeJson(string symbol, string normalizedSymbol, int userId)
    {
        // --- 1. D1 EMA-20 for HTF bias ---
        double d1Close[];
        int d1Bars = CopyClose(symbol, PERIOD_D1, 0, EMA_PERIOD + 5, d1Close);
        if (d1Bars < MIN_BARS - 10)
        {
            Print("[RegimeEngine] Insufficient D1 bars symbol=", symbol, " got=", d1Bars);
            return "";
        }

        ArraySetAsSeries(d1Close, true); // index 0 = most recent

        double ema20 = ComputeEMA(d1Close, d1Bars, EMA_PERIOD);
        if (ema20 <= 0.0)
            return "";

        double currentD1Close = d1Close[0];
        string htfBias;
        if (currentD1Close > ema20 * 1.0005)
            htfBias = "BULL";
        else if (currentD1Close < ema20 * 0.9995)
            htfBias = "BEAR";
        else
            htfBias = "TRANSITIONAL";

        // --- 2. H1 ATR-14 for volatility gating ---
        MqlRates h1Rates[];
        int h1Bars = CopyRates(symbol, PERIOD_H1, 0, ATR_PERIOD + 5, h1Rates);
        if (h1Bars < ATR_PERIOD + 1)
        {
            Print("[RegimeEngine] Insufficient H1 bars symbol=", symbol, " got=", h1Bars);
            return "";
        }

        ArraySetAsSeries(h1Rates, true);

        double atr14 = ComputeATR(h1Rates, h1Bars, ATR_PERIOD);
        if (atr14 <= 0.0)
        {
            Print("[RegimeEngine] ATR computation failed symbol=", symbol);
            return "";
        }

        // --- 3. Chop score from H1 directional efficiency ---
        // Efficiency ratio: net price move / sum of bar ranges over ATR_PERIOD bars.
        // Perfect trend: ratio = 1.0 → chop_score = 0.0
        // Perfect chop:  ratio = 0.0 → chop_score = 1.0
        double chopScore = ComputeChopScore(h1Rates, h1Bars, ATR_PERIOD);

        // --- 4. LTF regime classification ---
        string ltfRegime;
        if (chopScore < CHOP_LOWER)
            ltfRegime = "TRENDING";
        else if (chopScore <= CHOP_UPPER)
            ltfRegime = "RANGING";
        else
            ltfRegime = "CHOP";

        // --- 5. Build JSON ---
        string json = "{";
        json += "\"user_id\":"       + IntegerToString(userId)            + ",";
        json += "\"symbol\":\""      + normalizedSymbol                   + "\",";
        json += "\"htf_bias\":\""    + htfBias                            + "\",";
        json += "\"ltf_regime\":\""  + ltfRegime                          + "\",";
        json += "\"chop_score\":"    + DoubleToString(chopScore, 4)        + ",";
        json += "\"ema20_d1\":"      + DoubleToString(ema20, 8)            + ",";
        json += "\"atr14_h1\":"      + DoubleToString(atr14, 8);
        json += "}";

        return json;
    }

    // ----------------------------------------------------------------
    // BuildBatchPayload
    //
    // Build the full JSON array payload for all symbols, ready for
    // POST /ea/regime-snapshot.
    // ----------------------------------------------------------------
    string BuildBatchPayload(string& rawSymbols[], string& normSymbols[],
                             int count, int userId)
    {
        string arr = "[";
        bool first = true;

        for (int i = 0; i < count; i++)
        {
            string obj = ComputeRegimeJson(rawSymbols[i], normSymbols[i], userId);
            if (StringLen(obj) == 0)
                continue;

            if (!first) arr += ",";
            arr += obj;
            first = false;
        }

        arr += "]";
        return arr;
    }

private:
    // ----------------------------------------------------------------
    // ComputeEMA — exponential moving average, series in descending
    // time order (index 0 = most recent).
    // ----------------------------------------------------------------
    double ComputeEMA(double& prices[], int count, int period)
    {
        if (count < period)
            return 0.0;

        // Seed with SMA of the oldest `period` bars.
        double k = 2.0 / (period + 1.0);
        double ema = 0.0;

        // prices[0] is the most recent; we iterate from oldest (index period-1)
        // backward to index 0.
        for (int i = period - 1; i >= 0; i--)
            ema = (i == period - 1) ? prices[i] : (prices[i] - ema) * k + ema;

        return ema;
    }

    // ----------------------------------------------------------------
    // ComputeATR — simple ATR(period) over MqlRates[].
    // rates[] assumed series (index 0 = most recent).
    // ----------------------------------------------------------------
    double ComputeATR(MqlRates& rates[], int count, int period)
    {
        if (count < period + 1)
            return 0.0;

        double sumTR = 0.0;
        for (int i = 0; i < period; i++)
        {
            double high  = rates[i].high;
            double low   = rates[i].low;
            double prevC = rates[i + 1].close;
            double tr    = MathMax(high - low, MathMax(MathAbs(high - prevC),
                                                       MathAbs(low  - prevC)));
            sumTR += tr;
        }
        return sumTR / period;
    }

    // ----------------------------------------------------------------
    // ComputeChopScore
    //
    // Efficiency-ratio-based chop metric:
    //   netMove  = |close[0] - close[period]|
    //   pathLen  = sum of |close[i] - close[i+1]| for i in 0..period-1
    //   effRatio = netMove / pathLen   (1.0 = perfect trend, 0.0 = pure chop)
    //   chopScore = 1.0 - effRatio
    //
    // Clipped to [0.0, 1.0].
    // ----------------------------------------------------------------
    double ComputeChopScore(MqlRates& rates[], int count, int period)
    {
        if (count < period + 1)
            return 0.5;

        double pathLen = 0.0;
        for (int i = 0; i < period; i++)
            pathLen += MathAbs(rates[i].close - rates[i + 1].close);

        if (pathLen < 1e-10)
            return 0.5;

        double netMove  = MathAbs(rates[0].close - rates[period].close);
        double effRatio = MathMin(netMove / pathLen, 1.0);
        double chopScore = 1.0 - effRatio;

        return MathMax(0.0, MathMin(1.0, chopScore));
    }
};

// Static constant definitions (must be outside class body in MQL5).
static const double RegimeEngine::TREND_THRESHOLD = 0.8;
static const double RegimeEngine::CHOP_LOWER       = 0.35;
static const double RegimeEngine::CHOP_UPPER        = 0.65;

#endif // REGIME_ENGINE_MQH
