import { createFileRoute } from "@tanstack/react-router";
import { useSnapshot } from "@/hooks/useSniperData";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { BiasBadge, ChopMeter, GateBadge } from "@/components/sniper/Indicators";
import { WarningLine } from "@/components/sniper/Warnings";
import { fmtPrice, fmtPct, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";

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

function LivePage() {
  const { data, isLoading } = useSnapshot();
  if (isLoading || !data) return <div className="text-mute text-sm">Loading radar…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Live Radar</h1>
          <p className="text-xs text-mute mt-0.5">Prices · Regime · Gate · Chop</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data.prices.map((price) => {
          const regime = data.regimes.find((r) => r.symbol === price.symbol);
          const gate = data.gates.find((g) => g.symbol === price.symbol);
          const stale = price.state === "stale" || regime?.state === "stale";
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
                  {fmtPrice(price.mid, price.symbol)}
                </div>
                <div
                  className={cn(
                    "font-mono text-sm",
                    price.changePct1d >= 0 ? "text-buy" : "text-sell",
                  )}
                >
                  {fmtPct(price.changePct1d)}
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-mute">
                <span>BID {fmtPrice(price.bid, price.symbol)}</span>
                <span>ASK {fmtPrice(price.ask, price.symbol)}</span>
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
              {stale && !gate?.reason && (
                <WarningLine level="warn">
                  Snapshot {relTime(price.updatedAt)} — refresh to revalidate.
                </WarningLine>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
