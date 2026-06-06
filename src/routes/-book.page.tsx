import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import {
  useStableUserTrades,
  useSnapshot,
  usePollingUiState,
  useAccountTelemetry,
} from "@/hooks/useSniperData";
import { SettingsQueryErrorState } from "@/components/sniper/SettingsQueryErrorState";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { WarningLine } from "@/components/sniper/Warnings";
import { BiasBadge } from "@/components/sniper/Indicators";
import { fmtPrice, fmtPct, fmtCurrency, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Position, RegimeState } from "@/types/sniper";

type PosSortKey = "direction" | "entry" | "current" | "lots" | "pnl" | "time";
type SymSortKey = "symbol" | "positions" | "long" | "short" | "net" | "pnl";
type SortDir = "asc" | "desc";

// Shared grid template: chevron | symbol+regime | pos count | long | short | net | OI today % | pnl | badge
const HEADER_GRID =
  "grid items-center gap-2 sm:gap-3 grid-cols-[16px_minmax(150px,1.4fr)_minmax(120px,1fr)_minmax(100px,0.8fr)_minmax(100px,0.8fr)_minmax(100px,0.8fr)_minmax(110px,0.8fr)_minmax(140px,1fr)_76px]";

type TodayBaselineQuality = "day_start" | "first_seen_today" | "missing";

type TodayOiImpactSource = {
  symbol?: string;
  todayOiPnlImpactUSC?: number | null;
  todayOiEquityImpactPct?: number | null;
  todayBaselineQuality?: TodayBaselineQuality | null;
};

type SymbolSummary = {
  symbol: string;
  posList: Position[];
  groupPnl: number;
  groupState: string;
  stale: boolean;
  snapPairUpdatedAt?: string;
  longsCount: number;
  shortsCount: number;
  totalLong: number;
  totalShort: number;
  netLots: number;
  regimeBias?: RegimeState["bias"];
  equityImpactPct: number | null;
  todayBaselineQuality: TodayBaselineQuality | null;
};

function getEquityImpactPct(
  instrumentPnl: number | null | undefined,
  accountEquity: number | null | undefined,
) {
  if (instrumentPnl === null || instrumentPnl === undefined) return null;
  if (!accountEquity || accountEquity <= 0) return null;
  return (instrumentPnl / accountEquity) * 100;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getTodayOiImpactSource(snap: unknown, symbol: string): TodayOiImpactSource | null {
  const maybeSnap = snap as { todayOiImpacts?: TodayOiImpactSource[] } | null | undefined;
  return maybeSnap?.todayOiImpacts?.find((row) => row.symbol === symbol) ?? null;
}

function getTodayOiEquityImpactPct(
  source: TodayOiImpactSource | null,
  accountEquity: number | null | undefined,
): number | null {
  const providedPct = finiteNumber(source?.todayOiEquityImpactPct);
  if (providedPct !== null) return providedPct;

  const todayOiPnlImpactUSC = finiteNumber(source?.todayOiPnlImpactUSC);
  return getEquityImpactPct(todayOiPnlImpactUSC, accountEquity);
}

function EquityImpactBadge({
  value,
  baselineQuality,
}: {
  value: number | null;
  baselineQuality?: TodayBaselineQuality | null;
}) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <span title="Today baseline unavailable" className="text-mute text-[10px] font-mono">
        —
      </span>
    );
  }
  if (value === 0) {
    return (
      <span
        title="Today's open exposure impact as % of total equity"
        className="text-mute text-[10px] font-mono tabular-nums"
      >
        0.00%
      </span>
    );
  }
  const isPositive = value > 0;
  const title =
    baselineQuality === "first_seen_today"
      ? "Open exposure impact since first seen today as % of total equity"
      : "Today's open exposure impact as % of total equity";

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center justify-end gap-0.5 font-mono text-[10px] font-semibold tabular-nums",
        isPositive ? "text-buy" : "text-sell",
      )}
    >
      {isPositive ? "↑" : "↓"} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function sortPositions(posList: Position[], sortKey: PosSortKey, sortDir: SortDir) {
  const arr = [...posList];
  arr.sort((a, b) => {
    let av: number | string;
    let bv: number | string;
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

export function BookPage() {
  const { data: trades, isLoading, error } = useStableUserTrades();
  const { data: snap } = useSnapshot();
  const {
    pendingSettingsLoad,
    missingBackendUrl,
    settingsLoadFailed,
    settingsLoadError,
    retrySettingsLoad,
  } = usePollingUiState();
  const { data: accountTelemetry } = useAccountTelemetry();
  const positions = trades?.positions ?? [];

  const [symSortKey, setSymSortKey] = useState<SymSortKey>("pnl");
  const [symSortDir, setSymSortDir] = useState<SortDir>("desc");

  const toggleSymSort = (key: SymSortKey) => {
    if (symSortKey === key) {
      setSymSortDir(symSortDir === "asc" ? "desc" : "asc");
    } else {
      setSymSortKey(key);
      setSymSortDir(key === "symbol" ? "asc" : "desc");
    }
  };

  const summaries = useMemo<SymbolSummary[]>(() => {
    const grouped = positions.reduce<Record<string, Position[]>>((acc, p) => {
      (acc[p.symbol] ??= []).push(p);
      return acc;
    }, {});
    const list = Object.entries(grouped).map(([symbol, posList]) => {
      const snapPair = snap?.prices.find((p) => p.symbol === symbol);
      const tradeStale = posList.some((p) => p.state === "stale");
      const stale = tradeStale || snapPair?.state === "stale";
      const groupState = tradeStale ? "stale" : (snapPair?.state ?? "unavailable");
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
        todayBaselineQuality,
      };
    });
    list.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
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
    return <div className="text-mute text-sm">Loading active book...</div>;
  }

  if (settingsLoadFailed) {
    return (
      <SettingsQueryErrorState
        resourceLabel="the active book"
        errorDetail={settingsLoadError}
        onRetry={retrySettingsLoad}
      />
    );
  }

  if (missingBackendUrl) {
    return (
      <div className="text-mute text-sm">
        Configure a backend URL in Account before loading the active book.
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-mute text-sm">Loading active book...</div>;
  }

  if (error) {
    return (
      <div className="text-mute text-sm">
        Active book unavailable while backend trade telemetry is unreachable.
      </div>
    );
  }

  const totalPnl = positions.reduce((s, p) => s + p.pnlUSC, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Active Book</h1>
          <p className="text-xs text-mute mt-0.5">
            {positions.length} open - {fmtCurrency(totalPnl, accountTelemetry?.currency, true)}
          </p>
        </div>
      </div>

      {summaries.length === 0 && <div className="text-mute text-sm">No open positions.</div>}

      {summaries.length > 0 && (
        <div className="hidden sm:block overflow-x-auto">
          <div className="min-w-[760px] space-y-2">
            {/* Symbol-level sort header */}
            <div
              className={cn(
                HEADER_GRID,
                "px-3 sm:px-4 py-2 rounded-md border border-bd bg-bg2/20 text-[10px] font-mono uppercase tracking-wider text-mute",
              )}
            >
              <span />
              <SymSortHeader
                label="Symbol"
                k="symbol"
                active={symSortKey === "symbol"}
                dir={symSortDir}
                onClick={() => toggleSymSort("symbol")}
              />
              <SymSortHeader
                label="Positions"
                k="positions"
                active={symSortKey === "positions"}
                dir={symSortDir}
                onClick={() => toggleSymSort("positions")}
              />
              <SymSortHeader
                label="Long"
                k="long"
                active={symSortKey === "long"}
                dir={symSortDir}
                onClick={() => toggleSymSort("long")}
              />
              <SymSortHeader
                label="Short"
                k="short"
                active={symSortKey === "short"}
                dir={symSortDir}
                onClick={() => toggleSymSort("short")}
              />
              <SymSortHeader
                label="Net"
                k="net"
                active={symSortKey === "net"}
                dir={symSortDir}
                onClick={() => toggleSymSort("net")}
              />
              <span className="text-[10px] font-mono uppercase tracking-wider text-mute text-right">
                OI Today %
              </span>
              <SymSortHeader
                label="P/L"
                k="pnl"
                active={symSortKey === "pnl"}
                dir={symSortDir}
                onClick={() => toggleSymSort("pnl")}
                className="justify-end"
              />
              <span />
            </div>

            {summaries.map((s) => (
              <SymbolCard key={s.symbol} {...s} currency={accountTelemetry?.currency} />
            ))}
          </div>
        </div>
      )}

      {summaries.length > 0 && (
        <div className="sm:hidden space-y-2">
          {summaries.map((s) => (
            <MobileSymbolCard key={s.symbol} {...s} currency={accountTelemetry?.currency} />
          ))}
        </div>
      )}
    </div>
  );
}

function SymSortHeader({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  k: SymSortKey;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 hover:text-tx transition-colors min-w-0",
        active && "text-tx",
        className,
      )}
    >
      <span className="truncate">{label}</span>
      {active ? (
        dir === "asc" ? (
          <ChevronUp className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0" />
        )
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
      )}
    </button>
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
  currency,
}: SymbolSummary & { currency?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<PosSortKey>("time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: PosSortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedPos = useMemo(
    () => sortPositions(posList, sortKey, sortDir),
    [posList, sortKey, sortDir],
  );

  return (
    <div className="rounded-lg border border-bd bg-bg1/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={cn(
          HEADER_GRID,
          "w-full px-3 sm:px-4 py-2.5 bg-bg2/30 text-left hover:bg-bg2/50 transition-colors",
          expanded && "border-b border-bd",
        )}
      >
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-mute" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-mute" />
        )}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-sm font-semibold truncate">{symbol}</span>
          {regimeBias ? (
            <BiasBadge bias={regimeBias} />
          ) : (
            <span className="text-[10px] font-mono text-mute shrink-0">—</span>
          )}
        </div>
        <span className="text-[10px] font-mono text-mute tabular-nums">
          {posList.length} pos · {longsCount}L / {shortsCount}S
        </span>
        <span className="text-[10px] font-mono text-buy tabular-nums">
          Long {totalLong.toFixed(2)}
        </span>
        <span className="text-[10px] font-mono text-sell tabular-nums">
          Short {totalShort.toFixed(2)}
        </span>
        <span
          className={cn(
            "text-[10px] font-mono tabular-nums",
            netLots >= 0 ? "text-buy" : "text-sell",
          )}
        >
          Net {netLots >= 0 ? "+" : ""}
          {netLots.toFixed(2)}
        </span>
        <span className="text-right">
          <EquityImpactBadge value={equityImpactPct} baselineQuality={todayBaselineQuality} />
        </span>
        <span
          className={cn(
            "font-mono text-sm text-right tabular-nums",
            groupPnl >= 0 ? "text-buy" : "text-sell",
          )}
        >
          {fmtCurrency(groupPnl, currency, true)}
        </span>
        <span className="flex justify-end">
          <FreshnessBadge state={groupState as never} />
        </span>
      </button>

      {expanded && (
        <>
          {stale && (
            <div className="px-4 py-2 border-b border-bd">
              <WarningLine level="warn">
                {symbol} backend snapshot is {relTime(snapPairUpdatedAt ?? "")}.
              </WarningLine>
            </div>
          )}

          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-12 gap-2 px-3 sm:px-4 py-2 border-b border-bd bg-bg2/20 text-[10px] font-mono uppercase tracking-wider text-mute">
                <SortHeader
                  className="col-span-2 sm:col-span-1"
                  label="Type"
                  active={sortKey === "direction"}
                  dir={sortDir}
                  onClick={() => toggleSort("direction")}
                />
                <SortHeader
                  className="col-span-3 sm:col-span-2"
                  label="Entry"
                  active={sortKey === "entry"}
                  dir={sortDir}
                  onClick={() => toggleSort("entry")}
                />
                <SortHeader
                  className="col-span-3 sm:col-span-2"
                  label="Current"
                  active={sortKey === "current"}
                  dir={sortDir}
                  onClick={() => toggleSort("current")}
                />
                <SortHeader
                  className="col-span-2"
                  label="Lots"
                  active={sortKey === "lots"}
                  dir={sortDir}
                  onClick={() => toggleSort("lots")}
                />
                <SortHeader
                  className="col-span-2 sm:col-span-3 justify-end"
                  label="P/L"
                  active={sortKey === "pnl"}
                  dir={sortDir}
                  onClick={() => toggleSort("pnl")}
                />
                <SortHeader
                  className="hidden sm:flex col-span-2 justify-end"
                  label="Time"
                  active={sortKey === "time"}
                  dir={sortDir}
                  onClick={() => toggleSort("time")}
                />
              </div>
              <div className="divide-y divide-bd">
                {sortedPos.map((p) => (
                  <div
                    key={p.id}
                    className="grid grid-cols-12 items-center gap-2 px-3 sm:px-4 py-2.5 text-xs"
                  >
                    <span
                      className={cn(
                        "col-span-2 sm:col-span-1 inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono w-fit",
                        p.direction === "LONG"
                          ? "border-buy/40 text-buy bg-buy/10"
                          : "border-sell/40 text-sell bg-sell/10",
                      )}
                    >
                      {p.direction}
                    </span>
                    <div className="col-span-3 sm:col-span-2 font-mono text-tx">
                      {fmtPrice(p.entry, p.symbol)}
                    </div>
                    <div className="col-span-3 sm:col-span-2 font-mono text-tx">
                      {fmtPrice(p.current, p.symbol)}
                    </div>
                    <div className="col-span-2 font-mono text-dim">{p.lots.toFixed(2)}</div>
                    <div className="col-span-2 sm:col-span-3 text-right font-mono">
                      <div className={cn(p.pnlUSC >= 0 ? "text-buy" : "text-sell")}>
                        {fmtCurrency(p.pnlUSC, currency, true)}
                      </div>
                      <div
                        className={cn(
                          "text-[10px]",
                          p.pnlPct >= 0 ? "text-buy/70" : "text-sell/70",
                        )}
                      >
                        {fmtPct(p.pnlPct)}
                      </div>
                    </div>
                    <div className="hidden sm:block col-span-2 text-right text-[10px] font-mono text-mute">
                      {relTime(p.openedAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
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
  currency,
}: SymbolSummary & { currency?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<PosSortKey>("time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const sortedPos = useMemo(
    () => sortPositions(posList, sortKey, sortDir),
    [posList, sortKey, sortDir],
  );

  const toggleSort = (key: PosSortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="rounded-lg border border-bd bg-bg1/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={cn(
          "w-full px-3 py-3 bg-bg2/30 text-left hover:bg-bg2/50 transition-colors",
          expanded && "border-b border-bd",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-sm font-semibold truncate">{symbol}</span>
              {regimeBias ? (
                <BiasBadge bias={regimeBias} />
              ) : (
                <span className="text-[10px] font-mono text-mute">—</span>
              )}
            </div>
            <div className="mt-1 text-[10px] font-mono text-mute tabular-nums">
              {posList.length} pos · {longsCount}L / {shortsCount}S
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div
              className={cn(
                "font-mono text-sm tabular-nums",
                groupPnl >= 0 ? "text-buy" : "text-sell",
              )}
            >
              {fmtCurrency(groupPnl, currency, true)}
            </div>
            <div className="mt-1 flex justify-end">
              <FreshnessBadge state={groupState as never} />
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <MobileMetric
            label="Long"
            value={<span className="text-buy">{totalLong.toFixed(2)}</span>}
          />
          <MobileMetric
            label="Short"
            value={<span className="text-sell">{totalShort.toFixed(2)}</span>}
          />
          <MobileMetric
            label="Net"
            value={
              <span className={netLots >= 0 ? "text-buy" : "text-sell"}>
                {netLots >= 0 ? "+" : ""}
                {netLots.toFixed(2)}
              </span>
            }
          />
          <MobileMetric
            label="OI Today %"
            value={
              <EquityImpactBadge value={equityImpactPct} baselineQuality={todayBaselineQuality} />
            }
          />
        </div>
      </button>

      {expanded && (
        <div>
          {stale && (
            <div className="px-3 py-2 border-b border-bd">
              <WarningLine level="warn">
                {symbol} backend snapshot is {relTime(snapPairUpdatedAt ?? "")}.
              </WarningLine>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 px-3 py-2 border-b border-bd bg-bg2/20 text-[10px] font-mono uppercase tracking-wider text-mute">
            <SortHeader
              label="Type"
              active={sortKey === "direction"}
              dir={sortDir}
              onClick={() => toggleSort("direction")}
            />
            <SortHeader
              label="Lots"
              active={sortKey === "lots"}
              dir={sortDir}
              onClick={() => toggleSort("lots")}
            />
            <SortHeader
              className="justify-end"
              label="P/L"
              active={sortKey === "pnl"}
              dir={sortDir}
              onClick={() => toggleSort("pnl")}
            />
          </div>

          <div className="divide-y divide-bd">
            {sortedPos.map((p) => (
              <div key={p.id} className="px-3 py-2.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono",
                      p.direction === "LONG"
                        ? "border-buy/40 text-buy bg-buy/10"
                        : "border-sell/40 text-sell bg-sell/10",
                    )}
                  >
                    {p.direction}
                  </span>
                  <div
                    className={cn(
                      "font-mono tabular-nums",
                      p.pnlUSC >= 0 ? "text-buy" : "text-sell",
                    )}
                  >
                    {fmtCurrency(p.pnlUSC, currency, true)}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
                  <div className="text-mute">Entry</div>
                  <div className="text-right text-tx">{fmtPrice(p.entry, p.symbol)}</div>
                  <div className="text-mute">Current</div>
                  <div className="text-right text-tx">{fmtPrice(p.current, p.symbol)}</div>
                  <div className="text-mute">Lots</div>
                  <div className="text-right text-dim">{p.lots.toFixed(2)}</div>
                  <div className="text-mute">Time</div>
                  <div className="text-right text-mute">{relTime(p.openedAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MobileMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded border border-bd bg-bg1/50 px-2 py-1.5">
      <div className="text-[9px] font-mono uppercase tracking-wider text-mute">{label}</div>
      <div className="mt-1 font-mono text-[11px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 hover:text-tx transition-colors",
        active && "text-tx",
        className,
      )}
    >
      <span>{label}</span>
      {active ? (
        dir === "asc" ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-50" />
      )}
    </button>
  );
}
