import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  usePollingUiState,
  useSnapshot,
  usePollMs,
  useCanonicalWatchlist,
  clampSymbolToWatchlist,
} from "@/hooks/useSniperData";
import { SettingsQueryErrorState } from "@/components/sniper/SettingsQueryErrorState";
import { useTickFlash } from "@/hooks/useTickFlash";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { fmtPrice, fmtPct } from "@/lib/format";
import { isChartTickFlashActive, useChartCountdownMs } from "@/lib/chartCountdown";
import { cn } from "@/lib/utils";
import { TVChart } from "@/components/sniper/TVChart";
import type { ChartSnapshot, FreshnessState, Symbol } from "@/types/sniper";
import { apiClient } from "@/lib/api/sniperClient";

export type ChartSeriesPoint = {
  t: number;
  p: number;
};

export function buildLiveChartSeries({
  candles,
  liveMid,
  pollMs,
  quoteState,
  now = Date.now(),
}: {
  candles: ChartSnapshot["candles"] | undefined;
  liveMid: number | null | undefined;
  pollMs: number | null;
  quoteState?: FreshnessState | null;
  now?: number;
}): ChartSeriesPoint[] {
  const series = (candles ?? []).map((c) => ({ t: new Date(c.time).getTime(), p: c.close }));
  const hasFreshQuote = quoteState === "live" || quoteState === "mock";
  const livePrice =
    hasFreshQuote && typeof liveMid === "number" && Number.isFinite(liveMid) ? liveMid : null;
  if (series.length === 0 || livePrice === null) {
    return series;
  }

  const lastCandleTime = series.at(-1)?.t;
  const livePoint: ChartSeriesPoint = { t: now, p: livePrice };
  const shouldReplaceLastPoint =
    Number.isFinite(lastCandleTime) &&
    pollMs !== null &&
    pollMs > 0 &&
    now - (lastCandleTime as number) < pollMs * 1.5;

  if (!shouldReplaceLastPoint) {
    return [...series, livePoint];
  }

  return [...series.slice(0, -1), livePoint];
}

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
  const {
    backendReady,
    pendingSettingsLoad,
    missingBackendUrl,
    settingsLoadFailed,
    settingsLoadError,
    retrySettingsLoad,
  } = usePollingUiState();
  const pollMs = usePollMs();
  const { watchlist } = useCanonicalWatchlist();
  const [selected, setSelected] = useState<Symbol | null>(null);

  const prices = useMemo(() => data?.prices ?? [], [data?.prices]);
  const pricesBySymbol = useMemo(
    () => new Map(prices.map((price) => [price.symbol, price])),
    [prices],
  );
  const activeSymbol = clampSymbolToWatchlist(selected, watchlist);
  const price = activeSymbol ? pricesBySymbol.get(activeSymbol) : undefined;
  const tickDirection = useTickFlash(price?.mid);
  const tickFlash = isChartTickFlashActive(backendReady, price?.state, tickDirection);
  const lastTickFlash = useRef(false);

  useEffect(() => {
    const nextSelected = clampSymbolToWatchlist(selected, watchlist);
    if (selected !== nextSelected) {
      setSelected(nextSelected);
    }
  }, [selected, watchlist]);

  const { data: chart } = useQuery<ChartSnapshot>({
    queryKey: ["chart", activeSymbol],
    queryFn: () => apiClient.getChartSnapshot(activeSymbol as Symbol),
    enabled: backendReady && pollMs !== null && activeSymbol !== null,
    refetchInterval: backendReady ? (pollMs ?? false) : false,
  });
  const nextCandleAt =
    chart && "nextCandleAt" in chart && typeof chart.nextCandleAt === "number"
      ? chart.nextCandleAt
      : undefined;
  const countdownSource = useMemo(
    () =>
      chart
        ? {
            timeframe: chart.timeframe,
            candles: chart.candles,
            nextCandleAt,
          }
        : undefined,
    [chart, nextCandleAt],
  );
  const candleCountdownMs = useChartCountdownMs(countdownSource);
  const isVitestRuntime = "vitest" in import.meta;

  useEffect(() => {
    if (!lastTickFlash.current && tickFlash && import.meta.env.DEV && !isVitestRuntime) {
      console.debug("[CHART_TICK_FLASH]", {
        symbol: activeSymbol,
        state: price?.state ?? null,
        updatedAt: price?.updatedAt ?? null,
      });
    }

    lastTickFlash.current = tickFlash;
  }, [activeSymbol, isVitestRuntime, price?.state, price?.updatedAt, tickFlash]);

  if (pendingSettingsLoad) {
    return <div className="text-mute text-sm">Loading chart data...</div>;
  }

  if (settingsLoadFailed) {
    return (
      <SettingsQueryErrorState
        resourceLabel="chart data"
        errorDetail={settingsLoadError}
        onRetry={retrySettingsLoad}
      />
    );
  }

  if (missingBackendUrl) {
    return (
      <div className="text-mute text-sm">
        Configure a backend URL in Account before loading chart data.
      </div>
    );
  }

  if (!data) return null;
  if (!activeSymbol) {
    return <div className="text-mute text-sm">Add symbols to your watchlist to view charts.</div>;
  }

  const series = buildLiveChartSeries({
    candles: chart?.candles,
    liveMid: price?.mid,
    pollMs,
    quoteState: price?.state,
  });
  const fibs = chart?.fibLevels ?? [];
  const families = Array.from(new Set(fibs.map((f) => f.family))).filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Charts</h1>
          <p className="mt-0.5 text-xs text-mute">Price + Fibonacci overlay</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {watchlist.map((symbol) => (
          <button
            key={symbol}
            onClick={() => setSelected(symbol)}
            className={cn(
              "rounded border px-2.5 py-1 text-xs font-mono transition-colors",
              symbol === activeSymbol
                ? "border-accent/60 bg-accent/15 text-accent"
                : "border-bd bg-bg2/40 text-mute hover:border-bd2 hover:text-dim",
            )}
          >
            {symbol}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-bd bg-bg1/60 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl font-semibold">{activeSymbol}</span>
              {families.length > 0 && (
                <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent">
                  Fib {families.join(" / ")}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-3">
              {price ? (
                <>
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
                </>
              ) : (
                <span className="font-mono text-sm text-mute">
                  Awaiting live snapshot for this watchlist symbol.
                </span>
              )}
            </div>
          </div>
          <FreshnessBadge state={chart?.state ?? price?.state ?? "offline"} />
        </div>

        <TVChart
          series={series}
          fibs={fibs}
          symbol={activeSymbol}
          tickFlash={tickFlash}
          candleCountdownMs={candleCountdownMs}
        />

        <div className="mt-4 flex flex-wrap gap-2">
          {fibs.map((f) => (
            <div
              key={`${f.family}-${f.label}`}
              className="rounded border border-bd bg-bg2/40 px-2.5 py-2 text-center"
            >
              <div className="text-[10px] font-mono uppercase tracking-wider text-accent">
                {f.family} {f.label}
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
