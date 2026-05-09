import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBackendReady, useSnapshot, usePollMs } from "@/hooks/useSniperData";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { fmtPrice, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
  const backendReady = useBackendReady();
  const pollMs = usePollMs();
  const [selected, setSelected] = useState<Symbol>("GBPUSD");

  // Clamp selection to current watchlist snapshot so chart requests never
  // dereference a removed symbol after a watchlist mutation.
  const prices = data?.prices ?? [];
  const price = prices.find((p) => p.symbol === selected) ?? prices[0];
  const activeSymbol = price?.symbol ?? selected;

  const { data: chart } = useQuery<ChartSnapshot>({
    queryKey: ["chart", activeSymbol],
    queryFn: () => apiClient.getChartSnapshot(activeSymbol),
    enabled: backendReady && pollMs !== null,
    refetchInterval: backendReady ? (pollMs ?? false) : false,
  });

  if (!backendReady) {
    return (
      <div className="text-mute text-sm">
        Configure a backend URL in Account before loading chart data.
      </div>
    );
  }

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
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="font-mono text-xl font-semibold">{price.symbol}</div>
            <div className="mt-1 flex items-center gap-3">
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
              <div className="mt-0.5 font-mono text-sm text-tx">
                {fmtPrice(f.price, activeSymbol)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type FibLevel = { family: string; label: string; price: number };

function TVChart({
  series,
  fibs,
  symbol,
}: {
  series: { t: number; p: number }[];
  fibs: FibLevel[];
  symbol: Symbol | string;
}) {
  const precision = useMemo(() => {
    const sample = fmtPrice(1, symbol);
    const dot = sample.indexOf(".");
    return dot >= 0 ? sample.length - dot - 1 : 2;
  }, [symbol]);
  const data = useMemo(() => {
    const points = new Map<number, number>();
    for (const pt of series) {
      const sec = Math.floor(pt.t / 1000);
      if (!Number.isFinite(sec) || !Number.isFinite(pt.p)) continue;
      points.set(sec, pt.p);
    }
    return Array.from(points.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, value]) => ({ time, value }));
  }, [series]);
  const yDomain = useMemo(() => {
    const values = [...data.map((point) => point.value), ...fibs.map((fib) => fib.price)].filter(
      (value) => Number.isFinite(value),
    );
    if (values.length === 0) return ["auto", "auto"] as const;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = max - min || Math.max(Math.abs(max) * 0.0025, Math.pow(10, -precision));
    const padding = Math.max(spread * 0.12, Math.pow(10, -precision));
    return [min - padding, max + padding] as const;
  }, [data, fibs, precision]);

  const formatAxisTime = (time: number) =>
    new Date(time * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const formatTooltipTime = (time: number) =>
    new Date(time * 1000).toLocaleString([], {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="-mx-2">
      <div className="h-[360px] w-full px-2">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded border border-dashed border-bd text-sm text-mute">
            No candle data returned for this symbol yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="rgba(164,191,223,0.08)" vertical={false} />
              <XAxis
                dataKey="time"
                minTickGap={32}
                tick={{ fill: "#7f93ab", fontSize: 10, fontFamily: "JetBrains Mono" }}
                tickFormatter={formatAxisTime}
                tickLine={false}
                axisLine={{ stroke: "rgba(164,191,223,0.18)" }}
              />
              <YAxis
                domain={yDomain}
                orientation="right"
                width={82}
                tick={{ fill: "#7f93ab", fontSize: 10, fontFamily: "JetBrains Mono" }}
                tickFormatter={(value: number) => fmtPrice(value, symbol)}
                tickLine={false}
                axisLine={{ stroke: "rgba(164,191,223,0.18)" }}
              />
              <Tooltip
                separator="  "
                contentStyle={{
                  backgroundColor: "rgba(11, 20, 32, 0.96)",
                  border: "1px solid rgba(164,191,223,0.18)",
                  borderRadius: "8px",
                  color: "#d7e3f4",
                  fontFamily: "JetBrains Mono",
                  fontSize: "11px",
                }}
                formatter={(value: number) => [fmtPrice(value, symbol), "Price"]}
                labelFormatter={(value: number) => formatTooltipTime(value)}
              />
              {fibs.map((fib) => (
                <ReferenceLine
                  key={`${fib.family}-${fib.label}`}
                  y={fib.price}
                  stroke="#d8a35d"
                  strokeDasharray="4 4"
                  strokeOpacity={0.75}
                  ifOverflow="extendDomain"
                  label={{
                    value: fib.label,
                    position: "insideTopLeft",
                    fill: "#d8a35d",
                    fontSize: 10,
                    fontFamily: "JetBrains Mono",
                  }}
                />
              ))}
              <Line
                type="monotone"
                dataKey="value"
                stroke="#59a8ff"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="mt-1 px-2 font-mono text-[10px] text-mute">
        Backend-authoritative close series with live fib overlays
      </div>
    </div>
  );
}
