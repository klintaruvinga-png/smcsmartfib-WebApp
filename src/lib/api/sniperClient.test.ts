import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  clearCredentials: vi.fn(),
  getAuthHeader: vi.fn(() => null),
  getWordPressNonce: vi.fn(() => "test-nonce"),
}));

import { fetchSoakReport, setBackendUrl } from "./sniperClient";

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
