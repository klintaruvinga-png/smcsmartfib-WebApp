//+------------------------------------------------------------------+
//| SMC_MarketDataEA.mq5                                             |
//| Attach to one chart; engine monitors all symbols in Symbols[].  |
//|                                                                  |
//| Setup:                                                           |
//|  1. Set WebhookURL to your WP REST endpoint.                    |
//|  2. Set ApiKey to match SMC_SF_EA_API_KEY on WordPress.          |
//|  3. Set UserId to the WordPress user that owns the stream.       |
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

input string WebhookURL  = "https://yoursite.com/wp-json/sniper/v1/ea/market-stream";
input string ApiKey      = "";          // X-API-KEY value
input int    UserId      = 1;           // WordPress user_id for EA ingest ownership
input int    TimerSec    = 10;          // OnPeriodic interval in seconds
input string Symbols     = "EURUSD,GBPUSD,XAUUSD,USDJPY,GBPJPY,AUDUSD";

MarketDataEngine engine;

// CRITICAL FIX: Promote parsed symbol list to module-level so OnTimer() can iterate
// all registered symbols and call SymbolInfoTick() for each.  Without this, OnTick()
// only fires for the chart symbol; all other watched symbols remain at
// FRESHNESS_DISCONNECTED permanently (lastTickTime = 0) because they never receive a
// tick-driven update from OnTick().
string g_symArray[];
int    g_symCount = 0;

int OnInit()
{
    // Parse comma-separated symbol list into module-level arrays.
    g_symCount = StringSplit(Symbols, ',', g_symArray);
    if (g_symCount <= 0)
    {
        Print("SMC_MarketDataEA: no symbols configured");
        return INIT_FAILED;
    }
    if (UserId <= 0)
    {
        Print("SMC_MarketDataEA: UserId must be a valid WordPress user_id");
        return INIT_FAILED;
    }
    if (StringLen(ApiKey) <= 0)
    {
        Print("SMC_MarketDataEA: ApiKey is required for /ea/market-stream");
        return INIT_FAILED;
    }

    // Trim whitespace from each symbol token.
    for (int i = 0; i < g_symCount; i++)
    {
        StringTrimLeft(g_symArray[i]);
        StringTrimRight(g_symArray[i]);
    }

    string auth = "X-API-KEY: " + ApiKey;

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
    // Real-time tick for the chart symbol only — forward to engine.
    MqlTick tick;
    if (!SymbolInfoTick(Symbol(), tick))
        return;

    engine.OnTick(Symbol(), tick.bid, tick.ask, tick.time, tick.volume);
}

void OnTimer()
{
    // CRITICAL FIX: Refresh tick state for all non-chart symbols via SymbolInfoTick().
    // In MQL5, OnTick() only fires when the chart symbol ticks.  Without this loop,
    // every symbol other than the attached chart shows FRESHNESS_DISCONNECTED because
    // FreshnessEngine.lastTickTimes[] remains 0 for them, making secondsSinceTick
    // enormous and driving all non-chart symbols to FRESHNESS_STALE / DISCONNECTED.
    string chartSym = Symbol();
    for (int i = 0; i < g_symCount; i++)
    {
        if (g_symArray[i] == chartSym)
            continue; // already handled in OnTick()

        MqlTick tick;
        if (SymbolInfoTick(g_symArray[i], tick))
            engine.OnTick(g_symArray[i], tick.bid, tick.ask, tick.time, tick.volume);
    }

    engine.OnPeriodic();
}
