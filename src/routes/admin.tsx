import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Flag, Lock, ShieldCheck } from "lucide-react";
import {
  apiClient,
  createSoakCheckpoint,
  fetchAdminHealth,
  fetchSoakReport,
  type AdminHealthResponse,
  AuthError,
  upsertSoakEvidence,
} from "@/lib/api/sniperClient";
import { getAuthHeader, hasCredentials, hasWordPressNonce } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SOAK_TEMPLATES } from "@/types/sniper";
import type {
  DashboardSettings,
  PairPrice,
  SoakCheckpointRow,
  SoakEvidencePayload,
  SoakEvidenceRow,
  SoakEvidenceType,
  SoakReport,
  SoakType,
  SymbolDiagnostic,
} from "@/types/sniper";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Health - SMC SuperFIB" },
      {
        name: "description",
        content: "Admin-only backend health summary and soak workspace.",
      },
    ],
  }),
  component: AdminPage,
});

type LoadState =
  | { kind: "loading" }
  | { kind: "denied" }
  | { kind: "ready"; health: AdminHealthResponse };

type SoakLoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; report: SoakReport };

type AutoBaselineFields = {
  frontendWatchlist: string;
  watchlistLiveSymbols: string;
  notes: string;
};

type BaselineForm = {
  soakType: SoakType;
  soakPurpose: string;
  startedBy: string;
  startedAt: string;
  eaSymbols: string;
  frontendWatchlist: string;
  mt5TerminalStatus: string;
  backendHealthEndpoint: string;
  t0HealthSummary: string;
  authConfirmed: string;
  twelveDataKeyStatus: string;
  watchlistLiveSymbols: string;
  notes: string;
};

const SOAK_EVIDENCE_TYPES: SoakEvidenceType[] = [
  "baseline_metadata",
  "signal_parity_confirm",
  "feed_stable_window",
  "engine_run_observation",
  "manual_note",
];

export function AdminPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [soakState, setSoakState] = useState<SoakLoadState>({ kind: "loading" });
  const [pageAccessedAt] = useState(() => defaultDateTimeLocalValue());
  const [soakType, setSoakType] = useState<SoakType>("PHASE_3_STABILITY_72H");
  const [durationHours, setDurationHours] = useState(
    SOAK_TEMPLATES.PHASE_3_STABILITY_72H.defaultDurationHours,
  );
  const [checkpointCount, setCheckpointCount] = useState(
    SOAK_TEMPLATES.PHASE_3_STABILITY_72H.defaultCheckpointCount,
  );
  const [baselineForm, setBaselineForm] = useState<BaselineForm>(() =>
    createBaselineFormDefaults({
      pageAccessedAt,
      autoBaselineFields: {
        frontendWatchlist: "",
        watchlistLiveSymbols: "",
        notes: "",
      },
      health: null,
      soakType: "PHASE_3_STABILITY_72H",
    }),
  );
  const [evidenceForm, setEvidenceForm] = useState<SoakEvidencePayload>({
    evidence_key: "",
    evidence_type: "manual_note",
    evidence_value: "",
    operator: resolveOperatorIdentifier(),
  });
  const [checkpointNotes, setCheckpointNotes] = useState("");
  const [baselineSaving, setBaselineSaving] = useState(false);
  const [evidenceSaving, setEvidenceSaving] = useState(false);
  const [checkpointSaving, setCheckpointSaving] = useState(false);
  const [panelMessage, setPanelMessage] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [soakRefreshing, setSoakRefreshing] = useState(false);
  const [autoBaselineFields, setAutoBaselineFields] = useState<AutoBaselineFields>({
    frontendWatchlist: "",
    watchlistLiveSymbols: "",
    notes: "",
  });
  const soakRefreshInFlight = useRef<Promise<SoakReport | null> | null>(null);
  const soakTypeInitializedFromReport = useRef(false);
  const soakTypeManuallyChanged = useRef(false);

  useEffect(() => {
    if (!hasCredentials() && !hasWordPressNonce()) {
      void router.navigate({ to: "/login" });
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const health = await fetchAdminHealth();
        if (!cancelled) {
          setState({ kind: "ready", health });
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof AuthError) {
          void router.navigate({ to: "/login" });
          return;
        }
        setState({ kind: "denied" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!hasCredentials() && !hasWordPressNonce()) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const report = await fetchSoakReport();
        if (!cancelled) {
          setSoakState({ kind: "ready", report });
          setPanelError(null);
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof AuthError) {
          void router.navigate({ to: "/login" });
          return;
        }
        const message = formatSoakReportError(error, "load");
        console.error("[SOAK] Failed to load soak report", error);
        setSoakState({
          kind: "error",
          message,
        });
        setPanelError(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!hasCredentials() && !hasWordPressNonce()) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const [settings, snapshot] = await Promise.all([
          apiClient.getUserSettings(),
          apiClient.getSnapshot(),
        ]);
        if (cancelled) return;

        const derived = deriveAutoBaselineFields(
          settings,
          snapshot.prices ?? [],
          snapshot.diagnostics ?? [],
        );
        setAutoBaselineFields(derived);
        setBaselineForm((current) => ({
          ...current,
          frontendWatchlist:
            current.frontendWatchlist !== ""
              ? current.frontendWatchlist
              : derived.frontendWatchlist,
          watchlistLiveSymbols:
            current.watchlistLiveSymbols !== ""
              ? current.watchlistLiveSymbols
              : derived.watchlistLiveSymbols,
          notes: current.notes !== "" ? current.notes : derived.notes,
        }));
      } catch {
        if (cancelled) return;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state.kind !== "ready") return;
    setBaselineForm((current) => ({
      ...current,
      t0HealthSummary:
        current.t0HealthSummary !== "" ? current.t0HealthSummary : buildHealthSummary(state.health),
      twelveDataKeyStatus:
        current.twelveDataKeyStatus !== ""
          ? current.twelveDataKeyStatus
          : (state.health.twelveDataKeyStatus ?? state.health.twelveDataKey),
    }));
  }, [state]);

  useEffect(() => {
    if (soakState.kind !== "ready") return;
    setBaselineForm((current) => hydrateBaselineForm(current, soakState.report.manual_evidence));
  }, [soakState]);

  useEffect(() => {
    if (soakState.kind !== "ready") return;
    if (soakTypeInitializedFromReport.current) return;
    if (soakTypeManuallyChanged.current) return;

    const reportSoakType = inferSoakTypeFromReport(soakState.report);
    soakTypeInitializedFromReport.current = true;
    if (!reportSoakType || reportSoakType === "CUSTOM") return;

    setSoakType(reportSoakType);
    setDurationHours(SOAK_TEMPLATES[reportSoakType].defaultDurationHours);
    setCheckpointCount(SOAK_TEMPLATES[reportSoakType].defaultCheckpointCount);
  }, [soakState]);

  if (state.kind === "loading") {
    return <div className="text-mute text-sm">Loading admin health...</div>;
  }

  if (state.kind === "denied") {
    return (
      <div className="max-w-2xl space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Admin Health</h1>
          <p className="mt-0.5 text-xs text-mute">Administrator capability required</p>
        </div>

        <div className="rounded-lg border border-sell/30 bg-sell/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-sell" />
            <div className="space-y-1">
              <div className="text-sm font-semibold text-sell">Access denied</div>
              <p className="text-xs text-dim">
                This route is restricted to WordPress administrators. No backend diagnostics were
                exposed.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const health = state.health;
  const baselineCheckpoint =
    soakState.kind === "ready" ? soakState.report.baseline_checkpoint : null;
  const latestCheckpoint =
    soakState.kind === "ready" ? (soakState.report.checkpoints[0] ?? null) : null;
  const selectedSoakTemplate = SOAK_TEMPLATES[soakType];
  const derivedCheckpointLabels = deriveCheckpointLabels(soakType, durationHours, checkpointCount);
  const derivedCheckpointSummary =
    derivedCheckpointLabels.length > 0
      ? derivedCheckpointLabels.join(", ")
      : "configured checkpoints once duration and count are set";
  const nextCheckpointLabel =
    derivedCheckpointLabels[soakState.kind === "ready" ? soakState.report.checkpoints.length : 0] ??
    null;
  const baselineCaptureLocked = baselineCheckpoint !== null;
  const evidenceRows = soakState.kind === "ready" ? soakState.report.manual_evidence : [];
  const baselineAge = formatSoakAge(baselineCheckpoint?.created_at ?? null);
  const checkpointAge = formatSoakAge(
    latestCheckpoint?.created_at ?? baselineCheckpoint?.created_at ?? null,
  );

  function handleSoakTypeChange(nextType: SoakType) {
    soakTypeManuallyChanged.current = true;
    const template = SOAK_TEMPLATES[nextType];
    setSoakType(nextType);
    setDurationHours(template.defaultDurationHours);
    setCheckpointCount(template.defaultCheckpointCount);
    setCheckpointNotes("");
    setPanelMessage(null);
    setPanelError(null);
    setBaselineForm(
      hydrateBaselineForm(
        createBaselineFormDefaults({
          pageAccessedAt,
          autoBaselineFields,
          health: state.kind === "ready" ? state.health : null,
          soakType: nextType,
        }),
        soakState.kind === "ready" ? soakState.report.manual_evidence : [],
      ),
    );
  }

  async function refreshSoakReport() {
    if (soakRefreshInFlight.current) {
      return soakRefreshInFlight.current;
    }

    setSoakRefreshing(true);
    setSoakState({ kind: "loading" });
    const refreshPromise = (async () => {
      try {
        const report = await fetchSoakReport();
        setSoakState({ kind: "ready", report });
        setPanelError(null);
        return report;
      } catch (error) {
        if (error instanceof AuthError) {
          void router.navigate({ to: "/login" });
          return null;
        }
        const message = formatSoakReportError(error, "refresh");
        console.error("[SOAK] Failed to refresh soak report", error);
        setSoakState({ kind: "error", message });
        setPanelError(null);
        return null;
      } finally {
        soakRefreshInFlight.current = null;
        setSoakRefreshing(false);
      }
    })();

    soakRefreshInFlight.current = refreshPromise;
    return refreshPromise;
  }

  async function saveEvidenceEntries(entries: SoakEvidencePayload[]) {
    for (const entry of entries) {
      if (!entry.evidence_value.trim()) continue;
      await upsertSoakEvidence(entry);
    }
  }

  async function handleBaselineSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBaselineSaving(true);
    setPanelMessage(null);
    setPanelError(null);

    try {
      const operator = baselineForm.startedBy.trim() || resolveOperatorIdentifier();
      const baselineEntries = buildBaselineEvidenceEntries(baselineForm, operator);
      console.debug("[SOAK] Baseline evidence entries", baselineEntries);
      await saveEvidenceEntries(baselineEntries);

      if (!baselineCheckpoint) {
        await createSoakCheckpoint({
          checkpointType: "baseline",
          operatorNotes: baselineForm.notes,
        });
      }

      const refreshed = await refreshSoakReport();
      if (!refreshed) return;
      setPanelMessage(
        baselineCheckpoint
          ? "Baseline metadata updated."
          : "Baseline captured. The first soak snapshot is now marked as baseline.",
      );
    } catch (error) {
      if (error instanceof AuthError) {
        void router.navigate({ to: "/login" });
        return;
      }
      setPanelError(error instanceof Error ? error.message : "Failed to capture baseline.");
    } finally {
      setBaselineSaving(false);
    }
  }

  async function handleEvidenceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEvidenceSaving(true);
    setPanelMessage(null);
    setPanelError(null);

    try {
      await upsertSoakEvidence(evidenceForm);
      const refreshed = await refreshSoakReport();
      if (!refreshed) return;
      setPanelMessage(`Saved evidence key "${evidenceForm.evidence_key}".`);
      setEvidenceForm((current) => ({
        ...current,
        evidence_key: "",
        evidence_type: "manual_note",
        evidence_value: "",
      }));
    } catch (error) {
      if (error instanceof AuthError) {
        void router.navigate({ to: "/login" });
        return;
      }
      setPanelError(error instanceof Error ? error.message : "Failed to save soak evidence.");
    } finally {
      setEvidenceSaving(false);
    }
  }

  async function handleCheckpointSave() {
    setCheckpointSaving(true);
    setPanelMessage(null);
    setPanelError(null);

    try {
      await createSoakCheckpoint({
        checkpointType: "checkpoint",
        operatorNotes: checkpointNotes,
      });
      const refreshed = await refreshSoakReport();
      if (!refreshed) return;
      setPanelMessage("Saved soak checkpoint snapshot.");
      setCheckpointNotes("");
    } catch (error) {
      if (error instanceof AuthError) {
        void router.navigate({ to: "/login" });
        return;
      }
      setPanelError(error instanceof Error ? error.message : "Failed to save checkpoint.");
    } finally {
      setCheckpointSaving(false);
    }
  }

  function handleExportMarkdown() {
    if (soakState.kind !== "ready") return;

    const datePart = (soakState.report.generated_at || new Date().toISOString()).slice(0, 10);
    const fileName = `${selectedSoakTemplate.soakType.toLowerCase().replace(/_/g, "-")}-${datePart}.md`;
    const blob = new Blob([buildSoakReportMarkdown(soakState.report, selectedSoakTemplate)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handlePrint() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  return (
    <div className="space-y-4">
      <style>{`
        @page {
          margin: 12mm;
        }

        @media print {
          body {
            background: #ffffff;
          }

          body * {
            visibility: hidden;
          }

          .soak-report-print-section,
          .soak-report-print-section * {
            visibility: visible;
          }

          .soak-report-print-section {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            border: 0;
            box-shadow: none;
            background: #ffffff;
            color: #000000;
            padding: 0;
          }

          .soak-report-print-block,
          .soak-report-print-card,
          .soak-report-print-table {
            display: block !important;
          }

          .soak-report-print-grid {
            display: grid !important;
          }

          .soak-report-print-section summary {
            display: none;
          }

          .soak-report-print-section [data-print-hide="true"] {
            display: none !important;
          }

          .soak-report-print-card,
          .soak-report-print-block,
          .soak-report-print-grid,
          .soak-report-print-table {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .soak-report-print-card,
          .soak-report-print-block {
            border: 1px solid #d1d5db !important;
            background: #ffffff !important;
            color: #111827 !important;
            box-shadow: none !important;
          }

          .soak-report-print-section h2,
          .soak-report-print-section h3,
          .soak-report-print-section h4 {
            break-inside: avoid;
            page-break-after: avoid;
            page-break-inside: avoid;
          }

          .soak-report-print-section table {
            width: 100%;
            border-collapse: collapse;
          }

          .soak-report-print-section th,
          .soak-report-print-section td {
            border-color: #d1d5db !important;
            color: #111827 !important;
          }

          .soak-report-print-section .text-dim,
          .soak-report-print-section .text-mute,
          .soak-report-print-section .text-tx,
          .soak-report-print-section .text-buy,
          .soak-report-print-section .text-warn,
          .soak-report-print-section .text-sell,
          .soak-report-print-section .text-accent {
            color: #111827 !important;
          }
        }
      `}</style>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Admin Health</h1>
        <p className="mt-0.5 text-xs text-mute">
          Administrator-only backend status and soak workspace from{" "}
          <span className="font-mono">/sniper/v1/admin/*</span>
        </p>
      </div>

      <section
        data-section="backend-health-readonly"
        className="space-y-4 rounded-lg border border-accent/30 bg-accent/5 p-4"
      >
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-accent" />
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Backend Health Status</h2>
            <p className="mt-0.5 text-xs text-mute">
              Read-only - values are owned and updated by the backend.
            </p>
            <p className="mt-1 text-[11px] text-dim">
              This section mirrors <span className="font-mono">/admin/health</span> and does not
              accept local edits or form submissions.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <HealthCard
            label="System status"
            value={health.feedStatus ?? health.priceFeed}
            tone={toneForStatus(health.feedStatus ?? health.priceFeed)}
          />
          <HealthCard
            label="Backend sync"
            value={health.backendSync}
            tone={toneForStatus(health.backendSync)}
          />
          <HealthCard
            label="Engine run"
            value={health.engineRunState ?? "unknown"}
            tone={toneForStatus(health.engineRunState)}
          />
          <HealthCard
            label="Price feed"
            value={health.priceFeed}
            tone={toneForStatus(health.priceFeed)}
          />
          <HealthCard
            label="Twelve Data key"
            value={health.twelveDataKeyStatus ?? health.twelveDataKey}
            tone={toneForStatus(health.twelveDataKeyStatus ?? health.twelveDataKey)}
          />
          <HealthCard
            label="Per-symbol diagnostics"
            value={String(health.perSymbolDiagnostics?.length ?? 0)}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <TimestampCard label="Last batch" value={health.lastBatchAt} />
          <TimestampCard label="Last engine run" value={health.lastEngineRunAt} />
        </div>

        {health.perSymbolDiagnostics && health.perSymbolDiagnostics.length > 0 && (
          <div className="rounded-lg border border-bd bg-bg1/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-accent" />
              <div className="text-[11px] font-mono uppercase tracking-wider text-mute">
                Per-symbol diagnostics
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="text-mute">
                  <tr className="border-b border-bd">
                    <th className="px-2 py-2 font-mono uppercase tracking-wider">Symbol</th>
                    <th className="px-2 py-2 font-mono uppercase tracking-wider">Price</th>
                    <th className="px-2 py-2 font-mono uppercase tracking-wider">Candle</th>
                    <th className="px-2 py-2 font-mono uppercase tracking-wider">Count</th>
                    <th className="px-2 py-2 font-mono uppercase tracking-wider">Last Price</th>
                    <th className="px-2 py-2 font-mono uppercase tracking-wider">Last Candle</th>
                    <th className="px-2 py-2 font-mono uppercase tracking-wider">Blocker</th>
                  </tr>
                </thead>
                <tbody>
                  {health.perSymbolDiagnostics.map((diagnostic) => (
                    <tr key={diagnostic.symbol} className="border-b border-bd/50 last:border-b-0">
                      <td className="px-2 py-2 font-mono text-tx">{diagnostic.symbol}</td>
                      <td className="px-2 py-2 text-dim">{diagnostic.priceState}</td>
                      <td className="px-2 py-2 text-dim">{diagnostic.candleState}</td>
                      <td className="px-2 py-2 text-dim">{String(diagnostic.candleCount)}</td>
                      <td className="px-2 py-2 text-dim">
                        {formatTimestamp(diagnostic.lastPriceAt)}
                      </td>
                      <td className="px-2 py-2 text-dim">
                        {formatTimestamp(diagnostic.lastCandleAt)}
                      </td>
                      <td className="px-2 py-2 text-dim">{diagnostic.engineBlocker}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <details open className="soak-report-print-section rounded-lg border border-bd bg-bg1/60">
        <summary className="cursor-pointer list-none border-b border-bd px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">{selectedSoakTemplate.label}</h2>
              <p className="mt-0.5 text-xs text-mute">
                Capture the baseline, store operator evidence, and save checkpoint snapshots during
                the live soak.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden" data-print-hide="true">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportMarkdown}
                disabled={soakState.kind !== "ready"}
              >
                Export Markdown
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePrint}
                disabled={soakState.kind !== "ready"}
              >
                Print / Save PDF
              </Button>
            </div>
          </div>
        </summary>

        <div className="space-y-4 p-4">
          {soakState.kind === "ready" && (
            <div className="hidden print:block soak-report-print-block">
              <h3 className="text-base font-semibold tracking-tight text-tx">
                {selectedSoakTemplate.label} Report
              </h3>
              <p className="mt-1 text-xs text-dim">
                Generated {formatTimestamp(soakState.report.generated_at)}
              </p>
            </div>
          )}

          {panelMessage && (
            <div className="rounded-md border border-buy/30 bg-buy/10 px-3 py-2 text-xs text-buy">
              {panelMessage}
            </div>
          )}

          {panelError && (
            <div className="rounded-md border border-sell/30 bg-sell/10 px-3 py-2 text-xs text-sell">
              {panelError}
            </div>
          )}

          {soakState.kind === "loading" && (
            <div className="text-sm text-mute">Loading soak report...</div>
          )}

          {soakState.kind === "error" && (
            <div className="space-y-3 rounded-md border border-sell/30 bg-sell/10 px-3 py-3 text-xs text-sell">
              <div className="space-y-1">
                <div className="font-semibold">Soak report failed to load.</div>
                <p className="text-[11px] text-dim">{soakState.message}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refreshSoakReport()}
                disabled={soakRefreshing}
              >
                {soakRefreshing ? "Retrying soak report..." : "Retry soak report"}
              </Button>
            </div>
          )}

          {soakState.kind === "ready" && (
            <>
              <div className="soak-report-print-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <HealthCard
                  label="Baseline"
                  value={baselineCheckpoint ? "captured" : "pending"}
                  tone={baselineCheckpoint ? "positive" : "warning"}
                  badge="BASELINE"
                  badgeTone={baselineCheckpoint ? "positive" : "warning"}
                  icon={
                    baselineCheckpoint ? (
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                    )
                  }
                  headerDetail={
                    baselineCheckpoint
                      ? `Captured ${baselineAge} ago`
                      : "Waiting for baseline capture."
                  }
                  className="soak-report-print-card"
                />
                <HealthCard
                  label="Baseline age"
                  value={baselineAge}
                  badge="BASELINE"
                  badgeTone={baselineCheckpoint ? "positive" : "warning"}
                  icon={<Flag className="h-3.5 w-3.5" aria-hidden="true" />}
                  headerDetail={
                    baselineCheckpoint
                      ? `Captured at ${formatTimestamp(baselineCheckpoint.created_at)}`
                      : "Baseline timestamp unavailable."
                  }
                  className="soak-report-print-card"
                />
                <HealthCard
                  label="Checkpoint age"
                  value={checkpointAge}
                  badge="CHECKPOINT"
                  badgeTone={
                    latestCheckpoint ? "positive" : baselineCheckpoint ? "warning" : "neutral"
                  }
                  icon={<ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />}
                  headerDetail={
                    latestCheckpoint
                      ? `Latest checkpoint at ${formatTimestamp(latestCheckpoint.created_at)}`
                      : baselineCheckpoint
                        ? "Using baseline timestamp until the first checkpoint is saved."
                        : "No checkpoint source available yet."
                  }
                  className="soak-report-print-card"
                />
                <HealthCard
                  label="Checkpoints"
                  value={String(soakState.report.checkpoints.length)}
                  badge="CHECKPOINT"
                  badgeTone={soakState.report.checkpoints.length > 0 ? "positive" : "neutral"}
                  icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                  headerDetail={
                    latestCheckpoint
                      ? `Latest checkpoint ${checkpointAge} ago`
                      : baselineCheckpoint
                        ? "Checkpoint history has not started yet."
                        : "Capture baseline before saving checkpoints."
                  }
                  className="soak-report-print-card"
                />
                <HealthCard
                  label="Manual evidence"
                  value={String(soakState.report.manual_evidence.length)}
                  className="soak-report-print-card"
                />
                <HealthCard
                  label="Watchlist symbols"
                  value={
                    soakState.report.watchlist_count === null
                      ? "Unavailable"
                      : String(soakState.report.watchlist_count)
                  }
                  className="soak-report-print-card"
                />
              </div>

              <div className="soak-report-print-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <HealthCard
                  label="Snapshots 24h"
                  value={stringOrUnavailable(soakState.report.snapshots_24h)}
                  className="soak-report-print-card"
                />
                <HealthCard
                  label="Candles 24h"
                  value={stringOrUnavailable(soakState.report.candles_24h)}
                  className="soak-report-print-card"
                />
                <HealthCard
                  label="Engine runs 24h"
                  value={String(soakState.report.engine_runs_summary.total_24h)}
                  className="soak-report-print-card"
                />
                <HealthCard
                  label="Audit events 24h"
                  value={String(soakState.report.audit_events_summary.total_24h)}
                  className="soak-report-print-card"
                />
              </div>

              <div
                data-section="operator-evidence-entry"
                className="soak-report-print-block rounded-lg border border-bd bg-bg2/40 px-4 py-3"
              >
                <h3 className="text-sm font-semibold tracking-tight">
                  Operator Evidence - enter metadata only
                </h3>
                <p className="mt-0.5 text-xs text-mute">
                  Use the forms below to record soak metadata, evidence, and checkpoints. These
                  entries do not edit backend health state.
                </p>
                <div className="mt-3 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="soak-type"
                      className="text-[11px] font-mono uppercase tracking-wider text-mute"
                    >
                      Soak type
                    </label>
                    <select
                      id="soak-type"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={soakType}
                      onChange={(event) => handleSoakTypeChange(event.target.value as SoakType)}
                    >
                      {Object.values(SOAK_TEMPLATES).map((template) => (
                        <option key={template.soakType} value={template.soakType}>
                          {template.label}
                        </option>
                      ))}
                    </select>
                    <div className="text-[11px] text-dim">{selectedSoakTemplate.description}</div>
                  </div>

                  {soakType === "CUSTOM" ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="custom-duration-hours"
                          className="text-[11px] font-mono uppercase tracking-wider text-mute"
                        >
                          Duration (hours)
                        </label>
                        <Input
                          id="custom-duration-hours"
                          type="number"
                          min={1}
                          max={720}
                          step={1}
                          value={durationHours}
                          onChange={(event) =>
                            setDurationHours(Number.parseInt(event.target.value || "0", 10) || 0)
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label
                          htmlFor="custom-checkpoint-count"
                          className="text-[11px] font-mono uppercase tracking-wider text-mute"
                        >
                          Checkpoint count
                        </label>
                        <Input
                          id="custom-checkpoint-count"
                          type="number"
                          min={1}
                          max={24}
                          step={1}
                          value={checkpointCount}
                          onChange={(event) =>
                            setCheckpointCount(Number.parseInt(event.target.value || "0", 10) || 0)
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-bd bg-bg1/60 px-3 py-3">
                      <div className="text-[11px] font-mono uppercase tracking-wider text-mute">
                        Template schedule
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-dim">
                        <div>Duration: {selectedSoakTemplate.defaultDurationHours}h</div>
                        <div>Checkpoints: {selectedSoakTemplate.defaultCheckpointCount}</div>
                        <div>Labels: {selectedSoakTemplate.checkpointLabels.join(", ")}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="soak-report-print-grid grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="soak-report-print-block rounded-lg border border-bd bg-bg2/40 p-4 space-y-4">
                  <div className="flex items-start gap-3">
                    <Flag className="mt-0.5 h-4 w-4 text-accent" />
                    <div>
                      <h3 className="text-sm font-semibold tracking-tight">
                        {selectedSoakTemplate.label} - Operator Baseline
                      </h3>
                      <p className="mt-0.5 text-xs text-mute">
                        Capture the T0 baseline at soak start. Use checkpoint snapshots for{" "}
                        {derivedCheckpointSummary}. If no baseline exists yet, the first snapshot
                        saved here is automatically marked{" "}
                        <span className="font-mono">baseline</span>.
                      </p>
                      <p className="mt-1 text-[11px] text-dim">
                        Auto-prefilled where current data already exists: page access start time,
                        frontend watchlist, live watchlist symbols, and notes summary.
                      </p>
                    </div>
                  </div>

                  {baselineCheckpoint && (
                    <div className="space-y-3">
                      <div className="soak-report-print-block rounded-md border border-buy/30 bg-buy/10 px-3 py-3 text-xs text-buy">
                        <div className="flex items-center gap-2 font-semibold">
                          <CheckCircle2 className="h-4 w-4" />
                          Baseline captured
                        </div>
                        <div className="mt-1 text-dim">
                          Saved at {formatTimestamp(baselineCheckpoint.created_at)}. Additional
                          edits here update the operator baseline evidence but do not create a
                          second baseline snapshot.
                        </div>
                      </div>

                      <div className="soak-report-print-block rounded-md border border-warn/40 bg-warn/10 px-3 py-3 text-xs text-warn">
                        <div className="flex items-center gap-2 font-semibold">
                          <AlertTriangle className="h-4 w-4" />
                          Baseline already captured - do not replace
                        </div>
                        <div className="mt-1 text-dim">
                          The preserved baseline snapshot remains the soak reference point. A new
                          baseline capture is locked on this admin session.
                        </div>
                      </div>
                    </div>
                  )}

                  <form className="space-y-3" onSubmit={handleBaselineSubmit}>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field
                        label="Started by"
                        value={baselineForm.startedBy}
                        onChange={(value) =>
                          setBaselineForm((current) => ({ ...current, startedBy: value }))
                        }
                        placeholder="Kudzie"
                      />
                      <Field
                        label="Start time"
                        value={baselineForm.startedAt}
                        onChange={(value) =>
                          setBaselineForm((current) => ({ ...current, startedAt: value }))
                        }
                        type="datetime-local"
                      />
                      <Field
                        label="MT5 terminal status"
                        value={baselineForm.mt5TerminalStatus}
                        onChange={(value) =>
                          setBaselineForm((current) => ({
                            ...current,
                            mt5TerminalStatus: value,
                          }))
                        }
                        placeholder="Online, running multiple clients"
                      />
                      <Field
                        label="Auth confirmed"
                        value={baselineForm.authConfirmed}
                        onChange={(value) =>
                          setBaselineForm((current) => ({ ...current, authConfirmed: value }))
                        }
                        placeholder="YES"
                      />
                      <Field
                        label="Health endpoint"
                        value={baselineForm.backendHealthEndpoint}
                        onChange={(value) =>
                          setBaselineForm((current) => ({
                            ...current,
                            backendHealthEndpoint: value,
                          }))
                        }
                        placeholder="https://.../wp-json/sniper/v1/health"
                      />
                      <Field
                        label="T+0 health summary"
                        value={baselineForm.t0HealthSummary}
                        onChange={(value) =>
                          setBaselineForm((current) => ({ ...current, t0HealthSummary: value }))
                        }
                        placeholder="feedStatus=stale, backendSync=live, twelveDataKeyStatus=ok"
                      />
                      <Field
                        label="Twelve Data key status"
                        value={baselineForm.twelveDataKeyStatus}
                        onChange={(value) =>
                          setBaselineForm((current) => ({
                            ...current,
                            twelveDataKeyStatus: value,
                          }))
                        }
                        placeholder="ok"
                      />
                      <Field
                        label="Soak objective"
                        value={baselineForm.soakPurpose}
                        onChange={(value) =>
                          setBaselineForm((current) => ({
                            ...current,
                            soakPurpose: value,
                          }))
                        }
                        placeholder="Stability soak for live feed parity and dashboard diagnostics"
                      />
                    </div>

                    <TextField
                      label="EA symbols running"
                      value={baselineForm.eaSymbols}
                      onChange={(value) =>
                        setBaselineForm((current) => ({ ...current, eaSymbols: value }))
                      }
                      placeholder="EURUSD, USDJPY, GBPUSD..."
                    />
                    <TextField
                      label="Frontend watchlist"
                      value={baselineForm.frontendWatchlist}
                      onChange={(value) =>
                        setBaselineForm((current) => ({ ...current, frontendWatchlist: value }))
                      }
                      placeholder="USDJPY, NZDUSD, USDCHF..."
                      hint={autoBaselineFields.frontendWatchlist}
                    />
                    <TextField
                      label="Watchlist live symbols at T+0"
                      value={baselineForm.watchlistLiveSymbols}
                      onChange={(value) =>
                        setBaselineForm((current) => ({
                          ...current,
                          watchlistLiveSymbols: value,
                        }))
                      }
                      placeholder="7 currency pairs plus BTCUSD live"
                      hint={autoBaselineFields.watchlistLiveSymbols}
                    />
                    <TextField
                      label="Baseline notes"
                      value={baselineForm.notes}
                      onChange={(value) =>
                        setBaselineForm((current) => ({ ...current, notes: value }))
                      }
                      placeholder="Lowest candle count observed was 33..."
                      hint={autoBaselineFields.notes}
                    />

                    {baselineCaptureLocked ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          disabled
                          variant="outline"
                          title="Baseline already captured. Saving a new baseline is not permitted."
                          aria-label="Baseline already captured. Saving a new baseline is not permitted."
                        >
                          Capture Baseline & Start Soak
                        </Button>
                        <Button type="submit" disabled={baselineSaving}>
                          {baselineSaving ? "Saving..." : "Update Baseline Evidence"}
                        </Button>
                      </div>
                    ) : (
                      <Button type="submit" disabled={baselineSaving}>
                        {baselineSaving ? "Saving..." : "Capture Baseline & Start Soak"}
                      </Button>
                    )}
                  </form>
                </div>

                <div className="soak-report-print-block rounded-lg border border-bd bg-bg2/40 p-4 space-y-4">
                  <div className="flex items-start gap-3">
                    <ClipboardList className="mt-0.5 h-4 w-4 text-accent" />
                    <div>
                      <h3 className="text-sm font-semibold tracking-tight">
                        {selectedSoakTemplate.label} Timeline
                      </h3>
                      <p className="mt-0.5 text-xs text-mute">
                        Use checkpoint snapshots for {derivedCheckpointSummary}. Baseline is stored
                        separately and never overwritten by later checkpoints.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-dim">
                    {renderTimelineRow("T0 baseline", baselineCheckpoint)}
                    {derivedCheckpointLabels.map((label, index) =>
                      renderTimelineRow(label, soakState.report.checkpoints[index] ?? null),
                    )}
                  </div>

                  <div className="soak-report-print-block rounded-md border border-bd bg-bg1/60 px-3 py-3">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-mute">
                      Latest engine summary
                    </div>
                    <div className="mt-2 grid gap-2 text-xs text-dim">
                      <div>
                        Engine runs 24h: {String(soakState.report.engine_runs_summary.total_24h)}
                      </div>
                      <div>
                        Success 24h: {String(soakState.report.engine_runs_summary.success_24h)}
                      </div>
                      <div>
                        Errors 24h: {String(soakState.report.engine_runs_summary.error_24h)}
                      </div>
                      <div>
                        Last run:{" "}
                        {formatTimestamp(soakState.report.engine_runs_summary.last_run_at)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="soak-report-print-grid grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="soak-report-print-block rounded-lg border border-bd bg-bg2/40 p-4 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">Manual Evidence</h3>
                    <p className="mt-0.5 text-xs text-mute">
                      Save operator-confirmed proof such as parity checks, stale-window behavior,
                      restarts, screenshots, or copied log findings.
                    </p>
                  </div>

                  <form className="space-y-3" onSubmit={handleEvidenceSubmit}>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field
                        label="Evidence key"
                        value={evidenceForm.evidence_key}
                        onChange={(value) =>
                          setEvidenceForm((current) => ({ ...current, evidence_key: value }))
                        }
                        placeholder="soak-feed-window-2026-05-10"
                      />

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-mono uppercase tracking-wider text-mute">
                          Evidence type
                        </label>
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          value={evidenceForm.evidence_type}
                          onChange={(event) =>
                            setEvidenceForm((current) => ({
                              ...current,
                              evidence_type: event.target.value as SoakEvidenceType,
                            }))
                          }
                        >
                          {SOAK_EVIDENCE_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <TextField
                      label="Evidence value"
                      value={evidenceForm.evidence_value}
                      onChange={(value) =>
                        setEvidenceForm((current) => ({ ...current, evidence_value: value }))
                      }
                      placeholder="Describe the observation, pasted log lines, screenshot reference, or SQL result."
                    />

                    <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                      <Field
                        label="Operator"
                        value={evidenceForm.operator}
                        onChange={(value) =>
                          setEvidenceForm((current) => ({ ...current, operator: value }))
                        }
                        placeholder="wordpress-admin"
                      />

                      <Button type="submit" disabled={evidenceSaving}>
                        {evidenceSaving ? "Saving..." : "Save Evidence"}
                      </Button>
                    </div>
                  </form>

                  <div className="soak-report-print-table overflow-x-auto">
                    <table className="min-w-full text-left text-xs">
                      <thead className="text-mute">
                        <tr className="border-b border-bd">
                          <th className="px-2 py-2 font-mono uppercase tracking-wider">Key</th>
                          <th className="px-2 py-2 font-mono uppercase tracking-wider">Type</th>
                          <th className="px-2 py-2 font-mono uppercase tracking-wider">Operator</th>
                          <th className="px-2 py-2 font-mono uppercase tracking-wider">Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {evidenceRows.length === 0 ? (
                          <tr>
                            <td className="px-2 py-3 text-dim" colSpan={4}>
                              No manual evidence saved yet.
                            </td>
                          </tr>
                        ) : (
                          evidenceRows.map((row) => (
                            <tr key={row.id} className="border-b border-bd/50 last:border-b-0">
                              <td className="px-2 py-2 align-top font-mono text-tx">
                                <div>{row.evidence_key}</div>
                                <div className="mt-1 whitespace-pre-wrap text-dim">
                                  {row.evidence_value}
                                </div>
                              </td>
                              <td className="px-2 py-2 align-top text-dim">{row.evidence_type}</td>
                              <td className="px-2 py-2 align-top text-dim">{row.operator}</td>
                              <td className="px-2 py-2 align-top text-dim">
                                {formatTimestamp(row.updated_at)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="soak-report-print-block rounded-lg border border-bd bg-bg2/40 p-4 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">Checkpoint Snapshots</h3>
                    <p className="mt-0.5 text-xs text-mute">
                      Save periodic snapshots during the soak. These are separate from the baseline
                      and preserved as point-in-time evidence.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-md border border-bd bg-bg1/60 px-3 py-3">
                      <div className="text-[11px] font-mono uppercase tracking-wider text-mute">
                        Next checkpoint
                      </div>
                      <div className="mt-1 text-xs text-dim">
                        {nextCheckpointLabel ?? "All planned checkpoints are already labeled."}
                      </div>
                    </div>
                    <TextField
                      label="Checkpoint notes"
                      value={checkpointNotes}
                      onChange={setCheckpointNotes}
                      placeholder="Optional notes for the current soak checkpoint."
                    />
                    <Button
                      type="button"
                      onClick={handleCheckpointSave}
                      disabled={
                        checkpointSaving ||
                        !baselineCheckpoint ||
                        derivedCheckpointLabels.length === 0
                      }
                    >
                      {checkpointSaving
                        ? "Saving..."
                        : nextCheckpointLabel
                          ? `Save ${nextCheckpointLabel} Snapshot`
                          : "Save Checkpoint Snapshot"}
                    </Button>
                    {!baselineCheckpoint && (
                      <div className="text-xs text-warn">
                        Capture the baseline first. The soak starts when the baseline snapshot is
                        saved.
                      </div>
                    )}
                    {baselineCheckpoint && derivedCheckpointLabels.length === 0 && (
                      <div className="text-xs text-warn">
                        Configure duration and checkpoint count before saving snapshots.
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <section
                      aria-labelledby="baseline-snapshot-heading"
                      className="soak-report-print-block space-y-3 rounded-md border border-bd/70 bg-bg1/30 p-3"
                    >
                      <div className="border-b border-bd/70 pb-2">
                        <h4
                          id="baseline-snapshot-heading"
                          className="text-[11px] font-mono uppercase tracking-[0.24em] text-mute"
                        >
                          Baseline Snapshot
                        </h4>
                        <p className="mt-1 text-xs text-dim">
                          Immutable reference point for the soak. Saved once, then preserved.
                        </p>
                      </div>
                      {baselineCheckpoint ? (
                        <CheckpointCard checkpoint={baselineCheckpoint} title="Baseline" />
                      ) : (
                        <div className="rounded-md border border-dashed border-bd px-3 py-4 text-xs text-dim">
                          Baseline not captured yet.
                        </div>
                      )}
                    </section>

                    <section
                      aria-labelledby="checkpoint-history-heading"
                      className="soak-report-print-block space-y-3 rounded-md border border-bd/70 bg-bg1/30 p-3"
                    >
                      <div className="border-b border-bd/70 pb-2">
                        <h4
                          id="checkpoint-history-heading"
                          className="text-[11px] font-mono uppercase tracking-[0.24em] text-mute"
                        >
                          Checkpoint History
                        </h4>
                        <p className="mt-1 text-xs text-dim">
                          Additive snapshots captured at later soak intervals.
                        </p>
                      </div>

                      {soakState.report.checkpoints.length === 0 ? (
                        <div className="rounded-md border border-dashed border-bd px-3 py-4 text-xs text-dim">
                          No non-baseline checkpoints saved yet.
                        </div>
                      ) : (
                        soakState.report.checkpoints
                          .slice(0, 6)
                          .map((checkpoint) => (
                            <CheckpointCard
                              key={checkpoint.id}
                              checkpoint={checkpoint}
                              title="Checkpoint"
                            />
                          ))
                      )}
                    </section>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </details>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-mono uppercase tracking-wider text-mute">{label}</label>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-mono uppercase tracking-wider text-mute">{label}</label>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {hint && value === hint && (
        <div className="text-[11px] text-dim">Auto-filled from current app/backend state.</div>
      )}
    </div>
  );
}

function HealthCard({
  label,
  value,
  tone = "neutral",
  detail,
  className,
  icon,
  badge,
  badgeTone,
  headerDetail,
}: {
  label: string;
  value: string;
  tone?: "positive" | "warning" | "critical" | "neutral";
  detail?: string;
  className?: string;
  icon?: ReactNode;
  badge?: string;
  badgeTone?: "positive" | "warning" | "critical" | "neutral";
  headerDetail?: string;
}) {
  const toneClass =
    tone === "positive"
      ? "border-buy/30 bg-buy/10 text-buy"
      : tone === "warning"
        ? "border-warn/30 bg-warn/10 text-warn"
        : tone === "critical"
          ? "border-sell/30 bg-sell/10 text-sell"
          : "border-bd bg-bg2/50 text-tx";
  const badgeClass =
    (badgeTone ?? tone) === "positive"
      ? "border-buy/30 bg-buy/10 text-buy"
      : (badgeTone ?? tone) === "warning"
        ? "border-warn/30 bg-warn/10 text-warn"
        : (badgeTone ?? tone) === "critical"
          ? "border-sell/30 bg-sell/10 text-sell"
          : "border-bd bg-bg2/50 text-mute";

  return (
    <div className={`rounded-lg border border-bd bg-bg1/60 p-4 space-y-2 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-mute">
            {icon ? <span className="shrink-0">{icon}</span> : null}
            <span>{label}</span>
          </div>
          {headerDetail ? <div className="mt-1 text-[11px] text-dim">{headerDetail}</div> : null}
        </div>
        {badge ? (
          <span
            className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] ${badgeClass}`}
          >
            {badge}
          </span>
        ) : null}
      </div>
      <div
        className={`inline-flex rounded border px-2 py-1 font-mono text-sm uppercase ${toneClass}`}
      >
        {value}
      </div>
      {detail ? <div className="text-[11px] text-dim">{detail}</div> : null}
    </div>
  );
}

function TimestampCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg border border-bd bg-bg1/60 p-4 space-y-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-mute">{label}</div>
      <div className="font-mono text-sm text-tx">{formatTimestamp(value)}</div>
    </div>
  );
}

function CheckpointCard({ checkpoint, title }: { checkpoint: SoakCheckpointRow; title: string }) {
  const aggregate = checkpoint.snapshot_data;
  const isBaseline = checkpoint.checkpoint_type === "baseline";
  return (
    <div
      className={`soak-report-print-block space-y-2 rounded-md border px-3 py-3 ${
        isBaseline
          ? "border-sky-400/50 bg-sky-400/8 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.12)]"
          : "border-slate-400/35 bg-slate-400/5"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.24em] ${
              isBaseline
                ? "border-sky-400/50 bg-sky-400/12 text-sky-200"
                : "border-slate-300/30 bg-slate-300/10 text-slate-200"
            }`}
          >
            {isBaseline ? "BASELINE" : "CHECKPOINT"}
          </span>
          <div className="text-xs font-mono text-tx">
            {title} {isBaseline ? "reference snapshot" : "snapshot"}
          </div>
          {isBaseline && (
            <span className="inline-flex items-center gap-1 text-[11px] text-sky-100/90">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Locked reference</span>
            </span>
          )}
        </div>
        <div className="text-[11px] text-dim">{formatTimestamp(checkpoint.created_at)}</div>
      </div>
      <div className="text-xs text-dim">
        {checkpoint.operator_notes || "No operator notes recorded."}
      </div>
      <div className="grid gap-1 text-[11px] text-dim sm:grid-cols-2">
        <div>Feed: {aggregate.health.feedStatus ?? aggregate.health.priceFeed}</div>
        <div>Backend: {aggregate.health.backendSync}</div>
        <div>Snapshots 24h: {stringOrUnavailable(aggregate.snapshots_24h)}</div>
        <div>Candles 24h: {stringOrUnavailable(aggregate.candles_24h)}</div>
      </div>
    </div>
  );
}

function defaultDateTimeLocalValue() {
  const now = new Date();
  now.setSeconds(0, 0);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function resolveHealthEndpointHint() {
  if (typeof window === "undefined") return "";

  const root = (window as Window & { SNIPER?: { root?: string } }).SNIPER?.root;
  if (typeof root === "string" && root !== "") {
    return `${root.replace(/\/$/, "")}/sniper/v1/health`;
  }

  return `${window.location.origin}/wp-json/sniper/v1/health`;
}

function resolveOperatorIdentifier(): string {
  const authHeader = getAuthHeader();
  if (!authHeader?.startsWith("Basic ")) {
    return "";
  }

  try {
    const decoded = atob(authHeader.slice("Basic ".length));
    const [username] = decoded.split(":");
    return username?.trim() ?? "";
  } catch {
    return "";
  }
}

function deriveAutoBaselineFields(
  settings: DashboardSettings,
  prices: PairPrice[],
  diagnostics: SymbolDiagnostic[],
): AutoBaselineFields {
  const watchlist = settings.watchlist ?? [];
  const frontendWatchlist = watchlist.join(", ");

  const priceBySymbol = new Map(prices.map((price) => [price.symbol, price]));
  const diagnosticBySymbol = new Map(
    diagnostics.map((diagnostic) => [diagnostic.symbol, diagnostic]),
  );

  const liveSymbols = watchlist.filter((symbol) => {
    const price = priceBySymbol.get(symbol);
    const diagnostic = diagnosticBySymbol.get(symbol);
    return price?.state === "live" || diagnostic?.priceState === "live";
  });
  const nonLiveSymbols = watchlist.filter((symbol) => !liveSymbols.includes(symbol));

  const watchlistLiveSymbols =
    watchlist.length === 0
      ? "No watchlist configured."
      : nonLiveSymbols.length === 0
        ? `${liveSymbols.length}/${watchlist.length} live: ${liveSymbols.join(", ")}`
        : `${liveSymbols.length}/${watchlist.length} live: ${liveSymbols.join(", ")} | not live: ${nonLiveSymbols.join(", ")}`;

  const lowestCandleDiagnostic = diagnostics.reduce<SymbolDiagnostic | null>(
    (lowest, diagnostic) => {
      if (!lowest) return diagnostic;
      return diagnostic.candleCount < lowest.candleCount ? diagnostic : lowest;
    },
    null,
  );
  const symbolsBelow30 = diagnostics.filter((diagnostic) => diagnostic.candleCount < 30);
  const blockers = diagnostics.filter((diagnostic) => diagnostic.engineBlocker !== "OK");

  const notesParts: string[] = [];
  notesParts.push(`Watchlist symbols: ${watchlist.length}.`);
  if (watchlist.length > 0) {
    notesParts.push(`Live watchlist symbols now: ${liveSymbols.length}/${watchlist.length}.`);
  } else {
    notesParts.push("No watchlist symbols are configured yet.");
  }
  if (lowestCandleDiagnostic) {
    notesParts.push(
      `Lowest candle count currently observed: ${lowestCandleDiagnostic.candleCount} on ${lowestCandleDiagnostic.symbol}.`,
    );
  }
  if (symbolsBelow30.length > 0) {
    notesParts.push(
      `Symbols under 30 candles: ${symbolsBelow30.map((diagnostic) => `${diagnostic.symbol}=${diagnostic.candleCount}`).join(", ")}.`,
    );
  } else if (diagnostics.length > 0) {
    notesParts.push("No watchlist symbols are currently under 30 candles.");
  }
  if (blockers.length > 0) {
    notesParts.push(
      `Active blockers: ${blockers.map((diagnostic) => `${diagnostic.symbol}=${diagnostic.engineBlocker}`).join(", ")}.`,
    );
  }

  return {
    frontendWatchlist,
    watchlistLiveSymbols,
    notes: notesParts.join(" "),
  };
}

function createBaselineFormDefaults({
  pageAccessedAt,
  autoBaselineFields,
  health,
  soakType,
}: {
  pageAccessedAt: string;
  autoBaselineFields: AutoBaselineFields;
  health: AdminHealthResponse | null;
  soakType: SoakType;
}): BaselineForm {
  return {
    soakType,
    soakPurpose: "",
    startedBy: resolveOperatorIdentifier(),
    startedAt: pageAccessedAt,
    eaSymbols: "",
    frontendWatchlist: autoBaselineFields.frontendWatchlist,
    mt5TerminalStatus: "Online",
    backendHealthEndpoint: resolveHealthEndpointHint(),
    t0HealthSummary: health ? buildHealthSummary(health) : "",
    authConfirmed: "YES",
    twelveDataKeyStatus: health ? (health.twelveDataKeyStatus ?? health.twelveDataKey) : "",
    watchlistLiveSymbols: autoBaselineFields.watchlistLiveSymbols,
    notes: autoBaselineFields.notes,
  };
}

function hydrateBaselineForm(form: BaselineForm, rows: SoakEvidenceRow[]): BaselineForm {
  const evidenceMap = indexEvidenceByKey(rows);
  const hydratedSoakType = (
    evidenceMap["baseline.soak_type"] ??
    evidenceMap["soak.type"] ??
    evidenceMap["soak_type"] ??
    form.soakType
  )
    .trim()
    .toUpperCase();

  return {
    ...form,
    soakType:
      hydratedSoakType === "PHASE_0_RESTART_72H" || hydratedSoakType === "PHASE_3_STABILITY_72H"
        ? hydratedSoakType
        : form.soakType,
    soakPurpose: evidenceMap["baseline.soak_purpose"] ?? form.soakPurpose,
    startedBy: evidenceMap["baseline.started_by"] ?? form.startedBy,
    startedAt: evidenceMap["baseline.started_at"] ?? form.startedAt,
    eaSymbols: evidenceMap["baseline.ea_symbols"] ?? form.eaSymbols,
    frontendWatchlist: evidenceMap["baseline.frontend_watchlist"] ?? form.frontendWatchlist,
    mt5TerminalStatus: evidenceMap["baseline.mt5_terminal_status"] ?? form.mt5TerminalStatus,
    backendHealthEndpoint:
      evidenceMap["baseline.backend_health_endpoint"] ?? form.backendHealthEndpoint,
    t0HealthSummary: evidenceMap["baseline.t0_health_summary"] ?? form.t0HealthSummary,
    authConfirmed: evidenceMap["baseline.auth_confirmed"] ?? form.authConfirmed,
    twelveDataKeyStatus: evidenceMap["baseline.twelve_data_key_status"] ?? form.twelveDataKeyStatus,
    watchlistLiveSymbols:
      evidenceMap["baseline.watchlist_live_symbols"] ?? form.watchlistLiveSymbols,
    notes: evidenceMap["baseline.notes"] ?? form.notes,
  };
}

function buildHealthSummary(health: AdminHealthResponse): string {
  return [
    `feedStatus=${health.feedStatus ?? health.priceFeed}`,
    `backendSync=${health.backendSync}`,
    `twelveDataKeyStatus=${health.twelveDataKeyStatus ?? health.twelveDataKey}`,
  ].join(", ");
}

function deriveCheckpointLabels(
  soakType: SoakType,
  durationHours: number,
  checkpointCount: number,
): string[] {
  if (soakType !== "CUSTOM") {
    return SOAK_TEMPLATES[soakType].checkpointLabels;
  }

  if (durationHours < 1 || checkpointCount < 1) {
    return [];
  }

  return Array.from({ length: checkpointCount }, (_, index) => {
    const checkpointHour = (durationHours * (index + 1)) / checkpointCount;
    return `T+${formatCheckpointHour(checkpointHour)}h`;
  });
}

function inferSoakTypeFromReport(report: SoakReport): SoakType | null {
  const evidenceMap = indexEvidenceByKey(report.manual_evidence);
  const persistedType = (
    evidenceMap["baseline.soak_type"] ??
    evidenceMap["soak.type"] ??
    evidenceMap["soak_type"] ??
    ""
  )
    .trim()
    .toUpperCase();

  if (persistedType === "PHASE_0_RESTART_72H" || persistedType === "PHASE_3_STABILITY_72H") {
    return persistedType;
  }

  return null;
}

function formatCheckpointHour(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2).replace(/\.?0+$/, "");
}

function buildBaselineEvidenceEntries(form: BaselineForm, operator: string): SoakEvidencePayload[] {
  return [
    evidenceEntry("baseline.soak_type", "baseline_metadata", form.soakType, operator),
    evidenceEntry("baseline.soak_purpose", "baseline_metadata", form.soakPurpose, operator),
    evidenceEntry("baseline.started_by", "baseline_metadata", form.startedBy, operator),
    evidenceEntry("baseline.started_at", "baseline_metadata", form.startedAt, operator),
    evidenceEntry("baseline.ea_symbols", "baseline_metadata", form.eaSymbols, operator),
    evidenceEntry(
      "baseline.frontend_watchlist",
      "baseline_metadata",
      form.frontendWatchlist,
      operator,
    ),
    evidenceEntry(
      "baseline.mt5_terminal_status",
      "baseline_metadata",
      form.mt5TerminalStatus,
      operator,
    ),
    evidenceEntry(
      "baseline.backend_health_endpoint",
      "baseline_metadata",
      form.backendHealthEndpoint,
      operator,
    ),
    evidenceEntry(
      "baseline.t0_health_summary",
      "baseline_metadata",
      form.t0HealthSummary,
      operator,
    ),
    evidenceEntry("baseline.auth_confirmed", "baseline_metadata", form.authConfirmed, operator),
    evidenceEntry(
      "baseline.twelve_data_key_status",
      "baseline_metadata",
      form.twelveDataKeyStatus,
      operator,
    ),
    evidenceEntry(
      "baseline.watchlist_live_symbols",
      "baseline_metadata",
      form.watchlistLiveSymbols,
      operator,
    ),
    evidenceEntry("baseline.notes", "baseline_metadata", form.notes, operator),
  ];
}

function evidenceEntry(
  evidence_key: string,
  evidence_type: SoakEvidenceType,
  evidence_value: string,
  operator: string,
): SoakEvidencePayload {
  return {
    evidence_key,
    evidence_type,
    evidence_value,
    operator,
  };
}

function indexEvidenceByKey(rows: SoakEvidenceRow[]) {
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.evidence_key] = row.evidence_value;
  }
  return map;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Unavailable";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString();
}

function formatSoakAge(value: string | null): string {
  if (!value) return "Not started";

  const baseline = new Date(value);
  if (Number.isNaN(baseline.getTime())) return "Unknown";

  const diffMs = Date.now() - baseline.getTime();
  if (diffMs < 0) return "0h";

  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function formatSoakReportError(error: unknown, action: "load" | "refresh"): string {
  const statusCode = resolveErrorStatusCode(error);
  const errorCode = resolveErrorCode(error);
  const actionLabel = action === "load" ? "initial load" : "refresh";
  const parts = [`Soak report data source failed during ${actionLabel}.`];

  if (statusCode !== null) {
    parts.push(`HTTP ${statusCode}.`);
  }

  if (errorCode) {
    parts.push(`Error code: ${errorCode}.`);
  }

  if (error instanceof Error && error.message.trim()) {
    parts.push(`Detail: ${error.message}.`);
  }

  parts.push("Retry the soak report. Contact backend on-call if this persists.");
  return parts.join(" ");
}

function resolveErrorStatusCode(error: unknown): number | null {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number" && Number.isFinite(status)) {
      return status;
    }
  }

  if (error instanceof Error) {
    const match = error.message.match(/failed:\s*(\d{3})\b/i);
    if (match) {
      return Number.parseInt(match[1], 10);
    }
  }

  return null;
}

function resolveErrorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) {
      return code.trim();
    }
  }

  if (error instanceof Error) {
    const match = error.message.match(/"(?:error|code)":"([^"]+)"/i);
    if (match) {
      return match[1];
    }
  }

  return null;
}

function renderTimelineRow(label: string, checkpoint: SoakCheckpointRow | null) {
  return (
    <div className="flex items-center justify-between rounded-md border border-bd bg-bg1/60 px-3 py-2">
      <div className="font-mono text-tx">{label}</div>
      <div>{checkpoint ? formatTimestamp(checkpoint.created_at) : "Pending"}</div>
    </div>
  );
}

function stringOrUnavailable(value: number | null) {
  return value === null ? "Unavailable" : String(value);
}

function toneForStatus(value: string | undefined): "positive" | "warning" | "critical" | "neutral" {
  switch (value) {
    case "live":
    case "present":
    case "ok":
      return "positive";
    case "cached":
    case "stale":
    case "missing":
    case "rate-limited":
      return "warning";
    case "blocked":
    case "offline":
    case "failed":
      return "critical";
    default:
      return "neutral";
  }
}

function buildSoakReportMarkdown(report: SoakReport, template: { label: string; soakType: string }): string {
  const evidenceMap = indexEvidenceByKey(report.manual_evidence);
  const evidenceLines =
    report.manual_evidence.length === 0
      ? ["- None recorded"]
      : report.manual_evidence.map(
          (row) =>
            `- ${row.evidence_key} | ${row.evidence_type} | ${row.operator} | ${formatTimestamp(row.updated_at)} | ${row.evidence_value.replace(/\r?\n/g, " ")}`,
        );

  const checkpointLines =
    report.checkpoints.length === 0
      ? ["- None recorded"]
      : report.checkpoints.map(
          (row) =>
            `- ${row.checkpoint_type} | ${formatTimestamp(row.created_at)} | ${row.operator_notes ?? "No operator notes"}`,
        );

  const baselineLine = report.baseline_checkpoint
    ? `- ${formatTimestamp(report.baseline_checkpoint.created_at)} | ${report.baseline_checkpoint.operator_notes ?? "No operator notes"}`
    : "- Pending";

  const soakPurpose =
    evidenceMap["baseline.soak_purpose"] ?? evidenceMap["soak.purpose"] ?? "";

  const reportLines = [
    `# ${template.label}`,
    "",
    `Soak type: ${template.soakType}`,
  ];

  if (soakPurpose) {
    reportLines.push(`Soak objective: ${soakPurpose}`, "");
  } else {
    reportLines.push("");
  }

  reportLines.push(
    `Generated at: ${report.generated_at}`,
    "",
    "## Baseline",
    baselineLine,
    "",
  );

  return [
    ...reportLines,
    "## Health",
    `- Feed status: ${report.health.feedStatus ?? report.health.priceFeed}`,
    `- Backend sync: ${report.health.backendSync}`,
    `- Engine run state: ${report.health.engineRunState ?? "unknown"}`,
    `- Last batch: ${formatTimestamp(report.health.lastBatchAt)}`,
    `- Last engine run: ${formatTimestamp(report.health.lastEngineRunAt)}`,
    "",
    "## Aggregates",
    `- Watchlist count: ${report.watchlist_count === null ? "Unavailable" : report.watchlist_count}`,
    `- Snapshots 24h: ${report.snapshots_24h === null ? "Unavailable" : report.snapshots_24h}`,
    `- Candles 24h: ${report.candles_24h === null ? "Unavailable" : report.candles_24h}`,
    `- Engine runs 24h: total=${report.engine_runs_summary.total_24h}, success=${report.engine_runs_summary.success_24h}, error=${report.engine_runs_summary.error_24h}, last=${formatTimestamp(report.engine_runs_summary.last_run_at)}`,
    `- Audit events 24h: total=${report.audit_events_summary.total_24h}, error=${report.audit_events_summary.error_count_24h}, warning=${report.audit_events_summary.warning_count_24h}`,
    "",
    "## Manual Evidence",
    ...evidenceLines,
    "",
    "## Checkpoints",
    ...checkpointLines,
    "",
  ].join("\n");
}
