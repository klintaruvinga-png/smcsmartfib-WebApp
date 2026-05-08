import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSnapshot, usePollMs } from "@/hooks/useSniperData";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { fmtPrice, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type IPriceLine,
} from "lightweight-charts";
import type { ChartSnapshot, Symbol } from "@/types/sniper";
import { apiClient } from "@/lib/api/sniperClient";

export const Route = createFileRoute("/charts")({
  head: () => ({
    meta: [
      { title: "Charts - SMC SuperFIB" },
      { name: "description", content: "Per-pair price and Fibonacci visualisation." },
      { property: "og:title", content: "Charts - SMC SuperFIB" },
      { property: "og:description", content: "Price action with key Fibonacci levels." },
    ],
  }),
  component: ChartsPage,
});

function ChartsPage() {
  const { data } = useSnapshot();
  const pollMs = usePollMs();
  const [selected, setSelected] = useState<Symbol>("GBPUSD");

  // Clamp selection to current watchlist snapshot — if the selected symbol was
  // removed from the watchlist it will no longer appear in data.prices, so fall
  // back to the first available symbol instead of dereferencing undefined.
  const prices = data?.prices ?? [];
  const price = prices.find((p) => p.symbol === selected) ?? prices[0];
  const activeSymbol = price?.symbol ?? selected;

  const { data: chart } = useQuery<ChartSnapshot>({
    queryKey: ["chart", activeSymbol],
    queryFn: () => apiClient.getChartSnapshot(activeSymbol),
    enabled: pollMs !== null,
    refetchInterval: pollMs ?? false,
  });

  if (!data) return null;
  if (!price) {
    return <div className="text-mute text-sm">Add symbols to your watchlist to view charts.</div>;
  }

  const series = (chart?.candles ?? []).map((c) => ({ t: new Date(c.time).getTime(), p: c.close }));
  const fibs = chart?.fibLevels ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Charts</h1>
          <p className="text-xs text-mute mt-0.5">Price + Fibonacci overlay</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {data.prices.map((p) => (
          <button
            key={p.symbol}
            onClick={() => setSelected(p.symbol)}
            className={cn(
              "rounded border px-2.5 py-1 text-xs font-mono transition-colors",
              p.symbol === activeSymbol
                ? "border-accent/60 bg-accent/15 text-accent"
                : "border-bd bg-bg2/40 text-mute hover:text-dim hover:border-bd2",
            )}
          >
            {p.symbol}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-bd bg-bg1/60 p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-mono text-xl font-semibold">{price.symbol}</div>
            <div className="flex items-center gap-3 mt-1">
              <span className="font-mono text-2xl text-tx">
                {fmtPrice(price.mid, price.symbol)}
              </span>
              <span
                className={cn(
                  "font-mono text-sm",
                  price.changePct1d >= 0 ? "text-buy" : "text-sell",
                )}
              >
                {fmtPct(price.changePct1d)}
              </span>
            </div>
          </div>
          <FreshnessBadge state={chart?.state ?? price.state} />
        </div>

        <TVChart series={series} fibs={fibs} symbol={activeSymbol} />

        <div className="mt-4 flex flex-wrap gap-2">
          {fibs.map((f) => (
            <div
              key={`${f.family}-${f.label}`}
              className="rounded border border-bd bg-bg2/40 px-2.5 py-2 text-center"
            >
              <div className="text-[10px] font-mono uppercase tracking-wider text-accent">
                FIB {f.label}
              </div>
              <div className="font-mono text-sm text-tx mt-0.5">
                {fmtPrice(f.price, activeSymbol)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
