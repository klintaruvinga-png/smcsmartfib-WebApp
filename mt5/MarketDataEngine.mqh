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
    string authHeader;   // e.g. "Authorization: Bearer <token>"

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

        string freshness = FreshnessStateName(freshnessEngine.GetFreshnessState(norm));
        string session   = sessionManager.GetSessionName();

        string json = "{";
        json += "\"symbol\":\"" + symbol + "\",";
        json += "\"normalized_symbol\":\"" + norm + "\",";
        json += "\"freshness\":\"" + freshness + "\",";
        json += "\"session\":\"" + session + "\"";

        if (hasTick)
        {
            json += ",\"tick\":{";
            json += "\"bid\":"       + DoubleToString(tick.bid, 8) + ",";
            json += "\"ask\":"       + DoubleToString(tick.ask, 8) + ",";
            json += "\"spread\":"    + DoubleToString(tick.spread, 5) + ",";
            json += "\"volume\":"    + IntegerToString(tick.volume) + ",";
            // HARDENING: Use ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ) instead of MT5's
            // dot-format (YYYY.MM.DD HH:MM:SS) which PHP strtotime() cannot reliably parse.
            json += "\"timestamp\":\"" + TimeToIso8601(tick.timestamp) + "\"";
            json += "}";
        }

        if (hasCandle && candleBuilder.ValidateCandle(candle))
        {
            json += ",\"candle_m1\":{";
            json += "\"timestamp\":\"" + TimeToIso8601(candle.time) + "\",";
            json += "\"open\":"   + DoubleToString(candle.open,  8) + ",";
            json += "\"high\":"   + DoubleToString(candle.high,  8) + ",";
            json += "\"low\":"    + DoubleToString(candle.low,   8) + ",";
            json += "\"close\":"  + DoubleToString(candle.close, 8) + ",";
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
        string headers = "Content-Type: application/json\r\n";
        if (StringLen(authHeader) > 0)
            headers += authHeader + "\r\n";

        char   postData[];
        char   result[];
        string responseHeaders;

        StringToCharArray(payload, postData, 0, StringLen(payload));

        int httpStatus = WebRequest("POST", webhookUrl, headers, 5000,
                                    postData, result, responseHeaders);

        return (httpStatus == 200 || httpStatus == 201);
    }

private:
    // Convert a datetime to ISO 8601 string (YYYY-MM-DDTHH:MM:SSZ).
    // MQL5's TimeToString produces "YYYY.MM.DD HH:MM:SS" which PHP strtotime()
    // does not reliably parse; ISO 8601 is unambiguous and portable.
    string TimeToIso8601(datetime t)
    {
        MqlDateTime dt;
        TimeToStruct(t, dt);
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
