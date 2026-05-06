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

public:
    SymbolNormalizer()
    {
        knownCount       = 0;
        multiSuffixCount = 0;

        // Known broker suffixes (longest first to avoid partial stripping)
        multiSuffixes[multiSuffixCount++] = ".MICRO";
        multiSuffixes[multiSuffixCount++] = ".PRO";
        multiSuffixes[multiSuffixCount++] = ".ECN";
        multiSuffixes[multiSuffixCount++] = ".STP";
        multiSuffixes[multiSuffixCount++] = ".RAW";
        multiSuffixes[multiSuffixCount++] = ".A";
        multiSuffixes[multiSuffixCount++] = ".B";
        multiSuffixes[multiSuffixCount++] = ".C";

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
        // Oil
        AddKnownSymbol("USOIL");
        AddKnownSymbol("UKOIL");
    }

    ~SymbolNormalizer() {}

    string NormalizeSymbol(string symbol)
    {
        string normalized = ToUpperCase(symbol);
        normalized = StripSuffixes(normalized);

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
};

#endif // SYMBOL_NORMALIZER_MQH
