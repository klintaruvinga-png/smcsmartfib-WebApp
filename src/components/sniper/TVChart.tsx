import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { fmtPrice } from "@/lib/format";
import type { Symbol } from "@/types/sniper";

export type FibLevel = {
  family: string;
  label: string;
  price: number;
  role?: "premium" | "equilibrium" | "discount" | "premium-extension" | "discount-extension";
};

function colorForRole(role: FibLevel["role"], label: string): string {
  // 50% / equilibrium = neutral gray
  if (role === "equilibrium" || /(^|\s)50(\.0+)?%?$/.test(label.trim())) return "#9aa6b2";
  if (role === "discount" || role === "discount-extension") return "#3ecf8e"; // buy = green
  if (role === "premium" || role === "premium-extension") return "#ef5b5b"; // sell = red
  return "#9aa6b2";
}

export function TVChart({
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
        // Place label fully above the price line so the dotted line never crosses the text
        el.style.top = `${y - 18}px`;
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

    let rafId = 0;
    const tick = () => {
      positionLabels();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
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

    priceLinesRef.current = fibs.map((fib) => {
      const color = colorForRole(fib.role, fib.label);
      return seriesApi.createPriceLine({
        price: fib.price,
        color,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "",
      });
    });

    overlay.innerHTML = "";
    for (const fib of fibs) {
      const color = colorForRole(fib.role, fib.label);
      const el = document.createElement("div");
      el.dataset.price = String(fib.price);
      el.style.cssText =
        `position:absolute;right:60px;font-size:10px;font-family:'JetBrains Mono',monospace;` +
        `color:${color};pointer-events:none;white-space:nowrap;line-height:14px;` +
        `background:rgba(15,20,28,0.85);padding:1px 5px;border-radius:2px;` +
        `border:1px solid ${color}55;`;
      el.textContent = `${fib.family} ${fib.label} @ ${fmtPrice(fib.price, symbol)}`;
      overlay.appendChild(el);
    }

    positionLabels();
  }, [fibs, symbol]);

  return (
    <div className="-mx-2">
      <div className="relative h-[420px] w-full">
        <div ref={containerRef} className="h-full w-full" />
        <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
      </div>
      <div className="mt-1 px-2 font-mono text-[10px] text-mute">
        Drag to pan / Scroll to zoom / Drag axes to scale
      </div>
    </div>
  );
}
