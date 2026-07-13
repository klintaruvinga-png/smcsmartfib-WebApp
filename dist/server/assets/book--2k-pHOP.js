import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { H as useStableUserTrades, w as useSnapshot, b as usePollingUiState, h as useAccountTelemetry, k as fmtCurrency, f as cn, F as FreshnessBadge, W as WarningLine, r as relTime, m as fmtPrice, l as fmtPct } from "./router-DONb8JY3.js";
import { S as SettingsQueryErrorState } from "./SettingsQueryErrorState-2nE1Yemg.js";
import { B as BiasBadge } from "./Indicators-BvwzcdKI.js";
import "@tanstack/react-router";
import "@tanstack/react-query";
import "clsx";
import "tailwind-merge";
import "sonner";
import "recharts";
import "@radix-ui/react-slot";
import "class-variance-authority";
const HEADER_GRID = "grid items-center gap-2 sm:gap-3 grid-cols-[16px_minmax(150px,1.4fr)_minmax(120px,1fr)_minmax(100px,0.8fr)_minmax(100px,0.8fr)_minmax(100px,0.8fr)_minmax(110px,0.8fr)_minmax(140px,1fr)_76px]";
function getEquityImpactPct(instrumentPnl, accountEquity) {
  if (instrumentPnl === null || instrumentPnl === void 0) return null;
  if (!accountEquity || accountEquity <= 0) return null;
  return instrumentPnl / accountEquity * 100;
}
function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function getTodayOiImpactSource(snap, symbol) {
  const maybeSnap = snap;
  return maybeSnap?.todayOiImpacts?.find((row) => row.symbol === symbol) ?? null;
}
function getTodayOiEquityImpactPct(source, accountEquity) {
  const providedPct = finiteNumber(source?.todayOiEquityImpactPct);
  if (providedPct !== null) return providedPct;
  const todayOiPnlImpactUSC = finiteNumber(source?.todayOiPnlImpactUSC);
  return getEquityImpactPct(todayOiPnlImpactUSC, accountEquity);
}
function EquityImpactBadge({
  value,
  baselineQuality
}) {
  if (value === null || !Number.isFinite(value)) {
    return /* @__PURE__ */ jsx("span", { title: "Today baseline unavailable", className: "text-mute text-[10px] font-mono", children: "—" });
  }
  if (value === 0) {
    return /* @__PURE__ */ jsx(
      "span",
      {
        title: "Today's open exposure impact as % of total equity",
        className: "text-mute text-[10px] font-mono tabular-nums",
        children: "0.00%"
      }
    );
  }
  const isPositive = value > 0;
  const title = baselineQuality === "first_seen_today" ? "Open exposure impact since first seen today as % of total equity" : "Today's open exposure impact as % of total equity";
  return /* @__PURE__ */ jsxs(
    "span",
    {
      title,
      className: cn(
        "inline-flex items-center justify-start gap-0.5 font-mono text-[10px] font-semibold tabular-nums",
        isPositive ? "text-buy" : "text-sell"
      ),
      children: [
        isPositive ? "↑" : "↓",
        " ",
        Math.abs(value).toFixed(2),
        "%"
      ]
    }
  );
}
function sortPositions(posList, sortKey, sortDir) {
  const arr = [...posList];
  arr.sort((a, b) => {
    let av;
    let bv;
    switch (sortKey) {
      case "direction":
        av = a.direction;
        bv = b.direction;
        break;
      case "entry":
        av = a.entry;
        bv = b.entry;
        break;
      case "current":
        av = a.current;
        bv = b.current;
        break;
      case "lots":
        av = a.lots;
        bv = b.lots;
        break;
      case "pnl":
        av = a.pnlUSC;
        bv = b.pnlUSC;
        break;
      case "time":
        av = new Date(a.openedAt).getTime();
        bv = new Date(b.openedAt).getTime();
        break;
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
  return arr;
}
function BookPage() {
  const { data: trades, isLoading, error } = useStableUserTrades();
  const { data: snap } = useSnapshot();
  const {
    pendingSettingsLoad,
    missingBackendUrl,
    settingsLoadFailed,
    settingsLoadError,
    retrySettingsLoad
  } = usePollingUiState();
  const { data: accountTelemetry } = useAccountTelemetry();
  const positions = trades?.positions ?? [];
  const [symSortKey, setSymSortKey] = useState("pnl");
  const [symSortDir, setSymSortDir] = useState("desc");
  const toggleSymSort = (key) => {
    if (symSortKey === key) {
      setSymSortDir(symSortDir === "asc" ? "desc" : "asc");
    } else {
      setSymSortKey(key);
      setSymSortDir(key === "symbol" ? "asc" : "desc");
    }
  };
  const summaries = useMemo(() => {
    const grouped = positions.reduce((acc, p) => {
      (acc[p.symbol] ??= []).push(p);
      return acc;
    }, {});
    const list = Object.entries(grouped).map(([symbol, posList]) => {
      const snapPair = snap?.prices.find((p) => p.symbol === symbol);
      const tradeStale = posList.some((p) => p.state === "stale");
      const stale = tradeStale || snapPair?.state === "stale";
      const groupState = tradeStale ? "stale" : snapPair?.state ?? "unavailable";
      const groupPnl = posList.reduce((s, p) => s + p.pnlUSC, 0);
      const longs = posList.filter((p) => p.direction === "LONG");
      const shorts = posList.filter((p) => p.direction === "SHORT");
      const totalLong = longs.reduce((s, p) => s + p.lots, 0);
      const totalShort = shorts.reduce((s, p) => s + p.lots, 0);
      const regime = snap?.regimes?.find((r) => r.symbol === symbol);
      const todayOiImpact = getTodayOiImpactSource(snap, symbol);
      const equityImpactPct = getTodayOiEquityImpactPct(todayOiImpact, accountTelemetry?.equity);
      const todayBaselineQuality = todayOiImpact?.todayBaselineQuality ?? null;
      return {
        symbol,
        posList,
        groupPnl,
        groupState,
        stale,
        snapPairUpdatedAt: snapPair?.updatedAt,
        longsCount: longs.length,
        shortsCount: shorts.length,
        totalLong,
        totalShort,
        netLots: totalLong - totalShort,
        regimeBias: regime?.bias,
        equityImpactPct,
        todayBaselineQuality
      };
    });
    list.sort((a, b) => {
      let av;
      let bv;
      switch (symSortKey) {
        case "symbol":
          av = a.symbol;
          bv = b.symbol;
          break;
        case "positions":
          av = a.posList.length;
          bv = b.posList.length;
          break;
        case "long":
          av = a.totalLong;
          bv = b.totalLong;
          break;
        case "short":
          av = a.totalShort;
          bv = b.totalShort;
          break;
        case "net":
          av = a.netLots;
          bv = b.netLots;
          break;
        case "oi":
          av = finiteNumber(a.equityImpactPct) ?? -Infinity;
          bv = finiteNumber(b.equityImpactPct) ?? -Infinity;
          break;
        case "pnl":
          av = a.groupPnl;
          bv = b.groupPnl;
          break;
      }
      if (av < bv) return symSortDir === "asc" ? -1 : 1;
      if (av > bv) return symSortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [positions, snap, symSortKey, symSortDir, accountTelemetry]);
  if (pendingSettingsLoad) {
    return /* @__PURE__ */ jsx("div", { className: "text-mute text-sm", children: "Loading active book..." });
  }
  if (settingsLoadFailed) {
    return /* @__PURE__ */ jsx(
      SettingsQueryErrorState,
      {
        resourceLabel: "the active book",
        errorDetail: settingsLoadError,
        onRetry: retrySettingsLoad
      }
    );
  }
  if (missingBackendUrl) {
    return /* @__PURE__ */ jsx("div", { className: "text-mute text-sm", children: "Configure a backend URL in Account before loading the active book." });
  }
  if (isLoading) {
    return /* @__PURE__ */ jsx("div", { className: "text-mute text-sm", children: "Loading active book..." });
  }
  if (error) {
    return /* @__PURE__ */ jsx("div", { className: "text-mute text-sm", children: "Active book unavailable while backend trade telemetry is unreachable." });
  }
  const totalPnl = positions.reduce((s, p) => s + p.pnlUSC, 0);
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsx("div", { className: "flex items-end justify-between", children: /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold tracking-tight", children: "Active Book" }),
      /* @__PURE__ */ jsxs("p", { className: "text-xs text-mute mt-0.5", children: [
        positions.length,
        " open - ",
        fmtCurrency(totalPnl, accountTelemetry?.currency, true)
      ] })
    ] }) }),
    summaries.length === 0 && /* @__PURE__ */ jsx("div", { className: "text-mute text-sm", children: "No open positions." }),
    summaries.length > 0 && /* @__PURE__ */ jsx("div", { className: "hidden sm:block overflow-x-auto", children: /* @__PURE__ */ jsxs("div", { className: "min-w-[760px] space-y-2", children: [
      /* @__PURE__ */ jsxs(
        "div",
        {
          className: cn(
            HEADER_GRID,
            "px-3 sm:px-4 py-2 rounded-md border border-bd bg-bg2/20 text-[10px] font-mono uppercase tracking-wider text-mute"
          ),
          children: [
            /* @__PURE__ */ jsx("span", {}),
            /* @__PURE__ */ jsx(
              SymSortHeader,
              {
                label: "Symbol",
                k: "symbol",
                active: symSortKey === "symbol",
                dir: symSortDir,
                onClick: () => toggleSymSort("symbol")
              }
            ),
            /* @__PURE__ */ jsx(
              SymSortHeader,
              {
                label: "Positions",
                k: "positions",
                active: symSortKey === "positions",
                dir: symSortDir,
                onClick: () => toggleSymSort("positions")
              }
            ),
            /* @__PURE__ */ jsx(
              SymSortHeader,
              {
                label: "Long",
                k: "long",
                active: symSortKey === "long",
                dir: symSortDir,
                onClick: () => toggleSymSort("long")
              }
            ),
            /* @__PURE__ */ jsx(
              SymSortHeader,
              {
                label: "Short",
                k: "short",
                active: symSortKey === "short",
                dir: symSortDir,
                onClick: () => toggleSymSort("short")
              }
            ),
            /* @__PURE__ */ jsx(
              SymSortHeader,
              {
                label: "Net",
                k: "net",
                active: symSortKey === "net",
                dir: symSortDir,
                onClick: () => toggleSymSort("net")
              }
            ),
            /* @__PURE__ */ jsx(
              SymSortHeader,
              {
                label: "OI Today %",
                k: "oi",
                active: symSortKey === "oi",
                dir: symSortDir,
                onClick: () => toggleSymSort("oi")
              }
            ),
            /* @__PURE__ */ jsx(
              SymSortHeader,
              {
                label: "P/L",
                k: "pnl",
                active: symSortKey === "pnl",
                dir: symSortDir,
                onClick: () => toggleSymSort("pnl")
              }
            ),
            /* @__PURE__ */ jsx("span", {})
          ]
        }
      ),
      summaries.map((s) => /* @__PURE__ */ jsx(SymbolCard, { ...s, currency: accountTelemetry?.currency }, s.symbol))
    ] }) }),
    summaries.length > 0 && /* @__PURE__ */ jsx("div", { className: "sm:hidden space-y-2", children: summaries.map((s) => /* @__PURE__ */ jsx(MobileSymbolCard, { ...s, currency: accountTelemetry?.currency }, s.symbol)) })
  ] });
}
function SymSortHeader({
  label,
  active,
  dir,
  onClick,
  className
}) {
  return /* @__PURE__ */ jsxs(
    "button",
    {
      type: "button",
      onClick,
      className: cn(
        "flex items-center gap-1 p-0 m-0 bg-transparent hover:text-tx transition-colors min-w-0",
        active && "text-tx",
        className
      ),
      children: [
        /* @__PURE__ */ jsx("span", { className: "truncate", children: label }),
        active ? dir === "asc" ? /* @__PURE__ */ jsx(ChevronUp, { className: "h-3 w-3 shrink-0" }) : /* @__PURE__ */ jsx(ChevronDown, { className: "h-3 w-3 shrink-0" }) : /* @__PURE__ */ jsx(ChevronsUpDown, { className: "h-3 w-3 opacity-50 shrink-0" })
      ]
    }
  );
}
function SymbolCard({
  symbol,
  posList,
  groupPnl,
  groupState,
  stale,
  snapPairUpdatedAt,
  longsCount,
  shortsCount,
  totalLong,
  totalShort,
  netLots,
  regimeBias,
  equityImpactPct,
  todayBaselineQuality,
  currency
}) {
  const [expanded, setExpanded] = useState(false);
  const [sortKey, setSortKey] = useState("time");
  const [sortDir, setSortDir] = useState("desc");
  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };
  const sortedPos = useMemo(
    () => sortPositions(posList, sortKey, sortDir),
    [posList, sortKey, sortDir]
  );
  return /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd bg-bg1/60 overflow-hidden", children: [
    /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        onClick: () => setExpanded((v) => !v),
        "aria-expanded": expanded,
        className: cn(
          HEADER_GRID,
          "w-full px-3 sm:px-4 py-2.5 bg-bg2/30 text-left hover:bg-bg2/50 transition-colors",
          expanded && "border-b border-bd"
        ),
        children: [
          expanded ? /* @__PURE__ */ jsx(ChevronUp, { className: "h-3.5 w-3.5 text-mute" }) : /* @__PURE__ */ jsx(ChevronDown, { className: "h-3.5 w-3.5 text-mute" }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
            /* @__PURE__ */ jsx("span", { className: "font-mono text-sm font-semibold truncate", children: symbol }),
            regimeBias ? /* @__PURE__ */ jsx(BiasBadge, { bias: regimeBias }) : /* @__PURE__ */ jsx("span", { className: "text-[10px] font-mono text-mute shrink-0", children: "—" })
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "text-[10px] font-mono text-mute tabular-nums", children: [
            posList.length,
            " pos · ",
            longsCount,
            "L / ",
            shortsCount,
            "S"
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "text-[10px] font-mono text-buy tabular-nums", children: [
            "Long ",
            totalLong.toFixed(2)
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "text-[10px] font-mono text-sell tabular-nums", children: [
            "Short ",
            totalShort.toFixed(2)
          ] }),
          /* @__PURE__ */ jsxs(
            "span",
            {
              className: cn(
                "text-[10px] font-mono tabular-nums",
                netLots >= 0 ? "text-buy" : "text-sell"
              ),
              children: [
                "Net ",
                netLots >= 0 ? "+" : "",
                netLots.toFixed(2)
              ]
            }
          ),
          /* @__PURE__ */ jsx("span", { className: "text-[10px] font-mono tabular-nums", children: /* @__PURE__ */ jsx(EquityImpactBadge, { value: equityImpactPct, baselineQuality: todayBaselineQuality }) }),
          /* @__PURE__ */ jsx(
            "span",
            {
              className: cn(
                "font-mono text-sm tabular-nums",
                groupPnl >= 0 ? "text-buy" : "text-sell"
              ),
              children: fmtCurrency(groupPnl, currency, true)
            }
          ),
          /* @__PURE__ */ jsx("span", { className: "flex justify-end", children: /* @__PURE__ */ jsx(FreshnessBadge, { state: groupState }) })
        ]
      }
    ),
    expanded && /* @__PURE__ */ jsxs(Fragment, { children: [
      stale && /* @__PURE__ */ jsx("div", { className: "px-4 py-2 border-b border-bd", children: /* @__PURE__ */ jsxs(WarningLine, { level: "warn", children: [
        symbol,
        " backend snapshot is ",
        relTime(snapPairUpdatedAt ?? ""),
        "."
      ] }) }),
      /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("div", { className: "min-w-[560px]", children: [
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-12 gap-2 px-3 sm:px-4 py-2 border-b border-bd bg-bg2/20 text-[10px] font-mono uppercase tracking-wider text-mute", children: [
          /* @__PURE__ */ jsx(
            SortHeader,
            {
              className: "col-span-2 sm:col-span-1",
              label: "Type",
              active: sortKey === "direction",
              dir: sortDir,
              onClick: () => toggleSort("direction")
            }
          ),
          /* @__PURE__ */ jsx(
            SortHeader,
            {
              className: "col-span-3 sm:col-span-2",
              label: "Entry",
              active: sortKey === "entry",
              dir: sortDir,
              onClick: () => toggleSort("entry")
            }
          ),
          /* @__PURE__ */ jsx(
            SortHeader,
            {
              className: "col-span-3 sm:col-span-2",
              label: "Current",
              active: sortKey === "current",
              dir: sortDir,
              onClick: () => toggleSort("current")
            }
          ),
          /* @__PURE__ */ jsx(
            SortHeader,
            {
              className: "col-span-2",
              label: "Lots",
              active: sortKey === "lots",
              dir: sortDir,
              onClick: () => toggleSort("lots")
            }
          ),
          /* @__PURE__ */ jsx(
            SortHeader,
            {
              className: "col-span-2 sm:col-span-3",
              label: "P/L",
              active: sortKey === "pnl",
              dir: sortDir,
              onClick: () => toggleSort("pnl")
            }
          ),
          /* @__PURE__ */ jsx(
            SortHeader,
            {
              className: "hidden sm:flex col-span-2 justify-end",
              label: "Time",
              active: sortKey === "time",
              dir: sortDir,
              onClick: () => toggleSort("time")
            }
          )
        ] }),
        /* @__PURE__ */ jsx("div", { className: "divide-y divide-bd", children: sortedPos.map((p) => /* @__PURE__ */ jsxs(
          "div",
          {
            className: "grid grid-cols-12 items-center gap-2 px-3 sm:px-4 py-2.5 text-xs",
            children: [
              /* @__PURE__ */ jsx(
                "span",
                {
                  className: cn(
                    "col-span-2 sm:col-span-1 inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono w-fit",
                    p.direction === "LONG" ? "border-buy/40 text-buy bg-buy/10" : "border-sell/40 text-sell bg-sell/10"
                  ),
                  children: p.direction
                }
              ),
              /* @__PURE__ */ jsx("div", { className: "col-span-3 sm:col-span-2 font-mono text-tx", children: fmtPrice(p.entry, p.symbol) }),
              /* @__PURE__ */ jsx("div", { className: "col-span-3 sm:col-span-2 font-mono text-tx", children: fmtPrice(p.current, p.symbol) }),
              /* @__PURE__ */ jsx("div", { className: "col-span-2 font-mono text-dim", children: p.lots.toFixed(2) }),
              /* @__PURE__ */ jsxs("div", { className: "col-span-2 sm:col-span-3 font-mono", children: [
                /* @__PURE__ */ jsx("div", { className: cn(p.pnlUSC >= 0 ? "text-buy" : "text-sell"), children: fmtCurrency(p.pnlUSC, currency, true) }),
                /* @__PURE__ */ jsx(
                  "div",
                  {
                    className: cn(
                      "text-[10px]",
                      p.pnlPct >= 0 ? "text-buy/70" : "text-sell/70"
                    ),
                    children: fmtPct(p.pnlPct)
                  }
                )
              ] }),
              /* @__PURE__ */ jsx("div", { className: "hidden sm:block col-span-2 text-right text-[10px] font-mono text-mute", children: relTime(p.openedAt) })
            ]
          },
          p.id
        )) })
      ] }) })
    ] })
  ] });
}
function MobileSymbolCard({
  symbol,
  posList,
  groupPnl,
  groupState,
  stale,
  snapPairUpdatedAt,
  longsCount,
  shortsCount,
  totalLong,
  totalShort,
  netLots,
  regimeBias,
  equityImpactPct,
  todayBaselineQuality,
  currency
}) {
  const [expanded, setExpanded] = useState(false);
  const [sortKey, setSortKey] = useState("time");
  const [sortDir, setSortDir] = useState("desc");
  const sortedPos = useMemo(
    () => sortPositions(posList, sortKey, sortDir),
    [posList, sortKey, sortDir]
  );
  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd bg-bg1/60 overflow-hidden", children: [
    /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        onClick: () => setExpanded((v) => !v),
        "aria-expanded": expanded,
        className: cn(
          "w-full px-3 py-3 bg-bg2/30 text-left hover:bg-bg2/50 transition-colors",
          expanded && "border-b border-bd"
        ),
        children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-3", children: [
            /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
                /* @__PURE__ */ jsx("span", { className: "font-mono text-sm font-semibold truncate", children: symbol }),
                regimeBias ? /* @__PURE__ */ jsx(BiasBadge, { bias: regimeBias }) : /* @__PURE__ */ jsx("span", { className: "text-[10px] font-mono text-mute", children: "—" })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "mt-1 text-[10px] font-mono text-mute tabular-nums", children: [
                posList.length,
                " pos · ",
                longsCount,
                "L / ",
                shortsCount,
                "S"
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "shrink-0 text-left", children: [
              /* @__PURE__ */ jsx(
                "div",
                {
                  className: cn(
                    "font-mono text-sm tabular-nums",
                    groupPnl >= 0 ? "text-buy" : "text-sell"
                  ),
                  children: fmtCurrency(groupPnl, currency, true)
                }
              ),
              /* @__PURE__ */ jsx("div", { className: "mt-1 flex justify-end", children: /* @__PURE__ */ jsx(FreshnessBadge, { state: groupState }) })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "mt-3 grid grid-cols-2 gap-2", children: [
            /* @__PURE__ */ jsx(
              MobileMetric,
              {
                label: "Long",
                value: /* @__PURE__ */ jsx("span", { className: "text-buy", children: totalLong.toFixed(2) })
              }
            ),
            /* @__PURE__ */ jsx(
              MobileMetric,
              {
                label: "Short",
                value: /* @__PURE__ */ jsx("span", { className: "text-sell", children: totalShort.toFixed(2) })
              }
            ),
            /* @__PURE__ */ jsx(
              MobileMetric,
              {
                label: "Net",
                value: /* @__PURE__ */ jsxs("span", { className: netLots >= 0 ? "text-buy" : "text-sell", children: [
                  netLots >= 0 ? "+" : "",
                  netLots.toFixed(2)
                ] })
              }
            ),
            /* @__PURE__ */ jsx(
              MobileMetric,
              {
                label: "OI Today %",
                value: /* @__PURE__ */ jsx(EquityImpactBadge, { value: equityImpactPct, baselineQuality: todayBaselineQuality })
              }
            )
          ] })
        ]
      }
    ),
    expanded && /* @__PURE__ */ jsxs("div", { children: [
      stale && /* @__PURE__ */ jsx("div", { className: "px-3 py-2 border-b border-bd", children: /* @__PURE__ */ jsxs(WarningLine, { level: "warn", children: [
        symbol,
        " backend snapshot is ",
        relTime(snapPairUpdatedAt ?? ""),
        "."
      ] }) }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-3 gap-2 px-3 py-2 border-b border-bd bg-bg2/20 text-[10px] font-mono uppercase tracking-wider text-mute", children: [
        /* @__PURE__ */ jsx(
          SortHeader,
          {
            label: "Type",
            active: sortKey === "direction",
            dir: sortDir,
            onClick: () => toggleSort("direction")
          }
        ),
        /* @__PURE__ */ jsx(
          SortHeader,
          {
            label: "Lots",
            active: sortKey === "lots",
            dir: sortDir,
            onClick: () => toggleSort("lots")
          }
        ),
        /* @__PURE__ */ jsx(
          SortHeader,
          {
            className: "justify-end",
            label: "P/L",
            active: sortKey === "pnl",
            dir: sortDir,
            onClick: () => toggleSort("pnl")
          }
        )
      ] }),
      /* @__PURE__ */ jsx("div", { className: "divide-y divide-bd", children: sortedPos.map((p) => /* @__PURE__ */ jsxs("div", { className: "px-3 py-2.5 text-xs", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3", children: [
          /* @__PURE__ */ jsx(
            "span",
            {
              className: cn(
                "inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono",
                p.direction === "LONG" ? "border-buy/40 text-buy bg-buy/10" : "border-sell/40 text-sell bg-sell/10"
              ),
              children: p.direction
            }
          ),
          /* @__PURE__ */ jsx(
            "div",
            {
              className: cn(
                "font-mono tabular-nums",
                p.pnlUSC >= 0 ? "text-buy" : "text-sell"
              ),
              children: fmtCurrency(p.pnlUSC, currency, true)
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]", children: [
          /* @__PURE__ */ jsx("div", { className: "text-mute", children: "Entry" }),
          /* @__PURE__ */ jsx("div", { className: "text-right text-tx", children: fmtPrice(p.entry, p.symbol) }),
          /* @__PURE__ */ jsx("div", { className: "text-mute", children: "Current" }),
          /* @__PURE__ */ jsx("div", { className: "text-right text-tx", children: fmtPrice(p.current, p.symbol) }),
          /* @__PURE__ */ jsx("div", { className: "text-mute", children: "Lots" }),
          /* @__PURE__ */ jsx("div", { className: "text-right text-dim", children: p.lots.toFixed(2) }),
          /* @__PURE__ */ jsx("div", { className: "text-mute", children: "Time" }),
          /* @__PURE__ */ jsx("div", { className: "text-right text-mute", children: relTime(p.openedAt) })
        ] })
      ] }, p.id)) })
    ] })
  ] });
}
function MobileMetric({ label, value }) {
  return /* @__PURE__ */ jsxs("div", { className: "rounded border border-bd bg-bg1/50 px-2 py-1.5", children: [
    /* @__PURE__ */ jsx("div", { className: "text-[9px] font-mono uppercase tracking-wider text-mute", children: label }),
    /* @__PURE__ */ jsx("div", { className: "mt-1 font-mono text-[11px] font-semibold tabular-nums", children: value })
  ] });
}
function SortHeader({
  label,
  active,
  dir,
  onClick,
  className
}) {
  return /* @__PURE__ */ jsxs(
    "button",
    {
      type: "button",
      onClick,
      className: cn(
        "flex items-center gap-1 p-0 m-0 bg-transparent hover:text-tx transition-colors",
        active && "text-tx",
        className
      ),
      children: [
        /* @__PURE__ */ jsx("span", { children: label }),
        active ? dir === "asc" ? /* @__PURE__ */ jsx(ChevronUp, { className: "h-3 w-3" }) : /* @__PURE__ */ jsx(ChevronDown, { className: "h-3 w-3" }) : /* @__PURE__ */ jsx(ChevronsUpDown, { className: "h-3 w-3 opacity-50" })
      ]
    }
  );
}
const SplitComponent = BookPage;
export {
  SplitComponent as component
};
