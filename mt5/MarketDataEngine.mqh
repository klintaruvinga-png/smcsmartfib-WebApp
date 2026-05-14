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
        bool   indexEquity   = IsEquityIndexSymbol(symbol);
        bool   equityOpen    = indexEquity ? IsEquitySessionOpen() : true;
        string freshnessStr  = (indexEquity && !equityOpen)
                                   ? "CLOSED"
                                   : FreshnessStateName(GetFreshnessState(symbol));
        // Use current broker-local time as payload timestamp when session is closed so PHP does
        // not reject the push on the >300s stale-data guard. TimeCurrent() is broker-local;
        // TimeToIso8601() converts it to UTC by subtracting the broker offset. Passing TimeGMT()
        // here would cause a double-shift on non-UTC brokers (TimeToIso8601 subtracts the offset
        // again, producing a timestamp hours in the past).
        datetime pushTime    = (indexEquity && !equityOpen) ? TimeCurrent() : tick.timestamp;

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
        json += "\"session\":\""           + GetSessionName()                           + "\"";

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

private:
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
        // If t is in broker-local time (from TimeCurrent() or CopyRates()),
        // convert it to UTC by applying the broker offset.
        datetime brokerUtcOffset = TimeCurrent() - TimeGMT();
        datetime utcTime = t - brokerUtcOffset;
        
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
