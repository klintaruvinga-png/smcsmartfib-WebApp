/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SOAK_TEMPLATES, type EngineHealth, type SoakReport } from "@/types/sniper";

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

import { AdminPage, hydrateBaselineForm, inferSoakTypeFromReport } from "./admin";

const BASELINE_EXISTS_WARNING = "Baseline already captured - do not replace";
const BASELINE_CAPTURE_LOCK_MESSAGE =
  "Baseline already captured. Saving a new baseline is not permitted.";
const START_NEW_SOAK_BUTTON = "Start New Soak";
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

function buildHealth(): EngineHealth {
  return {
    backendSync: "live",
    priceFeed: "live",
    feedStatus: "live",
    engineRunState: "live",
    twelveDataKey: "present",
    twelveDataKeyStatus: "ok",
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

function buildCheckpoint(
  id: number,
  checkpointType: "baseline" | "checkpoint",
  createdAt: string,
  operatorNotes: string,
) {
  return {
    id,
    checkpoint_type: checkpointType,
    snapshot_data: {
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
      generated_at: "2026-05-12T08:05:00Z",
    },
    operator_notes: operatorNotes,
    created_at: createdAt,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function selectSoakType(
  value: "PHASE_0_RESTART_72H" | "PHASE_3_STABILITY_72H" | "PHASE_4_30_DAY" | "CUSTOM",
) {
  fireEvent.change(screen.getByLabelText("Soak type"), { target: { value } });
}

describe("AdminPage", () => {
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
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
    consoleErrorSpy.mockRestore();
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
    expect(screen.getByText(/Soak report data source failed during initial load\./)).toBeTruthy();
    expect(screen.getByText(/HTTP 500\./)).toBeTruthy();
    expect(screen.getByText(/Error code: table_init_failed\./)).toBeTruthy();
    expect(screen.getByText(/Contact backend on-call if this persists\./)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry soak report" }));

    await waitFor(() => {
      expect(apiMocks.fetchSoakReport).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByText("Soak report failed to load.")).toBeNull();
    });
    expect(screen.queryByText(/Soak report data source failed during initial load\./)).toBeNull();
    expect(screen.getByText("Baseline")).toBeTruthy();
  });

  it("shows the soak report fetch status detail in the error panel", async () => {
    const loadError = new Error(
      'API /admin/soak-report failed: 503 - {"error":"service_unavailable"}',
    );
    apiMocks.fetchSoakReport.mockRejectedValueOnce(loadError);

    render(<AdminPage />);

    expect(await screen.findByText("Soak report failed to load.")).toBeTruthy();
    expect(screen.getByText(/HTTP 503\./)).toBeTruthy();
    expect(screen.getByText(/Error code: service_unavailable\./)).toBeTruthy();
    expect(screen.getByText(/Detail: API \/admin\/soak-report failed: 503/)).toBeTruthy();
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

  it("renders distinct baseline and checkpoint snapshot sections", async () => {
    const report = buildSoakReport();
    report.baseline_checkpoint = buildCheckpoint(
      1,
      "baseline",
      "2026-05-12T08:05:00Z",
      "Initial soak capture.",
    );
    report.checkpoints = [
      buildCheckpoint(2, "checkpoint", "2026-05-12T20:05:00Z", "T+12h checkpoint."),
    ];
    apiMocks.fetchSoakReport.mockResolvedValue(report);

    render(<AdminPage />);

    const baselineSection = await screen.findByRole("region", { name: "Baseline Snapshot" });
    const checkpointSection = screen.getByRole("region", { name: "Checkpoint History" });

    expect(within(baselineSection).getByText("BASELINE")).toBeTruthy();
    expect(within(baselineSection).getByText("Locked reference")).toBeTruthy();
    expect(within(checkpointSection).getByText("CHECKPOINT")).toBeTruthy();
    expect(screen.getByText("Baseline Snapshot")).toBeTruthy();
    expect(screen.getByText("Checkpoint History")).toBeTruthy();
  });

  it("promotes a ready soak report back to error state when refresh fails", async () => {
    const report = buildSoakReport();
    const refreshError = new Error('API /admin/soak-report failed: 500 - {"error":"retry_failed"}');
    apiMocks.fetchSoakReport.mockResolvedValueOnce(report).mockRejectedValueOnce(refreshError);
    apiMocks.createSoakCheckpoint.mockResolvedValue(
      buildCheckpoint(1, "baseline", "2026-05-12T08:05:00Z", "Initial soak capture."),
    );

    render(<AdminPage />);

    expect(
      await screen.findByRole("button", { name: "Capture Baseline & Start Soak" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Capture Baseline & Start Soak" }));

    expect(await screen.findByText("Soak report failed to load.")).toBeTruthy();
    expect(screen.getByText(/Soak report data source failed during refresh\./)).toBeTruthy();
    expect(screen.getByText(/HTTP 500\./)).toBeTruthy();
    expect(screen.getByText(/Error code: retry_failed\./)).toBeTruthy();
    expect(screen.queryByText("Baseline age")).toBeNull();
  });

  it("blocks concurrent retry clicks while a soak report refresh is in flight", async () => {
    const loadError = new Error(
      'API /admin/soak-report failed: 500 - {"error":"table_init_failed"}',
    );
    const deferred = createDeferred<SoakReport>();
    apiMocks.fetchSoakReport
      .mockRejectedValueOnce(loadError)
      .mockImplementationOnce(() => deferred.promise);

    render(<AdminPage />);

    const retryButton = await screen.findByRole("button", { name: "Retry soak report" });
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(apiMocks.fetchSoakReport).toHaveBeenCalledTimes(2);
    });

    deferred.resolve(buildSoakReport());

    expect(await screen.findByText("Baseline")).toBeTruthy();
  });

  it("renders baseline status cards with baseline badges, icon shells, and promoted age copy", async () => {
    const report = buildSoakReport();
    report.baseline_checkpoint = buildCheckpoint(
      1,
      "baseline",
      "2026-05-12T08:05:00Z",
      "Initial soak capture.",
    );
    apiMocks.fetchSoakReport.mockResolvedValue(report);

    render(<AdminPage />);

    const baselineCard = (await screen.findByText("Baseline")).closest(
      ".soak-report-print-card",
    ) as HTMLElement | null;
    const baselineAgeCard = screen
      .getByText("Baseline age")
      .closest(".soak-report-print-card") as HTMLElement | null;

    expect(baselineCard).toBeTruthy();
    expect(baselineAgeCard).toBeTruthy();
    expect(within(baselineCard as HTMLElement).getByText("BASELINE")).toBeTruthy();
    expect(within(baselineCard as HTMLElement).getByText(/Captured .* ago/)).toBeTruthy();
    expect((baselineCard as HTMLElement).querySelector("svg")).toBeTruthy();
    expect(within(baselineAgeCard as HTMLElement).getByText("BASELINE")).toBeTruthy();
    expect(within(baselineAgeCard as HTMLElement).getByText(/Captured at /)).toBeTruthy();
    expect((baselineAgeCard as HTMLElement).querySelector("svg")).toBeTruthy();
  });

  it("renders checkpoint status cards with checkpoint badges and fallback age guidance", async () => {
    const report = buildSoakReport();
    report.baseline_checkpoint = buildCheckpoint(
      1,
      "baseline",
      "2026-05-12T08:05:00Z",
      "Initial soak capture.",
    );
    apiMocks.fetchSoakReport.mockResolvedValue(report);

    render(<AdminPage />);

    const checkpointAgeCard = (await screen.findByText("Checkpoint age")).closest(
      ".soak-report-print-card",
    ) as HTMLElement | null;
    const checkpointsCard = screen
      .getByText("Checkpoints")
      .closest(".soak-report-print-card") as HTMLElement | null;

    expect(checkpointAgeCard).toBeTruthy();
    expect(checkpointsCard).toBeTruthy();
    expect(within(checkpointAgeCard as HTMLElement).getByText("CHECKPOINT")).toBeTruthy();
    expect(
      within(checkpointAgeCard as HTMLElement).getByText(
        "Using baseline timestamp until the first checkpoint is saved.",
      ),
    ).toBeTruthy();
    expect((checkpointAgeCard as HTMLElement).querySelector("svg")).toBeTruthy();
    expect(within(checkpointsCard as HTMLElement).getByText("CHECKPOINT")).toBeTruthy();
  });

  it("shows a baseline-exists warning and locks baseline capture when a baseline is present", async () => {
    const report = buildSoakReport();
    report.baseline_checkpoint = buildCheckpoint(
      1,
      "baseline",
      "2026-05-12T08:05:00Z",
      "Initial soak capture.",
    );
    apiMocks.fetchSoakReport.mockResolvedValue(report);

    render(<AdminPage />);

    expect(await screen.findByText(BASELINE_EXISTS_WARNING)).toBeTruthy();

    const captureButton = screen.getByRole("button", { name: BASELINE_CAPTURE_LOCK_MESSAGE });
    expect((captureButton as HTMLButtonElement).disabled).toBe(true);
    expect(captureButton.getAttribute("title")).toBe(BASELINE_CAPTURE_LOCK_MESSAGE);
    expect(captureButton.getAttribute("aria-label")).toBe(BASELINE_CAPTURE_LOCK_MESSAGE);
    expect(screen.getByRole("button", { name: "Update Baseline Evidence" })).toBeTruthy();
  });

  it("does not show the baseline-exists warning before the first baseline is captured", async () => {
    apiMocks.fetchSoakReport.mockResolvedValue(buildSoakReport());

    render(<AdminPage />);

    expect(await screen.findByRole("heading", { name: "Phase 3 - Stability Soak" })).toBeTruthy();
    selectSoakType("PHASE_0_RESTART_72H");
    expect(screen.getByRole("heading", { name: "Phase 0 - Restart Soak" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Phase 0 - Restart Soak - Operator Baseline" }),
    ).toBeTruthy();
    expect(screen.getAllByText("T+12h").length).toBeGreaterThan(0);
    expect(screen.getAllByText("T+24h").length).toBeGreaterThan(0);
    expect(screen.getAllByText("T+48h").length).toBeGreaterThan(0);
    expect(screen.getAllByText("T+72h").length).toBeGreaterThan(0);
    expect(screen.queryByText(BASELINE_EXISTS_WARNING)).toBeNull();

    const captureButton = screen.getByRole("button", { name: "Capture Baseline & Start Soak" });
    expect((captureButton as HTMLButtonElement).disabled).toBe(false);
    expect(captureButton.getAttribute("title")).toBeNull();
    expect(captureButton.getAttribute("aria-label")).toBeNull();
    expect(screen.queryByRole("button", { name: "Update Baseline Evidence" })).toBeNull();
  });

  it("renders the Phase 3 template heading and checkpoint labels", async () => {
    apiMocks.fetchSoakReport.mockResolvedValue(buildSoakReport());

    render(<AdminPage />);

    expect(await screen.findByRole("heading", { name: "Phase 3 - Stability Soak" })).toBeTruthy();
    selectSoakType("PHASE_0_RESTART_72H");
    selectSoakType("PHASE_3_STABILITY_72H");

    expect(
      screen.getByRole("heading", { name: "Phase 3 - Stability Soak - Operator Baseline" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Phase 3 - Stability Soak Timeline" })).toBeTruthy();
    expect(screen.getAllByText("T+24h").length).toBeGreaterThan(0);
  });

  it("renders the Phase 4 soak option in the picker and applies its template label", async () => {
    apiMocks.fetchSoakReport.mockResolvedValue(buildSoakReport());

    render(<AdminPage />);

    expect(await screen.findByRole("heading", { name: "Phase 3 - Stability Soak" })).toBeTruthy();
    expect(screen.getByRole("option", { name: SOAK_TEMPLATES.PHASE_4_30_DAY.label })).toBeTruthy();

    selectSoakType("PHASE_4_30_DAY");

    expect(screen.getByRole("heading", { name: "Phase 4 - 30-Day Live Soak" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Phase 4 - 30-Day Live Soak - Operator Baseline" }),
    ).toBeTruthy();
  });

  it("inferSoakTypeFromReport returns PHASE_4_30_DAY", () => {
    const report = buildSoakReport();
    report.manual_evidence = [
      {
        id: 1,
        evidence_key: "baseline.soak_type",
        evidence_type: "baseline_metadata",
        evidence_value: "PHASE_4_30_DAY",
        operator: "tester",
        created_at: "2026-05-12T08:05:00Z",
        updated_at: "2026-05-12T08:05:00Z",
      },
    ];

    expect(inferSoakTypeFromReport(report)).toBe("PHASE_4_30_DAY");
  });

  it("hydrateBaselineForm preserves baseline keys for a Phase 4 soak report", () => {
    const hydrated = hydrateBaselineForm(
      {
        soakType: "PHASE_3_STABILITY_72H",
        soakPurpose: "",
        startedBy: "",
        startedAt: "2026-05-12T08:05",
        eaSymbols: "",
        frontendWatchlist: "",
        mt5TerminalStatus: "",
        backendHealthEndpoint: "",
        t0HealthSummary: "",
        authConfirmed: "",
        twelveDataKeyStatus: "",
        watchlistLiveSymbols: "",
        notes: "",
      },
      [
        {
          id: 1,
          evidence_key: "baseline.soak_type",
          evidence_type: "baseline_metadata",
          evidence_value: "PHASE_4_30_DAY",
          operator: "tester",
          created_at: "2026-05-12T08:05:00Z",
          updated_at: "2026-05-12T08:05:00Z",
        },
        {
          id: 2,
          evidence_key: "baseline.started_by",
          evidence_type: "baseline_metadata",
          evidence_value: "phase4-operator",
          operator: "tester",
          created_at: "2026-05-12T08:05:00Z",
          updated_at: "2026-05-12T08:05:00Z",
        },
        {
          id: 3,
          evidence_key: "baseline.notes",
          evidence_type: "baseline_metadata",
          evidence_value: "Phase 4 baseline restored.",
          operator: "tester",
          created_at: "2026-05-12T08:05:00Z",
          updated_at: "2026-05-12T08:05:00Z",
        },
      ],
    );

    expect(hydrated.soakType).toBe("PHASE_4_30_DAY");
    expect(hydrated.startedBy).toBe("phase4-operator");
    expect(hydrated.notes).toBe("Phase 4 baseline restored.");
  });

  it("initializes soak template from persisted soak-type evidence on first load", async () => {
    const report = buildSoakReport();
    report.baseline_checkpoint = buildCheckpoint(
      1,
      "baseline",
      "2026-05-12T08:05:00Z",
      "Initial soak capture.",
    );
    report.manual_evidence = [
      {
        id: 1,
        evidence_key: "baseline.soak_type",
        evidence_type: "baseline_metadata",
        evidence_value: "PHASE_0_RESTART_72H",
        operator: "tester",
        created_at: "2026-05-12T08:05:00Z",
        updated_at: "2026-05-12T08:05:00Z",
      },
    ];
    apiMocks.fetchSoakReport.mockResolvedValue(report);

    render(<AdminPage />);

    expect(await screen.findByRole("heading", { name: "Phase 0 - Restart Soak" })).toBeTruthy();
    expect(screen.getAllByText("T+12h").length).toBeGreaterThan(0);
  });

  it("hydrates baseline soak type from legacy soak.type evidence when updating baseline", async () => {
    const report = buildSoakReport();
    report.baseline_checkpoint = buildCheckpoint(
      1,
      "baseline",
      "2026-05-12T08:05:00Z",
      "Initial soak capture.",
    );
    report.manual_evidence = [
      {
        id: 1,
        evidence_key: "soak.type",
        evidence_type: "baseline_metadata",
        evidence_value: "PHASE_0_RESTART_72H",
        operator: "tester",
        created_at: "2026-05-12T08:05:00Z",
        updated_at: "2026-05-12T08:05:00Z",
      },
    ];
    apiMocks.fetchSoakReport.mockResolvedValue(report);
    apiMocks.upsertSoakEvidence.mockResolvedValue([]);

    render(<AdminPage />);

    expect(await screen.findByRole("heading", { name: "Phase 0 - Restart Soak" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Update Baseline Evidence" }));

    await waitFor(() => {
      expect(apiMocks.upsertSoakEvidence).toHaveBeenCalled();
    });
    const payloads = apiMocks.upsertSoakEvidence.mock.calls.map((call) => call[0]) as Array<{
      evidence_key: string;
      evidence_value: string;
    }>;
    expect(payloads).not.toHaveLength(0);
    expect(payloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidence_key: "baseline.soak_type",
          evidence_value: "PHASE_0_RESTART_72H",
        }),
      ]),
    );
  });

  it("does not override manual soak template selection on later report refreshes", async () => {
    const phase0Report = buildSoakReport();
    phase0Report.manual_evidence = [
      {
        id: 1,
        evidence_key: "baseline.soak_type",
        evidence_type: "baseline_metadata",
        evidence_value: "PHASE_0_RESTART_72H",
        operator: "tester",
        created_at: "2026-05-12T08:05:00Z",
        updated_at: "2026-05-12T08:05:00Z",
      },
    ];
    apiMocks.fetchSoakReport
      .mockResolvedValueOnce(phase0Report)
      .mockResolvedValueOnce(phase0Report);
    apiMocks.upsertSoakEvidence.mockResolvedValue([]);

    render(<AdminPage />);

    expect(await screen.findByRole("heading", { name: "Phase 0 - Restart Soak" })).toBeTruthy();
    selectSoakType("PHASE_3_STABILITY_72H");
    expect(screen.getByRole("heading", { name: "Phase 3 - Stability Soak" })).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("soak-feed-window-2026-05-10"), {
      target: { value: "phase3-manual-refresh" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(
        "Describe the observation, pasted log lines, screenshot reference, or SQL result.",
      ),
      { target: { value: "Verify manual soak type selection survives a report refresh." } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save Evidence" }));

    await waitFor(() => {
      expect(apiMocks.fetchSoakReport).toHaveBeenCalledTimes(2);
    });
    expect(apiMocks.upsertSoakEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        evidence_key: "phase3-manual-refresh",
      }),
    );
    expect(screen.getByRole("heading", { name: "Phase 3 - Stability Soak" })).toBeTruthy();
  });

  it("shows custom duration and checkpoint controls and renders evenly spaced labels", async () => {
    apiMocks.fetchSoakReport.mockResolvedValue(buildSoakReport());

    render(<AdminPage />);

    expect(await screen.findByRole("heading", { name: "Phase 3 - Stability Soak" })).toBeTruthy();
    selectSoakType("CUSTOM");

    const durationInput = screen.getByLabelText("Duration (hours)");
    const checkpointCountInput = screen.getByLabelText("Checkpoint count");

    expect(durationInput).toBeTruthy();
    expect(checkpointCountInput).toBeTruthy();

    fireEvent.change(durationInput, { target: { value: "48" } });
    fireEvent.change(checkpointCountInput, { target: { value: "3" } });

    expect(screen.getAllByText("T+16h").length).toBeGreaterThan(0);
    expect(screen.getAllByText("T+32h").length).toBeGreaterThan(0);
    expect(screen.getAllByText("T+48h").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Save T+16h Snapshot" })).toBeTruthy();
  });

  it("clears unsaved baseline form state when switching templates", async () => {
    apiMocks.fetchSoakReport.mockResolvedValue(buildSoakReport());

    render(<AdminPage />);

    expect(await screen.findByRole("heading", { name: "Phase 3 - Stability Soak" })).toBeTruthy();

    const eaSymbolsInput = screen.getByPlaceholderText("EURUSD, USDJPY, GBPUSD...");
    fireEvent.change(eaSymbolsInput, { target: { value: "EURUSD, GBPUSD" } });
    expect((eaSymbolsInput as HTMLTextAreaElement).value).toBe("EURUSD, GBPUSD");

    selectSoakType("PHASE_0_RESTART_72H");

    expect(
      (screen.getByPlaceholderText("EURUSD, USDJPY, GBPUSD...") as HTMLTextAreaElement).value,
    ).toBe("");
  });

  it("renders the reset control when a baseline checkpoint exists", async () => {
    const report = buildSoakReport();
    report.baseline_checkpoint = buildCheckpoint(
      1,
      "baseline",
      "2026-05-12T08:05:00Z",
      "Initial soak capture.",
    );
    apiMocks.fetchSoakReport.mockResolvedValue(report);

    render(<AdminPage />);

    expect(await screen.findByText(BASELINE_EXISTS_WARNING)).toBeTruthy();
    expect(screen.getByRole("button", { name: START_NEW_SOAK_BUTTON })).toBeTruthy();
  });

  it("does not render the reset control when no baseline checkpoint exists", async () => {
    apiMocks.fetchSoakReport.mockResolvedValue(buildSoakReport());

    render(<AdminPage />);

    expect(
      await screen.findByRole("button", { name: "Capture Baseline & Start Soak" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: START_NEW_SOAK_BUTTON })).toBeNull();
  });

  it("clicking reset enables baseline capture without clearing the previous checkpoint view", async () => {
    const report = buildSoakReport();
    report.baseline_checkpoint = buildCheckpoint(
      1,
      "baseline",
      "2026-05-12T08:05:00Z",
      "Initial soak capture.",
    );
    apiMocks.fetchSoakReport.mockResolvedValue(report);

    render(<AdminPage />);

    expect(await screen.findByText(BASELINE_EXISTS_WARNING)).toBeTruthy();
    const lockedCaptureButton = screen.getByRole("button", { name: BASELINE_CAPTURE_LOCK_MESSAGE });
    expect((lockedCaptureButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: START_NEW_SOAK_BUTTON }));

    const enabledCaptureButton = screen.getByRole("button", {
      name: "Capture Baseline & Start Soak",
    });
    expect((enabledCaptureButton as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("New soak baseline armed")).toBeTruthy();
    expect(screen.getByText(/Previous baseline from/)).toBeTruthy();
    expect(screen.getByText(/Saved at /)).toBeTruthy();
  });
});
