import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { m as fmtPrice, f as cn, w as useSnapshot, b as usePollingUiState, z as usePollMs, d as useCanonicalWatchlist, G as clampSymbolToWatchlist, p as apiClient, l as fmtPct, F as FreshnessBadge } from "./router-DONb8JY3.js";
import { S as SettingsQueryErrorState } from "./SettingsQueryErrorState-2nE1Yemg.js";
import { u as useTickFlash } from "./useTickFlash-CPIV-dXF.js";
import { createChart, LineSeries } from "lightweight-charts";
import "@tanstack/react-router";
import "clsx";
import "tailwind-merge";
import "lucide-react";
import "sonner";
import "recharts";
import "@radix-ui/react-slot";
import "class-variance-authority";
const CHART_TIMEFRAME_MS = {
  "1min": 6e4,
  "5min": 3e5,
  "15min": 9e5,
  "30min": 18e5,
  "1h": 36e5,
  "4h": 144e5
};
function isChartTickFlashActive(backendReady, freshnessState, tickDirection) {
  return backendReady && (freshnessState === "live" || freshnessState === "mock") && tickDirection !== null;
}
function resolveChartCountdownMs(chart, now = Date.now()) {
  if (!chart) {
    return void 0;
  }
  if (typeof chart.nextCandleAt === "number" && Number.isFinite(chart.nextCandleAt)) {
    return Math.max(0, chart.nextCandleAt - now);
  }
  const intervalMs = CHART_TIMEFRAME_MS[chart.timeframe];
  const lastCandle = chart.candles.at(-1);
  if (intervalMs === void 0 || !lastCandle) {
    return void 0;
  }
  const lastCandleAtMs = Date.parse(lastCandle.time);
  if (!Number.isFinite(lastCandleAtMs)) {
    return void 0;
  }
  return Math.max(0, lastCandleAtMs + intervalMs - now);
}
function useChartCountdownMs(chart) {
  const [countdownMs, setCountdownMs] = useState(
    () => resolveChartCountdownMs(chart)
  );
  const lastCandleTime = chart?.candles.at(-1)?.time;
  useEffect(() => {
    setCountdownMs(resolveChartCountdownMs(chart));
    if (!chart || chart.candles.length === 0) {
      return void 0;
    }
    const intervalMs = CHART_TIMEFRAME_MS[chart.timeframe];
    if (intervalMs === void 0) {
      return void 0;
    }
    const intervalId = window.setInterval(() => {
      setCountdownMs(resolveChartCountdownMs(chart));
    }, 1e3);
    return () => window.clearInterval(intervalId);
  }, [chart, lastCandleTime]);
  return countdownMs;
}
function colorForRole(role, label) {
  if (role === "equilibrium" || /(^|\s)50(\.0+)?%?$/.test(label.trim())) return "#9aa6b2";
  if (role === "discount" || role === "discount-extension") return "#3ecf8e";
  if (role === "premium" || role === "premium-extension") return "#ef5b5b";
  return "#9aa6b2";
}
function formatCountdown(ms) {
  const safeMs = Math.max(0, ms);
  const minutes = Math.floor(safeMs / 6e4);
  const seconds = String(Math.floor(safeMs % 6e4 / 1e3)).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
function TVChart({
  series,
  fibs,
  symbol,
  tickFlash,
  candleCountdownMs
}) {
  const containerRef = useRef(null);
  const overlayRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const priceLinesRef = useRef([]);
  const latestPrice = series.at(-1)?.p;
  const precision = useMemo(() => {
    const sample = fmtPrice(1, symbol);
    const dot = sample.indexOf(".");
    return dot >= 0 ? sample.length - dot - 1 : 2;
  }, [symbol]);
  function positionLabels() {
    const seriesApi = seriesRef.current;
    const overlay = overlayRef.current;
    if (!seriesApi || !overlay) return;
    for (const el of Array.from(overlay.children)) {
      const price = parseFloat(el.dataset.price ?? "0");
      const y = seriesApi.priceToCoordinate(price);
      if (y == null) {
        el.style.display = "none";
      } else {
        el.style.display = "block";
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
        fontSize: 10
      },
      grid: {
        vertLines: { color: "rgba(164,191,223,0.08)" },
        horzLines: { color: "rgba(164,191,223,0.08)" }
      },
      rightPriceScale: {
        borderColor: "rgba(164,191,223,0.24)",
        scaleMargins: { top: 0.1, bottom: 0.1 }
      },
      timeScale: {
        borderColor: "rgba(164,191,223,0.24)",
        timeVisible: true,
        secondsVisible: false
      },
      crosshair: { mode: 1 },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true
      },
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
        mouseWheel: true,
        pinch: true
      },
      autoSize: true
    });
    const lineSeries = chart.addSeries(LineSeries, {
      color: "#59a8ff",
      lineWidth: 2,
      priceFormat: { type: "price", precision, minMove: Math.pow(10, -precision) }
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
      series.reduce((points, pt) => {
        const sec = Math.floor(pt.t / 1e3);
        if (!Number.isFinite(sec) || !Number.isFinite(pt.p)) return points;
        points.set(sec, pt.p);
        return points;
      }, /* @__PURE__ */ new Map()).entries()
    ).sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));
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
        title: ""
      });
    });
    overlay.innerHTML = "";
    for (const fib of fibs) {
      const color = colorForRole(fib.role, fib.label);
      const el = document.createElement("div");
      el.dataset.price = String(fib.price);
      el.style.cssText = `position:absolute;right:60px;font-size:10px;font-family:'JetBrains Mono',monospace;color:${color};pointer-events:none;white-space:nowrap;line-height:14px;background:rgba(15,20,28,0.85);padding:1px 5px;border-radius:2px;border:1px solid ${color}55;`;
      el.textContent = `${fib.family} ${fib.label} @ ${fmtPrice(fib.price, symbol)}`;
      overlay.appendChild(el);
    }
    positionLabels();
  }, [fibs, symbol]);
  return /* @__PURE__ */ jsxs("div", { className: "-mx-2", children: [
    (typeof latestPrice === "number" || candleCountdownMs !== void 0) && /* @__PURE__ */ jsxs("div", { className: "mb-2 flex items-center gap-2 px-2", children: [
      typeof latestPrice === "number" && /* @__PURE__ */ jsx(
        "span",
        {
          className: cn(
            "rounded border border-bd bg-bg2/60 px-2 py-1 font-mono text-[11px] text-tx",
            tickFlash && "live-dot"
          ),
          children: fmtPrice(latestPrice, symbol)
        }
      ),
      candleCountdownMs !== void 0 && /* @__PURE__ */ jsx("span", { className: "candle-countdown", children: formatCountdown(candleCountdownMs) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "relative h-[420px] w-full", children: [
      /* @__PURE__ */ jsx("div", { ref: containerRef, className: "h-full w-full" }),
      /* @__PURE__ */ jsx("div", { ref: overlayRef, className: "pointer-events-none absolute inset-0 overflow-hidden" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "mt-1 px-2 font-mono text-[10px] text-mute", children: "Drag to pan / Scroll to zoom / Drag axes to scale" })
  ] });
}
function buildLiveChartSeries({
  candles,
  liveMid,
  pollMs,
  quoteState,
  now = Date.now()
}) {
  const series = (candles ?? []).map((c) => ({
    t: new Date(c.time).getTime(),
    p: c.close
  }));
  const hasFreshQuote = quoteState === "live" || quoteState === "mock";
  const livePrice = hasFreshQuote && typeof liveMid === "number" && Number.isFinite(liveMid) ? liveMid : null;
  if (series.length === 0 || livePrice === null) {
    return series;
  }
  const lastCandleTime = series.at(-1)?.t;
  const livePoint = {
    t: now,
    p: livePrice
  };
  const shouldReplaceLastPoint = Number.isFinite(lastCandleTime) && pollMs !== null && pollMs > 0 && now - lastCandleTime < pollMs * 1.5;
  if (!shouldReplaceLastPoint) {
    return [...series, livePoint];
  }
  return [...series.slice(0, -1), livePoint];
}
function ChartsPage() {
  const {
    data
  } = useSnapshot();
  const {
    backendReady,
    pendingSettingsLoad,
    missingBackendUrl,
    settingsLoadFailed,
    settingsLoadError,
    retrySettingsLoad
  } = usePollingUiState();
  const pollMs = usePollMs();
  const {
    watchlist
  } = useCanonicalWatchlist();
  const [selected, setSelected] = useState(null);
  const prices = useMemo(() => data?.prices ?? [], [data?.prices]);
  const pricesBySymbol = useMemo(() => new Map(prices.map((price2) => [price2.symbol, price2])), [prices]);
  const activeSymbol = clampSymbolToWatchlist(selected, watchlist);
  const price = activeSymbol ? pricesBySymbol.get(activeSymbol) : void 0;
  const tickDirection = useTickFlash(price?.mid);
  const tickFlash = isChartTickFlashActive(backendReady, price?.state, tickDirection);
  const lastTickFlash = useRef(false);
  useEffect(() => {
    const nextSelected = clampSymbolToWatchlist(selected, watchlist);
    if (selected !== nextSelected) {
      setSelected(nextSelected);
    }
  }, [selected, watchlist]);
  const {
    data: chart
  } = useQuery({
    queryKey: ["chart", activeSymbol],
    queryFn: () => apiClient.getChartSnapshot(activeSymbol),
    enabled: backendReady && pollMs !== null && activeSymbol !== null,
    refetchInterval: backendReady ? pollMs ?? false : false
  });
  const nextCandleAt = chart && "nextCandleAt" in chart && typeof chart.nextCandleAt === "number" ? chart.nextCandleAt : void 0;
  const countdownSource = useMemo(() => chart ? {
    timeframe: chart.timeframe,
    candles: chart.candles,
    nextCandleAt
  } : void 0, [chart, nextCandleAt]);
  const candleCountdownMs = useChartCountdownMs(countdownSource);
  const isVitestRuntime = "vitest" in import.meta;
  useEffect(() => {
    if (!lastTickFlash.current && tickFlash && false) ;
    lastTickFlash.current = tickFlash;
  }, [activeSymbol, isVitestRuntime, price?.state, price?.updatedAt, tickFlash]);
  if (pendingSettingsLoad) {
    return /* @__PURE__ */ jsx("div", { className: "text-mute text-sm", children: "Loading chart data..." });
  }
  if (settingsLoadFailed) {
    return /* @__PURE__ */ jsx(SettingsQueryErrorState, { resourceLabel: "chart data", errorDetail: settingsLoadError, onRetry: retrySettingsLoad });
  }
  if (missingBackendUrl) {
    return /* @__PURE__ */ jsx("div", { className: "text-mute text-sm", children: "Configure a backend URL in Account before loading chart data." });
  }
  if (!data) return null;
  if (!activeSymbol) {
    return /* @__PURE__ */ jsx("div", { className: "text-mute text-sm", children: "Add symbols to your watchlist to view charts." });
  }
  const series = buildLiveChartSeries({
    candles: chart?.candles,
    liveMid: price?.mid,
    pollMs,
    quoteState: price?.state
  });
  const fibs = chart?.fibLevels ?? [];
  const families = Array.from(new Set(fibs.map((f) => f.family))).filter(Boolean);
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsx("div", { className: "flex items-end justify-between", children: /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold tracking-tight", children: "Charts" }),
      /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-xs text-mute", children: "Price + Fibonacci overlay" })
    ] }) }),
    /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1.5", children: watchlist.map((symbol) => /* @__PURE__ */ jsx("button", { onClick: () => setSelected(symbol), className: cn("rounded border px-2.5 py-1 text-xs font-mono transition-colors", symbol === activeSymbol ? "border-accent/60 bg-accent/15 text-accent" : "border-bd bg-bg2/40 text-mute hover:border-bd2 hover:text-dim"), children: symbol }, symbol)) }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd bg-bg1/60 p-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "mb-4 flex items-center justify-between", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("span", { className: "font-mono text-xl font-semibold", children: activeSymbol }),
            families.length > 0 && /* @__PURE__ */ jsxs("span", { className: "rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent", children: [
              "Fib ",
              families.join(" / ")
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "mt-1 flex items-center gap-3", children: price ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("span", { className: "font-mono text-2xl text-tx", children: fmtPrice(price.mid, price.symbol) }),
            /* @__PURE__ */ jsx("span", { className: cn("font-mono text-sm", price.changePct1d >= 0 ? "text-buy" : "text-sell"), children: fmtPct(price.changePct1d) })
          ] }) : /* @__PURE__ */ jsx("span", { className: "font-mono text-sm text-mute", children: "Awaiting live snapshot for this watchlist symbol." }) })
        ] }),
        /* @__PURE__ */ jsx(FreshnessBadge, { state: chart?.state ?? price?.state ?? "offline" })
      ] }),
      /* @__PURE__ */ jsx(TVChart, { series, fibs, symbol: activeSymbol, tickFlash, candleCountdownMs }),
      /* @__PURE__ */ jsx("div", { className: "mt-4 flex flex-wrap gap-2", children: fibs.map((f) => /* @__PURE__ */ jsxs("div", { className: "rounded border border-bd bg-bg2/40 px-2.5 py-2 text-center", children: [
        /* @__PURE__ */ jsxs("div", { className: "text-[10px] font-mono uppercase tracking-wider text-accent", children: [
          f.family,
          " ",
          f.label
        ] }),
        /* @__PURE__ */ jsx("div", { className: "mt-0.5 font-mono text-sm text-tx", children: fmtPrice(f.price, activeSymbol) })
      ] }, `${f.family}-${f.label}`)) })
    ] })
  ] });
}
export {
  buildLiveChartSeries,
  ChartsPage as component
};
