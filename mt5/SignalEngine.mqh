#ifndef SIGNAL_ENGINE_MQH
#define SIGNAL_ENGINE_MQH

#include "FibEngine.mqh"

//+------------------------------------------------------------------+
//| SignalEngine — Phase 6: MT5 Signal Engine (Dual-Run)            |
//|                                                                  |
//| Generates signal candidates from fib levels + regime state.     |
//| MT5 runs in parallel with Pine; Pine remains authoritative      |
//| until Phase 6 parity ≥ 95% is confirmed.                       |
//|                                                                  |
//| Signal lifecycle:                                                |
//|   WATCH  → price approaching fib zone (within confluence band)  |
//|   ARMED  → MSS confirmed + displacement candle present          |
//|   READY  → full confluence + HTF alignment + regime clear       |
//|                                                                  |
//| Verdict tiers:                                                   |
//|   A+  — all gates pass + high HTF confidence                   |
//|   A   — all gates pass                                          |
//|   B   — MSS + displacement, missing one confluence gate         |
//|   C   — partial — watch-only                                    |
//+------------------------------------------------------------------+

struct SignalCandidate
{
    string   id;           // GUID: symbol_direction_fibRatio_timestamp
    string   symbol;
    string   direction;    // LONG / SHORT
    string   status;       // WATCH / ARMED / READY
    string   verdict;      // A+ / A / B / C
    double   entryPrice;
    double   slPrice;
    double   tpPrice;
    double   fibLevel;     // triggering fib price
    double   fibRatio;     // triggering fib ratio
    string   fibFamily;    // LTF_SF / HTF_AF
    string   htfBias;      // BULL / BEAR / TRANSITIONAL (from RegimeEngine)
    string   ltfRegime;    // TRENDING / RANGING / CHOP
    double   confidence;   // 0.0 – 1.0
    datetime createdAt;
};

class SignalEngine
{
private:
    // Pip sizes used for proximity and displacement checks.
    // JP pairs use 0.01; all others use 0.0001.
    double GetPipSize(string symbol)
    {
        if (StringFind(symbol, "JPY") >= 0)
            return 0.01;
        return 0.0001;
    }

    enum
    {
        // Proximity band: price within this many pips of a fib level
        // counts as "in the zone."
        PROXIMITY_PIPS = 15,
        // Displacement threshold: the signal candle must close at least
        // this many pips through the fib level.
        DISPLACEMENT_PIPS = 8
    };

    // HTF alignment multiplier applied to confidence.
    static const double HTF_ALIGNED_BOOST;   // = 0.15
    static const double HTF_OPPOSED_PENALTY; // = -0.30

public:
    SignalEngine() {}
    ~SignalEngine() {}

    // ----------------------------------------------------------------
    // EvaluateSymbol
    //
    // Given fib levels computed by FibEngine and regime from
    // RegimeEngine, produce a signal candidate (if any) for one symbol.
    //
    // fibLevels[]  — output from FibEngine.BuildFibPayload() already
    //                parsed, but here we work with raw broker data to
    //                avoid double-parsing. The caller should pass the
    //                FibLevelOut array directly.
    //
    // Returns true and populates out if a candidate was found.
    // ----------------------------------------------------------------
    bool EvaluateSymbol(string symbol, string normalizedSymbol,
                        string htfBias, string ltfRegime, double chopScore,
                        FibLevelOut& fibLevels[], int fibCount,
                        SignalCandidate& out)
    {
        if (fibCount == 0)
            return false;

        double bid     = SymbolInfoDouble(symbol, SYMBOL_BID);
        double ask     = SymbolInfoDouble(symbol, SYMBOL_ASK);
        double mid     = (bid + ask) / 2.0;
        double pipSize = GetPipSize(normalizedSymbol);
        double proxBand = PROXIMITY_PIPS * pipSize;
        double displBand = DISPLACEMENT_PIPS * pipSize;

        // --- Gate: skip CHOP regimes — signals require directional structure.
        if (ltfRegime == "CHOP" && chopScore > 0.72)
            return false;

        // --- Find the nearest fib level to current price ---
        int    nearestIdx  = -1;
        double nearestDist = DBL_MAX;
        for (int i = 0; i < fibCount; i++)
        {
            double dist = MathAbs(mid - fibLevels[i].price);
            if (dist < nearestDist)
            {
                nearestDist = dist;
                nearestIdx  = i;
            }
        }

        if (nearestIdx < 0 || nearestDist > proxBand * 3.0)
            return false;

        FibLevelOut trig = fibLevels[nearestIdx];

        // --- Direction from HTF bias and price relative to fib ---
        string direction;
        if (htfBias == "BULL")
            direction = (mid < trig.price) ? "LONG" : "SHORT";
        else if (htfBias == "BEAR")
            direction = (mid > trig.price) ? "SHORT" : "LONG";
        else
        {
            // TRANSITIONAL: direction from price side relative to 50 fib
            direction = (mid < trig.price) ? "LONG" : "SHORT";
        }

        // --- Status determination ---
        string status;
        int    gates = 0;

        // Gate 1: proximity
        if (nearestDist <= proxBand)
            gates++;

        // Gate 2: displacement — check if last closed H1 candle closed
        //         through the fib level.
        MqlRates h1[];
        int h1Count = CopyRates(symbol, PERIOD_H1, 1, 3, h1); // bars 1..3 (closed)
        bool hasDisplacement = false;
        if (h1Count >= 1)
        {
            ArraySetAsSeries(h1, true);
            double c0 = h1[0].close;
            double c1 = (h1Count > 1) ? h1[1].close : c0;
            // Displacement: price crossed fib level with momentum
            bool crossedUp   = (c1 < trig.price && c0 > trig.price + displBand);
            bool crossedDown = (c1 > trig.price && c0 < trig.price - displBand);
            hasDisplacement  = (direction == "LONG" && crossedUp) ||
                               (direction == "SHORT" && crossedDown);
            if (hasDisplacement)
                gates++;
        }

        // Gate 3: HTF alignment
        bool htfAligned = (htfBias == "BULL" && direction == "LONG") ||
                          (htfBias == "BEAR" && direction == "SHORT");
        bool htfOpposed = (htfBias == "BULL" && direction == "SHORT") ||
                          (htfBias == "BEAR" && direction == "LONG");
        if (htfAligned)
            gates++;

        // Gate 4: LTF not chop
        if (ltfRegime == "TRENDING")
            gates++;

        // Status from gates
        if (gates <= 1)
            status = "WATCH";
        else if (gates == 2)
            status = "ARMED";
        else
            status = "READY";

        // --- Confidence score ---
        double confidence = (double) gates / 4.0;
        if (htfAligned)
            confidence = MathMin(1.0, confidence + HTF_ALIGNED_BOOST);
        if (htfOpposed)
            confidence = MathMax(0.0, confidence + HTF_OPPOSED_PENALTY);

        // --- Verdict ---
        string verdict;
        if (confidence >= 0.88 && htfAligned && hasDisplacement)
            verdict = "A+";
        else if (confidence >= 0.70)
            verdict = "A";
        else if (confidence >= 0.50)
            verdict = "B";
        else
            verdict = "C";

        // --- SL / TP ---
        // SL: recent H4 swing (3-bar fractal).
        double sl = ComputeSwingSL(symbol, direction, pipSize);
        // TP: next fib level in direction of trade.
        double tp = ComputeFibTP(fibLevels, fibCount, trig, direction, pipSize);

        // --- Populate output ---
        out.id        = normalizedSymbol + "_" + direction + "_" +
                        DoubleToString(trig.ratio, 1) + "_" +
                        IntegerToString((int) TimeCurrent());
        out.symbol    = normalizedSymbol;
        out.direction = direction;
        out.status    = status;
        out.verdict   = verdict;
        out.entryPrice = mid;
        out.slPrice    = sl;
        out.tpPrice    = tp;
        out.fibLevel   = trig.price;
        out.fibRatio   = trig.ratio;
        out.fibFamily  = trig.family;
        out.htfBias    = htfBias;
        out.ltfRegime  = ltfRegime;
        out.confidence = confidence;
        out.createdAt  = TimeCurrent();

        return true;
    }

    // ----------------------------------------------------------------
    // SignalToJson — serialize one SignalCandidate to JSON.
    // ----------------------------------------------------------------
    string SignalToJson(const SignalCandidate& s, int userId)
    {
        string json = "{";
        json += "\"id\":\""         + s.id                                + "\",";
        json += "\"user_id\":"      + IntegerToString(userId)             + ",";
        json += "\"symbol\":\""     + s.symbol                            + "\",";
        json += "\"direction\":\""  + s.direction                         + "\",";
        json += "\"status\":\""     + s.status                            + "\",";
        json += "\"verdict\":\""    + s.verdict                           + "\",";
        json += "\"entry_price\":"  + DoubleToString(s.entryPrice, 8)     + ",";
        json += "\"sl_price\":"     + DoubleToString(s.slPrice,  8)       + ",";
        json += "\"tp_price\":"     + DoubleToString(s.tpPrice,  8)       + ",";
        json += "\"fib_level\":"    + DoubleToString(s.fibLevel,  8)      + ",";
        json += "\"fib_ratio\":"    + DoubleToString(s.fibRatio,  4)      + ",";
        json += "\"fib_family\":\"" + s.fibFamily                         + "\",";
        json += "\"htf_bias\":\""   + s.htfBias                           + "\",";
        json += "\"ltf_regime\":\"" + s.ltfRegime                         + "\",";
        json += "\"confidence\":"   + DoubleToString(s.confidence, 4)     + ",";
        json += "\"created_at\":"   + IntegerToString((long) s.createdAt);
        json += "}";
        return json;
    }

private:
    // ----------------------------------------------------------------
    // ComputeSwingSL — H4 3-bar swing fractal for stop-loss placement.
    // LONG SL: below nearest swing low in past 10 H4 bars.
    // SHORT SL: above nearest swing high in past 10 H4 bars.
    // ----------------------------------------------------------------
    double ComputeSwingSL(string symbol, string direction, double pipSize)
    {
        MqlRates h4[];
        int bars = CopyRates(symbol, PERIOD_H4, 1, 12, h4);
        if (bars < 3)
        {
            double bid = SymbolInfoDouble(symbol, SYMBOL_BID);
            double fallback = (direction == "LONG") ? bid - 50 * pipSize
                                                    : bid + 50 * pipSize;
            return fallback;
        }
        ArraySetAsSeries(h4, true);

        if (direction == "LONG")
        {
            double swingLow = h4[0].low;
            for (int i = 1; i < bars; i++)
                swingLow = MathMin(swingLow, h4[i].low);
            return swingLow - 5 * pipSize; // buffer below swing
        }
        else
        {
            double swingHigh = h4[0].high;
            for (int i = 1; i < bars; i++)
                swingHigh = MathMax(swingHigh, h4[i].high);
            return swingHigh + 5 * pipSize; // buffer above swing
        }
    }

    // ----------------------------------------------------------------
    // ComputeFibTP — next fib level in the trade direction.
    // Scans fibLevels[] for the nearest level beyond the trigger.
    // ----------------------------------------------------------------
    double ComputeFibTP(FibLevelOut& fibLevels[], int fibCount,
                        const FibLevelOut& trigger, string direction,
                        double pipSize)
    {
        double best = 0.0;
        double bestDist = DBL_MAX;

        for (int i = 0; i < fibCount; i++)
        {
            if (fibLevels[i].price == trigger.price)
                continue;

            bool inDirection = (direction == "LONG"  && fibLevels[i].price > trigger.price) ||
                               (direction == "SHORT" && fibLevels[i].price < trigger.price);
            if (!inDirection)
                continue;

            double dist = MathAbs(fibLevels[i].price - trigger.price);
            if (dist < bestDist)
            {
                bestDist = dist;
                best     = fibLevels[i].price;
            }
        }

        if (best == 0.0)
        {
            // Fallback: 50-pip projected target if no fib level found
            best = trigger.price + ((direction == "LONG") ? 50.0 : -50.0) * pipSize;
        }
        return best;
    }
};

static const double SignalEngine::HTF_ALIGNED_BOOST   = 0.15;
static const double SignalEngine::HTF_OPPOSED_PENALTY = -0.30;

#endif // SIGNAL_ENGINE_MQH
