import { useEffect, useState } from "react";
import type { ChartSnapshot } from "@/types/sniper";
import type { FreshnessState } from "@/types/sniper";
import type { TickDirection } from "@/hooks/useTickFlash";

export const CHART_TIMEFRAME_MS = {
  "1min": 60_000,
  "5min": 300_000,
  "15min": 900_000,
  "30min": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
} as const;

type ChartCountdownSource = Pick<ChartSnapshot, "timeframe" | "candles"> & {
  nextCandleAt?: number;
};

export function isChartTickFlashActive(
  backendReady: boolean,
  freshnessState: FreshnessState | null | undefined,
  tickDirection: TickDirection,
): boolean {
  return (
    backendReady &&
    (freshnessState === "live" || freshnessState === "mock") &&
    tickDirection !== null
  );
}

export function resolveChartCountdownMs(
  chart: ChartCountdownSource | undefined,
  now = Date.now(),
): number | undefined {
  if (!chart) {
    return undefined;
  }

  if (typeof chart.nextCandleAt === "number" && Number.isFinite(chart.nextCandleAt)) {
    return Math.max(0, chart.nextCandleAt - now);
  }

  const intervalMs = CHART_TIMEFRAME_MS[chart.timeframe as keyof typeof CHART_TIMEFRAME_MS];
  const lastCandle = chart.candles.at(-1);
  if (intervalMs === undefined || !lastCandle) {
    return undefined;
  }

  const lastCandleAtMs = Date.parse(lastCandle.time);
  if (!Number.isFinite(lastCandleAtMs)) {
    return undefined;
  }

  return Math.max(0, lastCandleAtMs + intervalMs - now);
}

export function useChartCountdownMs(chart: ChartCountdownSource | undefined): number | undefined {
  const [countdownMs, setCountdownMs] = useState<number | undefined>(() =>
    resolveChartCountdownMs(chart),
  );
  const lastCandleTime = chart?.candles.at(-1)?.time;

  useEffect(() => {
    setCountdownMs(resolveChartCountdownMs(chart));

    if (!chart || chart.candles.length === 0) {
      return undefined;
    }

    const intervalMs = CHART_TIMEFRAME_MS[chart.timeframe as keyof typeof CHART_TIMEFRAME_MS];
    if (intervalMs === undefined) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setCountdownMs(resolveChartCountdownMs(chart));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [chart, lastCandleTime]);

  return countdownMs;
}
