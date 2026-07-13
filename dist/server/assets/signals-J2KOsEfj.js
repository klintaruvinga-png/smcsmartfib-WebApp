import { jsx, jsxs } from "react/jsx-runtime";
import { u as useLiveSignals, a as useEngineHealth, b as usePollingUiState, c as useEngineBatch, d as useCanonicalWatchlist, e as deduplicateById, n as normalizeSymbolForWatchlistComparison, r as relTime, f as cn, D as DivergenceBanner, F as FreshnessBadge } from "./router-DONb8JY3.js";
import { S as SettingsQueryErrorState } from "./SettingsQueryErrorState-2nE1Yemg.js";
import { V as VerdictBadge } from "./VerdictBadge-B6Djk0kB.js";
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import "@tanstack/react-router";
import "@tanstack/react-query";
import "clsx";
import "tailwind-merge";
import "sonner";
import "recharts";
import "@radix-ui/react-slot";
import "class-variance-authority";
function HealthIcon({ state }) {
  if (state === "live" || state === "ok") return /* @__PURE__ */ jsx(CheckCircle2, { className: "h-4 w-4 text-buy" });
  if (state === "stale" || state === "pending-sync" || state === "mock")
    return /* @__PURE__ */ jsx(AlertTriangle, { className: "h-4 w-4 text-warn" });
  return /* @__PURE__ */ jsx(XCircle, { className: "h-4 w-4 text-sell" });
}
function blockerLabel(b) {
  if (!b || b === "OK") return "";
  const map = {
    AOV_EQUILIBRIUM_ZONE: "AOV equilibrium zone",
    ANCHOR_CHOP_BLOCKED: "SF+AF dual equilibrium — anchor chop zone",
    FUNDAMENTAL_HTF_OPPOSED: "HTF fundamentals oppose signal bias"
  };
  return map[b] ?? b.replace(/_/g, " ").toLowerCase();
}
function blockerSeverity(b) {
  if (!b || b === "OK") return "warn";
  return b === "KEY_MISSING" || b === "KEY_INVALID" || b === "RATE_LIMITED" ? "sell" : "warn";
}
function SignalsPage() {
  const isVitestRuntime = false;
  const { data: signals } = useLiveSignals();
  const { data: h } = useEngineHealth();
  const {
    pendingSettingsLoad,
    missingBackendUrl,
    settingsLoadFailed,
    settingsLoadError,
    retrySettingsLoad
  } = usePollingUiState();
  const { mutate: runBatch, isPending: batchRunning } = useEngineBatch();
  const { watchlist, watchlistSet } = useCanonicalWatchlist();
  const [watchlistOnly, setWatchlistOnly] = useState(true);
  const allUnique = useMemo(() => signals ? deduplicateById(signals) : [], [signals]);
  const { watchlistFilteredSignals, unmatchedSignalSymbols } = useMemo(() => {
    const filtered = [];
    const unmatched = [];
    for (const signal of allUnique) {
      if (watchlistSet.has(normalizeSymbolForWatchlistComparison(signal.symbol))) {
        filtered.push(signal);
      } else if (unmatched.length < 5) {
        unmatched.push(signal.symbol);
      }
    }
    return { watchlistFilteredSignals: filtered, unmatchedSignalSymbols: unmatched };
  }, [allUnique, watchlistSet]);
  const uniqueSignals = useMemo(
    () => watchlistOnly ? watchlistFilteredSignals : allUnique,
    [allUnique, watchlistFilteredSignals, watchlistOnly]
  );
  useEffect(() => {
    return;
  }, [
    allUnique.length,
    isVitestRuntime,
    unmatchedSignalSymbols,
    watchlistFilteredSignals.length,
    watchlistSet.size
  ]);
  const divergent = uniqueSignals.filter((s) => s.computedBy === "frontend" && !s.backendConfirmed);
  if (pendingSettingsLoad) {
    return /* @__PURE__ */ jsx("div", { className: "text-mute text-sm", children: "Loading signal engine..." });
  }
  if (settingsLoadFailed) {
    return /* @__PURE__ */ jsx(
      SettingsQueryErrorState,
      {
        resourceLabel: "signal engine data",
        errorDetail: settingsLoadError,
        onRetry: retrySettingsLoad
      }
    );
  }
  if (missingBackendUrl) {
    return /* @__PURE__ */ jsx("div", { className: "text-mute text-sm", children: "Configure a backend URL in Account before loading signal engine data." });
  }
  const rawFeedState = h?.feedStatus ?? h?.priceFeed ?? "offline";
  const feedState = rawFeedState === "rate-limited" ? "stale" : rawFeedState;
  const mt5AuthorityLive = h?.feedStatus === "live";
  const checks = [
    {
      label: "Backend sync",
      state: h?.backendSync ?? "offline",
      detail: h?.lastBatchAt ? relTime(h.lastBatchAt) : "never"
    },
    {
      label: "Feed status",
      state: feedState,
      detail: h?.feedStatus ?? h?.priceFeed
    },
    {
      label: mt5AuthorityLive ? "MT5 authority" : "Twelve Data key",
      state: mt5AuthorityLive ? "ok" : h?.twelveDataKeyStatus === "ok" || !h?.twelveDataKeyStatus && h?.twelveDataKey === "present" ? "ok" : "missing",
      detail: mt5AuthorityLive ? "live" : h?.twelveDataKeyStatus ? h.twelveDataKeyStatus.replace("-", " ") : void 0
    },
    {
      label: "Engine run",
      state: h?.engineRunState === "live" || h?.engineRunState === "cached" ? "live" : h?.engineRunState === "stale" ? "stale" : "offline",
      detail: h?.engineRunState ?? (h?.lastEngineRunAt ? relTime(h.lastEngineRunAt) : "never")
    }
  ];
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-end justify-between", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold tracking-tight", children: "Signal Engine" }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-mute mt-0.5", children: "Readiness · candidate flow · backend confirmation" })
      ] }),
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => runBatch(void 0),
          disabled: batchRunning,
          className: "flex items-center gap-1.5 rounded border border-bd bg-bg2/60 px-3 py-1.5 text-[11px] font-mono text-dim hover:text-fg hover:border-info/40 disabled:opacity-50 transition-colors",
          children: [
            /* @__PURE__ */ jsx(RefreshCw, { className: cn("h-3 w-3", batchRunning && "animate-spin") }),
            batchRunning ? "Refreshing…" : "Force refresh"
          ]
        }
      )
    ] }),
    divergent.length > 0 && /* @__PURE__ */ jsxs(DivergenceBanner, { children: [
      divergent.length,
      " frontend-only candidate",
      divergent.length > 1 ? "s" : "",
      " without backend confirmation."
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd bg-bg1/60 p-4", children: [
      /* @__PURE__ */ jsx("div", { className: "text-[11px] font-mono uppercase tracking-wider text-mute mb-3", children: "Engine readiness" }),
      /* @__PURE__ */ jsx("div", { className: "grid gap-2 sm:grid-cols-2 lg:grid-cols-4", children: checks.map((c) => /* @__PURE__ */ jsxs(
        "div",
        {
          className: "flex items-center justify-between gap-2 rounded border border-bd bg-bg2/40 px-3 py-2",
          children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx(HealthIcon, { state: c.state }),
              /* @__PURE__ */ jsx("span", { className: "text-xs text-dim", children: c.label })
            ] }),
            c.detail && /* @__PURE__ */ jsx("span", { className: "text-[10px] font-mono text-mute", children: c.detail })
          ]
        },
        c.label
      )) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd bg-bg1/60", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between border-b border-bd px-4 py-2.5", children: [
        /* @__PURE__ */ jsx("div", { className: "text-[11px] font-mono uppercase tracking-wider text-mute", children: "Live candidates" }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => setWatchlistOnly((v) => !v),
              className: cn(
                "text-[10px] font-mono px-2 py-0.5 rounded border transition-colors",
                watchlistOnly ? "border-info/40 text-info bg-info/10" : "border-bd text-mute hover:border-info/30 hover:text-info"
              ),
              children: watchlistOnly ? "watchlist" : "all symbols"
            }
          ),
          /* @__PURE__ */ jsxs("span", { className: "text-[10px] font-mono text-mute", children: [
            uniqueSignals.length,
            watchlistOnly && allUnique.length !== uniqueSignals.length && /* @__PURE__ */ jsxs("span", { className: "text-mute/50", children: [
              " / ",
              allUnique.length
            ] }),
            " ",
            "total"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "divide-y divide-bd", children: [
        uniqueSignals.length === 0 && /* @__PURE__ */ jsx("div", { className: "px-4 py-8 text-center text-sm text-mute", children: watchlistOnly && watchlist.length === 0 ? "No watchlist symbols. Add symbols in Account to populate Signal Engine." : "No live candidates for the current filter." }),
        uniqueSignals.map((s) => {
          const isDivergent = s.computedBy === "frontend" && !s.backendConfirmed;
          return /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-12 items-center gap-3 px-4 py-3", children: [
            /* @__PURE__ */ jsx("div", { className: "col-span-2 sm:col-span-1", children: /* @__PURE__ */ jsx(VerdictBadge, { verdict: s.verdict }) }),
            /* @__PURE__ */ jsxs("div", { className: "col-span-4 sm:col-span-2", children: [
              /* @__PURE__ */ jsx("div", { className: "font-mono text-sm font-semibold", children: s.symbol }),
              /* @__PURE__ */ jsx(
                "div",
                {
                  className: cn(
                    "text-[10px] font-mono",
                    s.direction === "LONG" ? "text-buy" : "text-sell"
                  ),
                  children: s.direction
                }
              )
            ] }),
            /* @__PURE__ */ jsx("div", { className: "col-span-3 sm:col-span-2", children: /* @__PURE__ */ jsx(
              "span",
              {
                className: cn(
                  "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono",
                  s.status === "READY" ? "border-buy/40 text-buy bg-buy/10" : s.status === "ARMED" ? "border-warn/40 text-warn bg-warn/10" : "border-info/40 text-info bg-info/10"
                ),
                children: s.status
              }
            ) }),
            /* @__PURE__ */ jsx("div", { className: "hidden sm:flex col-span-4 flex-wrap gap-1", children: s.confluence.slice(0, 3).map((c) => /* @__PURE__ */ jsx(
              "span",
              {
                className: "rounded bg-bg2 px-1.5 py-0.5 text-[9px] font-mono text-mute border border-bd",
                children: c
              },
              c
            )) }),
            /* @__PURE__ */ jsxs("div", { className: "col-span-3 flex flex-col items-end gap-1", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx(
                  "span",
                  {
                    className: cn(
                      "inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider font-mono",
                      s.computedBy === "backend" ? "border-buy/40 text-buy bg-buy/10" : "border-violet/40 text-violet bg-violet/10"
                    ),
                    children: s.computedBy
                  }
                ),
                isDivergent ? /* @__PURE__ */ jsx(
                  "span",
                  {
                    className: "inline-flex items-center gap-1 text-[10px] font-mono text-sell",
                    title: "Backend has not confirmed",
                    children: "⚠️"
                  }
                ) : /* @__PURE__ */ jsx("span", { className: "text-[10px] font-mono text-buy", title: "Backend confirmed", children: "✓" })
              ] }),
              s.engineBlocker && s.engineBlocker !== "OK" && /* @__PURE__ */ jsx(
                "span",
                {
                  className: cn(
                    "text-[9px] font-mono",
                    blockerSeverity(s.engineBlocker) === "sell" ? "text-sell" : "text-warn"
                  ),
                  title: `Engine blocker: ${s.engineBlocker}`,
                  children: blockerLabel(s.engineBlocker)
                }
              )
            ] })
          ] }, s.id);
        })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-end gap-2", children: [
      /* @__PURE__ */ jsx("span", { className: "text-[10px] font-mono text-mute", children: "last batch" }),
      /* @__PURE__ */ jsx(FreshnessBadge, { state: h?.backendSync ?? "offline" })
    ] })
  ] });
}
const SplitComponent = SignalsPage;
export {
  SplitComponent as component
};
