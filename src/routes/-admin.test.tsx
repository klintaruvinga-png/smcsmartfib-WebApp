import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { EngineHealth, SoakReport } from "@/types/sniper";

const routerMocks = vi.hoisted(() => ({
  instance: { navigate: vi.fn() },
}));

const authMocks = vi.hoisted(() => ({
  getAuthHeader: vi.fn(() => "Basic dGVzdDp0ZXN0"),
  hasCredentials: vi.fn(() => true),
  hasWordPressNonce: vi.fn(() => false),
}));

const apiMocks = vi.hoisted(() => {
  class MockAuthError extends Error {
    constructor() {
      super("Authentication required");
      this.name = "AuthError";
    }
  }

  return {
    AuthError: MockAuthError,
    fetchAdminHealth: vi.fn(),
    fetchSoakReport: vi.fn(),
    createSoakCheckpoint: vi.fn(),
    upsertSoakEvidence: vi.fn(),
    getUserSettings: vi.fn(),
    getSnapshot: vi.fn(),
  };
});

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (config: unknown) => config,
    useRouter: () => routerMocks.instance,
  };
});

vi.mock("@/lib/auth", () => authMocks);

vi.mock("@/lib/api/sniperClient", () => ({
  apiClient: {
    getUserSettings: apiMocks.getUserSettings,
    getSnapshot: apiMocks.getSnapshot,
  },
  createSoakCheckpoint: apiMocks.createSoakCheckpoint,
  fetchAdminHealth: apiMocks.fetchAdminHealth,
  fetchSoakReport: apiMocks.fetchSoakReport,
  AuthError: apiMocks.AuthError,
  upsertSoakEvidence: apiMocks.upsertSoakEvidence,
}));

import { AdminPage } from "./admin";

function buildHealth(): EngineHealth {
  return {
    backendSync: "fresh",
    priceFeed: "live",
    feedStatus: "live",
    engineRunState: "live",
    twelveDataKey: "present",
    twelveDataKeyStatus: "present",
    lastBatchAt: "2026-05-12T08:00:00Z",
    lastEngineRunAt: "2026-05-12T08:01:00Z",
    perSymbolDiagnostics: [],
  };
}

function buildSoakReport(): SoakReport {
  return {
    health: buildHealth(),
    watchlist_count: 2,
    snapshots_24h: 4,
    candles_24h: 96,
    engine_runs_summary: {
      total_24h: 8,
      success_24h: 8,
      error_24h: 0,
      last_run_at: "2026-05-12T08:01:00Z",
    },
    audit_events_summary: {
      total_24h: 3,
      error_count_24h: 0,
      warning_count_24h: 1,
    },
    manual_evidence: [],
    baseline_checkpoint: null,
    checkpoints: [],
    generated_at: "2026-05-12T08:05:00Z",
    seeded: false,
  };
}

describe("AdminPage", () => {
  beforeEach(() => {
    routerMocks.instance.navigate.mockReset();
    authMocks.getAuthHeader.mockReturnValue("Basic dGVzdDp0ZXN0");
    authMocks.hasCredentials.mockReturnValue(true);
    authMocks.hasWordPressNonce.mockReturnValue(false);
    apiMocks.fetchAdminHealth.mockReset();
    apiMocks.fetchSoakReport.mockReset();
    apiMocks.getUserSettings.mockReset();
    apiMocks.getSnapshot.mockReset();
    apiMocks.fetchAdminHealth.mockResolvedValue(buildHealth());
    apiMocks.getUserSettings.mockResolvedValue({
      backendUrl: "https://example.com/wp-json",
      apiKeyStatus: "present",
      refreshIntervalSec: 5,
      staleThresholdSec: 30,
      watchlist: ["EURUSD", "GBPUSD"],
      riskAllocation: { perTradePct: 1, dailyMaxPct: 3, ddCapPct: 5 },
    });
    apiMocks.getSnapshot.mockResolvedValue({
      prices: [],
      diagnostics: [],
    });
    apiMocks.createSoakCheckpoint.mockReset();
    apiMocks.upsertSoakEvidence.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders backend health inside a read-only backend-owned section", async () => {
    apiMocks.fetchSoakReport.mockResolvedValue(buildSoakReport());

    render(<AdminPage />);

    expect(await screen.findByText("Backend Health Status")).toBeTruthy();
    expect(
      screen.getByText("Read-only - values are owned and updated by the backend."),
    ).toBeTruthy();
    expect(apiMocks.fetchAdminHealth).toHaveBeenCalledTimes(1);

    const healthSection = document.querySelector(
      '[data-section="backend-health-readonly"]',
    ) as HTMLElement | null;
    expect(healthSection).toBeTruthy();
    expect(healthSection?.querySelectorAll("input, textarea, select, button")).toHaveLength(0);

    const scoped = within(healthSection as HTMLElement);
    expect(scoped.getByText("System status")).toBeTruthy();
    expect(scoped.getByText("Backend sync")).toBeTruthy();
    expect(scoped.getByText("Engine run")).toBeTruthy();
    expect(scoped.getByText("Price feed")).toBeTruthy();
    expect(scoped.getByText("Twelve Data key")).toBeTruthy();
    expect(scoped.getByText("Per-symbol diagnostics")).toBeTruthy();
    expect(scoped.getByText("Last batch")).toBeTruthy();
    expect(scoped.getByText("Last engine run")).toBeTruthy();
  });

  it("renders the existing access denied surface when admin health fails to load", async () => {
    apiMocks.fetchAdminHealth.mockRejectedValueOnce(new Error("admin health unavailable"));
    apiMocks.fetchSoakReport.mockResolvedValue(buildSoakReport());

    render(<AdminPage />);

    expect(await screen.findByText("Access denied")).toBeTruthy();
    expect(screen.getByText("Administrator capability required")).toBeTruthy();
    expect(
      screen.getByText(
        "This route is restricted to WordPress administrators. No backend diagnostics were exposed.",
      ),
    ).toBeTruthy();
    expect(apiMocks.fetchAdminHealth).toHaveBeenCalledTimes(1);
  });

  it("surfaces initial soak report load failures and recovers on retry", async () => {
    const loadError = new Error(
      'API /admin/soak-report failed: 500 - {"error":"table_init_failed"}',
    );

    apiMocks.fetchSoakReport
      .mockRejectedValueOnce(loadError)
      .mockResolvedValueOnce(buildSoakReport());

    render(<AdminPage />);

    expect(await screen.findByText("Soak report failed to load.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry soak report" })).toBeTruthy();
    expect(screen.getAllByText(loadError.message)).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Retry soak report" }));

    await waitFor(() => {
      expect(apiMocks.fetchSoakReport).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByText("Soak report failed to load.")).toBeNull();
    });
    expect(screen.queryByText(loadError.message)).toBeNull();
    expect(screen.getByText("Baseline")).toBeTruthy();
  });

  it("redirects to login on soak report AuthError without surfacing panelError", async () => {
    apiMocks.fetchSoakReport.mockRejectedValueOnce(new apiMocks.AuthError());

    render(<AdminPage />);

    await waitFor(() => {
      expect(routerMocks.instance.navigate).toHaveBeenCalledWith({ to: "/login" });
    });

    expect(screen.queryByText("Soak report failed to load.")).toBeNull();
    expect(screen.queryByText("Authentication required")).toBeNull();
  });
});
