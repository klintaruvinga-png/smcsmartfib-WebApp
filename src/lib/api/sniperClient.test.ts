import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  clearCredentials: vi.fn(),
  getAuthHeader: vi.fn(() => null),
  getWordPressNonce: vi.fn(() => "test-nonce"),
}));

import { apiClient, fetchSoakReport, setBackendUrl } from "./sniperClient";

describe("fetchSoakReport", () => {
  beforeEach(() => {
    setBackendUrl("https://example.com/wp-json");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves the full soak report payload on HTTP 200", async () => {
    const payload = {
      health: {
        backendSync: "offline",
        priceFeed: "stale",
        feedStatus: "stale",
        engineRunState: "failed",
        twelveDataKey: "missing",
        twelveDataKeyStatus: "missing",
        lastBatchAt: null,
        lastEngineRunAt: null,
        perSymbolDiagnostics: [],
      },
      watchlist_count: 0,
      snapshots_24h: 0,
      candles_24h: 0,
      engine_runs_summary: {
        total_24h: 0,
        success_24h: 0,
        error_24h: 0,
        last_run_at: null,
      },
      audit_events_summary: {
        total_24h: 0,
        error_count_24h: 0,
        warning_count_24h: 0,
      },
      manual_evidence: [],
      baseline_checkpoint: {
        id: 3,
        checkpoint_type: "baseline",
        snapshot_data: {},
        operator_notes: null,
        created_at: "2026-05-11T08:00:00Z",
      },
      checkpoints: [],
      generated_at: "2026-05-11T08:05:00Z",
      seeded: true,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    await expect(fetchSoakReport()).resolves.toMatchObject({
      baseline_checkpoint: {
        id: 3,
        checkpoint_type: "baseline",
      },
      seeded: true,
    });
  });

  it("rejects with a surfaced backend error on HTTP 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: "table_init_failed", detail: "dbDelta unavailable" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
    );

    await expect(fetchSoakReport()).rejects.toThrow(
      /API \/admin\/soak-report failed: 500 - {"error":"table_init_failed","detail":"dbDelta unavailable"}/,
    );
  });
});

describe("Phase 2 telemetry client reads", () => {
  beforeEach(() => {
    setBackendUrl("https://example.com/wp-json");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads positions and orders from the new read-only endpoints without POSTing trade state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              position_id: "1001",
              symbol: "EURUSD",
              direction: "LONG",
              entry_price: 1.08,
              current_price: 1.081,
              volume: 0.5,
              profit: 125,
              opened_at: "2026-05-20T10:00:00Z",
              freshness: "live",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              order_id: "2001",
              symbol: "EURUSD",
              direction: "SHORT",
              order_type: "SELL_LIMIT",
              entry_price: 1.09,
              volume: 0.25,
              sl: 1.095,
              tp: 1.08,
              placed_at: "2026-05-20T10:05:00Z",
              freshness: "live",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await apiClient.getUserTrades(false);

    expect(result.positions).toHaveLength(1);
    expect(result.orders).toHaveLength(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/sniper/v1/positions"),
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/sniper/v1/orders"),
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("reads account telemetry from the backend-owned account endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            account_id: "32206603",
            terminal_id: "terminal-1",
            balance: 10000,
            equity: 10125,
            margin: 1000,
            free_margin: 9125,
            margin_level: 1012.5,
            floating_pl: 125,
            currency: "USC",
            leverage: 500,
            ea_version: "1.00",
            last_seen_at: "2026-05-20T10:15:00Z",
            updated_at: "2026-05-20T10:15:00Z",
            freshness: "live",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const telemetry = await apiClient.getAccountTelemetry(false);

    expect(telemetry).toMatchObject({
      accountId: "32206603",
      floatingPl: 125,
      state: "live",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/sniper/v1/account-telemetry"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("normalizes the /user/progress contract from snake_case to camelCase", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            equity_pulse: {
              equity_usc: 10125,
              today_pnl_usc: 48.5,
              state: "LIVE",
            },
            streak: {
              current_streak_days: 0,
              last_active_date: "2026-05-20",
              state: "UNAVAILABLE",
            },
            milestones: {
              first_heartbeat: true,
              first_market_stream: true,
              first_trade_telemetry: true,
              state: "LIVE",
            },
            generated_at: "2026-05-20T10:15:00Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const progress = await apiClient.getUserProgress(false);

    expect(progress).toMatchObject({
      equityPulse: {
        equityUSC: 10125,
        todayPnlUSC: 48.5,
        state: "LIVE",
      },
      streak: {
        currentStreakDays: 0,
        lastActiveDate: "2026-05-20",
        state: "UNAVAILABLE",
      },
      milestones: {
        firstHeartbeat: true,
        firstMarketStream: true,
        firstTradeTelemetry: true,
        state: "LIVE",
      },
      generatedAt: "2026-05-20T10:15:00Z",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/sniper/v1/user/progress"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("returns the typed mock user-progress payload in mock mode", async () => {
    await expect(apiClient.getUserProgress(true)).resolves.toMatchObject({
      equityPulse: {
        state: "LIVE",
      },
      streak: {
        state: "LIVE",
      },
      milestones: {
        state: "LIVE",
      },
    });
  });

  it("requests live signals with a cache-bust token and no-store fetch cache", async () => {
    const signals = [{ id: "EURUSD-LONG" }];
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ signals, polledAt: "2026-05-30T00:00:00+00:00" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient.getLiveSignals(false)).resolves.toEqual(signals);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/sniper\/v1\/live-signals\?_=\d+$/),
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
      }),
    );
  });
});

describe("ladders client contract", () => {
  beforeEach(() => {
    setBackendUrl("https://example.com/wp-json");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects malformed /ladders payloads instead of returning a non-array plan set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ plans: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    await expect(apiClient.getLadders(undefined, false)).rejects.toThrow(
      "/ladders: backend response missing ladder array",
    );
  });
});
