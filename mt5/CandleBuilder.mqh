#ifndef CANDLE_BUILDER_MQH
#define CANDLE_BUILDER_MQH

#include "TickProcessor.mqh"

//+------------------------------------------------------------------+
//| CandleBuilder Class                                              |
//+------------------------------------------------------------------+
class CandleBuilder
{
private:
    MqlRates candlesM1[100][500];   // M1 candles per symbol (last 500)
    int candleIndices[100];          // Next write index per symbol
    int candleCounts[100];           // Committed candle count per symbol, capped at 500
    datetime lastCandleTime[100];    // Last candle time per symbol
    string symbolList[100];
    int symbolCount;
    bool ringFull[100];   // true once candleIndices[i] has wrapped past 499

    // Current candle being built
    MqlRates currentCandles[100];

public:
    // Constructor
    CandleBuilder()
    {
        symbolCount = 0;
        ArrayInitialize(candleIndices, 0);
        ArrayInitialize(candleCounts, 0);
        ArrayInitialize(lastCandleTime, 0);
        ArrayInitialize(ringFull, false);
        ZeroMemory(currentCandles);   // ArrayInitialize doesn't support struct arrays
    }

    // Destructor
    ~CandleBuilder() {}

    // Build M1 candle from ticks
    void BuildCandleM1(string symbol, TickProcessor& tickProcessor)
    {
        int index = GetSymbolIndex(symbol);
        if (index == -1)
            index = AddSymbol(symbol);
        // HARDENING: AddSymbol() returns -1 when the 100-symbol capacity is full.
        // Guard so callers never use index -1 for out-of-bounds struct-array access.
        if (index == -1)
        {
            Print("CandleBuilder: capacity full, skipping symbol: ", symbol);
            return;
        }

        TickData tick;
        if (!tickProcessor.GetLastTick(symbol, tick))
            return;

        datetime currentTime = tick.timestamp;
        datetime candleTime = currentTime - (currentTime % 60);  // M1 boundary

        // If new candle period
        if (candleTime != lastCandleTime[index])
        {
            // Save previous candle if exists
            if (lastCandleTime[index] != 0)
            {
                candlesM1[index][candleIndices[index]] = currentCandles[index];
                int next = (candleIndices[index] + 1) % 500;
                if (next == 0) ringFull[index] = true;
                candleIndices[index] = next;
                if (candleCounts[index] < 500)
                    candleCounts[index]++;
            }

            // Initialize new candle
            currentCandles[index].time = candleTime;
            currentCandles[index].open = tick.bid;
            currentCandles[index].high = tick.bid;
            currentCandles[index].low = tick.bid;
            currentCandles[index].close = tick.bid;
            currentCandles[index].tick_volume = tick.volume;
            // HARDENING: Use SymbolInfoInteger for the correct point multiplier instead of
            // a hardcoded 100000 (5-digit assumption). JPY pairs and metals use different
            // point values; the hardcoded multiplier produces meaningless spread figures.
            double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
            currentCandles[index].spread = (point > 0) ? (int)MathRound((tick.ask - tick.bid) / point) : 0;
            currentCandles[index].real_volume = 0;

            lastCandleTime[index] = candleTime;
        }
        else
        {
            // Update current candle
            currentCandles[index].high = MathMax(currentCandles[index].high, tick.bid);
            currentCandles[index].low = MathMin(currentCandles[index].low, tick.bid);
            currentCandles[index].close = tick.bid;
            currentCandles[index].tick_volume += tick.volume;
        }
    }

    // Aggregate to higher timeframes
    void AggregateToTimeframe(string symbol, ENUM_TIMEFRAMES timeframe)
    {
        // Placeholder for aggregation logic
        // Would combine multiple M1 candles into higher TF
    }

    // Get candle
    bool GetCandle(string symbol, ENUM_TIMEFRAMES timeframe, int shift, MqlRates& candle)
    {
        if (timeframe != PERIOD_M1)
            return false;  // Only M1 implemented yet

        int index = GetSymbolIndex(symbol);
        if (index == -1)
            return false;

        int committed = candleIndices[index];
        if (!ringFull[index]) {
            // Ring not yet full: candleIndices is a direct count of committed bars.
            if (committed == 0)
                return false;  // cold start — no bar written yet
            if (shift >= committed)
                return false;  // shift requests older bar than history holds
        } else {
            // Ring is full: all 500 slots valid. Any shift 0–499 is safe.
            if (shift >= 500)
                return false;  // caller error — out of range
        }

        int candleIndex = (candleIndices[index] - 1 - shift + 500) % 500;
        candle = candlesM1[index][candleIndex];
        return true;
    }

    // Handle missing candles
    void CreateSyntheticCandle(string symbol, datetime timestamp)
    {
        int index = GetSymbolIndex(symbol);
        if (index == -1)
            return;

        MqlRates synthetic;
        synthetic.time = timestamp;
        synthetic.open = currentCandles[index].close;
        synthetic.high = currentCandles[index].close;
        synthetic.low = currentCandles[index].close;
        synthetic.close = currentCandles[index].close;
        synthetic.tick_volume = 0;
        synthetic.spread = 0;
        synthetic.real_volume = 0;

        candlesM1[index][candleIndices[index]] = synthetic;
        int nextIdx = (candleIndices[index] + 1) % 500;
        if (nextIdx == 0) ringFull[index] = true;
        candleIndices[index] = nextIdx;
        if (candleCounts[index] < 500)
            candleCounts[index]++;
    }

    // Validate candle
    bool ValidateCandle(MqlRates& candle)
    {
        // time > 0 : rejects zero-initialized structs (epoch / cold-start slots)
        //            and synthetic candles whose timestamp was never set.
        // tick_volume > 0 : rejects empty/placeholder bars.
        // high >= low : basic OHLC sanity.
        return candle.time > 0 && candle.tick_volume > 0 && candle.high >= candle.low;
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

#endif // CANDLE_BUILDER_MQH
