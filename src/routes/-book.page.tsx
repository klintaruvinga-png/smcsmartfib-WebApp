import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { useStableUserTrades, useSnapshot, usePollingUiState, useAccountTelemetry } from "@/hooks/useSniperData";
import { SettingsQueryErrorState } from "@/components/sniper/SettingsQueryErrorState";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { WarningLine } from "@/components/sniper/Warnings";
import { fmtPrice, fmtPct, fmtCurrency, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Position } from "@/types/sniper";

type SortKey = "direction" | "entry" | "current" | "lots" | "pnl" | "time";
type SortDir = "asc" | "desc";

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

  const grouped = positions.reduce<Record<string, Position[]>>((acc, p) => {
    (acc[p.symbol] ??= []).push(p);
    return acc;
  }, {});

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

      {Object.keys(grouped).length === 0 && (
        <div className="text-mute text-sm">No open positions.</div>
      )}

      <div className="space-y-4">
        {Object.entries(grouped).map(([symbol, posList]) => {
          const snapPair = snap?.prices.find((p) => p.symbol === symbol);
          const tradeStale = posList.some((p) => p.state === "stale");
          const stale = tradeStale || snapPair?.state === "stale";
          const groupState = tradeStale ? "stale" : (snapPair?.state ?? "unavailable");
          const groupPnl = posList.reduce((s, p) => s + p.pnlUSC, 0);
          const longs = posList.filter((p) => p.direction === "LONG");
          const shorts = posList.filter((p) => p.direction === "SHORT");
          const totalLong = longs.reduce((s, p) => s + p.lots, 0);
          const totalShort = shorts.reduce((s, p) => s + p.lots, 0);
          return (
            <SymbolCard
              key={symbol}
              symbol={symbol}
              posList={posList}
              groupPnl={groupPnl}
              groupState={groupState}
              stale={stale}
              snapPairUpdatedAt={snapPair?.updatedAt}
              longsCount={longs.length}
              shortsCount={shorts.length}
              totalLong={totalLong}
              totalShort={totalShort}
              currency={accountTelemetry?.currency}
            />
          );
        })}
      </div>
    </div>
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
  currency,
}: {
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
  currency?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedPos = useMemo(() => {
    const arr = [...posList];
    arr.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (sortKey) {
        case "direction": av = a.direction; bv = b.direction; break;
        case "entry": av = a.entry; bv = b.entry; break;
        case "current": av = a.current; bv = b.current; break;
        case "lots": av = a.lots; bv = b.lots; break;
        case "pnl": av = a.pnlUSC; bv = b.pnlUSC; break;
        case "time": av = new Date(a.openedAt).getTime(); bv = new Date(b.openedAt).getTime(); break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [posList, sortKey, sortDir]);

  return (
    <div className="rounded-lg border border-bd bg-bg1/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-bd bg-bg2/30 text-left hover:bg-bg2/50 transition-colors"
      >
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-mute" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-mute" />
          )}
          <span className="font-mono text-sm font-semibold">{symbol}</span>
          <span className="text-[10px] font-mono text-mute">
            {posList.length} pos · {longsCount}L / {shortsCount}S
          </span>
          <span className="text-[10px] font-mono text-mute">·</span>
          <span className="text-[10px] font-mono text-buy">Long {totalLong.toFixed(2)} Lots</span>
          <span className="text-[10px] font-mono text-sell">Short {totalShort.toFixed(2)} Lots</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className={cn("font-mono text-sm", groupPnl >= 0 ? "text-buy" : "text-sell")}>
            {fmtCurrency(groupPnl, currency, true)}
          </span>
          <FreshnessBadge state={groupState as never} />
        </div>
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
                <SortHeader className="col-span-2 sm:col-span-1" label="Type" active={sortKey === "direction"} dir={sortDir} onClick={() => toggleSort("direction")} />
                <SortHeader className="col-span-3 sm:col-span-2" label="Entry" active={sortKey === "entry"} dir={sortDir} onClick={() => toggleSort("entry")} />
                <SortHeader className="col-span-3 sm:col-span-2" label="Current" active={sortKey === "current"} dir={sortDir} onClick={() => toggleSort("current")} />
                <SortHeader className="col-span-2" label="Lots" active={sortKey === "lots"} dir={sortDir} onClick={() => toggleSort("lots")} />
                <SortHeader className="col-span-2 sm:col-span-3 justify-end" label="P/L" active={sortKey === "pnl"} dir={sortDir} onClick={() => toggleSort("pnl")} />
                <SortHeader className="hidden sm:flex col-span-2 justify-end" label="Time" active={sortKey === "time"} dir={sortDir} onClick={() => toggleSort("time")} />
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
                    <div className="col-span-3 sm:col-span-2 font-mono text-tx">{fmtPrice(p.entry, p.symbol)}</div>
                    <div className="col-span-3 sm:col-span-2 font-mono text-tx">{fmtPrice(p.current, p.symbol)}</div>
                    <div className="col-span-2 font-mono text-dim">{p.lots.toFixed(2)}</div>
                    <div className="col-span-2 sm:col-span-3 text-right font-mono">
                      <div className={cn(p.pnlUSC >= 0 ? "text-buy" : "text-sell")}>
                        {fmtCurrency(p.pnlUSC, currency, true)}
                      </div>
                      <div className={cn("text-[10px]", p.pnlPct >= 0 ? "text-buy/70" : "text-sell/70")}>
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
