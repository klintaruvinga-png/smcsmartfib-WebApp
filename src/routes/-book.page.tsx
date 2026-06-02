import { useStableUserTrades, useSnapshot, usePollingUiState, useAccountTelemetry } from "@/hooks/useSniperData";
import { SettingsQueryErrorState } from "@/components/sniper/SettingsQueryErrorState";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { WarningLine } from "@/components/sniper/Warnings";
import { fmtPrice, fmtPct, fmtCurrency, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Position } from "@/types/sniper";

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
          const netLots = totalLong - totalShort;
          // Combined notional placeholder (backend will replace with true value)
          const combinedValue = posList.reduce((s, p) => s + p.lots * p.current, 0);
          return (
            <div key={symbol} className="rounded-lg border border-bd bg-bg1/60 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-bd bg-bg2/30">
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <span className="font-mono text-sm font-semibold">{symbol}</span>
                  <span className="text-[10px] font-mono text-mute">
                    {posList.length} pos · {longs.length}L / {shorts.length}S
                  </span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <span
                    className={cn("font-mono text-sm", groupPnl >= 0 ? "text-buy" : "text-sell")}
                  >
                    {fmtCurrency(groupPnl, accountTelemetry?.currency, true)}
                  </span>
                  <FreshnessBadge state={groupState} />
                </div>
              </div>

              {/* Aggregate summary row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-bd/60 border-b border-bd">
                <SummaryCell label="Long lots" value={totalLong.toFixed(2)} tone="buy" />
                <SummaryCell label="Short lots" value={totalShort.toFixed(2)} tone="sell" />
                <SummaryCell
                  label="Net lots"
                  value={`${netLots >= 0 ? "+" : ""}${netLots.toFixed(2)}`}
                  tone={netLots > 0 ? "buy" : netLots < 0 ? "sell" : "neutral"}
                />
                <SummaryCell
                  label="Combined value"
                  value={fmtCurrency(combinedValue, accountTelemetry?.currency)}
                  tone="neutral"
                />
              </div>

              {stale && (
                <div className="px-4 py-2 border-b border-bd">
                  <WarningLine level="warn">
                    {symbol} backend snapshot is {relTime(snapPair?.updatedAt ?? "")}.
                  </WarningLine>
                </div>
              )}

              {/* Mobile-friendly horizontally scrollable position list */}
              <div className="overflow-x-auto">
                <div className="divide-y divide-bd min-w-[520px]">
                  {posList.map((p) => (
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
                      <div className="col-span-3 sm:col-span-2 font-mono">
                        <div className="text-[10px] text-mute">ENTRY</div>
                        <div className="text-tx">{fmtPrice(p.entry, p.symbol)}</div>
                      </div>
                      <div className="col-span-3 sm:col-span-2 font-mono">
                        <div className="text-[10px] text-mute">CURRENT</div>
                        <div className="text-tx">{fmtPrice(p.current, p.symbol)}</div>
                      </div>
                      <div className="col-span-2 font-mono">
                        <div className="text-[10px] text-mute">LOTS</div>
                        <div className="text-dim">{p.lots.toFixed(2)}</div>
                      </div>
                      <div className="col-span-2 sm:col-span-3 text-right font-mono">
                        <div className={cn(p.pnlUSC >= 0 ? "text-buy" : "text-sell")}>
                          {fmtCurrency(p.pnlUSC, accountTelemetry?.currency, true)}
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
          );
        })}
      </div>
    </div>
  );
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "buy" | "sell" | "neutral";
}) {
  return (
    <div className="bg-bg1/50 px-3 py-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-mute">{label}</div>
      <div
        className={cn(
          "font-mono text-sm font-semibold tabular-nums",
          tone === "buy" && "text-buy",
          tone === "sell" && "text-sell",
          tone === "neutral" && "text-tx",
        )}
      >
        {value}
      </div>
    </div>
  );
}
