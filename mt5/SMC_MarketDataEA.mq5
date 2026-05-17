//+------------------------------------------------------------------+
//| SMC_MarketDataEA.mq5                                             |
//| Attach to one chart; engine monitors all symbols in Symbols[].  |
//|                                                                  |
//| Setup:                                                           |
//|  1. Set WebhookURL to your WP REST endpoint.                    |
//|  2. Set ApiKey to match SMC_SF_EA_API_KEY in wp-config.php.     |
//|  3. Set UserId to the WordPress user_id that owns the stream.   |
//|  4. Allow WebRequest for your domain in                         |
//|     Tools -> Options -> Expert Advisors.                        |
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
input bool   DebugLog   = false; // Enable verbose per-tick logging (off in production to avoid log noise)
input string Symbols    = "EURUSD,GBPUSD,XAUUSD,USDJPY,GBPJPY,AUDUSD";

MarketDataEngine engine;
SymbolNormalizer g_symbolNormalizer;

// Module-level symbol list - OnTimer() needs it to poll non-chart symbols.
// OnTick() only fires for the chart symbol; without this loop every other
// symbol stays at FRESHNESS_DISCONNECTED permanently.
string g_symArray[];
int    g_symCount = 0;
string g_rawSymArray[];
int    g_rawSymCount = 0;
bool   g_configValid = true;
int    g_warnCounter = 0;

// Heartbeat throttle: SendHeartbeat() fires every g_heartbeatIntervalTicks OnTimer() calls.
// Initialised from the HeartbeatIntervalTicks input in OnInit() so the trader can tune it
// from the EA properties dialog without recompiling.
int    g_heartbeatTickCount     = 0;
int    g_heartbeatIntervalTicks = 6;

bool IsBlankInput(string value)
{
    StringTrimLeft(value);
    StringTrimRight(value);
    return StringLen(value) == 0;
}

string BuildConfigIssueSummary()
{
    string issues = "";

    if (IsBlankInput(WebhookURL))
        issues += "WebhookURL is empty; ";
    if (IsBlankInput(ApiKey))
        issues += "ApiKey is empty; ";
    if (UserId <= 0)
        issues += "UserId must be >= 1; ";

    if (StringLen(issues) >= 2)
        issues = StringSubstr(issues, 0, StringLen(issues) - 2);

    return issues;
}

bool TrySelectBrokerSymbol(string symbol)
{
    if (StringLen(symbol) == 0)
        return false;

    ResetLastError();
    if (!SymbolInfoInteger(symbol, SYMBOL_EXIST))
        return false;

    if (!SymbolSelect(symbol, true))
    {
        Print("SMC_MarketDataEA: SymbolSelect failed for ", symbol, " | error=", GetLastError());
        return false;
    }

    double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
    return point > 0;
}

bool ResolveBrokerSymbol(string configured, string& resolved)
{
    string token = configured;
    StringTrimLeft(token);
    StringTrimRight(token);
    if (StringLen(token) == 0)
        return false;

    string canonical = g_symbolNormalizer.NormalizeSymbol(token);
    if (TrySelectBrokerSymbol(token))
    {
        resolved = token;
        return true;
    }

    int total = SymbolsTotal(false);
    for (int i = 0; i < total; i++)
    {
        string candidate = SymbolName(i, false);
        if (g_symbolNormalizer.NormalizeSymbol(candidate) == canonical && TrySelectBrokerSymbol(candidate))
        {
            resolved = candidate;
            return true;
        }
    }

    total = SymbolsTotal(true);
    for (int j = 0; j < total; j++)
    {
        string selected = SymbolName(j, true);
        if (g_symbolNormalizer.NormalizeSymbol(selected) == canonical && TrySelectBrokerSymbol(selected))
        {
            resolved = selected;
            return true;
        }
    }

    return false;
}

int OnInit()
{
    g_configValid = true;
    g_warnCounter = 0;

    string webhookUrl = WebhookURL;
    string apiKey     = ApiKey;
    StringTrimLeft(webhookUrl);
    StringTrimRight(webhookUrl);
    StringTrimLeft(apiKey);
    StringTrimRight(apiKey);

    // Soft-validate user config so the EA can still attach and run its timer.
    if (StringLen(webhookUrl) == 0)
    {
        Print("WARNING: SMC_MarketDataEA WebhookURL is empty. EA will attach, but backend sends are disabled until you set WebhookURL in Inputs and re-attach the EA.");
        g_configValid = false;
    }
    if (StringLen(apiKey) == 0)
    {
        Print("WARNING: SMC_MarketDataEA ApiKey is empty. EA will attach, but backend sends are disabled until you set ApiKey to match SMC_SF_EA_API_KEY in Inputs and re-attach the EA.");
        g_configValid = false;
    }
    if (UserId <= 0)
    {
        Print("WARNING: SMC_MarketDataEA UserId must be a valid WordPress user_id (>= 1). EA will attach, but backend sends are disabled until you correct UserId in Inputs and re-attach the EA.");
        g_configValid = false;
    }

    // Parse symbol list.
    g_rawSymCount = StringSplit(Symbols, ',', g_rawSymArray);
    if (g_rawSymCount <= 0)
    {
        Print("SMC_MarketDataEA: no symbols configured");
        return INIT_FAILED;
    }

    ArrayResize(g_symArray, g_rawSymCount);
    g_symCount = 0;

    // Resolve configured canonical symbols to broker symbols and select them.
    for (int i = 0; i < g_rawSymCount; i++)
    {
        StringTrimLeft(g_rawSymArray[i]);
        StringTrimRight(g_rawSymArray[i]);
        string resolved = "";
        if (ResolveBrokerSymbol(g_rawSymArray[i], resolved))
        {
            g_symArray[g_symCount++] = resolved;
            string canonical = g_symbolNormalizer.NormalizeSymbol(resolved);
            Print("SMC_MarketDataEA: symbol resolved configured=", g_rawSymArray[i],
                  " | broker=", resolved,
                  " | normalized=", canonical);
        }
        else
        {
            Print("SMC_MarketDataEA: unresolved symbol configured=", g_rawSymArray[i],
                  " | add/select the broker symbol in Market Watch or update Symbols input");
        }
    }

    if (g_symCount <= 0)
    {
        Print("SMC_MarketDataEA: no configured symbols could be resolved");
        return INIT_FAILED;
    }

    // Build the full auth header line - engine stores and reuses it.
    // Header name MUST match what PHP reads: get_header('x_ea_api_key')
    string auth = "";
    if (StringLen(apiKey) > 0)
        auth = "X-EA-API-Key: " + apiKey;

    if (!engine.Initialize(g_symArray, g_symCount, webhookUrl, auth, UserId))
    {
        Print("SMC_MarketDataEA: engine init failed");
        return INIT_FAILED;
    }

    // REGRESSION GUARD: license-check inversion is a hard failure mode.
    // Gate reads: if (!SendLicenseCheck()) → INIT_FAILED.
    // NOT: if (SendLicenseCheck()) → INIT_FAILED.
    if (!engine.SendLicenseCheck())
    {
        Print("[EA] License check denied or timed out. EA will not start.");
        return INIT_FAILED;
    }

    // Initial telemetry sync — soft gates, failure does not block startup.
    engine.SendAccountSync();
    engine.SendSymbolSync(g_symArray, g_symCount);

    g_heartbeatIntervalTicks = (HeartbeatIntervalTicks > 0) ? HeartbeatIntervalTicks : 6;
    EventSetTimer(TimerSec);
    if (!g_configValid)
    {
        Print("WARNING: SMC_MarketDataEA started with invalid backend config. ", BuildConfigIssueSummary(),
              ". Backend sends are disabled; update Inputs and re-attach the EA.");
    }
    Print("SMC_MarketDataEA: started, monitoring ", g_symCount, " resolved symbols");
    return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
    EventKillTimer();
}

void OnTick()
{
    // Real-time tick for the chart symbol - forward to engine immediately.
    MqlTick tick;
    if (!SymbolInfoTick(Symbol(), tick))
        return;

    engine.OnTick(Symbol(), tick.bid, tick.ask, tick.time, tick.volume);
}

void OnTimer()
{
    if (!g_configValid)
    {
        g_warnCounter++;
        if (g_warnCounter % 6 == 0)
        {
            Print("WARNING: SMC_MarketDataEA backend send is still disabled. ", BuildConfigIssueSummary(),
                  ". Update Inputs and re-attach the EA.");
        }
        return;
    }

    // Heartbeat throttle — soft gate, fires every g_heartbeatIntervalTicks invocations.
    // Counter resets to 0 after firing regardless of heartbeat success.
    g_heartbeatTickCount++;
    if (DebugLog)
        PrintFormat("DEBUG OnTimer: heartbeatTick=%d / interval=%d", g_heartbeatTickCount, g_heartbeatIntervalTicks);
    if (g_heartbeatTickCount >= g_heartbeatIntervalTicks)
    {
        g_heartbeatTickCount = 0;
        engine.SendHeartbeat();
    }

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
