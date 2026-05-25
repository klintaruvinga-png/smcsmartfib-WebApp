#property script_show_inputs

#include "SessionManager.mqh"

datetime UtcToServerTime(int year, int month, int day, int hour, int minute = 0, int second = 0)
{
    MqlDateTime dt;
    dt.year = year;
    dt.mon = month;
    dt.day = day;
    dt.hour = hour;
    dt.min = minute;
    dt.sec = second;

    datetime utcTime = StructToTime(dt);
    datetime brokerUtcOffset = TimeCurrent() - TimeGMT();
    return utcTime + brokerUtcOffset;
}

bool AssertCondition(bool condition, string message)
{
    if (!condition)
    {
        Print("FAIL: ", message);
        return false;
    }

    Print("PASS: ", message);
    return true;
}

void OnStart()
{
    SessionManager manager;
    datetime saturdayServerTime = UtcToServerTime(2026, 5, 23, 12, 0, 0);
    datetime sundayPreOpenServerTime = UtcToServerTime(2026, 5, 24, 20, 59, 0);
    datetime sundayPostOpenServerTime = UtcToServerTime(2026, 5, 24, 21, 1, 0);
    datetime mondayServerTime = UtcToServerTime(2026, 5, 25, 9, 0, 0);
    datetime fridayCloseServerTime = UtcToServerTime(2026, 5, 22, 21, 1, 0);
    bool ok = true;

    ok = AssertCondition(!manager.IsMarketOpenForSymbol("EURUSD", saturdayServerTime), "EURUSD must stay closed on Saturday UTC") && ok;
    ok = AssertCondition(manager.IsMarketOpenForSymbol("BTCUSD", saturdayServerTime), "BTCUSD must stay open on Saturday UTC") && ok;
    ok = AssertCondition(!manager.IsMarketOpenForSymbol("EURUSD", sundayPreOpenServerTime), "EURUSD must stay closed before Sunday FX reopen") && ok;
    ok = AssertCondition(manager.IsMarketOpenForSymbol("EURUSD", sundayPostOpenServerTime), "EURUSD must reopen after Sunday 21:00 UTC") && ok;
    ok = AssertCondition(manager.IsMarketOpenForSymbol("EURUSD", mondayServerTime), "EURUSD must stay open on Monday UTC") && ok;
    ok = AssertCondition(manager.IsMarketOpenForSymbol("BTCUSD", mondayServerTime), "BTCUSD must stay open on Monday UTC") && ok;
    ok = AssertCondition(!manager.IsMarketOpenForSymbol("EURUSD", fridayCloseServerTime), "EURUSD must stay closed after Friday 21:00 UTC") && ok;

    if (!ok)
    {
        Print("SessionManager market-open checks failed");
        return;
    }

    Print("SessionManager market-open checks passed");
}
