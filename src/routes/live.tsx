import { createFileRoute } from "@tanstack/react-router";
import { useSnapshot, useEngineBatch } from "@/hooks/useSniperData";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { BiasBadge, ChopMeter, GateBadge } from "@/components/sniper/Indicators";
import { WarningLine } from "@/components/sniper/Warnings";
import { fmtPrice, fmtPct, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import type { EngineBlocker } from "@/types/sniper";

export const Route = createFileRoute("/live")({
  head: () => ({
    meta: [
      { title: "Live Radar — SMC SuperFIB" },
      { name: "description", content: "Per-pair live prices, regime, gate state and chop meter." },
      { property: "og:title", content: "Live Radar — SMC SuperFIB" },
      { property: "og:description", content: "Real-time multi-pair regime + gate radar." },
    ],
  }),
  component: LivePage,
});

function blockerWarning(blocker: EngineBlocker | undefined): string | null {
  if (!blocker || blocker === "OK") return null;
  const map: Partial<Record<EngineBlocker, string>> = {
    KEY_MISSING: "Twelve Data key not set",
    KEY_INVALID: "Twelve Data key invalid",
    RATE_LIMITED: "Feed rate-limited — cooling down",
    QUOTE_UNAVAILABLE: "Price unavailable",
    PRICE_STALE: "Price data stale",
    CANDLES_MISSING: "No candle history",
    CANDLES_STALE: "Candles stale (>2 h old)",
    INSUFFICIENT_CANDLE_HISTORY: "Insufficient candle history (<30 bars)",
    READY_NOT_CONFIRMED_STALE_DATA: "READY but stale data — confirmation blocked",
    CHOP_GATE_BLOCKED: "Gate blocked — chop > 0.7 (F3 caution zone)",
  };
  return map[blocker] ?? blocker.replace(/_/g, " ").toLowerCase();
}

function LivePage() {
  const { data, isLoading } = useSnapshot();
  const { mutate: runBatch, isPending: batchRunning } = useEngineBatch();
  if (isLoading || !data) return <div className="text-mute text-sm">Loading radar…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Live Radar</h1>
          <p className="text-xs text-mute mt-0.5">Prices · Regime · Gate · Chop</p>
        </div>
        <button
          onClick={() => runBatch(undefined)}
          disabled={batchRunning}
          className="flex items-center gap-1.5 rounded border border-bd bg-bg2/60 px-3 py-1.5 text-[11px] font-mono text-dim hover:text-fg hover:border-info/40 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={cn("h-3 w-3", batchRunning && "animate-spin")} />
          {batchRunning ? "Refreshing…" : "Force refresh"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data.prices.map((price) => {
          const regime = data.regimes.find((r) => r.symbol === price.symbol);
          const gate = data.gates.find((g) => g.symbol === price.symbol);
          const diagnostic = (data.diagnostics ?? []).find((d) => d.symbol === price.symbol);
          // Preserve backend freshness authority; the browser clock must not override
          // backend-live data into a stale warning state.
          const stale =
            price.state === "stale" ||
            regime?.state === "stale" ||
            diagnostic?.priceState === "stale" ||
            diagnostic?.candleState === "stale";
          const priceUnavailable =
            price.mid === 0 && (price.state === "unavailable" || gate?.allow === "BLOCKED");
          const diagWarning = blockerWarning(diagnostic?.engineBlocker);
          const staleTimestamp = diagnostic?.lastPriceAt ?? price.updatedAt;
          return (
            <div
              key={price.symbol}
              className={cn(
                "rounded-lg border bg-bg1/60 p-3.5 space-y-3",
                price.state === "unavailable" || gate?.allow === "BLOCKED"
                  ? "border-sell/30"
                  : stale
                    ? "border-warn/30"
                    : "border-bd",
              )}
            >
              <div className="flex items-center justify-between">
                <div className="font-mono text-base font-semibold">{price.symbol}</div>
                <FreshnessBadge state={price.state} />
              </div>

              <div className="flex items-baseline justify-between">
                <div className="font-mono text-2xl font-semibold tabular-nums">
                  {priceUnavailable ? "—" : fmtPrice(price.mid, price.symbol)}
                </div>
                <div
                  className={cn(
                    "font-mono text-sm",
                    price.changePct1d >= 0 ? "text-buy" : "text-sell",
                  )}
                >
                  {priceUnavailable ? "—" : fmtPct(price.changePct1d)}
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-mute">
                <span>BID {priceUnavailable ? "—" : fmtPrice(price.bid, price.symbol)}</span>
                <span>ASK {priceUnavailable ? "—" : fmtPrice(price.ask, price.symbol)}</span>
              </div>

              <div className="border-t border-bd pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-mute">
                    Regime
                  </span>
                  {regime && <BiasBadge bias={regime.bias} />}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-mute">
                    Gate
                  </span>
                  {gate && <GateBadge allow={gate.allow} />}
                </div>
                {regime && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-mute">
                        Chop
                      </span>
                      <span className="text-[10px] font-mono text-dim">
                        Fib {regime.nearestFib ? fmtPrice(regime.nearestFib, price.symbol) : "—"}
                      </span>
                    </div>
                    <ChopMeter value={regime.chop} />
                  </div>
                )}
              </div>

              {gate?.reason && <WarningLine level="block">Gate blocked: {gate.reason}</WarningLine>}
              {diagWarning && !gate?.reason && (
                <WarningLine
                  level={
                    diagnostic?.engineBlocker === "KEY_MISSING" ||
                    diagnostic?.engineBlocker === "KEY_INVALID" ||
                    diagnostic?.engineBlocker === "RATE_LIMITED"
                      ? "block"
                      : "warn"
                  }
                >
                  {diagWarning}
                </WarningLine>
              )}
              {stale && !gate?.reason && !diagWarning && (
                <WarningLine level="warn">
                  Price data stale — last update {relTime(staleTimestamp)}.
                </WarningLine>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
