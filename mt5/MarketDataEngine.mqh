#ifndef MARKET_DATA_ENGINE_MQH
#define MARKET_DATA_ENGINE_MQH

#include "TickProcessor.mqh"
#include "CandleBuilder.mqh"
#include "SessionManager.mqh"
#include "FreshnessEngine.mqh"
#include "SymbolNormalizer.mqh"

//+------------------------------------------------------------------+
//| MarketDataEngine Class                                           |
//+------------------------------------------------------------------+
class MarketDataEngine
{
private:
    TickProcessor* tickProcessor;
    CandleBuilder* candleBuilder;
    SessionManager* sessionManager;
    FreshnessEngine* freshnessEngine;
    SymbolNormalizer* symbolNormalizer;

    string symbols[100];  // Array of active symbols
    int symbolCount;

public:
    // Constructor
    MarketDataEngine()
    {
        tickProcessor = new TickProcessor();
        candleBuilder = new CandleBuilder();
        sessionManager = new SessionManager();
        freshnessEngine = new FreshnessEngine();
        symbolNormalizer = new SymbolNormalizer();
        symbolCount = 0;
    }

    // Destructor
    ~MarketDataEngine()
    {
        delete tickProcessor;
        delete candleBuilder;
        delete sessionManager;
        delete freshnessEngine;
        delete symbolNormalizer;
    }

    // Initialization
    bool Initialize(string& activeSymbols[], int count)
    {
        symbolCount = count;
        for (int i = 0; i < count && i < 100; i++)
        {
            symbols[i] = activeSymbols[i];
        }
        return true;
    }

    // Main processing
    void OnTick(string symbol, double bid, double ask, datetime timestamp, long volume)
    {
        // Normalize symbol
        string normalized = symbolNormalizer.NormalizeSymbol(symbol);

        // Process tick
        tickProcessor.ProcessTick(normalized, bid, ask, timestamp, volume);

        // Update freshness
        freshnessEngine.UpdateOnTick(normalized, timestamp);

        // Update session
        sessionManager.UpdateSession(timestamp);

        // Build candle
        candleBuilder.BuildCandleM1(normalized, *tickProcessor);
    }

    // Getters
    string GetNormalizedSymbol(string symbol)
    {
        return symbolNormalizer.NormalizeSymbol(symbol);
    }

    ENUM_FRESHNESS_STATE GetFreshnessState(string symbol)
    {
        string normalized = symbolNormalizer.NormalizeSymbol(symbol);
        return freshnessEngine.GetFreshnessState(normalized);
    }

    ENUM_SESSION_STATE GetSessionState()
    {
        return sessionManager.GetCurrentSession();
    }

    bool GetCandleM1(string symbol, MqlRates& candle)
    {
        string normalized = symbolNormalizer.NormalizeSymbol(symbol);
        return candleBuilder.GetCandle(normalized, PERIOD_M1, 0, candle);
    }

    // Data transmission
    bool SendToBackend(string symbol)
    {
        // Placeholder for webhook sending logic
        // Would serialize data and send to PHP backend
        return true;
    }
};

#endif // MARKET_DATA_ENGINE_MQH