#ifndef FRESHNESS_ENGINE_MQH
#define FRESHNESS_ENGINE_MQH

//+------------------------------------------------------------------+
//| Freshness States                                                 |
//+------------------------------------------------------------------+
enum ENUM_FRESHNESS_STATE
{
    FRESHNESS_LIVE,
    FRESHNESS_DELAYED,
    FRESHNESS_STALE,
    FRESHNESS_CLOSED,
    FRESHNESS_DISCONNECTED
};

//+------------------------------------------------------------------+
//| FreshnessEngine Class                                            |
//+------------------------------------------------------------------+
class FreshnessEngine
{
private:
    ENUM_FRESHNESS_STATE freshnessStates[100];  // Per symbol, assume max 100 symbols
    datetime lastTickTimes[100];
    int stagnationTimers[100];
    string symbolList[100];
    int symbolCount;

public:
    // Constructor
    FreshnessEngine()
    {
        symbolCount = 0;
        ArrayInitialize(freshnessStates, FRESHNESS_DISCONNECTED);
        ArrayInitialize(lastTickTimes, 0);
        ArrayInitialize(stagnationTimers, 0);
    }

    // Destructor
    ~FreshnessEngine() {}

    // Update freshness on tick
    void UpdateOnTick(string symbol, datetime tickTime)
    {
        int index = GetSymbolIndex(symbol);
        if (index == -1)
            index = AddSymbol(symbol);
        // HARDENING: AddSymbol() returns -1 when the 100-symbol capacity is full.
        // Guard here so callers never use index -1 for out-of-bounds array access.
        if (index == -1)
        {
            Print("FreshnessEngine: capacity full, skipping symbol: ", symbol);
            return;
        }

        lastTickTimes[index] = tickTime;
        stagnationTimers[index] = 0;
        freshnessStates[index] = FRESHNESS_LIVE;
    }

    // Update freshness periodically for all known symbols.
    // Pass is_market_open=false during weekends/holidays so symbols transition
    // to FRESHNESS_CLOSED rather than incorrectly aging into FRESHNESS_STALE.
    void UpdatePeriodic(bool is_market_open = true)
    {
        datetime now = TimeCurrent();
        for (int i = 0; i < symbolCount; i++)
            UpdateSymbolPeriodic(symbolList[i], is_market_open, now);
    }

    // Update one symbol using the canonical MT5 thresholds:
    // LIVE < 30s, DELAYED < 300s, STALE >= 300s, CLOSED outside session hours.
    void UpdateSymbolPeriodic(string symbol, bool is_market_open = true, datetime now = 0)
    {
        int index = GetSymbolIndex(symbol);
        if (index == -1)
            index = AddSymbol(symbol);
        if (index == -1)
        {
            Print("FreshnessEngine: capacity full, skipping periodic update for symbol: ", symbol);
            return;
        }

        if (now <= 0)
            now = TimeCurrent();

        // HARDENING: disconnected terminal always wins - no live data possible.
        if (!IsTerminalConnected())
        {
            freshnessStates[index] = FRESHNESS_DISCONNECTED;
            stagnationTimers[index] = (int)(now - lastTickTimes[index]);
            return;
        }

        // HARDENING: propagate CLOSED state from session manager so market-closed
        // symbols are not misrepresented as STALE during weekends/holidays/off-hours.
        if (!is_market_open)
        {
            freshnessStates[index] = FRESHNESS_CLOSED;
            stagnationTimers[index] = (int)(now - lastTickTimes[index]);
            return;
        }

        int secondsSinceTick = (int)(now - lastTickTimes[index]);
        stagnationTimers[index] = secondsSinceTick;

        if (secondsSinceTick < 30)
            freshnessStates[index] = FRESHNESS_LIVE;
        else if (secondsSinceTick < 300)
            freshnessStates[index] = FRESHNESS_DELAYED;
        else
            freshnessStates[index] = FRESHNESS_STALE;
    }

    // Get freshness state
    ENUM_FRESHNESS_STATE GetFreshnessState(string symbol)
    {
        int index = GetSymbolIndex(symbol);
        if (index == -1)
            return FRESHNESS_DISCONNECTED;
        return freshnessStates[index];
    }

    // Check if terminal is connected
    bool IsTerminalConnected()
    {
        return TerminalInfoInteger(TERMINAL_CONNECTED) != 0;
    }

    // Aggregate account freshness
    ENUM_FRESHNESS_STATE GetAccountFreshness()
    {
        ENUM_FRESHNESS_STATE worst = FRESHNESS_LIVE;
        for (int i = 0; i < symbolCount; i++)
        {
            if (freshnessStates[i] > worst)
                worst = freshnessStates[i];
        }
        return worst;
    }

private:
    int GetSymbolIndex(string symbol)
    {
        for (int i = 0; i < symbolCount; i++)
        {
            if (symbolList[i] == symbol)
                return i;
        }
        return -1;
    }

    int AddSymbol(string symbol)
    {
        if (symbolCount < 100)
        {
            symbolList[symbolCount] = symbol;
            return symbolCount++;
        }
        return -1;
    }
};

#endif // FRESHNESS_ENGINE_MQH
