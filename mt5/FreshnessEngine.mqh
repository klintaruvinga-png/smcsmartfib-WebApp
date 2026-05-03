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

        lastTickTimes[index] = tickTime;
        stagnationTimers[index] = 0;

        // Determine freshness
        freshnessStates[index] = FRESHNESS_LIVE;  // Since we just got a tick
    }

    // Update freshness periodically
    void UpdatePeriodic()
    {
        datetime now = TimeCurrent();
        for (int i = 0; i < symbolCount; i++)
        {
            int secondsSinceTick = (int)(now - lastTickTimes[i]);
            stagnationTimers[i] = secondsSinceTick;

            if (secondsSinceTick < 30)
                freshnessStates[i] = FRESHNESS_LIVE;
            else if (secondsSinceTick < 300)
                freshnessStates[i] = FRESHNESS_DELAYED;
            else
                freshnessStates[i] = FRESHNESS_STALE;

            // Check session and connection
            if (!IsTerminalConnected())
                freshnessStates[i] = FRESHNESS_DISCONNECTED;
            // Session check would be integrated with SessionManager
        }
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
        return TerminalInfoInteger(TERMINAL_CONNECTED);
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