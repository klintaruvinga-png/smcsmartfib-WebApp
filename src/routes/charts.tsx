import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSnapshot } from "@/hooks/useSniperData";
import { mockPriceSeries, mockFibLevels } from "@/mocks/sniperData";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { fmtPrice, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LineChart, Line, ResponsiveContainer, ReferenceLine, YAxis, Tooltip } from "recharts";
import type { Symbol } from "@/types/sniper";

export const Route = createFileRoute("/charts")({
  head: () => ({
    meta: [
      { title: "Charts — SMC SuperFIB" },
      { name: "description", content: "Per-pair price and Fibonacci visualisation." },
      { property: "og:title", content: "Charts — SMC SuperFIB" },
      { property: "og:description", content: "Price action with key Fibonacci levels." },
    ],
  }),
  component: ChartsPage,
});

function ChartsPage() {
  const { data } = useSnapshot();
  const [selected, setSelected] = useState<Symbol>("GBPUSD");
  if (!data) return null;

  const price = data.prices.find((p) => p.symbol === selected)!;
  const series = mockPriceSeries(selected);
  const fibs = mockFibLevels(selected);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Charts</h1>
          <p className="text-xs text-mute mt-0.5">Price + Fibonacci overlay</p>
        </div>
      </div>

      {/* Pair switcher */}
      <div className="flex flex-wrap gap-1.5">
        {data.prices.map((p) => (
          <button
            key={p.symbol}
            onClick={() => setSelected(p.symbol)}
            className={cn(
              "rounded border px-2.5 py-1 text-xs font-mono transition-colors",
              p.symbol === selected
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
          <FreshnessBadge state={price.state} />
        </div>

        <div className="h-[320px] -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 5, right: 60, bottom: 5, left: 5 }}>
              <YAxis
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v: number) => fmtPrice(v, selected)}
                width={70}
                tick={{ fill: "#9cb0c9", fontSize: 10, fontFamily: "JetBrains Mono" }}
                axisLine={{ stroke: "rgba(164,191,223,0.24)" }}
                tickLine={false}
                orientation="right"
              />
              <Tooltip
                contentStyle={{
                  background: "#102033",
                  border: "1px solid rgba(164,191,223,0.34)",
                  borderRadius: 6,
                  fontFamily: "JetBrains Mono",
                  fontSize: 11,
                }}
                labelFormatter={() => ""}
                formatter={(v: number) => [fmtPrice(v, selected), "PRICE"]}
              />
              {fibs.map((f) => (
                <ReferenceLine
                  key={f.label}
                  y={f.value}
                  stroke="#d8a35d"
                  strokeDasharray="3 3"
                  strokeOpacity={0.55}
                  label={{
                    value: `${f.label} · ${fmtPrice(f.value, selected)}`,
                    position: "right",
                    fill: "#d8a35d",
                    fontSize: 9,
                    fontFamily: "JetBrains Mono",
                  }}
                />
              ))}
              <Line
                type="monotone"
                dataKey="p"
                stroke="#59a8ff"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          {fibs.map((f) => (
            <div
              key={f.label}
              className="rounded border border-bd bg-bg2/40 px-2.5 py-2 text-center"
            >
              <div className="text-[10px] font-mono uppercase tracking-wider text-accent">
                FIB {f.label}
              </div>
              <div className="font-mono text-sm text-tx mt-0.5">{fmtPrice(f.value, selected)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
