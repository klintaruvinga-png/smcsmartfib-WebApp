import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBackendReady, useSnapshot, usePollMs } from "@/hooks/useSniperData";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { fmtPrice, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
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
          <p className="mt-0.5 text-xs text-mute">Price + Fibonacci overlay</p>
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
                : "border-bd bg-bg2/40 text-mute hover:border-bd2 hover:text-dim",
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
    const seriesApi = seriesRef.current;
    const overlay = overlayRef.current;
    if (!seriesApi || !overlay) return;

    for (const el of Array.from(overlay.children) as HTMLDivElement[]) {
      const price = parseFloat(el.dataset.price ?? "0");
      const y = seriesApi.priceToCoordinate(price);
      if (y == null) {
        el.style.display = "none";
      } else {
        el.style.display = "block";
        el.style.top = `${y - 8}px`;
      }
    }
  }

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

    chart.subscribeCrosshairMove(positionLabels);
    chart.timeScale().subscribeVisibleTimeRangeChange(positionLabels);
    chart
      .priceScale("right")
      .subscribeVisiblePriceRangeChange(() => requestAnimationFrame(positionLabels));

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
  }, [precision]);

  useEffect(() => {
    const seriesApi = seriesRef.current;
    if (!seriesApi) return;

    const data = Array.from(
      series
        .reduce((points, pt) => {
          const sec = Math.floor(pt.t / 1000);
          if (!Number.isFinite(sec) || !Number.isFinite(pt.p)) return points;
          points.set(sec, pt.p);
          return points;
        }, new Map<number, number>())
        .entries(),
    )
      .sort((a, b) => a[0] - b[0])
      .map(([time, value]) => ({ time: time as UTCTimestamp, value }));

    seriesApi.setData(data);
    requestAnimationFrame(positionLabels);
  }, [series]);

  useEffect(() => {
    const seriesApi = seriesRef.current;
    const overlay = overlayRef.current;
    if (!seriesApi || !overlay) return;

    for (const line of priceLinesRef.current) {
      seriesApi.removePriceLine(line);
    }

    priceLinesRef.current = fibs.map((fib) =>
      seriesApi.createPriceLine({
        price: fib.price,
        color: "#d8a35d",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "",
      }),
    );

    overlay.innerHTML = "";
    for (const fib of fibs) {
      const el = document.createElement("div");
      el.dataset.price = String(fib.price);
      el.style.cssText =
        "position:absolute;left:4px;font-size:9px;font-family:'JetBrains Mono',monospace;" +
        "color:#d8a35d;pointer-events:none;white-space:nowrap;line-height:16px;";
      el.textContent = fib.label;
      overlay.appendChild(el);
    }

    positionLabels();
  }, [fibs]);

  return (
    <div className="-mx-2">
      <div className="relative h-[360px] w-full">
        <div ref={containerRef} className="h-full w-full" />
        <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
      </div>
      <div className="mt-1 px-2 font-mono text-[10px] text-mute">
        Drag to pan / Scroll to zoom / Drag axes to scale
      </div>
    </div>
  );
}
