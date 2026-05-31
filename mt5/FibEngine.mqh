#ifndef FIB_ENGINE_MQH
#define FIB_ENGINE_MQH

// Canonical 16-ratio fib set — must match PHP $ratios array exactly.
// Defined as a preprocessor constant array pattern using a struct.
struct FibLevelOut
{
    string   family;
    string   timeframe;
    double   ratio;
    double   price;
};

//+------------------------------------------------------------------+
//| FibEngine                                                        |
//|                                                                  |
//| Computes LTF_SF (recency-weighted composite) and HTF_AF         |
//| (raw-extreme authority anchor) fib levels from CopyRates data.  |
//|                                                                  |
//| Session grouping mirrors the PHP fib_levels_from_candles()      |
//| implementation in smc-superfib-sniper.php for parity compliance.|
//+------------------------------------------------------------------+
class FibEngine
{
private:
    // 16 canonical ratios — matches PHP $ratios exactly
    double   ratios[16];

    // Broker UTC offset cached per dispatch cycle
    datetime brokerUtcOffset;

    // Session store — parallel arrays acting as a keyed map (max 2048 sessions)
    enum { MAX_SESSIONS = 2048 };
    long   sessionKeys[2048];
    double sessionHighs[2048];
    double sessionLows[2048];
    int    sessionCount;

public:
    FibEngine()
    {
        double r[16] = {-200, -162.5, -100, -62.5, -25, 0,
                        25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300};
        for (int i = 0; i < 16; i++)
            ratios[i] = r[i];
        brokerUtcOffset = 0;
        sessionCount    = 0;
        ArrayInitialize(sessionKeys,  0);
        ArrayInitialize(sessionHighs, 0.0);
        ArrayInitialize(sessionLows,  0.0);
    }

    ~FibEngine() {}

    // Refresh broker UTC offset — call once per dispatch cycle before computing fibs.
    void RefreshBrokerOffset()
    {
        brokerUtcOffset = TimeCurrent() - TimeGMT();
    }

    // Build JSON payload containing LTF_SF and HTF_AF levels for a symbol across
    // the four required timeframes (M15, H1, H4, D1).  Returns "" on fatal error.
    //
    // symbol           — raw broker symbol (will be normalized by caller)
    // normalizedSymbol — canonical symbol (e.g. "EURUSD")
    // userId           — WordPress user_id to include in payload
    string BuildFibPayload(string symbol, string normalizedSymbol, int userId)
    {
        string json = "";

        int tfs[4]    = {900, 3600, 14400, 86400};
        string names[4] = {"M15", "H1", "H4", "D1"};
        ENUM_TIMEFRAMES mql_tfs[4] = {PERIOD_M15, PERIOD_H1, PERIOD_H4, PERIOD_D1};

        json += "[";
        bool first = true;
        for (int i = 0; i < 4; i++)
        {
            string tfJson = ComputeFibJson(symbol, normalizedSymbol, userId,
                                           mql_tfs[i], tfs[i], names[i]);
            if (StringLen(tfJson) == 0)
                continue;

            if (!first) json += ",";
            json += tfJson;
            first = false;
        }
        json += "]";

        return json;
    }

    // Build structured fib levels for one timeframe so the signal engine
    // consumes the same anchor calculations as the fib dispatch path.
    int BuildSignalFibLevelsForTF(string symbol, ENUM_TIMEFRAMES mqlTf,
                                  int chartTfSeconds, string tfName,
                                  FibLevelOut& outLevels[])
    {
        int lookback = FibHistoryWindowSize(chartTfSeconds);

        MqlRates rates[];
        int copied = CopyRates(symbol, mqlTf, 1, lookback, rates);
        if (copied <= 0)
        {
            Print("[FibEngine] CopyRates returned 0 for signal levels symbol=", symbol,
                  " tf=", tfName);
            return 0;
        }

        double compression = CompressionThreshold(symbol);
        string sessionTf = GetSessionTF(chartTfSeconds);
        string authorityTf = GetAuthorityTF(sessionTf);

        double ltfHigh, ltfLow;
        bool ltfValid = ComputeLTFAnchor(rates, copied, chartTfSeconds,
                                         sessionTf, compression,
                                         ltfHigh, ltfLow);

        double htfHigh, htfLow;
        bool htfValid = ComputeHTFAnchor(rates, copied, chartTfSeconds,
                                         authorityTf, compression,
                                         htfHigh, htfLow);

        int levelCount = 0;
        if (ltfValid)
            levelCount += ArraySize(ratios);
        if (htfValid)
            levelCount += ArraySize(ratios);
        if (levelCount == 0)
            return 0;

        ArrayResize(outLevels, levelCount);
        int outIndex = 0;

        if (ltfValid)
        {
            for (int i = 0; i < ArraySize(ratios); i++)
            {
                outLevels[outIndex].family = "LTF_SF";
                outLevels[outIndex].timeframe = tfName;
                outLevels[outIndex].ratio = ratios[i];
                outLevels[outIndex].price = PriceForRatio(ltfHigh, ltfLow, ratios[i]);
                outIndex++;
            }
        }

        if (htfValid)
        {
            for (int i = 0; i < ArraySize(ratios); i++)
            {
                outLevels[outIndex].family = "HTF_AF";
                outLevels[outIndex].timeframe = tfName;
                outLevels[outIndex].ratio = ratios[i];
                outLevels[outIndex].price = PriceForRatio(htfHigh, htfLow, ratios[i]);
                outIndex++;
            }
        }

        return outIndex;
    }

    // Build structured M15/H1/H4 fib levels for signal evaluation so the signal engine
    // consumes the same anchor calculations as the fib dispatch path.
    int BuildSignalFibLevels(string symbol, FibLevelOut& outLevels[])
    {
        ArrayResize(outLevels, 0);

        ENUM_TIMEFRAMES mqlTfs[3] = {PERIOD_M15, PERIOD_H1, PERIOD_H4};
        int chartTfSeconds[3] = {900, 3600, 14400};
        string tfNames[3] = {"M15", "H1", "H4"};

        int totalCount = 0;
        for (int i = 0; i < 3; i++)
        {
            FibLevelOut tfLevels[];
            int tfCount = BuildSignalFibLevelsForTF(symbol, mqlTfs[i],
                                                    chartTfSeconds[i], tfNames[i],
                                                    tfLevels);
            if (tfCount <= 0)
                continue;

            ArrayResize(outLevels, totalCount + tfCount);
            for (int j = 0; j < tfCount; j++)
            {
                outLevels[totalCount + j].family = tfLevels[j].family;
                outLevels[totalCount + j].timeframe = tfLevels[j].timeframe;
                outLevels[totalCount + j].ratio = tfLevels[j].ratio;
                outLevels[totalCount + j].price = tfLevels[j].price;
            }
            totalCount += tfCount;
        }

        return totalCount;
    }

    // Compute fib levels for a single timeframe and return as a JSON object.
    string ComputeFibJson(string symbol, string normSymbol, int userId,
                          ENUM_TIMEFRAMES mql_tf, int chart_tf_seconds, string tfName)
    {
        // Determine lookback size: matches PHP fib_history_window_size()
        int lookback = FibHistoryWindowSize(chart_tf_seconds);

        MqlRates rates[];
        int copied = CopyRates(symbol, mql_tf, 1, lookback, rates);
        // index 1 = last closed bar; read <lookback> bars from there
        if (copied <= 0)
        {
            Print("[FibEngine] CopyRates returned 0 for symbol=", symbol,
                  " tf=", tfName, " — skipping.");
            return "";
        }

        // Compression threshold
        double compression = CompressionThreshold(symbol);

        // Session grouping
        string session_tf   = GetSessionTF(chart_tf_seconds);
        string authority_tf = GetAuthorityTF(session_tf);

        // ---- LTF_SF anchor ----
        double ltf_high, ltf_low;
        bool   ltf_valid = ComputeLTFAnchor(rates, copied, chart_tf_seconds,
                                             session_tf, compression,
                                             ltf_high, ltf_low);

        // ---- HTF_AF anchor ----
        double htf_high, htf_low;
        bool   htf_valid = ComputeHTFAnchor(rates, copied, chart_tf_seconds,
                                             authority_tf, compression,
                                             htf_high, htf_low);

        if (!ltf_valid && !htf_valid)
            return "";

        string json = "{";
        json += "\"user_id\":"         + IntegerToString(userId)   + ",";
        json += "\"symbol\":\""        + normSymbol                 + "\",";
        json += "\"timeframe\":\""     + tfName                     + "\",";
        json += "\"chart_tf_seconds\":" + IntegerToString(chart_tf_seconds) + ",";
        json += "\"ltf_sf\":"          + BuildLevelsJson(ltf_valid, ltf_high, ltf_low, "LTF_SF") + ",";
        json += "\"htf_af\":"          + BuildLevelsJson(htf_valid, htf_high, htf_low, "HTF_AF");
        json += "}";

        return json;
    }

    // ---- Session TF helpers ----

    string GetSessionTF(int chart_tf_seconds)
    {
        if (chart_tf_seconds <= 1800) return "Daily";
        if (chart_tf_seconds <= 3600) return "Weekly";
        if (chart_tf_seconds <= 14400) return "Monthly";
        if (chart_tf_seconds <= 86400) return "Quarterly";
        return "Yearly";
    }

    string GetAuthorityTF(string session_tf)
    {
        if (session_tf == "Daily")   return "Weekly";
        if (session_tf == "Weekly")  return "Monthly";
        if (session_tf == "Monthly") return "Quarterly";
        return "Yearly";
    }

    // ---- Session key computation (UTC) ----

    // Convert broker-local datetime to UTC
    datetime ToUTC(datetime t)
    {
        return t - brokerUtcOffset;
    }

    long GetSessionKey(datetime t, string session_tf)
    {
        datetime utc = ToUTC(t);
        MqlDateTime dt;
        TimeToStruct(utc, dt);

        if (session_tf == "Daily")
            return (long)dt.year * 10000 + (long)dt.mon * 100 + (long)dt.day;

        if (session_tf == "Weekly")
        {
            int isoWeek = GetISOWeek(dt);
            int isoYear = dt.year;
            if (isoWeek > 50 && dt.mon == 1)  isoYear--;
            if (isoWeek < 3  && dt.mon == 12) isoYear++;
            return (long)isoYear * 100 + (long)isoWeek;
        }

        if (session_tf == "Monthly")
            return (long)dt.year * 100 + (long)dt.mon;

        if (session_tf == "Quarterly")
        {
            int quarter = (dt.mon - 1) / 3 + 1;
            return (long)dt.year * 10 + (long)quarter;
        }

        // Yearly
        return (long)dt.year;
    }

    // Approximate ISO week number matching PHP's gmdate('W')
    int GetISOWeek(MqlDateTime& dt)
    {
        // Day of year
        int monthDays[12] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
        bool leap = (dt.year % 4 == 0 && (dt.year % 100 != 0 || dt.year % 400 == 0));
        int dayOfYear = dt.day;
        for (int m = 1; m < dt.mon; m++)
            dayOfYear += (m == 2 && leap) ? 29 : monthDays[m - 1];

        // ISO: week starts Monday; day_of_week: 0=Sun,1=Mon,...,6=Sat
        int dow = dt.day_of_week;
        int monDow = (dow == 0) ? 6 : (dow - 1);  // 0=Mon, 6=Sun
        int week = (dayOfYear + 6 - monDow) / 7;
        if (week < 1)  week = 52;
        if (week > 52) week = 1;
        return week;
    }

    // ---- Session store helpers ----

    void ClearSessions()
    {
        sessionCount = 0;
    }

    int FindSession(long key)
    {
        for (int i = 0; i < sessionCount; i++)
            if (sessionKeys[i] == key) return i;
        return -1;
    }

    void AddOrUpdateSession(long key, double high, double low)
    {
        int idx = FindSession(key);
        if (idx >= 0)
        {
            if (high > sessionHighs[idx]) sessionHighs[idx] = high;
            if (low  < sessionLows[idx])  sessionLows[idx]  = low;
        }
        else if (sessionCount < MAX_SESSIONS)
        {
            sessionKeys[sessionCount]  = key;
            sessionHighs[sessionCount] = high;
            sessionLows[sessionCount]  = low;
            sessionCount++;
        }
    }

    // ---- LTF_SF anchor computation ----
    //
    // Mirrors PHP: resolve_session_anchors() + superfib_composite_anchor()
    // Session TF groups candles into completed sessions; most recent 3 get
    // recency weights (F1=0.40/0.35/0.25 for 3, 0.55/0.45 for 2, 1.0 for 1).
    bool ComputeLTFAnchor(MqlRates& rates[], int count, int chart_tf_seconds,
                          string session_tf, double compression,
                          double& out_high, double& out_low)
    {
        ClearSessions();

        for (int i = 0; i < count; i++)
        {
            long key = GetSessionKey(rates[i].time, session_tf);
            AddOrUpdateSession(key, rates[i].high, rates[i].low);
        }

        if (sessionCount <= 1)
            return false;

        // completed sessions = all but the last key (current forming session)
        // sessions were added in chronological order (CopyRates: oldest→newest)
        int completedCount = sessionCount - 1;
        if (completedCount < 1)
            return false;

        // completed sessions in reverse (most recent first) = [completedCount-1 .. 0]
        // F1 = completedCount-1, F2 = completedCount-2, F3 = completedCount-3
        int f1 = completedCount - 1;
        int f2 = completedCount - 2;
        int f3 = completedCount - 3;

        bool f1v = (f1 >= 0) && ((sessionHighs[f1] - sessionLows[f1]) >= compression);
        bool f2v = (f2 >= 0) && ((sessionHighs[f2] - sessionLows[f2]) >= compression);
        bool f3v = (f3 >= 0) && ((sessionHighs[f3] - sessionLows[f3]) >= compression);

        int valid_count = (f1v ? 1 : 0) + (f2v ? 1 : 0) + (f3v ? 1 : 0);
        if (valid_count < 1)
            return false;

        double wf1, wf2, wf3;
        if (valid_count == 3)
        {
            wf1 = 0.40; wf2 = 0.35; wf3 = 0.25;
        }
        else if (valid_count == 2)
        {
            if (f1v)
            {
                wf1 = 0.55;
                wf2 = f2v ? 0.45 : 0.0;
                wf3 = f3v ? 0.45 : 0.0;
            }
            else
            {
                wf1 = 0.0; wf2 = 0.55; wf3 = 0.45;
            }
        }
        else // valid_count == 1
        {
            wf1 = f1v ? 1.0 : 0.0;
            wf2 = f2v ? 1.0 : 0.0;
            wf3 = f3v ? 1.0 : 0.0;
        }

        double weight_total = wf1 + wf2 + wf3;
        if (weight_total <= 0.0)
            return false;

        double sum_high = 0.0, sum_low = 0.0;
        if (f1v && wf1 > 0.0) { sum_high += sessionHighs[f1] * wf1; sum_low += sessionLows[f1] * wf1; }
        if (f2v && wf2 > 0.0) { sum_high += sessionHighs[f2] * wf2; sum_low += sessionLows[f2] * wf2; }
        if (f3v && wf3 > 0.0) { sum_high += sessionHighs[f3] * wf3; sum_low += sessionLows[f3] * wf3; }

        out_high = sum_high / weight_total;
        out_low  = sum_low  / weight_total;

        if ((out_high - out_low) < compression)
            return false;

        return true;
    }

    // ---- HTF_AF anchor computation ----
    //
    // Mirrors PHP: resolve_htf_authority_anchor()
    // Groups candles by authority_tf; needs >3 completed sessions;
    // anchor = the 3rd most recent completed session's raw extremes.
    bool ComputeHTFAnchor(MqlRates& rates[], int count, int chart_tf_seconds,
                          string authority_tf, double compression,
                          double& out_high, double& out_low)
    {
        ClearSessions();

        for (int i = 0; i < count; i++)
        {
            long key = GetSessionKey(rates[i].time, authority_tf);
            AddOrUpdateSession(key, rates[i].high, rates[i].low);
        }

        // Need > 3 sessions (PHP: count($sessions) <= 3 → return invalid)
        if (sessionCount <= 3)
            return false;

        // completed = all except last
        int completedCount = sessionCount - 1;
        if (completedCount < 3)
            return false;

        // recent_sessions[2] = 3rd most recent = index completedCount-3
        int idx3 = completedCount - 3;
        if (idx3 < 0)
            return false;

        out_high = sessionHighs[idx3];
        out_low  = sessionLows[idx3];

        if ((out_high - out_low) < compression)
            return false;

        return true;
    }

    // ---- Fib price formula ----
    // price = H + (L - H) * (r / 100)  — matches PHP price_for_ratio()
    double PriceForRatio(double high, double low, double ratio)
    {
        double raw = high - ((ratio / 100.0) * (high - low));
        // Round to 8 decimal places matching PHP round(..., 8)
        return MathRound(raw * 100000000.0) / 100000000.0;
    }

    // ---- Build JSON levels array ----
    string BuildLevelsJson(bool valid, double high, double low, string family)
    {
        if (!valid)
            return "[]";

        string json = "[";
        for (int i = 0; i < 16; i++)
        {
            if (i > 0) json += ",";
            double price = PriceForRatio(high, low, ratios[i]);
            json += "{";
            json += "\"family\":\"" + family + "\",";
            json += "\"ratio\":"    + DoubleToString(ratios[i], 4) + ",";
            json += "\"price\":"    + DoubleToString(price, 8);
            json += "}";
        }
        json += "]";
        return json;
    }

    // ---- Compression threshold ----
    // Matches PHP fib_compression_threshold(): pip_size * min_pips
    //
    // REGRESSION FIX: pip_size is now looked up from a hardcoded table that
    // mirrors PHP's instrument spec exactly. The previous implementation
    // derived pip_size from SYMBOL_POINT at runtime; brokers that report
    // SYMBOL_POINT=0.001 for JPY pairs produced a threshold 10× larger than
    // PHP's, causing valid LTF_SF sessions to be silently rejected as compressed
    // (e.g. USDJPY H1/M15 LTF_SF always returned empty).
    double CompressionThreshold(string symbol)
    {
        double pip_size = PipSizeForSymbol(symbol);
        bool isJPY = (StringLen(symbol) >= 6 &&
                      StringSubstr(symbol, 3, 3) == "JPY");
        double min_pips = isJPY ? 40.0 : 20.0;
        return min_pips * pip_size;
    }

    // Return the canonical pip size for a symbol, matching PHP instrument spec.
    // Fallback: 0.0001 (standard 5dp forex).
    double PipSizeForSymbol(string symbol)
    {
        // JPY pairs — 0.01
        if (symbol == "USDJPY" || symbol == "AUDJPY" || symbol == "EURJPY" ||
            symbol == "GBPJPY" || symbol == "NZDJPY" || symbol == "CADJPY")
            return 0.01;

        // Metals — 0.01
        if (symbol == "XAUUSD" || symbol == "XAGUSD")
            return 0.01;

        // Standard 5dp forex — 0.0001
        return 0.0001;
    }

    // ---- Lookback window ----
    // Matches PHP fib_history_window_size()
    int FibHistoryWindowSize(int chart_tf_seconds)
    {
        int authority_span;
        if      (chart_tf_seconds <= 1800)  authority_span = 28   * 86400;
        else if (chart_tf_seconds <= 3600)  authority_span = 124  * 86400;
        else if (chart_tf_seconds <= 14400) authority_span = 366  * 86400;
        else                                authority_span = 1462 * 86400;

        int bars = (int)MathCeil((double)authority_span / (double)chart_tf_seconds) + 8;
        return MathMax(120, bars);
    }
};

#endif // FIB_ENGINE_MQH
