#ifndef MARKET_DATA_ENGINE_MQH
#define MARKET_DATA_ENGINE_MQH

#include "TickProcessor.mqh"
#include "CandleBuilder.mqh"
#include "SessionManager.mqh"
#include "FreshnessEngine.mqh"
#include "SymbolNormalizer.mqh"

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

    string   symbols[100];
    int      symbolCount;

    string   webhookUrl;   // https://yoursite.com/wp-json/sniper/v1/ea/market-stream
    string   authHeader;   // Full header line: "X-EA-API-Key: <token>"
    int      wpUserId;     // WordPress user_id that owns this stream

    datetime lastSentCandleM1[100];

    // Cached constant headers — built once in Initialize(), reused every send.
    string   cachedHeaders;

public:
    MarketDataEngine()
    {
        tickProcessor    = new TickProcessor();
        candleBuilder    = new CandleBuilder();
        sessionManager   = new SessionManager();
        freshnessEngine  = new FreshnessEngine();
        symbolNormalizer = new SymbolNormalizer();
        symbolCount      = 0;
        webhookUrl       = "";
        authHeader       = "";
        wpUserId         = 0;
        cachedHeaders    = "";
        ArrayInitialize(lastSentCandleM1, 0);
    }

    ~MarketDataEngine()
    {
        delete tickProcessor;
        delete candleBuilder;
        delete sessionManager;
        delete freshnessEngine;
        delete symbolNormalizer;
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

        // Refresh session with wall-clock time so IsMarketOpen() stays accurate
        // even when no ticks arrive (e.g. during market close / weekend).
        sessionManager.UpdateSession(TimeCurrent());

        // Let FreshnessEngine age states; pass market-open flag so it can
        // set CLOSED instead of STALE during weekend/holiday gaps.
        freshnessEngine.UpdatePeriodic(sessionManager.IsMarketOpen());

        if (StringLen(webhookUrl) == 0)
            return;

        for (int i = 0; i < symbolCount; i++)
            SendToBackend(symbols[i]);
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
    // Candle source: CopyRates() directly from the MT5 broker feed, NOT the
    // CandleBuilder ring buffer. CandleBuilder.GetCandle() returns hasCandle=true
    // with a zero-initialized MqlRates struct when no bar has completed yet (cold
    // start), and ValidateCandle() does not catch time==0, so the ring buffer path
    // was emitting "1970-01-01T00:00:00Z" on every periodic cycle until the first
    // full minute bar closed. CopyRates() returns the actual broker history and
    // returns < 1 when no data is available — a clean, unambiguous signal.
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

        // --- Candle: read last closed M1 bar directly from broker history ---
        // index=1 in CopyRates() is the last CLOSED bar (index=0 is the forming bar).
        // This is standard MT5 convention and is independent of CandleBuilder state.
        MqlRates rates[];
        int      copied     = CopyRates(symbol, PERIOD_M1, 1, 1, rates);
        bool     hasCandle  = (copied == 1 && rates[0].time > 0);

        datetime candleTime = hasCandle ? rates[0].time : 0;

        Print("EA PAYLOAD DEBUG → symbol=", symbol,
              " | hasTick=", hasTick,
              " | hasCandle=", hasCandle,
              " | latestClosedCandle=", TimeToString(candleTime, TIME_DATE|TIME_SECONDS));

        string json = "{";

        if (wpUserId > 0)
            json += "\"user_id\":"         + IntegerToString(wpUserId) + ",";

        json += "\"symbol\":\""            + symbol                                     + "\",";
        json += "\"normalized_symbol\":\"" + norm                                       + "\",";
        json += "\"timeframe\":\"M1\",";
        json += "\"timestamp\":\""         + TimeToIso8601(tick.timestamp) + "\",";
        json += "\"bid\":"                 + DoubleToString(tick.bid, digits)            + ",";
        json += "\"ask\":"                 + DoubleToString(tick.ask, digits)            + ",";
        json += "\"freshness\":\""         + FreshnessStateName(GetFreshnessState(symbol)) + "\",";
        json += "\"session\":\""           + GetSessionName()                           + "\"";

        if (hasCandle)
        {
            // REGRESSION GUARD: closed bar must be in the past, never equal to or
            // ahead of wall-clock time (would indicate a data/clock fault).
            if (candleTime >= now)
            {
                Print("REGRESSION GUARD: candle time is not in the past for ", symbol,
                      " | candleTime=", TimeToString(candleTime, TIME_DATE|TIME_SECONDS),
                      " | now=",        TimeToString(now,        TIME_DATE|TIME_SECONDS));
            }
            else
            {
                json += ",\"candle\":{";
                json += "\"time\":\""  + TimeToIso8601(candleTime)                    + "\",";
                json += "\"open\":"    + DoubleToString(rates[0].open,        digits)  + ",";
                json += "\"high\":"    + DoubleToString(rates[0].high,        digits)  + ",";
                json += "\"low\":"     + DoubleToString(rates[0].low,         digits)  + ",";
                json += "\"close\":"   + DoubleToString(rates[0].close,       digits)  + ",";
                json += "\"volume\":"  + IntegerToString((long)rates[0].tick_volume);
                json += "}";

                Print("EA SEND → ", symbol,
                      " | candle_time=", TimeToString(candleTime, TIME_DATE|TIME_SECONDS),
                      " | now=",         TimeToString(now,         TIME_DATE|TIME_SECONDS));
            }
        }
        else
        {
            // copied < 1: broker history not loaded yet for this symbol.
            // Snapshot (bid/ask) will still be sent; candle omitted safely.
            Print("HISTORY NOT READY → symbol=", symbol,
                  " | copied=", copied,
                  " — candle omitted from payload; snapshot will still send.");
        }

        json += "}";
        return json;
    }

    // POST a snapshot for one symbol to the PHP backend.
    bool SendToBackend(string symbol)
    {
        if (StringLen(webhookUrl) == 0)
            return false;

        // REGRESSION GUARD: Validate API key is configured before attempting send
        if (StringLen(authHeader) == 0)
        {
            Print("REGRESSION GUARD: authHeader is empty! API key not configured. Check Initialize() call.");
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

private:
    // Convert datetime to ISO 8601 UTC string (YYYY-MM-DDTHH:MM:SSZ).
    //
    // TimeToStruct() decomposes broker server-local time, not UTC. Appending Z
    // without converting first produces a false UTC claim: a UTC+2 broker tick at
    // server-time 12:00 would be stored as "12:00Z" instead of "10:00Z", shifting
    // candle buckets by the broker offset and breaking UNIQUE KEY alignment.
    //
    // Fix: subtract the broker UTC offset (TimeCurrent() - TimeGMT()) before
    // decomposing so the formatted components are genuine UTC.
    string TimeToIso8601(datetime t)
    {
        datetime brokerUtcOffset = TimeCurrent() - TimeGMT();
        MqlDateTime dt;
        TimeToStruct(t - brokerUtcOffset, dt);
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
};

#endif // MARKET_DATA_ENGINE_MQH