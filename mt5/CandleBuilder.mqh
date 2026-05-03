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
    int candleIndices[100];          // Current index per symbol
    datetime lastCandleTime[100];    // Last candle time per symbol
    string symbolList[100];
    int symbolCount;

    // Current candle being built
    MqlRates currentCandles[100];

public:
    // Constructor
    CandleBuilder()
    {
        symbolCount = 0;
        ArrayInitialize(candleIndices, 0);
        ArrayInitialize(lastCandleTime, 0);
        ArrayInitialize(currentCandles, 0);
    }

    // Destructor
    ~CandleBuilder() {}

    // Build M1 candle from ticks
    void BuildCandleM1(string symbol, TickProcessor& tickProcessor)
    {
        int index = GetSymbolIndex(symbol);
        if (index == -1)
            index = AddSymbol(symbol);

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
                candleIndices[index] = (candleIndices[index] + 1) % 500;
            }

            // Initialize new candle
            currentCandles[index].time = candleTime;
            currentCandles[index].open = tick.bid;
            currentCandles[index].high = tick.bid;
            currentCandles[index].low = tick.bid;
            currentCandles[index].close = tick.bid;
            currentCandles[index].tick_volume = tick.volume;
            currentCandles[index].spread = (int)((tick.ask - tick.bid) * 100000);  // Assuming 5-digit
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
        candleIndices[index] = (candleIndices[index] + 1) % 500;
    }

    // Validate candle
    bool ValidateCandle(MqlRates& candle)
    {
        return candle.tick_volume > 0 && candle.high >= candle.low;
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