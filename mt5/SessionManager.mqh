#ifndef SESSION_MANAGER_MQH
#define SESSION_MANAGER_MQH

//+------------------------------------------------------------------+
//| Session States                                                    |
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

//+------------------------------------------------------------------+
//| SessionManager Class                                             |
//| All session boundaries are UTC hours.                            |
//|                                                                  |
//| Sydney   : Sun 22:00 – Mon 06:00  (wraps midnight)              |
//| Tokyo    : 00:00 – 08:00                                         |
//| London   : 07:00 – 15:00                                         |
//| New York : 12:00 – 20:00                                         |
//| Overlap  : London+Tokyo 07-08, London+NY 12-15                  |
//+------------------------------------------------------------------+
class SessionManager
{
private:
    ENUM_SESSION_STATE currentSession;
    bool isHoliday;
    MqlDateTime dt;

public:
    SessionManager()
    {
        currentSession = SESSION_CLOSED;
        isHoliday = false;
    }

    ~SessionManager() {}

    void UpdateSession(datetime utcTime)
    {
        if (isHoliday)
        {
            currentSession = SESSION_CLOSED;
            return;
        }

        TimeToStruct(utcTime, dt);
        int dow  = dt.day_of_week;  // 0=Sunday, 6=Saturday
        int hour = dt.hour;

        // Saturday is always closed market
        if (dow == 6)
        {
            currentSession = SESSION_WEEKEND;
            return;
        }

        // Sunday: market opens at 22:00 UTC (Sydney open)
        if (dow == 0)
        {
            currentSession = (hour >= 22) ? SESSION_SYDNEY : SESSION_WEEKEND;
            return;
        }

        // Friday: market closes at 22:00 UTC (New York close +2 h buffer)
        if (dow == 5 && hour >= 22)
        {
            currentSession = SESSION_WEEKEND;
            return;
        }

        // Intraday: determine session by UTC hour
        bool sydney   = (hour >= 22) || (hour < 6);
        bool tokyo    = (hour >= 0)  && (hour < 8);
        bool london   = (hour >= 7)  && (hour < 15);
        bool newYork  = (hour >= 12) && (hour < 20);

        // Overlaps take precedence (highest liquidity)
        if (london && newYork)
        {
            currentSession = SESSION_OVERLAP;
        }
        else if (london && tokyo)
        {
            currentSession = SESSION_OVERLAP;
        }
        else if (london)
        {
            currentSession = SESSION_LONDON;
        }
        else if (newYork)
        {
            currentSession = SESSION_NEWYORK;
        }
        else if (tokyo)
        {
            currentSession = SESSION_TOKYO;
        }
        else if (sydney)
        {
            currentSession = SESSION_SYDNEY;
        }
        else
        {
            currentSession = SESSION_CLOSED;
        }
    }

    bool IsMarketOpen()
    {
        return currentSession != SESSION_CLOSED && currentSession != SESSION_WEEKEND;
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

    string GetSessionName()
    {
        switch (currentSession)
        {
            case SESSION_SYDNEY:   return "Sydney";
            case SESSION_TOKYO:    return "Tokyo";
            case SESSION_LONDON:   return "London";
            case SESSION_NEWYORK:  return "New York";
            case SESSION_OVERLAP:  return "Overlap";
            case SESSION_WEEKEND:  return "Weekend";
            default:               return "Closed";
        }
    }

    void SetHoliday(bool holiday)
    {
        isHoliday = holiday;
    }

    bool IsSessionTransition(datetime utcTime)
    {
        ENUM_SESSION_STATE before = currentSession;
        UpdateSession(utcTime);
        return currentSession != before;
    }
};

#endif // SESSION_MANAGER_MQH
