#ifndef MARKET_DATA_ENGINE_MQH
#define MARKET_DATA_ENGINE_MQH

#include "TickProcessor.mqh"
#include "CandleBuilder.mqh"
#include "SessionManager.mqh"
#include "FreshnessEngine.mqh"
#include "SymbolNormalizer.mqh"
#include "FibEngine.mqh"
#include "RegimeEngine.mqh"   // Phase 5
#include "SignalEngine.mqh"   // Phase 6
#include "ExecutionEngine.mqh" // Phase 7 scaffold

//+------------------------------------------------------------------+
//| MarketDataEngine                                                  |
//|                                                                   |
//| Central orchestrator. Call OnTick() on every tick and            |
//| OnPeriodic() from a timer (e.g. every 10 s) to flush stale       |
//| freshness states and push snapshots to the PHP backend.          |
//+------------------------------------------------------------------+
class MarketDataEngine
{
private:
    TickProcessor*    tickProcessor;
    CandleBuilder*    candleBuilder;
    SessionManager*   sessionManager;
    FreshnessEngine*  freshnessEngine;
    SymbolNormalizer* symbolNormalizer;
    FibEngine*        fibEngine;
    RegimeEngine*     regimeEngine;    // Phase 5
    SignalEngine*     signalEngine;    // Phase 6
    ExecutionEngine*  executionEngine; // Phase 7 scaffold

    string   symbols[100];
    int      symbolCount;

    string   webhookUrl;   // https://yoursite.com/wp-json/sniper/v1/ea/market-stream
    string   authHeader;   // Full header line: "X-EA-API-Key: <token>"
    int      wpUserId;     // WordPress user_id that owns this stream

    datetime lastSentCandleM1[100];

    // Cached constant headers — built once in Initialize(), reused every send.
    string   cachedHeaders;

    // Cached broker UTC offset — set once per dispatch cycle via RefreshCachedBrokerOffset().
    // Eliminates the TimeCurrent()-TimeGMT() race in TimeToIso8601() that produces
    // ±1s candle timestamp jitter and flips midnight M15 bars to the wrong UTC session key.
    datetime m_cachedBrokerOffset;

    // Base REST URL derived from webhookUrl (strips the route suffix).
    // Used by SendLicenseCheck, SendHeartbeat, SendAccountSync, SendSymbolSync.
    string   baseUrl;
    string   eaVersion;

    // Fib dispatch is throttled: one full-symbol sweep every fibCycleInterval periodic cycles.
    int      fibCycleCounter;
    int      fibCycleInterval;  // default 6 (every ~60s on a 10s timer)

public:
    // Phase 5/6 dispatch shares the same cycle interval as fib (every ~60s).
    int      regimeCycleCounter;
    int      regimeCycleInterval;  // default 6 (every ~60s on a 10s timer)
    int      signalCycleCounter;
    int      signalCycleInterval;  // default 12 (every ~120s — less frequent than regime)

    MarketDataEngine()
    {
        tickProcessor    = new TickProcessor();
        candleBuilder    = new CandleBuilder();
        sessionManager   = new SessionManager();
        freshnessEngine  = new FreshnessEngine();
        symbolNormalizer = new SymbolNormalizer();
        fibEngine        = new FibEngine();
        regimeEngine     = new RegimeEngine();
        signalEngine     = new SignalEngine();
        executionEngine  = new ExecutionEngine();
        symbolCount      = 0;
        webhookUrl       = "";
        authHeader       = "";
        wpUserId         = 0;
        cachedHeaders    = "";
        baseUrl          = "";
        eaVersion        = "1.00";
        fibCycleCounter  = 0;
        fibCycleInterval = 6;
        regimeCycleCounter  = 0;
        regimeCycleInterval = 6;   // Phase 5: same cadence as fib
        signalCycleCounter  = 0;
        signalCycleInterval = 12;  // Phase 6: every ~120s
        ArrayInitialize(lastSentCandleM1, 0);
        m_cachedBrokerOffset = 0;
    }

    ~MarketDataEngine()
    {
        delete tickProcessor;
        delete candleBuilder;
        delete sessionManager;
        delete fibEngine;
        delete freshnessEngine;
        delete symbolNormalizer;
        delete regimeEngine;
        delete signalEngine;
        delete executionEngine;
    }

    // Compute and cache the broker UTC offset. Call once at startup and once
    // per OnPeriodic() cycle so TimeToIso8601() always uses a stable offset
    // without racing TimeCurrent()-TimeGMT() on the same timer tick.
    void RefreshCachedBrokerOffset()
    {
        m_cachedBrokerOffset = TimeCurrent() - TimeGMT();
    }

    // url  = full webhook endpoint URL
    // auth = complete header line e.g. "X-EA-API-Key: mykey"
    //        (caller is responsible for the header name prefix)
    // userId = WordPress user_id that owns this data stream
    bool Initialize(string& activeSymbols[], int count,
                    string url = "", string auth = "", int userId = 0)
    {
        symbolCount = MathMin(count, 100);
        for (int i = 0; i < symbolCount; i++)
            symbols[i] = activeSymbols[i];

        webhookUrl = url;
        authHeader = auth;
        wpUserId   = userId;

        // Derive base REST URL by stripping everything from the first /ea/ segment onward.
        // webhookUrl = "https://site/wp-json/sniper/v1/ea/market-stream" → baseUrl = ".../v1"
        int eaPos = StringFind(url, "/ea/");
        baseUrl = (eaPos > 0) ? StringSubstr(url, 0, eaPos) : url;

        // Force symbol selection and pre-warm broker history for every tracked symbol.
        // Without SymbolSelect() MT5 may have no M1 history loaded, causing CopyRates()
        // to return 0 bars and iTime() to return 0 (epoch) on the first periodic cycle.
        MqlRates warmup[];
        for (int i = 0; i < symbolCount; i++)
        {
            SymbolSelect(symbols[i], true);
            int loaded = CopyRates(symbols[i], PERIOD_M1, 0, 100, warmup);
            Print("SMC_MarketDataEA: history preload symbol=", symbols[i],
                  " | bars_loaded=", loaded);
        }

        // Build the HTTP headers string once — reused on every WebRequest call.
        cachedHeaders  = "Content-Type: application/json\r\n";
        cachedHeaders += "Accept: application/json\r\n";
        cachedHeaders += "Connection: close\r\n";
        if (StringLen(authHeader) > 0)
            cachedHeaders += authHeader + "\r\n";

        // Seed the cached broker offset so TimeToIso8601() is safe from the
        // first OnTick() call before OnPeriodic() has run.
        RefreshCachedBrokerOffset();

        return true;
    }

    // ---- EA event handlers ----

    // Call from EA OnTick()
    void OnTick(string symbol, double bid, double ask,
                datetime timestamp, long volume)
    {
        string normalized = symbolNormalizer.NormalizeSymbol(symbol);
        tickProcessor.ProcessTick(normalized, bid, ask, timestamp, volume);
        freshnessEngine.UpdateOnTick(normalized, timestamp);
        sessionManager.UpdateSession(timestamp);
        candleBuilder.BuildCandleM1(normalized, *tickProcessor);
    }

    // Call from EA OnTimer() — typically every 10–30 seconds
    void OnPeriodic()
    {
        Print("SMC_MarketDataEA: OnPeriodic fired");
        // Refresh cached broker offset before any send path calls TimeToIso8601().
        RefreshCachedBrokerOffset();
        datetime now = TimeCurrent();
        sessionManager.UpdateSession(now);

        if (StringLen(webhookUrl) == 0)
            return;

        for (int i = 0; i < symbolCount; i++)
        {
            string normalized = symbolNormalizer.NormalizeSymbol(symbols[i]);
            bool isMarketOpen = sessionManager.IsMarketOpenForSymbol(normalized, now);
            freshnessEngine.UpdateSymbolPeriodic(normalized, isMarketOpen, now);
            SendToBackend(symbols[i]);
        }

        // Fib dispatch: run once per fibCycleInterval periodic cycles (~every minute
        // on a 10s timer) to avoid blocking the main symbol loop on every tick.
        fibCycleCounter++;
        if (fibCycleCounter >= fibCycleInterval)
        {
            fibCycleCounter = 0;
            fibEngine.RefreshBrokerOffset();
            SendFibToBackend();
        }

        // Phase 5 — Regime dispatch: same cadence as fib (~every 60s).
        regimeCycleCounter++;
        if (regimeCycleCounter >= regimeCycleInterval)
        {
            regimeCycleCounter = 0;
            SendRegimeToBackend();
        }

        // Phase 6 — Signal dispatch: every ~120s (less frequent than regime).
        signalCycleCounter++;
        if (signalCycleCounter >= signalCycleInterval)
        {
            signalCycleCounter = 0;
            SendSignalCandidatesToBackend();
        }

        // Phase 7 scaffold — execution polling (no-op until Phase 6 gate cleared).
        executionEngine.OnPeriodic();
    }

    // POST fib levels for all tracked symbols to /ea/fib-levels.
    // Called once per fib cycle (every fibCycleInterval periodic cycles).
    void SendFibToBackend()
    {
        if (StringLen(baseUrl) == 0)
            return;

        string url = baseUrl + "/ea/fib-levels";

        for (int i = 0; i < symbolCount; i++)
        {
            string normalized = symbolNormalizer.NormalizeSymbol(symbols[i]);
            string fibJson = fibEngine.BuildFibPayload(symbols[i], normalized, wpUserId);

            if (StringLen(fibJson) <= 2)  // "[]" = empty
            {
                Print("[FibEngine] No fib payload for symbol=", symbols[i], " — skipping.");
                continue;
            }

            string payload = "{";
            payload += "\"user_id\":"  + IntegerToString(wpUserId) + ",";
            payload += "\"symbol\":\"" + normalized                + "\",";
            payload += "\"levels\":"   + fibJson;
            payload += "}";

            char   postData[];
            char   result[];
            string responseHeaders;
            StringToCharArray(payload, postData, 0, StringLen(payload));

            int httpStatus = WebRequest("POST", url, cachedHeaders, 8000,
                                        postData, result, responseHeaders);
            if (httpStatus == 200 || httpStatus == 201)
            {
                Print("[FibEngine] POST OK symbol=", symbols[i]);
            }
            else
            {
                string body = CharArrayToString(result, 0, -1, CP_UTF8);
                Print("[FibEngine] POST FAILED symbol=", symbols[i],
                      " status=", httpStatus,
                      " resp=", StringLen(body) > 0 ? body : "(empty)");
            }
        }
    }

    // ---- Phase 5: Regime dispatch ----

    // POST regime snapshots for all tracked symbols to /ea/regime-snapshot.
    // Batches all symbols into a single JSON array payload.
    void SendRegimeToBackend()
    {
        if (StringLen(baseUrl) == 0)
            return;

        string url = baseUrl + "/ea/regime-snapshot";

        string normSymbols[100];
        for (int i = 0; i < symbolCount; i++)
            normSymbols[i] = symbolNormalizer.NormalizeSymbol(symbols[i]);

        string batchJson = regimeEngine.BuildBatchPayload(symbols, normSymbols,
                                                          symbolCount, wpUserId);

        if (StringLen(batchJson) <= 2)  // "[]" = empty
        {
            Print("[RegimeEngine] No regime payload — skipping dispatch.");
            return;
        }

        string payload = "{\"regimes\":" + batchJson + "}";

        char   postData[];
        char   result[];
        string responseHeaders;
        StringToCharArray(payload, postData, 0, StringLen(payload));

        int httpStatus = WebRequest("POST", url, cachedHeaders, 10000,
                                    postData, result, responseHeaders);
        if (httpStatus == 200 || httpStatus == 201)
            Print("[RegimeEngine] POST OK symbols=", symbolCount);
        else
        {
            string body = CharArrayToString(result, 0, -1, CP_UTF8);
            Print("[RegimeEngine] POST FAILED status=", httpStatus,
                  " resp=", StringLen(body) > 0 ? body : "(empty)");
        }
    }

    // ---- Phase 6: Signal candidates dispatch ----

    // Evaluate signal candidates for all symbols using the most recent
    // fib + regime state and POST to /ea/signal-candidates.
    void SendSignalCandidatesToBackend()
    {
        if (StringLen(baseUrl) == 0)
            return;

        fibEngine.RefreshBrokerOffset();

        string url      = baseUrl + "/ea/signal-candidates";
        string arr      = "[";
        bool   first    = true;
        int    candCount = 0;

        for (int i = 0; i < symbolCount; i++)
        {
            string norm = symbolNormalizer.NormalizeSymbol(symbols[i]);

            if (!IsLive(symbols[i]))
            {
                Print("[SignalEngine] Symbol not LIVE symbol=", symbols[i],
                      " freshness=", FreshnessStateName(GetFreshnessState(symbols[i])),
                      " — skipping candidate evaluation.");
                continue;
            }

            // Fetch fib levels for this symbol across the signal-selection set.
            // BuildSignalFibLevels() now aggregates M15, H1, and H4 levels.
            FibLevelOut fibLevels[];
            int fibCount = fibEngine.BuildSignalFibLevels(symbols[i], fibLevels);
            if (fibCount <= 0)
            {
                Print("[SignalEngine] No fib levels available symbol=", symbols[i],
                      " — skipping candidate evaluation.");
                continue;
            }

            RegimeSnapshotOut regimeState;
            if (!regimeEngine.ComputeRegimeState(symbols[i], regimeState))
            {
                Print("[SignalEngine] No regime state available symbol=", symbols[i],
                      " — skipping candidate evaluation.");
                continue;
            }

            SignalCandidate cand;
            bool found = signalEngine.EvaluateSymbol(
                symbols[i], norm,
                regimeState.htfBias, regimeState.ltfRegime, regimeState.chopScore,
                fibLevels, fibCount, cand);

            if (!found)
                continue;

            string candJson = signalEngine.SignalToJson(cand, wpUserId);
            if (!first) arr += ",";
            arr   += candJson;
            first  = false;
            candCount++;
        }

        arr += "]";

        if (candCount == 0)
        {
            Print("[SignalEngine] No candidates this cycle.");
            return;
        }

        string payload = "{\"candidates\":" + arr + "}";

        char   postData[];
        char   result[];
        string responseHeaders;
        StringToCharArray(payload, postData, 0, StringLen(payload));

        int httpStatus = WebRequest("POST", url, cachedHeaders, 10000,
                                    postData, result, responseHeaders);
        if (httpStatus == 200 || httpStatus == 201)
            Print("[SignalEngine] POST OK candidates=", candCount);
        else
        {
            string body = CharArrayToString(result, 0, -1, CP_UTF8);
            Print("[SignalEngine] POST FAILED status=", httpStatus,
                  " resp=", StringLen(body) > 0 ? body : "(empty)");
        }
    }

    // ---- Getters ----

    string GetNormalizedSymbol(string symbol)
    {
        return symbolNormalizer.NormalizeSymbol(symbol);
    }

    ENUM_FRESHNESS_STATE GetFreshnessState(string symbol)
    {
        return freshnessEngine.GetFreshnessState(
                   symbolNormalizer.NormalizeSymbol(symbol));
    }

    bool IsLive(string symbol)
    {
        return GetFreshnessState(symbol) == FRESHNESS_LIVE;
    }

    ENUM_SESSION_STATE GetSessionState()
    {
        return sessionManager.GetCurrentSession();
    }

    string GetSessionName()
    {
        return sessionManager.GetSessionName();
    }

    bool GetCandleM1(string symbol, MqlRates& candle)
    {
        return candleBuilder.GetCandle(
                   symbolNormalizer.NormalizeSymbol(symbol),
                   PERIOD_M1, 0, candle);
    }

    // ---- Webhook ----

    // Build the JSON payload for one symbol snapshot.
    //
    // Candle sources:
    // 1. M1 (1-minute): Last closed bar from CopyRates(PERIOD_M1)
    // 2. M15 (15-minute): Last closed bar from CopyRates(PERIOD_M15)
    //
    // CopyRates() directly from the MT5 broker feed, NOT the CandleBuilder ring buffer.
    // CandleBuilder.GetCandle() returns hasCandle=true with a zero-initialized MqlRates
    // struct when no bar has completed yet (cold start), and ValidateCandle() does not
    // catch time==0, so the ring buffer path was emitting "1970-01-01T00:00:00Z" on
    // every periodic cycle. CopyRates() returns the actual broker history cleanly.
    string BuildWebhookPayload(string symbol)
    {
        string norm = symbolNormalizer.NormalizeSymbol(symbol);

        TickData tick;
        bool hasTick = tickProcessor.GetLastTick(norm, tick);

        if (!hasTick)
        {
            Print("SMC_MarketDataEA: no tick available for symbol=", symbol, " normalized=", norm);
            return "";
        }

        datetime now   = TimeCurrent();
        int digits     = (int) SymbolInfoInteger(symbol, SYMBOL_DIGITS);
        if (digits < 0) digits = 5;

        // --- M1 Candle: read last closed M1 bar directly from broker history ---
        // index=1 in CopyRates() is the last CLOSED bar (index=0 is the forming bar).
        MqlRates rates_m1[];
        int      copied_m1     = CopyRates(symbol, PERIOD_M1, 1, 1, rates_m1);
        bool     hasCandle_m1  = (copied_m1 == 1 && rates_m1[0].time > 0);
        datetime candleTime_m1 = hasCandle_m1 ? rates_m1[0].time : 0;

        // --- M15 Candle: read last closed M15 bar directly from broker history ---
        MqlRates rates_m15[];
        int      copied_m15     = CopyRates(symbol, PERIOD_M15, 1, 1, rates_m15);
        bool     hasCandle_m15  = (copied_m15 == 1 && rates_m15[0].time > 0);
        datetime candleTime_m15 = hasCandle_m15 ? rates_m15[0].time : 0;

        Print("EA PAYLOAD DEBUG → symbol=", symbol,
              " | hasTick=", hasTick,
              " | hasCandle_m1=", hasCandle_m1,
              " | hasCandle_m15=", hasCandle_m15,
              " | latestClosedCandle_m1=", TimeToString(candleTime_m1, TIME_DATE|TIME_SECONDS),
              " | latestClosedCandle_m15=", TimeToString(candleTime_m15, TIME_DATE|TIME_SECONDS));

        // Equity index session-awareness: NAS100/US30 only trade US equity hours (13:30-20:00 UTC
        // Mon-Fri). The global SessionManager uses FX hours and cannot distinguish index
        // off-session from a genuine feed failure. When the equity session is closed, override
        // freshness to CLOSED and use the current wall-clock time as the push timestamp so the
        // PHP backend accepts the push (tick.timestamp would be hours old and get rejected by
        // the >300s stale-data guard). The last known bid/ask is sent as a reference price.
        bool   isMarketOpen  = sessionManager.IsMarketOpenForSymbol(norm, now);
        string freshnessStr  = isMarketOpen
                                   ? FreshnessStateName(GetFreshnessState(symbol))
                                   : "CLOSED";
        string sessionName   = sessionManager.GetSessionNameForSymbol(norm, now);
        // Use current broker-local time as payload timestamp when session is closed so PHP does
        // not reject the push on the >300s stale-data guard. TimeCurrent() is broker-local;
        // TimeToIso8601() converts it to UTC by subtracting the broker offset. Passing TimeGMT()
        // here would cause a double-shift on non-UTC brokers (TimeToIso8601 subtracts the offset
        // again, producing a timestamp hours in the past).
        datetime pushTime    = isMarketOpen ? tick.timestamp : now;

        string json = "{";

        if (wpUserId > 0)
            json += "\"user_id\":"         + IntegerToString(wpUserId) + ",";

        json += "\"symbol\":\""            + symbol                                     + "\",";
        json += "\"normalized_symbol\":\"" + norm                                       + "\",";
        json += "\"timeframe\":\"M1\",";
        json += "\"timestamp\":\""         + TimeToIso8601(pushTime) + "\",";
        json += "\"bid\":"                 + DoubleToString(tick.bid, digits)            + ",";
        json += "\"ask\":"                 + DoubleToString(tick.ask, digits)            + ",";
        json += "\"freshness\":\""         + freshnessStr                               + "\",";
        json += "\"session\":\""           + JsonEscape(sessionName)                    + "\"";

        long   accountId     = AccountInfoInteger(ACCOUNT_LOGIN);
        string accountIdStr  = IntegerToString(accountId);
        string terminalId    = GetTerminalId();
        string broker        = JsonEscape(AccountInfoString(ACCOUNT_COMPANY));
        string brokerServer  = JsonEscape(AccountInfoString(ACCOUNT_SERVER));
        int    terminalBuild = (int)TerminalInfoInteger(TERMINAL_BUILD);
        double spreadValue   = tick.ask - tick.bid;

        json += ",\"schema_version\":\"phase2.trade_telemetry.v1\"";
        json += ",\"account_id\":\""       + accountIdStr                               + "\"";
        json += ",\"terminal_id\":\""      + terminalId                                 + "\"";
        json += ",\"broker\":\""           + broker                                     + "\"";
        json += ",\"broker_server\":\""    + brokerServer                               + "\"";
        json += ",\"ea_version\":\""       + eaVersion                                  + "\"";
        json += ",\"terminal_build\":\""   + IntegerToString(terminalBuild)             + "\"";
        json += ",\"spread\":"             + DoubleToString(spreadValue, digits);
        json += ",\"positions\":"          + BuildOpenPositionsJson();
        json += ",\"pending_orders\":"     + BuildPendingOrdersJson();
        json += ",\"account_metrics\":"    + BuildAccountMetricsJson();

        // M1 Candle
        if (hasCandle_m1)
        {
            // REGRESSION GUARD: closed bar must be in the past, never equal to or
            // ahead of wall-clock time (would indicate a data/clock fault).
            if (candleTime_m1 >= now)
            {
                Print("REGRESSION GUARD: M1 candle time is not in the past for ", symbol,
                      " | candleTime=", TimeToString(candleTime_m1, TIME_DATE|TIME_SECONDS),
                      " | now=",        TimeToString(now,          TIME_DATE|TIME_SECONDS));
            }
            else
            {
                json += ",\"candle\":{";
                json += "\"time\":\""  + TimeToIso8601(candleTime_m1)                 + "\",";
                json += "\"open\":"    + DoubleToString(rates_m1[0].open,        digits)  + ",";
                json += "\"high\":"    + DoubleToString(rates_m1[0].high,        digits)  + ",";
                json += "\"low\":"     + DoubleToString(rates_m1[0].low,         digits)  + ",";
                json += "\"close\":"   + DoubleToString(rates_m1[0].close,       digits)  + ",";
                json += "\"volume\":"  + IntegerToString((long)rates_m1[0].tick_volume);
                json += "}";
                json += ",\"candle_time\":\""  + TimeToIso8601(candleTime_m1)                + "\"";
                json += ",\"candle_open\":"    + DoubleToString(rates_m1[0].open,       digits);
                json += ",\"candle_high\":"    + DoubleToString(rates_m1[0].high,       digits);
                json += ",\"candle_low\":"     + DoubleToString(rates_m1[0].low,        digits);
                json += ",\"candle_close\":"   + DoubleToString(rates_m1[0].close,      digits);
                json += ",\"candle_volume\":"  + IntegerToString((long)rates_m1[0].tick_volume);

                Print("EA SEND → ", symbol,
                      " | M1_time=", TimeToString(candleTime_m1, TIME_DATE|TIME_SECONDS),
                      " | now=",      TimeToString(now,          TIME_DATE|TIME_SECONDS));
            }
        }
        else
        {
            Print("HISTORY NOT READY → symbol=", symbol,
                  " | copied_m1=", copied_m1,
                  " — M1 candle omitted from payload; snapshot will still send.");
        }

        // M15 Candle
        if (hasCandle_m15)
        {
            if (candleTime_m15 >= now)
            {
                Print("REGRESSION GUARD: M15 candle time is not in the past for ", symbol,
                      " | candleTime=", TimeToString(candleTime_m15, TIME_DATE|TIME_SECONDS),
                      " | now=",        TimeToString(now,           TIME_DATE|TIME_SECONDS));
            }
            else
            {
                json += ",\"candle_m15\":{";
                json += "\"time\":\""  + TimeToIso8601(candleTime_m15)                + "\",";
                json += "\"open\":"    + DoubleToString(rates_m15[0].open,       digits)  + ",";
                json += "\"high\":"    + DoubleToString(rates_m15[0].high,       digits)  + ",";
                json += "\"low\":"     + DoubleToString(rates_m15[0].low,        digits)  + ",";
                json += "\"close\":"   + DoubleToString(rates_m15[0].close,      digits)  + ",";
                json += "\"volume\":"  + IntegerToString((long)rates_m15[0].tick_volume);
                json += "}";
                json += ",\"candle_m15_time\":\""  + TimeToIso8601(candleTime_m15)               + "\"";
                json += ",\"candle_m15_open\":"    + DoubleToString(rates_m15[0].open,      digits);
                json += ",\"candle_m15_high\":"    + DoubleToString(rates_m15[0].high,      digits);
                json += ",\"candle_m15_low\":"     + DoubleToString(rates_m15[0].low,       digits);
                json += ",\"candle_m15_close\":"   + DoubleToString(rates_m15[0].close,     digits);
                json += ",\"candle_m15_volume\":"  + IntegerToString((long)rates_m15[0].tick_volume);

                Print("EA SEND → ", symbol,
                      " | M15_time=", TimeToString(candleTime_m15, TIME_DATE|TIME_SECONDS),
                      " | now=",       TimeToString(now,           TIME_DATE|TIME_SECONDS));
            }
        }
        else
        {
            Print("HISTORY NOT READY → symbol=", symbol,
                  " | copied_m15=", copied_m15,
                  " — M15 candle omitted from payload.");
        }

        json += "}";
        return json;
    }

    // POST a snapshot for one symbol to the PHP backend.
    bool SendToBackend(string symbol)
    {
        if (StringLen(webhookUrl) == 0)
            return false;

        // Last line of defence: do not attempt HTTP if the EA has no usable API key.
        string apiKeyValue = authHeader;
        int headerSep = StringFind(apiKeyValue, ":");
        if (headerSep >= 0)
            apiKeyValue = StringSubstr(apiKeyValue, headerSep + 1);
        StringTrimLeft(apiKeyValue);
        StringTrimRight(apiKeyValue);

        if (StringLen(apiKeyValue) == 0)
        {
            Print("SMC_MarketDataEA: ApiKey not set - configure it in EA Inputs and re-attach the EA.");
            return false;
        }

        string payload = BuildWebhookPayload(symbol);
        if (StringLen(payload) == 0)
        {
            Print("SMC_MarketDataEA: empty payload for symbol=", symbol);
            return false;
        }

        Print("WEBHOOK DEBUG: Payload size=", StringLen(payload), " | auth_header_len=", StringLen(authHeader));

        char   postData[];
        char   result[];
        string responseHeaders;
        StringToCharArray(payload, postData, 0, StringLen(payload));

        int lastStatus = -1;
        for (int attempt = 0; attempt < 3; attempt++)
        {
            int httpStatus = WebRequest("POST", webhookUrl, cachedHeaders, 5000,
                                        postData, result, responseHeaders);
            lastStatus = httpStatus;
            if (httpStatus == 200 || httpStatus == 201)
            {
                string body = CharArrayToString(result, 0, -1, CP_UTF8);
                Print("SMC_MarketDataEA SUCCESS attempt ", attempt + 1,
                      " | symbol=",      symbol,
                      " | httpStatus=",  httpStatus,
                      " | response=",    body);
                return true;
            }

            int    err  = GetLastError();
            string body = CharArrayToString(result, 0, -1, CP_UTF8);
            Print("SMC_MarketDataEA FAILED attempt ", attempt + 1,
                  " | symbol=",      symbol,
                  " | httpStatus=",  httpStatus,
                  " | lastError=",   err,
                  " | response=",    StringLen(body) > 0 ? body : "(empty)");
            Sleep(150);
        }

        Print("SMC_MarketDataEA send failed for ", symbol, " (all 3 attempts)"
              " | lastStatus=", lastStatus);
        return false;
    }

    // ---- EA bridge routes (Phase 1) ----
    // Helper: extract last path component of TERMINAL_DATA_PATH as terminal_id.
    // Returns the hex identifier MT5 uses (e.g. "D91A3F56...") with no path separators.
    string GetTerminalId()
    {
        string termPath = TerminalInfoString(TERMINAL_DATA_PATH);
        string termId   = termPath;
        for (int i = StringLen(termPath) - 1; i >= 0; i--)
        {
            ushort ch = StringGetCharacter(termPath, i);
            if (ch == '\\' || ch == '/')
            {
                termId = StringSubstr(termPath, i + 1);
                break;
            }
        }
        return termId;
    }

    // GET /ea/license-check — hard gate: returns false if denied OR all attempts fail.
    // Caller (OnInit) must return INIT_FAILED when this returns false.
    // Uses 3-attempt / 150ms backoff matching SendToBackend().
    bool SendLicenseCheck()
    {
        if (StringLen(baseUrl) == 0)
            return false;

        string termId    = GetTerminalId();
        long   accountId = AccountInfoInteger(ACCOUNT_LOGIN);
        string url       = baseUrl + "/ea/license-check"
                         + "?user_id="    + IntegerToString(wpUserId)
                         + "&account_id=" + IntegerToString(accountId)
                         + "&terminal_id=" + termId
                         + "&ea_version="  + eaVersion;

        Print("[LicenseCheck] Dispatch | user_id=", wpUserId,
              " | account_id=", accountId,
              " | terminal_id=", termId,
              " | ea_version=", eaVersion);

        char   emptyBody[];
        char   result[];
        string responseHeaders;

        for (int attempt = 0; attempt < 3; attempt++)
        {
            int httpStatus = WebRequest("GET", url, cachedHeaders, 5000,
                                        emptyBody, result, responseHeaders);
            if (httpStatus == 200)
            {
                string body = CharArrayToString(result, 0, -1, CP_UTF8);
                if (StringFind(body, "\"allowed\":true") >= 0)
                {
                    Print("[LicenseCheck] License check passed.");
                    return true;
                }
                Print("[LicenseCheck] License denied by backend: ", body);
                return false;
            }
            Print("[LicenseCheck] Attempt ", attempt + 1, " failed | httpStatus=", httpStatus);
            Sleep(150);
        }

        Print("[LicenseCheck] Timed out or unreachable after 3 attempts - treating as denied.");
        return false;
    }

    // POST /ea/heartbeat — soft gate: logs warning on failure, never halts.
    // One attempt only to avoid blocking OnTimer() symbol poll loop.
    bool SendHeartbeat()
    {
        if (StringLen(baseUrl) == 0)
            return false;

        string termId       = GetTerminalId();
        long   accountId    = AccountInfoInteger(ACCOUNT_LOGIN);
        string broker       = AccountInfoString(ACCOUNT_COMPANY);
        string brokerServer = AccountInfoString(ACCOUNT_SERVER);
        int    termBuild    = (int)TerminalInfoInteger(TERMINAL_BUILD);
        int    connected    = (int)TerminalInfoInteger(TERMINAL_CONNECTED);
        string timestamp    = TimeToIso8601(TimeCurrent());

        string json = "{";
        json += "\"user_id\":"         + IntegerToString(wpUserId)  + ",";
        json += "\"account_id\":"      + IntegerToString(accountId) + ",";
        json += "\"terminal_id\":\""   + termId                     + "\",";
        json += "\"broker\":\""        + broker                     + "\",";
        json += "\"broker_server\":\"" + brokerServer               + "\",";
        json += "\"ea_version\":\""    + eaVersion                  + "\",";
        json += "\"terminal_build\":"  + IntegerToString(termBuild) + ",";
        json += "\"connected\":"       + IntegerToString(connected) + ",";
        json += "\"timestamp\":\""     + timestamp                  + "\"";
        json += "}";

        Print("[Heartbeat] Dispatch | user_id=", wpUserId,
              " | account_id=", accountId,
              " | terminal_id=", termId,
              " | connected=", connected);

        char   postData[];
        char   result[];
        string responseHeaders;
        StringToCharArray(json, postData, 0, StringLen(json));

        int httpStatus = WebRequest("POST", baseUrl + "/ea/heartbeat",
                                    cachedHeaders, 5000, postData, result, responseHeaders);
        if (httpStatus == 200)
        {
            Print("[Heartbeat] OK.");
            return true;
        }

        string body = CharArrayToString(result, 0, -1, CP_UTF8);
        Print("[Heartbeat] WARNING: failed | httpStatus=", httpStatus,
              " | response=", StringLen(body) > 0 ? body : "(empty)");
        return false;
    }

    // POST /ea/account-sync — soft gate: logs warning on failure, never halts.
    // One attempt to avoid blocking startup.
    bool SendAccountSync()
    {
        if (StringLen(baseUrl) == 0)
            return false;

        string termId       = GetTerminalId();
        long   accountId    = AccountInfoInteger(ACCOUNT_LOGIN);
        string broker       = AccountInfoString(ACCOUNT_COMPANY);
        string brokerServer = AccountInfoString(ACCOUNT_SERVER);
        string currency     = AccountInfoString(ACCOUNT_CURRENCY);
        double balance      = AccountInfoDouble(ACCOUNT_BALANCE);
        double equity       = AccountInfoDouble(ACCOUNT_EQUITY);
        double margin       = AccountInfoDouble(ACCOUNT_MARGIN);
        double freeMargin   = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
        long   leverage     = AccountInfoInteger(ACCOUNT_LEVERAGE);
        int    tradeAllowed = (int)AccountInfoInteger(ACCOUNT_TRADE_ALLOWED);
        int    connected    = (int)TerminalInfoInteger(TERMINAL_CONNECTED);
        int    termBuild    = (int)TerminalInfoInteger(TERMINAL_BUILD);
        string timestamp    = TimeToIso8601(TimeCurrent());

        string json = "{";
        json += "\"user_id\":"         + IntegerToString(wpUserId)    + ",";
        json += "\"account_id\":"      + IntegerToString(accountId)    + ",";
        json += "\"terminal_id\":\""   + termId                        + "\",";
        json += "\"broker\":\""        + broker                        + "\",";
        json += "\"broker_server\":\"" + brokerServer                  + "\",";
        json += "\"currency\":\""      + currency                      + "\",";
        json += "\"balance\":"         + DoubleToString(balance, 2)    + ",";
        json += "\"equity\":"          + DoubleToString(equity, 2)     + ",";
        json += "\"margin\":"          + DoubleToString(margin, 2)     + ",";
        json += "\"free_margin\":"     + DoubleToString(freeMargin, 2) + ",";
        json += "\"leverage\":"        + IntegerToString(leverage)     + ",";
        json += "\"trade_allowed\":"   + IntegerToString(tradeAllowed) + ",";
        json += "\"connected\":"       + IntegerToString(connected)    + ",";
        json += "\"ea_version\":\""    + eaVersion                     + "\",";
        json += "\"terminal_build\":"  + IntegerToString(termBuild)    + ",";
        json += "\"timestamp\":\""     + timestamp                     + "\"";
        json += "}";

        Print("[AccountSync] Dispatch | user_id=", wpUserId,
              " | account_id=", accountId,
              " | terminal_id=", termId,
              " | broker=", broker,
              " | broker_server=", brokerServer);

        char   postData[];
        char   result[];
        string responseHeaders;
        StringToCharArray(json, postData, 0, StringLen(json));

        int httpStatus = WebRequest("POST", baseUrl + "/ea/account-sync",
                                    cachedHeaders, 5000, postData, result, responseHeaders);
        if (httpStatus == 200)
        {
            Print("[AccountSync] OK.");
            return true;
        }

        string body = CharArrayToString(result, 0, -1, CP_UTF8);
        Print("[AccountSync] WARNING: failed | httpStatus=", httpStatus,
              " | response=", StringLen(body) > 0 ? body : "(empty)");
        return false;
    }

    // POST /ea/symbol-sync — soft gate: sends single batch for all resolved symbols.
    // Must be called after ResolveBrokerSymbol() completes in OnInit().
    bool SendSymbolSync(string &symArray[], int count)
    {
        if (StringLen(baseUrl) == 0 || count == 0)
            return false;

        string termId       = GetTerminalId();
        long   accountId    = AccountInfoInteger(ACCOUNT_LOGIN);
        string broker       = AccountInfoString(ACCOUNT_COMPANY);
        string brokerServer = AccountInfoString(ACCOUNT_SERVER);
        string timestamp    = TimeToIso8601(TimeCurrent());

        string json = "{";
        json += "\"user_id\":"         + IntegerToString(wpUserId)  + ",";
        json += "\"account_id\":"      + IntegerToString(accountId) + ",";
        json += "\"terminal_id\":\""   + termId                     + "\",";
        json += "\"broker\":\""        + broker                     + "\",";
        json += "\"broker_server\":\"" + brokerServer               + "\",";
        json += "\"timestamp\":\""     + timestamp                  + "\",";
        json += "\"symbols\":[";

        for (int s = 0; s < count; s++)
        {
            string sym         = symArray[s];
            string norm        = symbolNormalizer.NormalizeSymbol(sym);
            int    visible     = (int)SymbolInfoInteger(sym, SYMBOL_SELECT);
            int    digits      = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
            double point       = SymbolInfoDouble(sym, SYMBOL_POINT);
            double contractSz  = SymbolInfoDouble(sym, SYMBOL_TRADE_CONTRACT_SIZE);
            int    tradeMode   = (int)SymbolInfoInteger(sym, SYMBOL_TRADE_MODE);
            double minLot      = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
            double maxLot      = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);
            double lotStep     = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
            int    spread      = (int)SymbolInfoInteger(sym, SYMBOL_SPREAD);
            string currProfit  = SymbolInfoString(sym, SYMBOL_CURRENCY_PROFIT);
            string currMargin  = SymbolInfoString(sym, SYMBOL_CURRENCY_MARGIN);

            if (s > 0) json += ",";
            json += "{";
            json += "\"broker_symbol\":\""     + sym                           + "\",";
            json += "\"normalized_symbol\":\"" + norm                          + "\",";
            json += "\"base_symbol\":\""       + norm                          + "\",";
            json += "\"visible\":"             + IntegerToString(visible)      + ",";
            json += "\"selected\":"            + IntegerToString(visible)      + ",";
            json += "\"digits\":"              + IntegerToString(digits)       + ",";
            json += "\"point\":"               + DoubleToString(point, 10)     + ",";
            json += "\"contract_size\":"       + DoubleToString(contractSz, 2) + ",";
            json += "\"trade_mode\":"          + IntegerToString(tradeMode)    + ",";
            json += "\"min_lot\":"             + DoubleToString(minLot, 2)     + ",";
            json += "\"max_lot\":"             + DoubleToString(maxLot, 2)     + ",";
            json += "\"lot_step\":"            + DoubleToString(lotStep, 2)    + ",";
            json += "\"spread\":"              + IntegerToString(spread)       + ",";
            json += "\"currency_profit\":\"" + currProfit                      + "\",";
            json += "\"currency_margin\":\"" + currMargin                      + "\"";
            json += "}";
        }

        json += "]}";

        Print("[SymbolSync] Dispatch | user_id=", wpUserId,
              " | account_id=", accountId,
              " | terminal_id=", termId,
              " | symbol_count=", count);

        char   postData[];
        char   result[];
        string responseHeaders;
        StringToCharArray(json, postData, 0, StringLen(json));

        int httpStatus = WebRequest("POST", baseUrl + "/ea/symbol-sync",
                                    cachedHeaders, 5000, postData, result, responseHeaders);
        if (httpStatus == 200)
        {
            string body = CharArrayToString(result, 0, -1, CP_UTF8);
            Print("[SymbolSync] OK | count=", count, " | response=", body);
            return true;
        }

        string body = CharArrayToString(result, 0, -1, CP_UTF8);
        Print("[SymbolSync] WARNING: failed | httpStatus=", httpStatus,
              " | response=", StringLen(body) > 0 ? body : "(empty)");
        return false;
    }

private:
    string JsonEscape(string value)
    {
        string escaped = value;
        StringReplace(escaped, "\\", "\\\\");
        StringReplace(escaped, "\"", "\\\"");
        StringReplace(escaped, "\r", " ");
        StringReplace(escaped, "\n", " ");
        return escaped;
    }

    string PositionDirectionName(int positionType)
    {
        if (positionType == POSITION_TYPE_BUY)
            return "BUY";
        if (positionType == POSITION_TYPE_SELL)
            return "SELL";
        return "UNKNOWN";
    }

    string OrderTypeName(int orderType)
    {
        switch (orderType)
        {
            case ORDER_TYPE_BUY:            return "BUY";
            case ORDER_TYPE_SELL:           return "SELL";
            case ORDER_TYPE_BUY_LIMIT:      return "BUY_LIMIT";
            case ORDER_TYPE_SELL_LIMIT:     return "SELL_LIMIT";
            case ORDER_TYPE_BUY_STOP:       return "BUY_STOP";
            case ORDER_TYPE_SELL_STOP:      return "SELL_STOP";
            case ORDER_TYPE_BUY_STOP_LIMIT: return "BUY_STOP_LIMIT";
            case ORDER_TYPE_SELL_STOP_LIMIT:return "SELL_STOP_LIMIT";
            default:                        return "UNKNOWN";
        }
    }

    string BuildOpenPositionsJson()
    {
        int total = PositionsTotal();
        string json = "[";
        bool first = true;

        for (int i = 0; i < total; i++)
        {
            ulong ticket = PositionGetTicket(i);
            if (ticket == 0 || !PositionSelectByTicket(ticket))
                continue;

            string symbol = PositionGetString(POSITION_SYMBOL);
            string norm   = symbolNormalizer.NormalizeSymbol(symbol);
            string direction = PositionDirectionName((int)PositionGetInteger(POSITION_TYPE));
            datetime openedAt = (datetime)PositionGetInteger(POSITION_TIME);

            if (!first) json += ",";
            first = false;

            json += "{";
            json += "\"position_id\":\""    + IntegerToString((long)ticket) + "\",";
            json += "\"symbol\":\""         + JsonEscape(symbol) + "\",";
            json += "\"normalized_symbol\":\"" + JsonEscape(norm) + "\",";
            json += "\"direction\":\""      + direction + "\",";
            json += "\"entry_price\":"      + DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN), 8) + ",";
            json += "\"current_price\":"    + DoubleToString(PositionGetDouble(POSITION_PRICE_CURRENT), 8) + ",";
            json += "\"sl\":"               + DoubleToString(PositionGetDouble(POSITION_SL), 8) + ",";
            json += "\"tp\":"               + DoubleToString(PositionGetDouble(POSITION_TP), 8) + ",";
            json += "\"volume\":"           + DoubleToString(PositionGetDouble(POSITION_VOLUME), 2) + ",";
            json += "\"profit\":"           + DoubleToString(PositionGetDouble(POSITION_PROFIT), 2) + ",";
            json += "\"swap\":"             + DoubleToString(PositionGetDouble(POSITION_SWAP), 2) + ",";
            json += "\"commission\":0.00,";
            json += "\"magic\":"            + IntegerToString((int)PositionGetInteger(POSITION_MAGIC)) + ",";
            json += "\"comment\":\""        + JsonEscape(PositionGetString(POSITION_COMMENT)) + "\",";
            json += "\"opened_at\":\""      + TimeToIso8601(openedAt) + "\",";
            json += "\"state\":\"OPEN\"";
            json += "}";
        }

        json += "]";
        return json;
    }

    string BuildPendingOrdersJson()
    {
        int total = OrdersTotal();
        string json = "[";
        bool first = true;

        for (int i = 0; i < total; i++)
        {
            ulong ticket = OrderGetTicket(i);
            if (ticket == 0 || !OrderSelect(ticket))
                continue;

            int orderType = (int)OrderGetInteger(ORDER_TYPE);
            string symbol = OrderGetString(ORDER_SYMBOL);
            string norm   = symbolNormalizer.NormalizeSymbol(symbol);
            string mt5Type = OrderTypeName(orderType);
            datetime placedAt = (datetime)OrderGetInteger(ORDER_TIME_SETUP);

            if (!first) json += ",";
            first = false;

            json += "{";
            json += "\"order_id\":\""       + IntegerToString((long)ticket) + "\",";
            json += "\"symbol\":\""         + JsonEscape(symbol) + "\",";
            json += "\"normalized_symbol\":\"" + JsonEscape(norm) + "\",";
            json += "\"order_type\":\""     + mt5Type + "\",";
            json += "\"direction\":\""      + mt5Type + "\",";
            json += "\"entry_price\":"      + DoubleToString(OrderGetDouble(ORDER_PRICE_OPEN), 8) + ",";
            json += "\"sl\":"               + DoubleToString(OrderGetDouble(ORDER_SL), 8) + ",";
            json += "\"tp\":"               + DoubleToString(OrderGetDouble(ORDER_TP), 8) + ",";
            json += "\"volume\":"           + DoubleToString(OrderGetDouble(ORDER_VOLUME_INITIAL), 2) + ",";
            json += "\"magic\":"            + IntegerToString((int)OrderGetInteger(ORDER_MAGIC)) + ",";
            json += "\"comment\":\""        + JsonEscape(OrderGetString(ORDER_COMMENT)) + "\",";
            json += "\"placed_at\":\""      + TimeToIso8601(placedAt) + "\",";
            json += "\"state\":\"ACTIVE\"";
            json += "}";
        }

        json += "]";
        return json;
    }

    string BuildAccountMetricsJson()
    {
        long   leverage    = AccountInfoInteger(ACCOUNT_LEVERAGE);
        double balance     = AccountInfoDouble(ACCOUNT_BALANCE);
        double equity      = AccountInfoDouble(ACCOUNT_EQUITY);
        double margin      = AccountInfoDouble(ACCOUNT_MARGIN);
        double freeMargin  = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
        double marginLevel = AccountInfoDouble(ACCOUNT_MARGIN_LEVEL);
        double floatingPl  = equity - balance;
        string currency    = JsonEscape(AccountInfoString(ACCOUNT_CURRENCY));

        string json = "{";
        json += "\"balance\":"      + DoubleToString(balance, 2) + ",";
        json += "\"equity\":"       + DoubleToString(equity, 2) + ",";
        json += "\"margin\":"       + DoubleToString(margin, 2) + ",";
        json += "\"free_margin\":"  + DoubleToString(freeMargin, 2) + ",";
        json += "\"margin_level\":" + DoubleToString(marginLevel, 2) + ",";
        json += "\"floating_pl\":"  + DoubleToString(floatingPl, 2) + ",";
        json += "\"currency\":\""   + currency + "\",";
        json += "\"leverage\":"     + IntegerToString((int)leverage);
        json += "}";
        return json;
    }

    // Convert datetime to ISO 8601 UTC string (YYYY-MM-DDTHH:MM:SSZ).
    //
    // TimeToStruct() decomposes broker server-local time, not UTC. Appending Z
    // Fixed: Use TimeGMT() directly to avoid fragile offset calculations.
    // This ensures timestamps are always genuine UTC, eliminating the risk of
    // broker offset mismatches or DST-related drift. Every timestamp sent to
    // the PHP backend must be in UTC with a 'Z' suffix (ISO 8601 format).
    //
    // Example: If broker is UTC+3 and local time is 05:44:55,
    // then TimeGMT() returns 02:44:55 UTC, which is what gets sent.
    string TimeToIso8601(datetime t)
    {
        // Use the per-cycle cached offset (set in RefreshCachedBrokerOffset) rather
        // than recomputing TimeCurrent()-TimeGMT() inline. The inline form races on
        // the same timer tick and can produce a ±1s offset, flipping midnight M15
        // bars to 23:59:59 and assigning them to the wrong UTC session key.
        datetime utcTime = t - m_cachedBrokerOffset;
        
        MqlDateTime dt;
        TimeToStruct(utcTime, dt);
        return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
                            dt.year, dt.mon, dt.day,
                            dt.hour, dt.min, dt.sec);
    }

    string FreshnessStateName(ENUM_FRESHNESS_STATE state)
    {
        switch (state)
        {
            case FRESHNESS_LIVE:         return "LIVE";
            case FRESHNESS_DELAYED:      return "DELAYED";
            case FRESHNESS_STALE:        return "STALE";
            case FRESHNESS_CLOSED:       return "CLOSED";
            case FRESHNESS_DISCONNECTED: return "DISCONNECTED";
            default:                     return "UNKNOWN";
        }
    }

    // Returns true for equity index symbols that trade only during the US equity session.
    bool IsEquityIndexSymbol(string symbol)
    {
        string norm = symbolNormalizer.NormalizeSymbol(symbol);
        return norm == "NAS100" || norm == "US30";
    }

    // Returns true when the US equity regular session is currently open.
    // NYSE/NASDAQ hours are 09:30-16:00 ET (Eastern Time):
    //   EDT (UTC-4, 2nd Sun March 07:00 UTC → 1st Sun November 06:00 UTC): 13:30-20:00 UTC
    //   EST (UTC-5, otherwise):                                              14:30-21:00 UTC
    bool IsEquitySessionOpen()
    {
        MqlDateTime dt;
        TimeToStruct(TimeGMT(), dt);
        int dow = dt.day_of_week; // 0=Sunday, 6=Saturday
        if (dow == 0 || dow == 6)
            return false;
        int minutesUtc = dt.hour * 60 + dt.min;
        if (IsUsDstActive(dt))
            return minutesUtc >= 810 && minutesUtc < 1200;  // EDT: 13:30-20:00 UTC
        else
            return minutesUtc >= 870 && minutesUtc < 1260;  // EST: 14:30-21:00 UTC
    }

    // Returns true when US Daylight Saving Time is in effect.
    // DST rules (post-2007): starts 2nd Sunday of March at 02:00 ET (07:00 UTC),
    // ends 1st Sunday of November at 02:00 ET (06:00 UTC while still in EDT).
    bool IsUsDstActive(MqlDateTime& now)
    {
        int month = now.mon;
        int day   = now.day;
        int hour  = now.hour;

        if (month < 3 || month > 11) return false;
        if (month > 3 && month < 11) return true;

        // Determine day-of-week for the 1st of the month to find the Nth Sunday.
        MqlDateTime first;
        first.year = now.year; first.mon = month; first.day = 1;
        first.hour = 0; first.min = 0; first.sec = 0;
        datetime dt_first = StructToTime(first);
        MqlDateTime dt_first_s;
        TimeToStruct(dt_first, dt_first_s);
        int dow1 = dt_first_s.day_of_week; // 0=Sunday
        // Day of the first Sunday of the month (1-based)
        int first_sunday = (dow1 == 0) ? 1 : (1 + 7 - dow1);

        if (month == 3)
        {
            int second_sunday = first_sunday + 7;
            return day > second_sunday || (day == second_sunday && hour >= 7);
        }
        // November: DST ends on 1st Sunday at 06:00 UTC
        return day < first_sunday || (day == first_sunday && hour < 6);
    }
};

#endif // MARKET_DATA_ENGINE_MQH
