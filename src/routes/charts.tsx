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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  const precision = useMemo(() => {
    const sample = fmtPrice(1, symbol);
    const dot = sample.indexOf(".");
    return dot >= 0 ? sample.length - dot - 1 : 2;
  }, [symbol]);

  function positionLabels() {
    const s = seriesRef.current;
    const overlay = overlayRef.current;
    if (!s || !overlay) return;
    for (const el of Array.from(overlay.children) as HTMLDivElement[]) {
      const price = parseFloat(el.dataset.price ?? "0");
      const y = s.priceToCoordinate(price);
      if (y == null) {
        el.style.display = "none";
      } else {
        el.style.display = "block";
        el.style.top = `${y - 8}px`;
      }
    }
  }

  // init chart
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#9cb0c9",
        fontFamily: "JetBrains Mono",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(164,191,223,0.08)" },
        horzLines: { color: "rgba(164,191,223,0.08)" },
      },
      rightPriceScale: {
        borderColor: "rgba(164,191,223,0.24)",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: "rgba(164,191,223,0.24)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: 1 },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
        mouseWheel: true,
        pinch: true,
      },
      autoSize: true,
    });
    const lineSeries = chart.addSeries(LineSeries, {
      color: "#59a8ff",
      lineWidth: 2,
      priceFormat: { type: "price", precision, minMove: Math.pow(10, -precision) },
    });
    chartRef.current = chart;
    seriesRef.current = lineSeries;
    // Reposition overlay labels whenever the visible range or crosshair changes
    chart.subscribeCrosshairMove(positionLabels);
    chart.timeScale().subscribeVisibleTimeRangeChange(positionLabels);
    const container = containerRef.current;
    const onWheel = () => requestAnimationFrame(positionLabels);
    container.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      container.removeEventListener("wheel", onWheel);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLinesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precision]);

  // update data
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    // dedupe + sort ascending by time (lightweight-charts requirement)
    const map = new Map<number, number>();
    for (const pt of series) {
      const sec = Math.floor(pt.t / 1000);
      map.set(sec, pt.p);
    }
    const data = Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([t, p]) => ({ time: t as UTCTimestamp, value: p }));
    s.setData(data);
  }, [series]);

  // update fib lines
  useEffect(() => {
    const s = seriesRef.current;
    const overlay = overlayRef.current;
    if (!s || !overlay) return;
    for (const pl of priceLinesRef.current) s.removePriceLine(pl);
    priceLinesRef.current = fibs.map((f) =>
      s.createPriceLine({
        price: f.price,
        color: "#d8a35d",
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: "",
      }),
    );
    // Rebuild HTML label overlay — labels render on chart body, not price axis
    overlay.innerHTML = "";
    for (const f of fibs) {
      const el = document.createElement("div");
      el.dataset.price = String(f.price);
      el.style.cssText =
        "position:absolute;left:4px;font-size:9px;font-family:'JetBrains Mono',monospace;" +
        "color:#d8a35d;pointer-events:none;white-space:nowrap;line-height:16px;";
      el.textContent = f.label;
      overlay.appendChild(el);
    }
    positionLabels();
  }, [fibs]);

  return (
    <div className="-mx-2">
      <div className="relative h-[360px] w-full">
        <div ref={containerRef} className="h-full w-full" />
        <div
          ref={overlayRef}
          className="absolute inset-0 pointer-events-none overflow-hidden"
        />
      </div>
      <div className="px-2 mt-1 text-[10px] text-mute font-mono">
        Drag to pan · Scroll to zoom · Drag axes to scale
      </div>
    </div>
  );
}

