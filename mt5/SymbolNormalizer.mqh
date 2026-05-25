#ifndef SYMBOL_NORMALIZER_MQH
#define SYMBOL_NORMALIZER_MQH

//+------------------------------------------------------------------+
//| SymbolNormalizer Class                                           |
//|                                                                  |
//| Strips broker-specific suffixes and validates against the 28+   |
//| known symbols used by SMC SuperFib.                             |
//+------------------------------------------------------------------+
class SymbolNormalizer
{
private:
    string knownSymbols[50];
    int knownCount;

    // Multi-char suffix list: tried longest-first to avoid partial matches.
    // Single chars like "m" are intentionally excluded to prevent mangling
    // symbols such as XAUUSD or BTCUSD that don't end with those letters.
    string multiSuffixes[8];
    int multiSuffixCount;

    // Broker alias map: some brokers use non-standard ticker names (e.g. "GOLD"
    // instead of "XAUUSD"). An alias entry maps the broker name (uppercase) to
    // the canonical SMC SuperFib symbol name. Aliases are checked after the base
    // name is uppercased and after suffix stripping, so "GOLD.PRO" → strip ".PRO"
    // → "GOLD" → alias → "XAUUSD".
    string aliasKeys[20];
    string aliasVals[20];
    int    aliasCount;

public:
    SymbolNormalizer()
    {
        knownCount       = 0;
        multiSuffixCount = 0;
        aliasCount       = 0;

        // Known broker suffixes (longest first to avoid partial stripping)
        multiSuffixes[multiSuffixCount++] = ".MICRO";
        multiSuffixes[multiSuffixCount++] = ".PRO";
        multiSuffixes[multiSuffixCount++] = ".ECN";
        multiSuffixes[multiSuffixCount++] = ".STP";
        multiSuffixes[multiSuffixCount++] = ".RAW";
        multiSuffixes[multiSuffixCount++] = ".A";
        multiSuffixes[multiSuffixCount++] = ".B";
        multiSuffixes[multiSuffixCount++] = ".C";

        // Broker alias map — maps non-standard broker names to canonical symbols.
        // Checked after suffix-stripping so "GOLD.PRO" → "GOLD" → "XAUUSD".
        // Add entries here when a broker uses a different ticker for a known instrument.
        AddAlias("GOLD",            "XAUUSD");   // Common gold ticker (IC Markets, Exness, etc.)
        AddAlias("SILVER",          "XAGUSD");   // Common silver ticker
        AddAlias("US100",           "NAS100");   // NASDAQ alias used by some ECN/STP brokers
        AddAlias("NASDAQ",          "NAS100");
        AddAlias("NDX",             "NAS100");
        // Multi-word broker display names — checked on raw ToUpperCase output BEFORE the
        // 12-character truncation guard, so the full name matches reliably.
        AddAlias("US TECH 100",     "NAS100");   // GT Markets, some IC brokers
        AddAlias("WALL STREET 30",  "US30");     // GT Markets, some IC brokers
        AddAlias("WALL STREET",     "US30");     // Fallback: if ToUpperCase truncates at 12 chars
        AddAlias("DJ30",            "US30");     // Dow Jones alias
        AddAlias("DJI",             "US30");
        AddAlias("DOW30",           "US30");
        AddAlias("US500",           "SPX500");   // S&P 500 alias
        AddAlias("SPX",             "SPX500");
        // Deriv broker multi-word display names (additional to GT Markets aliases above)
        AddAlias("GERMANY 40",      "GER40");    // Deriv: "Germany 40"
        AddAlias("GERMANY40",       "GER40");    // stripped variant
        AddAlias("US SP 500",       "SPX500");   // Deriv: "US SP 500"
        AddAlias("USSP500",         "SPX500");   // stripped variant
        AddAlias("US SP500",        "SPX500");   // compact variant

        // FX majors / crosses
        AddKnownSymbol("EURUSD");
        AddKnownSymbol("GBPUSD");
        AddKnownSymbol("AUDUSD");
        AddKnownSymbol("NZDUSD");
        AddKnownSymbol("USDCAD");
        AddKnownSymbol("USDCHF");
        AddKnownSymbol("USDJPY");
        AddKnownSymbol("EURJPY");
        AddKnownSymbol("GBPJPY");
        AddKnownSymbol("AUDJPY");
        AddKnownSymbol("EURAUD");
        AddKnownSymbol("EURGBP");
        AddKnownSymbol("GBPAUD");
        AddKnownSymbol("GBPCAD");
        AddKnownSymbol("GBPCHF");
        AddKnownSymbol("AUDCAD");
        AddKnownSymbol("AUDCHF");
        AddKnownSymbol("AUDNZD");
        AddKnownSymbol("NZDJPY");
        AddKnownSymbol("CADCHF");
        AddKnownSymbol("CADJPY");
        AddKnownSymbol("CHFJPY");
        // Metals
        AddKnownSymbol("XAUUSD");
        AddKnownSymbol("XAGUSD");
        // Indices
        AddKnownSymbol("US30");
        AddKnownSymbol("NAS100");
        AddKnownSymbol("SPX500");
        AddKnownSymbol("UK100");
        AddKnownSymbol("GER40");
        // Crypto
        AddKnownSymbol("BTCUSD");
        AddKnownSymbol("ETHUSD");
        AddKnownSymbol("SOLUSD");   // Solana — present on user watchlist (Deriv)
        AddKnownSymbol("XRPUSD");
        AddKnownSymbol("BNBUSD");
        // Oil
        AddKnownSymbol("USOIL");
        AddKnownSymbol("UKOIL");
        // Macro / reference
        AddKnownSymbol("DXYUSD");   // US Dollar Index — present in EA Symbols (Deriv)
    }

    ~SymbolNormalizer() {}

    string NormalizeSymbol(string symbol)
    {
        string normalized = ToUpperCase(symbol);

        // Check alias map on raw uppercase name (e.g. "GOLD" → "XAUUSD").
        string direct = LookupAlias(normalized);
        if (StringLen(direct) > 0)
            return direct;

        normalized = StripSuffixes(normalized);

        // Check alias map after suffix strip (e.g. "GOLD.PRO" → "GOLD" → "XAUUSD").
        string stripped = LookupAlias(normalized);
        if (StringLen(stripped) > 0)
            return stripped;

        if (!IsKnownSymbol(normalized))
            normalized = StripCompactSuffixes(normalized);

        if (StringLen(normalized) > 12)
            normalized = StringSubstr(normalized, 0, 12);
        return normalized;
    }

    bool IsValidSymbol(string symbol)
    {
        return IsKnownSymbol(NormalizeSymbol(symbol));
    }


    string StripCompactSuffixes(string symbol)
    {
        string candidates[6];
        int n = 0;
        candidates[n++] = "RAW";
        candidates[n++] = "PRO";
        candidates[n++] = "ECN";
        candidates[n++] = "MICRO";
        candidates[n++] = "M";
        candidates[n++] = "C";

        for (int i = 0; i < n; i++)
        {
            int suffixLen = StringLen(candidates[i]);
            int pos = StringLen(symbol) - suffixLen;
            if (pos > 0 && StringSubstr(symbol, pos) == candidates[i])
            {
                string trimmed = StringSubstr(symbol, 0, pos);
                if (IsKnownSymbol(trimmed))
                    return trimmed;
            }
        }
        return symbol;
    }

    string StripSuffixes(string symbol)
    {
        // Strip known multi-char suffixes (dot-prefixed, e.g. ".PRO", ".MICRO")
        for (int i = 0; i < multiSuffixCount; i++)
        {
            int suffixLen = StringLen(multiSuffixes[i]);
            int pos       = StringLen(symbol) - suffixLen;
            if (pos > 0 && StringSubstr(symbol, pos) == multiSuffixes[i])
            {
                symbol = StringSubstr(symbol, 0, pos);
                break;  // One suffix at most
            }
        }
        return symbol;
    }

private:
    string ToUpperCase(string symbol)
    {
        string upper = "";
        for (int i = 0; i < StringLen(symbol); i++)
        {
            ushort ch = StringGetCharacter(symbol, i);  // StringGetChar removed in MQL5 build 2000+
            if (ch >= 'a' && ch <= 'z')
                ch -= 32;
            upper += CharToString((uchar)ch);           // CharToString takes uchar, not ushort
        }
        return upper;
    }

    bool IsKnownSymbol(string symbol)
    {
        for (int i = 0; i < knownCount; i++)
        {
            if (knownSymbols[i] == symbol)
                return true;
        }
        return false;
    }

    void AddKnownSymbol(string symbol)
    {
        if (knownCount < 50)
            knownSymbols[knownCount++] = symbol;
    }

    void AddAlias(string brokerName, string canonicalName)
    {
        if (aliasCount < 20)
        {
            aliasKeys[aliasCount] = brokerName;
            aliasVals[aliasCount] = canonicalName;
            aliasCount++;
        }
    }

    // Returns the canonical name if brokerName is in the alias map, else "".
    string LookupAlias(string brokerName)
    {
        for (int i = 0; i < aliasCount; i++)
        {
            if (aliasKeys[i] == brokerName)
                return aliasVals[i];
        }
        return "";
    }
};

#endif // SYMBOL_NORMALIZER_MQH
