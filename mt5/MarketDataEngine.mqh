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
    string BuildWebhookPayload(string symbol)
    {
        string norm = symbolNormalizer.NormalizeSymbol(symbol);

        TickData tick;
        MqlRates candle;
        bool hasTick   = tickProcessor.GetLastTick(norm, tick);
        bool hasCandle = candleBuilder.GetCandle(norm, PERIOD_M1, 0, candle);

        if (!hasTick)
        {
            Print("SMC_MarketDataEA: no tick available for symbol=", symbol, " normalized=", norm);
            return "";
        }

        datetime latestClosedCandleTime = candle.time;
        Print("EA PAYLOAD DEBUG → symbol=", symbol,
              " | hasTick=", hasTick,
              " | hasCandle=", hasCandle,
              " | latestClosedCandle=", TimeToString(latestClosedCandleTime, TIME_DATE|TIME_SECONDS));

        datetime now = TimeCurrent();
        int digits = (int) SymbolInfoInteger(symbol, SYMBOL_DIGITS);
        if (digits < 0) digits = 5;

        string json = "{";

        // user_id — lets PHP resolve ownership without a WP session cookie.
        if (wpUserId > 0)
            json += "\"user_id\":"        + IntegerToString(wpUserId) + ",";

        json += "\"symbol\":\""           + symbol                                    + "\",";
        json += "\"normalized_symbol\":\"" + norm                                     + "\",";
        json += "\"timeframe\":\"M1\",";
        json += "\"timestamp\":\""        + TimeToIso8601(tick.timestamp) + "\",";
        json += "\"bid\":"                + DoubleToString(tick.bid, digits)           + ",";
        json += "\"ask\":"                + DoubleToString(tick.ask, digits)           + ",";
        json += "\"freshness\":\""        + FreshnessStateName(GetFreshnessState(symbol)) + "\",";
        json += "\"session\":\""          + GetSessionName()                          + "\"";

        if (hasCandle && candleBuilder.ValidateCandle(candle))
        {
            datetime candleTime = candle.time;
            
            // REGRESSION GUARD: Reject live/future candles if candle indexing regresses.
            if (candleTime >= now)
            {
                Print("REGRESSION GUARD: Rejecting future candle for ", symbol,
                      " | candleTime=", TimeToString(candleTime, TIME_DATE|TIME_SECONDS),
                      " | now=", TimeToString(now, TIME_DATE|TIME_SECONDS),
                      " | Expected latest closed candle (shift=0 in CandleBuilder indexing)");
            }
            else
            {
                json += ",\"candle\":{";
                json += "\"time\":\""  + TimeToIso8601(candleTime) + "\",";
                json += "\"open\":"    + DoubleToString(candle.open,  digits)      + ",";
                json += "\"high\":"    + DoubleToString(candle.high,  digits)      + ",";
                json += "\"low\":"     + DoubleToString(candle.low,   digits)      + ",";
                json += "\"close\":"   + DoubleToString(candle.close, digits)      + ",";
                json += "\"volume\":"  + IntegerToString((long)candle.tick_volume);
                json += "}";

                Print("SHIFT CHECK → candle_time=", TimeToString(candleTime, TIME_DATE|TIME_SECONDS),
                      " | current=", TimeToString(now, TIME_DATE|TIME_SECONDS));
                Print("EA SEND → ", symbol,
                      " | candle_time=", TimeToString(candleTime, TIME_DATE|TIME_SECONDS),
                      " | now=", TimeToString(now, TIME_DATE|TIME_SECONDS));
            }
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