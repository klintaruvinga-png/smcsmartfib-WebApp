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
//| Central orchestrator.  Call OnTick() on every tick and            |
//| OnPeriodic() from a timer (e.g. every 5 s) to flush stale        |
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

    string symbols[100];
    int    symbolCount;

    string webhookUrl;   // e.g. "https://yoursite.com/wp-json/sniper/v1/snapshot"
    string authHeader;   // e.g. "X-API-KEY: <token>"
    datetime lastSentCandleM1[100];

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

    bool Initialize(string& activeSymbols[], int count,
                    string url = "", string auth = "")
    {
        symbolCount = MathMin(count, 100);
        for (int i = 0; i < symbolCount; i++)
            symbols[i] = activeSymbols[i];

        webhookUrl = url;
        authHeader = auth;
        return true;
    }

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

    // Call from EA OnTimer() — typically every 5–30 seconds
    void OnPeriodic()
    {
        // HARDENING: Refresh session with wall-clock time on every periodic call so
        // IsMarketOpen() stays accurate even when no ticks arrive (e.g. market closure).
        sessionManager.UpdateSession(TimeCurrent());
        // Pass session open state so FreshnessEngine can set CLOSED instead of
        // aging into STALE during weekends/holidays.
        freshnessEngine.UpdatePeriodic(sessionManager.IsMarketOpen());

        // Push a snapshot to the backend for every registered symbol
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

    // Build JSON payload for one symbol snapshot
    string BuildWebhookPayload(string symbol)
    {
        string norm = symbolNormalizer.NormalizeSymbol(symbol);

        TickData  tick;
        MqlRates  candle;
        bool hasTick   = tickProcessor.GetLastTick(norm, tick);
        bool hasCandle = candleBuilder.GetCandle(norm, PERIOD_M1, 0, candle);


        if (!hasTick)
            return "";

        int digits = (int) SymbolInfoInteger(symbol, SYMBOL_DIGITS);
        if (digits < 0) digits = 5;
        string tf = "M1";
        string json = "{";
        json += "\"symbol\":\"" + symbol + "\",";
        json += "\"normalized_symbol\":\"" + norm + "\",";
        json += "\"timeframe\":\"" + tf + "\",";
        json += "\"timestamp\":\"" + TimeToIso8601(tick.timestamp) + "\",";
        json += "\"bid\":" + DoubleToString(tick.bid, digits) + ",";
        json += "\"ask\":" + DoubleToString(tick.ask, digits);

        if (hasCandle && candleBuilder.ValidateCandle(candle))
        {
            json += ",\"candle\":{";
            json += "\"time\":\"" + TimeToIso8601(candle.time) + "\",";
            json += "\"open\":" + DoubleToString(candle.open, digits) + ",";
            json += "\"high\":" + DoubleToString(candle.high, digits) + ",";
            json += "\"low\":" + DoubleToString(candle.low, digits) + ",";
            json += "\"close\":" + DoubleToString(candle.close, digits) + ",";
            json += "\"volume\":" + IntegerToString((long)candle.tick_volume);
            json += "}";
        }
        json += "}";
        return json;
    }

    // POST a snapshot to the PHP backend via WebRequest
    bool SendToBackend(string symbol)
    {
        if (StringLen(webhookUrl) == 0)
            return false;

        string payload = BuildWebhookPayload(symbol);
        if (StringLen(payload) == 0)
            return false;
        string headers = "Content-Type: application/json\r\n";
        if (StringLen(authHeader) > 0)
            headers += authHeader + "\r\n";

        char   postData[];
        char   result[];
        string responseHeaders;

        StringToCharArray(payload, postData, 0, StringLen(payload));

        for (int attempt = 0; attempt < 3; attempt++)
        {
            int httpStatus = WebRequest("POST", webhookUrl, headers, 5000,
                                        postData, result, responseHeaders);
            if (httpStatus == 200 || httpStatus == 201)
                return true;
            Sleep(150);
        }
        Print("SMC_MarketDataEA send failed for ", symbol);
        return false;
    }

private:
    // Convert a datetime to ISO 8601 UTC string (YYYY-MM-DDTHH:MM:SSZ).
    // TimeToStruct() decomposes into broker-server local time, not UTC. Appending Z
    // without converting first produces a false UTC claim: a UTC+2 broker tick at
    // server-time 12:00 would be stored as UTC 12:00 instead of UTC 10:00, shifting
    // candle buckets by the server offset and breaking UNIQUE KEY alignment with
    // Twelve Data's UTC-based candles.
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
