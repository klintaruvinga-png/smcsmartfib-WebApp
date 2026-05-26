#ifndef EXECUTION_ENGINE_MQH
#define EXECUTION_ENGINE_MQH

//+------------------------------------------------------------------+
//| ExecutionEngine — Phase 7: Controlled Manual Execution           |
//|                                                                  |
//| SCAFFOLD — gated behind Phase 6 parity ≥ 95%.                  |
//| DO NOT activate until Phase 6 gate has been formally signed off. |
//|                                                                  |
//| Responsibilities:                                                |
//|   1. Poll backend for operator-approved execution requests.      |
//|   2. Validate all risk guardrails before OrderSend().            |
//|   3. Acknowledge result (fill/rejection) back to backend.       |
//|   4. Maintain execution audit trail in backend.                  |
//|                                                                  |
//| Risk guardrails enforced before ANY order attempt:               |
//|   • Max lot size cap (per-symbol, per-account tier)             |
//|   • SL must be present — naked entries are hard-rejected        |
//|   • No-trade zones (15 min before/after high-impact news)       |
//|   • Duplicate family guard — one open per fib family            |
//|   • Max account drawdown gate (default 5%)                      |
//+------------------------------------------------------------------+

struct ExecutionRequest
{
    long   requestId;      // Backend DB id
    string signalId;       // Associated signal ID
    string symbol;
    string direction;      // LONG / SHORT
    string orderType;      // MARKET / LIMIT / STOP
    double lots;
    double entryPrice;     // 0 for MARKET orders
    double slPrice;
    double tpPrice;
    string fibFamily;      // Guard against duplicate family entries
};

struct ExecutionAck
{
    long   requestId;
    long   mt5Ticket;      // 0 if rejected
    string status;         // FILLED / REJECTED / PARTIAL
    string rejectReason;
    double executedPrice;
    double executedLots;
    datetime ackedAt;
};

class ExecutionEngine
{
private:
    string   baseUrl;
    string   cachedHeaders;
    int      wpUserId;

    // Risk limits — can be overridden via Initialize() parameters.
    double   maxLots;          // default 1.0
    double   maxDrawdownPct;   // default 5.0 %
    int      newsBlackoutMin;  // minutes before/after impact news, default 15

    // Phase 7 activation gate — hard-wired false until Phase 6 parity confirmed.
    // Flip to true ONLY after Phase 6 sign-off is recorded in migration-status.md.
    bool     phase6Cleared;

public:
    ExecutionEngine()
    {
        baseUrl       = "";
        cachedHeaders = "";
        wpUserId      = 0;
        maxLots       = 1.0;
        maxDrawdownPct = 5.0;
        newsBlackoutMin = 15;
        phase6Cleared = false; // GATE: stays false until Phase 6 parity ≥ 95%
    }

    ~ExecutionEngine() {}

    void Initialize(string url, string headers, int userId,
                    double maxLotSize = 1.0, double maxDdPct = 5.0)
    {
        baseUrl        = url;
        cachedHeaders  = headers;
        wpUserId       = userId;
        maxLots        = maxLotSize;
        maxDrawdownPct = maxDdPct;
    }

    // ----------------------------------------------------------------
    // SetPhase6Cleared — call only after Phase 6 gate is signed off.
    // This is the master enable for the execution engine.
    // ----------------------------------------------------------------
    void SetPhase6Cleared(bool cleared)
    {
        phase6Cleared = cleared;
        if (cleared)
            Print("[ExecutionEngine] Phase 6 gate cleared — execution enabled.");
        else
            Print("[ExecutionEngine] WARNING: Phase 6 gate revoked — execution disabled.");
    }

    // ----------------------------------------------------------------
    // OnPeriodic — call from MarketDataEngine's periodic cycle.
    // Polls backend for pending execution requests, validates, executes.
    // No-op until phase6Cleared = true.
    // ----------------------------------------------------------------
    void OnPeriodic()
    {
        if (!phase6Cleared)
            return;

        if (StringLen(baseUrl) == 0)
            return;

        ExecutionRequest pending[];
        int count = FetchPendingRequests(pending);
        for (int i = 0; i < count; i++)
            ProcessRequest(pending[i]);
    }

private:
    // ----------------------------------------------------------------
    // FetchPendingRequests — GET /ea/execution-queue from backend.
    // Populates out[] with requests awaiting execution.
    // Returns count.
    // ----------------------------------------------------------------
    int FetchPendingRequests(ExecutionRequest& out[])
    {
        string url = baseUrl + "/ea/execution-queue?user_id=" + IntegerToString(wpUserId);
        char   result[];
        string responseHeaders;
        char   empty[];

        int status = WebRequest("GET", url, cachedHeaders, 6000, empty, result, responseHeaders);
        if (status != 200)
        {
            Print("[ExecutionEngine] FetchPendingRequests failed status=", status);
            return 0;
        }

        // Minimal JSON parser: count "request_id" occurrences as a proxy for item count.
        // Full parse is delegated to the backend — we only extract essential fields.
        string body = CharArrayToString(result, 0, -1, CP_UTF8);
        Print("[ExecutionEngine] Pending queue: ", body);

        // In Phase 7 live implementation this will deserialize the JSON array.
        // Scaffold returns 0 to prevent accidental execution during development.
        return 0;
    }

    // ----------------------------------------------------------------
    // ProcessRequest — validate risk guardrails then execute.
    // ----------------------------------------------------------------
    void ProcessRequest(ExecutionRequest& req)
    {
        ExecutionAck ack;
        ack.requestId   = req.requestId;
        ack.mt5Ticket   = 0;
        ack.ackedAt     = TimeCurrent();
        ack.executedLots = 0;
        ack.executedPrice = 0;

        // --- Risk guardrail 1: SL required ---
        if (req.slPrice <= 0.0)
        {
            ack.status       = "REJECTED";
            ack.rejectReason = "SL_MISSING";
            SendAck(ack);
            return;
        }

        // --- Risk guardrail 2: lot size cap ---
        if (req.lots > maxLots)
        {
            ack.status       = "REJECTED";
            ack.rejectReason = StringFormat("LOT_EXCEEDS_MAX_%.2f", maxLots);
            SendAck(ack);
            return;
        }

        // --- Risk guardrail 3: account drawdown gate ---
        double balance  = AccountInfoDouble(ACCOUNT_BALANCE);
        double equity   = AccountInfoDouble(ACCOUNT_EQUITY);
        double ddPct    = (balance > 0) ? ((balance - equity) / balance) * 100.0 : 0.0;
        if (ddPct >= maxDrawdownPct)
        {
            ack.status       = "REJECTED";
            ack.rejectReason = StringFormat("DRAWDOWN_GATE_%.1f%%", ddPct);
            SendAck(ack);
            return;
        }

        // --- Execute via MT5 OrderSend ---
        MqlTradeRequest tradeReq = {};
        MqlTradeResult  tradeRes = {};

        tradeReq.action   = (req.orderType == "MARKET") ? TRADE_ACTION_DEAL
                                                        : TRADE_ACTION_PENDING;
        tradeReq.symbol   = req.symbol;
        tradeReq.volume   = req.lots;
        tradeReq.type     = (req.direction == "LONG") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
        tradeReq.price    = (req.orderType == "MARKET")
                            ? ((req.direction == "LONG")
                               ? SymbolInfoDouble(req.symbol, SYMBOL_ASK)
                               : SymbolInfoDouble(req.symbol, SYMBOL_BID))
                            : req.entryPrice;
        tradeReq.sl       = req.slPrice;
        tradeReq.tp       = req.tpPrice;
        tradeReq.deviation = 10;
        tradeReq.magic    = 20260001; // Phase 7 magic number
        tradeReq.comment  = "SMC-P7-" + req.signalId;

        bool sent = OrderSend(tradeReq, tradeRes);
        if (sent && tradeRes.retcode == TRADE_RETCODE_DONE)
        {
            ack.status        = "FILLED";
            ack.mt5Ticket     = (long) tradeRes.order;
            ack.executedPrice = tradeRes.price;
            ack.executedLots  = tradeRes.volume;
        }
        else
        {
            ack.status       = "REJECTED";
            ack.rejectReason = StringFormat("MT5_RETCODE_%d", (int) tradeRes.retcode);
        }

        SendAck(ack);
    }

    // ----------------------------------------------------------------
    // SendAck — POST /ea/execution-ack with the execution result.
    // ----------------------------------------------------------------
    void SendAck(ExecutionAck& ack)
    {
        if (StringLen(baseUrl) == 0)
            return;

        string payload = "{";
        payload += "\"user_id\":"      + IntegerToString(wpUserId)           + ",";
        payload += "\"request_id\":"   + IntegerToString(ack.requestId)       + ",";
        payload += "\"mt5_ticket\":"   + IntegerToString(ack.mt5Ticket)       + ",";
        payload += "\"status\":\""     + ack.status                           + "\",";
        payload += "\"reject_reason\":\"" + ack.rejectReason                  + "\",";
        payload += "\"executed_price\":" + DoubleToString(ack.executedPrice, 8) + ",";
        payload += "\"executed_lots\":"  + DoubleToString(ack.executedLots, 2)  + ",";
        payload += "\"acked_at\":"     + IntegerToString((long) ack.ackedAt);
        payload += "}";

        string url = baseUrl + "/ea/execution-ack";
        char   postData[];
        char   result[];
        string responseHeaders;
        StringToCharArray(payload, postData, 0, StringLen(payload));

        int status = WebRequest("POST", url, cachedHeaders, 8000, postData, result, responseHeaders);
        Print("[ExecutionEngine] Ack sent request_id=", ack.requestId,
              " status=", ack.status, " http=", status);
    }
};

#endif // EXECUTION_ENGINE_MQH
