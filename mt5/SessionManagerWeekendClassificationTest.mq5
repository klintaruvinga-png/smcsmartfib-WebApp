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
    bool ok = true;

    ok = AssertCondition(manager.IsCryptoSymbol("BTCUSD"), "BTCUSD must classify as crypto") && ok;
    ok = AssertCondition(manager.IsCryptoSymbol("ETHUSD"), "ETHUSD must classify as crypto") && ok;
    ok = AssertCondition(!manager.IsCryptoSymbol("EURUSD"), "EURUSD must not classify as crypto") && ok;
    ok = AssertCondition(!manager.IsCryptoSymbol("US500"), "US500 must not classify as crypto") && ok;
    ok = AssertCondition(manager.IsMarketOpenForSymbol("BTCUSD", saturdayServerTime), "BTCUSD must stay open on Saturday UTC") && ok;
    ok = AssertCondition(!manager.IsMarketOpenForSymbol("EURUSD", saturdayServerTime), "EURUSD must stay closed on Saturday UTC") && ok;
    ok = AssertCondition(!manager.IsMarketOpenForSymbol("US500", saturdayServerTime), "US500 Saturday classification must remain unchanged") && ok;

    if (!ok)
    {
        Print("SessionManager weekend classification checks failed");
        return;
    }

    Print("SessionManager weekend classification checks passed");
}
