import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import {
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
import type { SoakEvidencePayload, SoakEvidenceType, SoakReport } from "@/types/sniper";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Health - SMC SuperFIB" },
      {
        name: "description",
        content: "Admin-only backend health summary for the SMC SuperFIB dashboard.",
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

const SOAK_EVIDENCE_TYPES: SoakEvidenceType[] = [
  "signal_parity_confirm",
  "feed_stable_window",
  "engine_run_observation",
  "manual_note",
];

function AdminPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [soakState, setSoakState] = useState<SoakLoadState>({ kind: "loading" });
  const [evidenceForm, setEvidenceForm] = useState<SoakEvidencePayload>({
    evidence_key: "",
    evidence_type: "manual_note",
    evidence_value: "",
    operator: resolveOperatorIdentifier(),
  });
  const [checkpointNotes, setCheckpointNotes] = useState("");
  const [evidenceSaving, setEvidenceSaving] = useState(false);
  const [checkpointSaving, setCheckpointSaving] = useState(false);
  const [panelMessage, setPanelMessage] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);

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
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof AuthError) {
          void router.navigate({ to: "/login" });
          return;
        }
        setSoakState({
          kind: "error",
          message: error instanceof Error ? error.message : "Failed to load soak report.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

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

  const { health } = state;

  async function refreshSoakReport() {
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
      const message = error instanceof Error ? error.message : "Failed to refresh soak report.";
      setSoakState({ kind: "error", message });
      setPanelError(message);
      return null;
    }
  }

  async function handleEvidenceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEvidenceSaving(true);
    setPanelMessage(null);
    setPanelError(null);

    try {
      await upsertSoakEvidence(evidenceForm);
      await refreshSoakReport();
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
      await createSoakCheckpoint(checkpointNotes);
      await refreshSoakReport();
      setPanelMessage("Saved 12h checkpoint snapshot.");
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
    const blob = new Blob([buildSoakReportMarkdown(soakState.report)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `soak-report-${datePart}.md`;
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
        @media print {
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
            background: #ffffff;
            color: #000000;
            padding: 0;
          }

          .soak-report-print-section summary {
            display: none;
          }
        }
      `}</style>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Admin Health</h1>
        <p className="mt-0.5 text-xs text-mute">
          Administrator-only backend status from <span className="font-mono">/sniper/v1/admin/health</span>
        </p>
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
                  <th className="px-2 py-2 font-mono uppercase tracking-wider">Blocker</th>
                </tr>
              </thead>
              <tbody>
                {health.perSymbolDiagnostics.map((diagnostic) => (
                  <tr key={diagnostic.symbol} className="border-b border-bd/50 last:border-b-0">
                    <td className="px-2 py-2 font-mono text-tx">{diagnostic.symbol}</td>
                    <td className="px-2 py-2 text-dim">{diagnostic.priceState}</td>
                    <td className="px-2 py-2 text-dim">{diagnostic.candleState}</td>
                    <td className="px-2 py-2 text-dim">{diagnostic.engineBlocker}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <details open className="soak-report-print-section rounded-lg border border-bd bg-bg1/60">
        <summary className="cursor-pointer list-none border-b border-bd px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Phase 0 Soak Report</h2>
              <p className="mt-0.5 text-xs text-mute">
                Admin-only aggregation over health, snapshots, candles, engine runs, audit events,
                manual operator evidence, and 72h checkpoints.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
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
            <div className="text-sm text-mute">Loading Phase 0 soak report...</div>
          )}

          {soakState.kind === "error" && (
            <div className="rounded-md border border-sell/30 bg-sell/10 px-3 py-2 text-xs text-sell">
              {soakState.message}
            </div>
          )}

          {soakState.kind === "ready" && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <HealthCard
                  label="Watchlist symbols"
                  value={
                    soakState.report.watchlist_count === null
                      ? "Unavailable"
                      : String(soakState.report.watchlist_count)
                  }
                />
                <HealthCard label="Snapshots 24h" value={String(soakState.report.snapshots_24h)} />
                <HealthCard label="Candles 24h" value={String(soakState.report.candles_24h)} />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border border-bd bg-bg2/40 p-4 space-y-3">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-mute">
                    Engine runs (24h)
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-xs">
                      <thead className="text-mute">
                        <tr className="border-b border-bd">
                          <th className="px-2 py-2 font-mono uppercase tracking-wider">Total</th>
                          <th className="px-2 py-2 font-mono uppercase tracking-wider">Success</th>
                          <th className="px-2 py-2 font-mono uppercase tracking-wider">Error</th>
                          <th className="px-2 py-2 font-mono uppercase tracking-wider">Last run</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="px-2 py-2 text-tx">
                            {String(soakState.report.engine_runs_summary?.total_24h ?? "Unavailable")}
                          </td>
                          <td className="px-2 py-2 text-tx">
                            {String(
                              soakState.report.engine_runs_summary?.success_24h ?? "Unavailable",
                            )}
                          </td>
                          <td className="px-2 py-2 text-tx">
                            {String(soakState.report.engine_runs_summary?.error_24h ?? "Unavailable")}
                          </td>
                          <td className="px-2 py-2 text-dim">
                            {formatTimestamp(
                              soakState.report.engine_runs_summary?.last_run_at ?? null,
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-lg border border-bd bg-bg2/40 p-4 space-y-3">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-mute">
                    Audit events (24h)
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-xs">
                      <thead className="text-mute">
                        <tr className="border-b border-bd">
                          <th className="px-2 py-2 font-mono uppercase tracking-wider">Total</th>
                          <th className="px-2 py-2 font-mono uppercase tracking-wider">Error</th>
                          <th className="px-2 py-2 font-mono uppercase tracking-wider">Warning</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="px-2 py-2 text-tx">
                            {String(
                              soakState.report.audit_events_summary?.total_24h ?? "Unavailable",
                            )}
                          </td>
                          <td className="px-2 py-2 text-tx">
                            {String(
                              soakState.report.audit_events_summary?.error_count_24h ?? "Unavailable",
                            )}
                          </td>
                          <td className="px-2 py-2 text-tx">
                            {String(
                              soakState.report.audit_events_summary?.warning_count_24h ??
                                "Unavailable",
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-lg border border-bd bg-bg2/40 p-4 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">Manual evidence</h3>
                    <p className="mt-0.5 text-xs text-mute">
                      Operator-only soak evidence. Saved server-side by evidence key.
                    </p>
                  </div>

                  <form className="space-y-3" onSubmit={handleEvidenceSubmit}>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-mono uppercase tracking-wider text-mute">
                          Evidence key
                        </label>
                        <Input
                          value={evidenceForm.evidence_key}
                          onChange={(event) =>
                            setEvidenceForm((current) => ({
                              ...current,
                              evidence_key: event.target.value,
                            }))
                          }
                          placeholder="phase0-london-window-1"
                        />
                      </div>

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

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-mono uppercase tracking-wider text-mute">
                        Evidence value
                      </label>
                      <Textarea
                        value={evidenceForm.evidence_value}
                        onChange={(event) =>
                          setEvidenceForm((current) => ({
                            ...current,
                            evidence_value: event.target.value,
                          }))
                        }
                        placeholder="Describe the operator-confirmed evidence."
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-mono uppercase tracking-wider text-mute">
                          Operator
                        </label>
                        <Input
                          value={evidenceForm.operator}
                          onChange={(event) =>
                            setEvidenceForm((current) => ({
                              ...current,
                              operator: event.target.value,
                            }))
                          }
                          placeholder="wordpress-admin"
                        />
                      </div>

                      <Button type="submit" disabled={evidenceSaving}>
                        {evidenceSaving ? "Saving..." : "Save evidence"}
                      </Button>
                    </div>
                  </form>

                  <div className="overflow-x-auto">
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
                        {soakState.report.manual_evidence.length === 0 ? (
                          <tr>
                            <td className="px-2 py-3 text-dim" colSpan={4}>
                              No manual evidence saved yet.
                            </td>
                          </tr>
                        ) : (
                          soakState.report.manual_evidence.map((row) => (
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

                <div className="rounded-lg border border-bd bg-bg2/40 p-4 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">Checkpoint snapshots</h3>
                    <p className="mt-0.5 text-xs text-mute">
                      Manual 12h checkpoint captures retained for 72h.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-mono uppercase tracking-wider text-mute">
                        Operator notes
                      </label>
                      <Textarea
                        value={checkpointNotes}
                        onChange={(event) => setCheckpointNotes(event.target.value)}
                        placeholder="Optional checkpoint notes for this soak window."
                      />
                    </div>
                    <Button type="button" onClick={handleCheckpointSave} disabled={checkpointSaving}>
                      {checkpointSaving ? "Saving..." : "Save 12h Checkpoint"}
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {soakState.report.checkpoints.slice(0, 5).length === 0 ? (
                      <div className="rounded-md border border-dashed border-bd px-3 py-4 text-xs text-dim">
                        No checkpoints saved yet.
                      </div>
                    ) : (
                      soakState.report.checkpoints.slice(0, 5).map((checkpoint) => (
                        <div
                          key={checkpoint.id}
                          className="rounded-md border border-bd bg-bg1/60 px-3 py-3 space-y-1.5"
                        >
                          <div className="text-xs font-mono text-tx">
                            {formatTimestamp(checkpoint.created_at)}
                          </div>
                          <div className="text-xs text-dim">
                            {checkpoint.operator_notes || "No operator notes recorded."}
                          </div>
                        </div>
                      ))
                    )}
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

function HealthCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "positive" | "warning" | "critical" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "border-buy/30 bg-buy/10 text-buy"
      : tone === "warning"
        ? "border-warn/30 bg-warn/10 text-warn"
        : tone === "critical"
          ? "border-sell/30 bg-sell/10 text-sell"
          : "border-bd bg-bg2/50 text-tx";

  return (
    <div className="rounded-lg border border-bd bg-bg1/60 p-4 space-y-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-mute">{label}</div>
      <div className={`inline-flex rounded border px-2 py-1 font-mono text-sm uppercase ${toneClass}`}>
        {value}
      </div>
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

function formatTimestamp(value: string | null): string {
  if (!value) return "Unavailable";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString();
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

function buildSoakReportMarkdown(report: SoakReport): string {
  const evidenceLines =
    report.manual_evidence.length === 0
      ? ["- None recorded"]
      : report.manual_evidence.map(
          (row) =>
            `- ${row.evidence_key} | ${row.evidence_type} | ${row.operator} | ${formatTimestamp(row.updated_at)} | ${row.evidence_value.replace(/\r?\n/g, " ")}`,
        );

  const checkpointLines =
    report.checkpoints.slice(0, 5).length === 0
      ? ["- None recorded"]
      : report.checkpoints
          .slice(0, 5)
          .map(
            (row) =>
              `- ${formatTimestamp(row.created_at)} | ${row.operator_notes ?? "No operator notes"}`,
          );

  return [
    "# Phase 0 Soak Report",
    "",
    `Generated at: ${report.generated_at}`,
    "",
    "## Health",
    `- Feed status: ${report.health.feedStatus ?? report.health.priceFeed}`,
    `- Backend sync: ${report.health.backendSync}`,
    `- Engine run state: ${report.health.engineRunState ?? "unknown"}`,
    `- Last batch: ${formatTimestamp(report.health.lastBatchAt)}`,
    `- Last engine run: ${formatTimestamp(report.health.lastEngineRunAt)}`,
    "",
    "## Aggregates",
    `- Watchlist count: ${report.watchlist_count === null ? "Unavailable" : report.watchlist_count}`,
    `- Snapshots 24h: ${report.snapshots_24h}`,
    `- Candles 24h: ${report.candles_24h}`,
    `- Engine runs 24h: total=${report.engine_runs_summary?.total_24h ?? "Unavailable"}, success=${report.engine_runs_summary?.success_24h ?? "Unavailable"}, error=${report.engine_runs_summary?.error_24h ?? "Unavailable"}, last=${formatTimestamp(report.engine_runs_summary?.last_run_at ?? null)}`,
    `- Audit events 24h: total=${report.audit_events_summary?.total_24h ?? "Unavailable"}, error=${report.audit_events_summary?.error_count_24h ?? "Unavailable"}, warning=${report.audit_events_summary?.warning_count_24h ?? "Unavailable"}`,
    "",
    "## Manual Evidence",
    ...evidenceLines,
    "",
    "## Recent Checkpoints",
    ...checkpointLines,
    "",
  ].join("\n");
}
