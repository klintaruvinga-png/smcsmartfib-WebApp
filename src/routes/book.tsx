import { createFileRoute } from "@tanstack/react-router";
import { useUserTrades, useSnapshot, usePollingUiState } from "@/hooks/useSniperData";
import { SettingsQueryErrorState } from "@/components/sniper/SettingsQueryErrorState";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { WarningLine } from "@/components/sniper/Warnings";
import { fmtPrice, fmtPct, fmtUSC, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Position } from "@/types/sniper";

export const Route = createFileRoute("/book")({
  head: () => ({
    meta: [
      { title: "Active Book — SMC SuperFIB" },
      {
        name: "description",
        content: "Open positions grouped by symbol with pair-level freshness warnings.",
      },
      { property: "og:title", content: "Active Book — SMC SuperFIB" },
      { property: "og:description", content: "All open positions in one consolidated book." },
    ],
  }),
  component: BookPage,
});

export function BookPage() {
  const { data: trades, isLoading, error } = useUserTrades();
  const { data: snap } = useSnapshot();
  const {
    pendingSettingsLoad,
    missingBackendUrl,
    settingsLoadFailed,
    settingsLoadError,
    retrySettingsLoad,
  } = usePollingUiState();
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
    const groupKey = `${p.symbol}:${p.direction}`;
    (acc[groupKey] ??= []).push(p);
    return acc;
  }, {});

  const totalPnl = positions.reduce((s, p) => s + p.pnlUSC, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Active Book</h1>
          <p className="text-xs text-mute mt-0.5">
            {positions.length} open · {fmtUSC(totalPnl, true)}
          </p>
        </div>
      </div>

      {Object.keys(grouped).length === 0 && (
        <div className="text-mute text-sm">No open positions.</div>
      )}

      <div className="space-y-4">
        {Object.entries(grouped).map(([groupKey, posList]) => {
          const symbol = posList[0]?.symbol ?? groupKey;
          const direction = posList[0]?.direction ?? "LONG";
          const snapPair = snap?.prices.find((p) => p.symbol === symbol);
          const stale = posList.some((p) => p.state === "stale") || snapPair?.state === "stale";
          const groupPnl = posList.reduce((s, p) => s + p.pnlUSC, 0);
          return (
            <div key={groupKey} className="rounded-lg border border-bd bg-bg1/60 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-bd bg-bg2/30">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold">{symbol}</span>
                  <span
                    className={cn(
                      "inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono",
                      direction === "LONG"
                        ? "border-buy/40 text-buy bg-buy/10"
                        : "border-sell/40 text-sell bg-sell/10",
                    )}
                  >
                    {direction}
                  </span>
                  <span className="text-[10px] font-mono text-mute">{posList.length} pos</span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={cn("font-mono text-sm", groupPnl >= 0 ? "text-buy" : "text-sell")}
                  >
                    {fmtUSC(groupPnl, true)}
                  </span>
                  {snapPair && <FreshnessBadge state={snapPair.state} />}
                </div>
              </div>
              {stale && (
                <div className="px-4 py-2 border-b border-bd">
                  <WarningLine level="warn">
                    {symbol} backend snapshot is {relTime(snapPair?.updatedAt ?? "")}.
                  </WarningLine>
                </div>
              )}
              <div className="divide-y divide-bd">
                {posList.map((p) => (
                  <div
                    key={p.id}
                    className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-xs"
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
                        {fmtUSC(p.pnlUSC, true)}
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
          );
        })}
      </div>
    </div>
  );
}
