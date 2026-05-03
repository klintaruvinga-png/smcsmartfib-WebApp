#ifndef SYMBOL_NORMALIZER_MQH
#define SYMBOL_NORMALIZER_MQH

//+------------------------------------------------------------------+
//| SymbolNormalizer Class                                           |
//+------------------------------------------------------------------+
class SymbolNormalizer
{
private:
    string knownSymbols[50];  // List of known valid symbols
    int knownCount;

public:
    // Constructor
    SymbolNormalizer()
    {
        knownCount = 0;
        // Initialize known symbols
        AddKnownSymbol("EURUSD");
        AddKnownSymbol("GBPUSD");
        AddKnownSymbol("AUDUSD");
        AddKnownSymbol("NZDUSD");
        AddKnownSymbol("USDJPY");
        AddKnownSymbol("AUDJPY");
        AddKnownSymbol("XAUUSD");
        AddKnownSymbol("XAGUSD");
        AddKnownSymbol("US30");
        AddKnownSymbol("NAS100");
        AddKnownSymbol("BTCUSD");
        AddKnownSymbol("ETHUSD");
        // Add more as needed
    }

    // Destructor
    ~SymbolNormalizer() {}

    // Normalize symbol
    string NormalizeSymbol(string symbol)
    {
        string normalized = ToUpperCase(symbol);
        normalized = StripSuffixes(normalized);
        if (StringLen(normalized) > 12)
            normalized = StringSubstr(normalized, 0, 12);
        return normalized;
    }

    // Validate symbol
    bool IsValidSymbol(string symbol)
    {
        string normalized = NormalizeSymbol(symbol);
        return IsKnownSymbol(normalized);
    }

    // Strip suffixes/prefixes
    string StripSuffixes(string symbol)
    {
        // Remove common suffixes
        string suffixes[] = {".A", ".PRO", "M", ".MICRO"};
        for (int i = 0; i < ArraySize(suffixes); i++)
        {
            int pos = StringFind(symbol, suffixes[i]);
            if (pos != -1)
                symbol = StringSubstr(symbol, 0, pos);
        }
        // Remove prefixes
        if (StringGetChar(symbol, 0) == 'A' || StringGetChar(symbol, 0) == 'a')
            symbol = StringSubstr(symbol, 1);
        return symbol;
    }

    // Convert to uppercase
    string ToUpperCase(string symbol)
    {
        string upper = "";
        for (int i = 0; i < StringLen(symbol); i++)
        {
            ushort ch = StringGetChar(symbol, i);
            if (ch >= 'a' && ch <= 'z')
                ch -= 32;
            upper += CharToString(ch);
        }
        return upper;
    }

    // Check against known list
    bool IsKnownSymbol(string symbol)
    {
        for (int i = 0; i < knownCount; i++)
        {
            if (knownSymbols[i] == symbol)
                return true;
        }
        return false;
    }

private:
    void AddKnownSymbol(string symbol)
    {
        if (knownCount < 50)
        {
            knownSymbols[knownCount] = symbol;
            knownCount++;
        }
    }
};

#endif // SYMBOL_NORMALIZER_MQH