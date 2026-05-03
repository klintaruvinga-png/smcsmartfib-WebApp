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
//+------------------------------------------------------------------+
class SessionManager
{
private:
    ENUM_SESSION_STATE currentSession;
    datetime sessionStartTimes[7];  // Start times for each session (UTC)
    datetime sessionEndTimes[7];
    bool isHoliday;
    MqlDateTime dt;

public:
    // Constructor
    SessionManager()
    {
        currentSession = SESSION_CLOSED;
        isHoliday = false;

        // Initialize session times (UTC, example for Monday)
        // Sydney: 22:00 Sun - 06:00 Mon
        sessionStartTimes[0] = StringToTime("22:00");  // Sunday
        sessionEndTimes[0] = StringToTime("06:00") + 86400;  // Monday

        // Tokyo: 00:00 - 08:00 Mon
        sessionStartTimes[1] = StringToTime("00:00") + 86400;
        sessionEndTimes[1] = StringToTime("08:00") + 86400;

        // London: 07:00 - 15:00 Mon
        sessionStartTimes[2] = StringToTime("07:00") + 86400;
        sessionEndTimes[2] = StringToTime("15:00") + 86400;

        // New York: 12:00 - 20:00 Mon
        sessionStartTimes[3] = StringToTime("12:00") + 86400;
        sessionEndTimes[3] = StringToTime("20:00") + 86400;

        // Add more sessions as needed
    }

    // Destructor
    ~SessionManager() {}

    // Update session state
    void UpdateSession(datetime currentTime)
    {
        if (isHoliday)
        {
            currentSession = SESSION_CLOSED;
            return;
        }

        TimeToStruct(currentTime, dt);
        int dow = dt.day_of_week;  // 0=Sunday

        if (dow == 0 || dow == 6)  // Weekend
        {
            currentSession = SESSION_WEEKEND;
            return;
        }

        // Adjust for day of week
        datetime dayStart = currentTime - (dt.hour * 3600 + dt.min * 60 + dt.sec);
        datetime timeOfDay = currentTime - dayStart;

        // Check each session
        if (timeOfDay >= sessionStartTimes[0] && timeOfDay < sessionEndTimes[0])
            currentSession = SESSION_SYDNEY;
        else if (timeOfDay >= sessionStartTimes[1] && timeOfDay < sessionEndTimes[1])
            currentSession = SESSION_TOKYO;
        else if (timeOfDay >= sessionStartTimes[2] && timeOfDay < sessionEndTimes[2])
            currentSession = SESSION_LONDON;
        else if (timeOfDay >= sessionStartTimes[3] && timeOfDay < sessionEndTimes[3])
            currentSession = SESSION_NEWYORK;
        else
            currentSession = SESSION_CLOSED;

        // Check for overlaps (simplified)
        // If in multiple, set to OVERLAP
    }

    // Check if market is open
    bool IsMarketOpen()
    {
        return currentSession != SESSION_CLOSED && currentSession != SESSION_WEEKEND;
    }

    // Get current session
    ENUM_SESSION_STATE GetCurrentSession()
    {
        return currentSession;
    }

    // Handle holidays
    void SetHoliday(bool holiday)
    {
        isHoliday = holiday;
    }

    // Detect session transitions
    bool IsSessionTransition()
    {
        // Implement transition detection logic
        return false;  // Placeholder
    }
};

#endif // SESSION_MANAGER_MQH