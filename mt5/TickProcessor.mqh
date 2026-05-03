#ifndef TICK_PROCESSOR_MQH
#define TICK_PROCESSOR_MQH

//+------------------------------------------------------------------+
//| Tick Data Structure                                              |
//+------------------------------------------------------------------+
struct TickData
{
    double bid;
    double ask;
    double spread;
    datetime timestamp;
    long volume;
};

//+------------------------------------------------------------------+
//| TickProcessor Class                                              |
//+------------------------------------------------------------------+
class TickProcessor
{
private:
    TickData lastTicks[100][1000];  // Last 1000 ticks per symbol (max 100 symbols)
    int tickIndices[100];           // Current index per symbol
    datetime lastTickTime[100];     // Last tick time per symbol
    string symbolList[100];
    int symbolCount;

public:
    // Constructor
    TickProcessor()
    {
        symbolCount = 0;
        ArrayInitialize(tickIndices, 0);
        ArrayInitialize(lastTickTime, 0);
    }

    // Destructor
    ~TickProcessor() {}

    // Process incoming tick
    void ProcessTick(string symbol, double bid, double ask, datetime timestamp, long volume)
    {
        int index = GetSymbolIndex(symbol);
        if (index == -1)
            index = AddSymbol(symbol);

        // Create tick data
        TickData tick;
        tick.bid = bid;
        tick.ask = ask;
        tick.spread = ask - bid;
        tick.timestamp = timestamp;
        tick.volume = volume;

        // Store tick
        lastTicks[index][tickIndices[index]] = tick;
        tickIndices[index] = (tickIndices[index] + 1) % 1000;

        lastTickTime[index] = timestamp;

        // Log or handle as needed
    }

    // Get last tick
    bool GetLastTick(string symbol, TickData& tick)
    {
        int index = GetSymbolIndex(symbol);
        if (index == -1)
            return false;

        int lastIndex = (tickIndices[index] - 1 + 1000) % 1000;
        tick = lastTicks[index][lastIndex];
        return true;
    }

    // Get tick history
    int GetTickHistory(string symbol, TickData& ticks[])
    {
        int index = GetSymbolIndex(symbol);
        if (index == -1)
            return 0;

        ArrayResize(ticks, 1000);
        for (int i = 0; i < 1000; i++)
        {
            int idx = (tickIndices[index] - 1 - i + 1000) % 1000;
            ticks[i] = lastTicks[index][idx];
        }
        return 1000;
    }

    // Reset stagnation timer
    void ResetStagnationTimer(string symbol)
    {
        int index = GetSymbolIndex(symbol);
        if (index != -1)
            lastTickTime[index] = TimeCurrent();
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

#endif // TICK_PROCESSOR_MQH