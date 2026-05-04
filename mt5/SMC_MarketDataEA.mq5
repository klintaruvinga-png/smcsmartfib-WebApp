//+------------------------------------------------------------------+
//| SMC_MarketDataEA.mq5                                             |
//| Attach to one chart; engine monitors all symbols in Symbols[].  |
//|                                                                  |
//| Setup:                                                           |
//|  1. Set WebhookURL to your WP REST endpoint.                    |
//|  2. Set ApiKey to match SMC_SF_EA_API_KEY in wp-config.php.     |
//|  3. Set UserId to the WordPress user_id that owns the stream.   |
//|  4. Allow WebRequest for your domain in                         |
//|     Tools → Options → Expert Advisors.                          |
//+------------------------------------------------------------------+
#property copyright "SMC SuperFib"
#property version   "1.00"
#property strict

#include "TickProcessor.mqh"
#include "CandleBuilder.mqh"
#include "SessionManager.mqh"
#include "FreshnessEngine.mqh"
#include "SymbolNormalizer.mqh"
#include "MarketDataEngine.mqh"

input string WebhookURL = "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream";
input string ApiKey     = "";   // Must match SMC_SF_EA_API_KEY in wp-config.php
input int    UserId     = 1;    // WordPress user_id that owns this data stream
input int    TimerSec   = 10;   // OnPeriodic interval in seconds
input string Symbols    = "EURUSD,GBPUSD,XAUUSD,USDJPY,GBPJPY,AUDUSD";

MarketDataEngine engine;

// Module-level symbol list — OnTimer() needs it to poll non-chart symbols.
// OnTick() only fires for the chart symbol; without this loop every other
// symbol stays at FRESHNESS_DISCONNECTED permanently.
string g_symArray[];
int    g_symCount = 0;

int OnInit()
{
    // --- Validate inputs ---
    if (StringLen(WebhookURL) == 0)
    {
        Print("SMC_MarketDataEA: WebhookURL is required");
        return INIT_FAILED;
    }
    if (StringLen(ApiKey) == 0)
    {
        Print("SMC_MarketDataEA: ApiKey is required — set it to match SMC_SF_EA_API_KEY in wp-config.php");
        return INIT_FAILED;
    }
    if (UserId <= 0)
    {
        Print("SMC_MarketDataEA: UserId must be a valid WordPress user_id (>= 1)");
        return INIT_FAILED;
    }

    // --- Parse symbol list ---
    g_symCount = StringSplit(Symbols, ',', g_symArray);
    if (g_symCount <= 0)
    {
        Print("SMC_MarketDataEA: no symbols configured");
        return INIT_FAILED;
    }

    // Trim whitespace from each token
    for (int i = 0; i < g_symCount; i++)
    {
        StringTrimLeft(g_symArray[i]);
        StringTrimRight(g_symArray[i]);
    }

    // Build the full auth header line — engine stores and reuses it.
    // Header name MUST match what PHP reads: get_header('x_ea_api_key')
    string auth = "X-EA-API-Key: " + ApiKey;

    if (!engine.Initialize(g_symArray, g_symCount, WebhookURL, auth, UserId))
    {
        Print("SMC_MarketDataEA: engine init failed");
        return INIT_FAILED;
    }

    EventSetTimer(TimerSec);
    Print("SMC_MarketDataEA: started, monitoring ", g_symCount, " symbols");
    return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
    EventKillTimer();
}

void OnTick()
{
    // Real-time tick for the chart symbol — forward to engine immediately.
    MqlTick tick;
    if (!SymbolInfoTick(Symbol(), tick))
        return;

    engine.OnTick(Symbol(), tick.bid, tick.ask, tick.time, tick.volume);
}

void OnTimer()
{
    // Poll all non-chart symbols so their freshness state stays accurate.
    // In MQL5, OnTick() only fires for the chart symbol; without this loop
    // every other watched symbol remains at FRESHNESS_DISCONNECTED.
    string chartSym = Symbol();
    for (int i = 0; i < g_symCount; i++)
    {
        if (g_symArray[i] == chartSym)
            continue; // already handled in OnTick()

        MqlTick tick;
        if (SymbolInfoTick(g_symArray[i], tick))
            engine.OnTick(g_symArray[i], tick.bid, tick.ask, tick.time, tick.volume);
    }

    // Flush freshness, update session, and push all snapshots to PHP backend.
    engine.OnPeriodic();
}