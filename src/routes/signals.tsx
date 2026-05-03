import { createFileRoute } from "@tanstack/react-router";
import {
  useEngineHealth,
  useEngineBatch,
  useLiveSignals,
  useWatchlist,
} from "@/hooks/useSniperData";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { VerdictBadge } from "@/components/sniper/VerdictBadge";
import { DivergenceBanner } from "@/components/sniper/Warnings";
import { relTime } from "@/lib/format";
import { cn, deduplicateById } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { EngineBlocker, FreshnessState } from "@/types/sniper";

export const Route = createFileRoute("/signals")({
  head: () => ({
    meta: [
      { title: "Signal Engine — SMC SuperFIB" },
      {
        name: "description",
        content: "Engine readiness checklist and live signal candidates with backend confirmation.",
      },
      { property: "og:title", content: "Signal Engine — SMC SuperFIB" },
      { property: "og:description", content: "Engine health and live candidate signals." },
    ],
  }),
  component: SignalsPage,
});

function HealthIcon({ state }: { state: FreshnessState | "ok" | "missing" }) {
  if (state === "live" || state === "ok") return <CheckCircle2 className="h-4 w-4 text-buy" />;
  if (state === "stale" || state === "pending-sync" || state === "mock")
    return <AlertTriangle className="h-4 w-4 text-warn" />;
  return <XCircle className="h-4 w-4 text-sell" />;
}

function blockerLabel(b: EngineBlocker | undefined): string {
  if (!b || b === "OK") return "";
  return b.replace(/_/g, " ").toLowerCase();
}

function blockerSeverity(b: EngineBlocker | undefined): "warn" | "sell" {
  if (!b || b === "OK") return "warn";
  return b === "KEY_MISSING" || b === "KEY_INVALID" || b === "RATE_LIMITED" ? "sell" : "warn";
}

function SignalsPage() {
  const { data: signals } = useLiveSignals();
  const { data: h } = useEngineHealth();
  const { mutate: runBatch, isPending: batchRunning } = useEngineBatch();
  const watchlist = useWatchlist();
  const [watchlistOnly, setWatchlistOnly] = useState(true);

  const allUnique = signals ? deduplicateById(signals) : [];
  const uniqueSignals =
    watchlistOnly && watchlist.length > 0
      ? allUnique.filter((s) => watchlist.includes(s.symbol))
      : allUnique;

  const divergent = uniqueSignals.filter((s) => s.computedBy === "frontend" && !s.backendConfirmed);

  // feedStatus supersedes priceFeed when present; "rate-limited" is not a FreshnessState value.
  const rawFeedState = h?.feedStatus ?? h?.priceFeed ?? "offline";
  const feedState: FreshnessState =
    rawFeedState === "rate-limited" ? "stale" : (rawFeedState as FreshnessState);
  const checks: { label: string; state: FreshnessState | "ok" | "missing"; detail?: string }[] = [
    {
      label: "Backend sync",
      state: h?.backendSync ?? "offline",
      detail: h?.lastBatchAt ? relTime(h.lastBatchAt) : "never",
    },
    {
      label: "Feed status",
      state: feedState,
      detail: h?.feedStatus ?? h?.priceFeed,
    },
    {
      label: "Twelve Data key",
      state:
        h?.twelveDataKeyStatus === "ok" ||
        (!h?.twelveDataKeyStatus && h?.twelveDataKey === "present")
          ? "ok"
          : "missing",
      detail: h?.twelveDataKeyStatus ? h.twelveDataKeyStatus.replace("-", " ") : undefined,
    },
    {
      label: "Engine run",
      state:
        h?.engineRunState === "live" || h?.engineRunState === "cached"
          ? "live"
          : h?.engineRunState === "stale"
            ? "stale"
            : "offline",
      detail: h?.engineRunState ?? (h?.lastEngineRunAt ? relTime(h.lastEngineRunAt) : "never"),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Signal Engine</h1>
          <p className="text-xs text-mute mt-0.5">
            Readiness · candidate flow · backend confirmation
          </p>
        </div>
        <button
          onClick={() => runBatch()}
          disabled={batchRunning}
          className="flex items-center gap-1.5 rounded border border-bd bg-bg2/60 px-3 py-1.5 text-[11px] font-mono text-dim hover:text-fg hover:border-info/40 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={cn("h-3 w-3", batchRunning && "animate-spin")} />
          {batchRunning ? "Refreshing…" : "Force refresh"}
        </button>
      </div>

      {divergent.length > 0 && (
        <DivergenceBanner>
          {divergent.length} frontend-only candidate{divergent.length > 1 ? "s" : ""} without
          backend confirmation.
        </DivergenceBanner>
      )}

      {/* Readiness grid */}
      <div className="rounded-lg border border-bd bg-bg1/60 p-4">
        <div className="text-[11px] font-mono uppercase tracking-wider text-mute mb-3">
          Engine readiness
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {checks.map((c) => (
            <div
              key={c.label}
              className="flex items-center justify-between gap-2 rounded border border-bd bg-bg2/40 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <HealthIcon state={c.state} />
                <span className="text-xs text-dim">{c.label}</span>
              </div>
              {c.detail && <span className="text-[10px] font-mono text-mute">{c.detail}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Candidate list */}
      <div className="rounded-lg border border-bd bg-bg1/60">
        <div className="flex items-center justify-between border-b border-bd px-4 py-2.5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-mute">
            Live candidates
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setWatchlistOnly((v) => !v)}
              className={cn(
                "text-[10px] font-mono px-2 py-0.5 rounded border transition-colors",
                watchlistOnly
                  ? "border-info/40 text-info bg-info/10"
                  : "border-bd text-mute hover:border-info/30 hover:text-info",
              )}
            >
              {watchlistOnly ? "watchlist" : "all symbols"}
            </button>
            <span className="text-[10px] font-mono text-mute">
              {uniqueSignals.length}
              {watchlistOnly && allUnique.length !== uniqueSignals.length && (
                <span className="text-mute/50"> / {allUnique.length}</span>
              )}{" "}
              total
            </span>
          </div>
        </div>
        <div className="divide-y divide-bd">
          {(uniqueSignals ?? []).map((s) => {
            const divergent = s.computedBy === "frontend" && !s.backendConfirmed;
            return (
              <div key={s.id} className="grid grid-cols-12 items-center gap-3 px-4 py-3">
                <div className="col-span-2 sm:col-span-1">
                  <VerdictBadge verdict={s.verdict} />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <div className="font-mono text-sm font-semibold">{s.symbol}</div>
                  <div
                    className={cn(
                      "text-[10px] font-mono",
                      s.direction === "LONG" ? "text-buy" : "text-sell",
                    )}
                  >
                    {s.direction}
                  </div>
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono",
                      s.status === "READY"
                        ? "border-buy/40 text-buy bg-buy/10"
                        : s.status === "ARMED"
                          ? "border-warn/40 text-warn bg-warn/10"
                          : "border-info/40 text-info bg-info/10",
                    )}
                  >
                    {s.status}
                  </span>
                </div>
                <div className="hidden sm:flex col-span-4 flex-wrap gap-1">
                  {s.confluence.slice(0, 3).map((c) => (
                    <span
                      key={c}
                      className="rounded bg-bg2 px-1.5 py-0.5 text-[9px] font-mono text-mute border border-bd"
                    >
                      {c}
                    </span>
                  ))}
                </div>
                <div className="col-span-3 flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider font-mono",
                        s.computedBy === "backend"
                          ? "border-buy/40 text-buy bg-buy/10"
                          : "border-violet/40 text-violet bg-violet/10",
                      )}
                    >
                      {s.computedBy}
                    </span>
                    {divergent ? (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-mono text-sell"
                        title="Backend has not confirmed"
                      >
                        ⚠️
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-buy" title="Backend confirmed">
                        ✓
                      </span>
                    )}
                  </div>
                  {s.engineBlocker && s.engineBlocker !== "OK" && (
                    <span
                      className={cn(
                        "text-[9px] font-mono",
                        blockerSeverity(s.engineBlocker) === "sell" ? "text-sell" : "text-warn",
                      )}
                      title={`Engine blocker: ${s.engineBlocker}`}
                    >
                      {blockerLabel(s.engineBlocker)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <span className="text-[10px] font-mono text-mute">last batch</span>
        <FreshnessBadge state={h?.backendSync ?? "offline"} />
      </div>
    </div>
  );
}
