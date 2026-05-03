//+------------------------------------------------------------------+
//| SMC_MarketDataEA.mq5                                             |
//| Attach to one chart; engine monitors all symbols in Symbols[].  |
//|                                                                  |
//| Setup:                                                           |
//|  1. Set WebhookURL to your WP REST endpoint.                    |
//|  2. Set AuthToken to a WP Application Password                  |
//|     (Settings → Users → Application Passwords).                 |
//|  3. Allow WebRequest for your domain in                         |
//|     Tools → Options → Expert Advisors.                          |
//+------------------------------------------------------------------+
#property copyright "SMC SuperFib"
#property version   "1.00"
#property strict

#include "MarketDataEngine.mqh"

input string WebhookURL  = "https://yoursite.com/wp-json/sniper/v1/snapshot";
input string AuthToken   = "";          // WP Application Password (user:token)
input int    TimerSec    = 10;          // OnPeriodic interval in seconds
input string Symbols     = "EURUSD,GBPUSD,XAUUSD,USDJPY,GBPJPY,AUDUSD";

MarketDataEngine engine;

int OnInit()
{
    // Parse comma-separated symbol list
    string symArray[];
    int count = StringSplit(Symbols, ',', symArray);
    if (count <= 0)
    {
        Print("SMC_MarketDataEA: no symbols configured");
        return INIT_FAILED;
    }

    string auth = (StringLen(AuthToken) > 0)
                  ? "Authorization: Basic " + AuthToken + "\r\n"
                  : "";

    if (!engine.Initialize(symArray, count, WebhookURL, auth))
    {
        Print("SMC_MarketDataEA: engine init failed");
        return INIT_FAILED;
    }

    EventSetTimer(TimerSec);
    Print("SMC_MarketDataEA: started, monitoring ", count, " symbols");
    return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
    EventKillTimer();
}

void OnTick()
{
    // In MQL5, Bid/Ask/Volume are not global variables — use MqlTick struct
    MqlTick tick;
    if (!SymbolInfoTick(Symbol(), tick))
        return;

    engine.OnTick(Symbol(), tick.bid, tick.ask, tick.time, tick.volume);
}

void OnTimer()
{
    engine.OnPeriodic();
}
