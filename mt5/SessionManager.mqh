#ifndef SESSION_MANAGER_MQH
#define SESSION_MANAGER_MQH

//+------------------------------------------------------------------+
//| Session States                                                   |
//+------------------------------------------------------------------+
enum ENUM_SESSION_STATE
{
    SESSION_CLOSED,
    SESSION_SYDNEY,
    SESSION_TOKYO,
    SESSION_LONDON,
    SESSION_NEWYORK,
    SESSION_OVERLAP,
    SESSION_WEEKEND
};

const string CRYPTO_SYMBOL_PREFIXES[] =
{
    "BTC",
    "ETH",
    "LTC",
    "XRP",
    "BNB",
    "SOL",
    "ADA",
    "DOGE"
};

//+------------------------------------------------------------------+
//| SessionManager Class                                             |
//| Session boundaries are evaluated in UTC after converting broker  |
//| server time to UTC.                                              |
//+------------------------------------------------------------------+
class SessionManager
{
private:
    ENUM_SESSION_STATE currentSession;
    bool isHoliday;

public:
    SessionManager()
    {
        currentSession = SESSION_CLOSED;
        isHoliday = false;
    }

    ~SessionManager() {}

    void UpdateSession(datetime serverTime)
    {
        currentSession = ResolveSessionStateForSymbol("", serverTime);
    }

    bool IsMarketOpen()
    {
        return currentSession != SESSION_CLOSED && currentSession != SESSION_WEEKEND;
    }

    bool IsMarketOpenForSymbol(string symbol, datetime serverTime = 0)
    {
        if (IsCryptoSymbol(symbol))
            return true;

        ENUM_SESSION_STATE session = ResolveSessionStateForSymbol(symbol, serverTime <= 0 ? TimeCurrent() : serverTime);
        return session != SESSION_CLOSED && session != SESSION_WEEKEND;
    }

    bool IsHighLiquidity()
    {
        return currentSession == SESSION_OVERLAP
            || currentSession == SESSION_LONDON
            || currentSession == SESSION_NEWYORK;
    }

    ENUM_SESSION_STATE GetCurrentSession()
    {
        return currentSession;
    }

    ENUM_SESSION_STATE GetCurrentSessionForSymbol(string symbol, datetime serverTime = 0)
    {
        return ResolveSessionStateForSymbol(symbol, serverTime <= 0 ? TimeCurrent() : serverTime);
    }

    bool IsCryptoSymbol(string symbol)
    {
        string upper = symbol;
        StringToUpper(upper);

        for (int i = 0; i < ArraySize(CRYPTO_SYMBOL_PREFIXES); i++)
        {
            string prefix = CRYPTO_SYMBOL_PREFIXES[i];
            if (StringFind(upper, prefix) == 0)
                return true;
        }

        return false;
    }

    string GetSessionName()
    {
        return SessionNameFromState(currentSession);
    }

    string GetSessionNameForSymbol(string symbol, datetime serverTime = 0)
    {
        return SessionNameFromState(
            ResolveSessionStateForSymbol(symbol, serverTime <= 0 ? TimeCurrent() : serverTime)
        );
    }

    void SetHoliday(bool holiday)
    {
        isHoliday = holiday;
    }

    bool IsSessionTransition(datetime serverTime)
    {
        ENUM_SESSION_STATE before = currentSession;
        UpdateSession(serverTime);
        return currentSession != before;
    }

private:
    ENUM_SESSION_STATE ResolveSessionStateForSymbol(string symbol, datetime serverTime)
    {
        datetime utcTime = ToUtc(serverTime);

        if (isHoliday)
            return SESSION_CLOSED;

        if (IsEquityIndexSymbol(symbol) && !IsUsEquitySessionOpen(utcTime))
            return SESSION_CLOSED;

        return ResolveBaseSessionState(utcTime);
    }

    ENUM_SESSION_STATE ResolveBaseSessionState(datetime utcTime)
    {
        MqlDateTime dt;
        TimeToStruct(utcTime, dt);

        int dow  = dt.day_of_week;  // 0=Sunday, 6=Saturday
        int hour = dt.hour;

        if (dow == 6)
            return SESSION_WEEKEND;

        if (dow == 0)
            return (hour >= 22) ? SESSION_SYDNEY : SESSION_WEEKEND;

        if (dow == 5 && hour >= 22)
            return SESSION_WEEKEND;

        bool sydney  = (hour >= 22) || (hour < 6);
        bool tokyo   = (hour >= 0)  && (hour < 8);
        bool london  = (hour >= 7)  && (hour < 15);
        bool newYork = (hour >= 12) && (hour < 20);

        if (london && newYork)
            return SESSION_OVERLAP;
        if (london && tokyo)
            return SESSION_OVERLAP;
        if (london)
            return SESSION_LONDON;
        if (newYork)
            return SESSION_NEWYORK;
        if (tokyo)
            return SESSION_TOKYO;
        if (sydney)
            return SESSION_SYDNEY;
        return SESSION_CLOSED;
    }

    string SessionNameFromState(ENUM_SESSION_STATE session)
    {
        switch (session)
        {
            case SESSION_SYDNEY:   return "Sydney";
            case SESSION_TOKYO:    return "Tokyo";
            case SESSION_LONDON:   return "London";
            case SESSION_NEWYORK:  return "New York";
            case SESSION_OVERLAP:  return "Overlap";
            default:               return "Closed";
        }
    }

    datetime ToUtc(datetime serverTime)
    {
        datetime brokerUtcOffset = TimeCurrent() - TimeGMT();
        return serverTime - brokerUtcOffset;
    }

    bool IsEquityIndexSymbol(string symbol)
    {
        string upper = symbol;
        StringToUpper(upper);
        return StringFind(upper, "NAS100") >= 0 || StringFind(upper, "US30") >= 0;
    }

    bool IsUsEquitySessionOpen(datetime utcTime)
    {
        MqlDateTime dt;
        TimeToStruct(utcTime, dt);

        int dow = dt.day_of_week;
        if (dow == 0 || dow == 6)
            return false;

        int minutesUtc = dt.hour * 60 + dt.min;
        if (IsUsDstActive(utcTime))
            return minutesUtc >= 810 && minutesUtc < 1200;  // EDT: 13:30-20:00 UTC
        return minutesUtc >= 870 && minutesUtc < 1260;      // EST: 14:30-21:00 UTC
    }

    bool IsUsDstActive(datetime utcTime)
    {
        MqlDateTime now;
        TimeToStruct(utcTime, now);

        int month = now.mon;
        int day   = now.day;
        int hour  = now.hour;

        if (month < 3 || month > 11) return false;
        if (month > 3 && month < 11) return true;

        MqlDateTime first;
        first.year = now.year;
        first.mon  = month;
        first.day  = 1;
        first.hour = 0;
        first.min  = 0;
        first.sec  = 0;

        datetime dtFirst = StructToTime(first);
        MqlDateTime firstStruct;
        TimeToStruct(dtFirst, firstStruct);
        int dow1 = firstStruct.day_of_week;
        int firstSunday = (dow1 == 0) ? 1 : (1 + 7 - dow1);

        if (month == 3)
        {
            int secondSunday = firstSunday + 7;
            return day > secondSunday || (day == secondSunday && hour >= 7);
        }

        return day < firstSunday || (day == firstSunday && hour < 6);
    }
};

#endif // SESSION_MANAGER_MQH
