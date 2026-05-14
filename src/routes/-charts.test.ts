import { describe, expect, it, vi } from "vitest";
import type { ChartSnapshot } from "@/types/sniper";
import { isChartTickFlashActive, resolveChartCountdownMs } from "@/lib/chartCountdown";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (config: unknown) => config,
  };
});

import { buildLiveChartSeries } from "./charts";

function buildCandles(times: string[]): ChartSnapshot["candles"] {
  return times.map((time, index) => ({
    time,
    open: 1 + index,
    high: 1.2 + index,
    low: 0.8 + index,
    close: 1.1 + index,
  }));
}

describe("buildLiveChartSeries", () => {
  it("appends a live point when the last candle is older than the poll window", () => {
    const now = Date.parse("2026-05-14T12:00:05.000Z");
    const series = buildLiveChartSeries({
      candles: buildCandles(["2026-05-14T12:00:00.000Z"]),
      liveMid: 1.2345,
      pollMs: 2_000,
      quoteState: "live",
      now,
    });

    expect(series).toHaveLength(2);
    expect(series.at(-1)).toEqual({ t: now, p: 1.2345 });
  });

  it("replaces the last point when the backend candle is still within the live poll window", () => {
    const now = Date.parse("2026-05-14T12:00:02.000Z");
    const series = buildLiveChartSeries({
      candles: buildCandles(["2026-05-14T11:45:00.000Z", "2026-05-14T12:00:01.000Z"]),
      liveMid: 1.3456,
      pollMs: 2_000,
      quoteState: "live",
      now,
    });

    expect(series).toHaveLength(2);
    expect(series.at(-1)).toEqual({ t: now, p: 1.3456 });
    expect(series[0]?.t).toBe(Date.parse("2026-05-14T11:45:00.000Z"));
  });

  it("does not augment the series when the live price is unavailable", () => {
    const series = buildLiveChartSeries({
      candles: buildCandles(["2026-05-14T12:00:00.000Z"]),
      liveMid: undefined,
      pollMs: 2_000,
      quoteState: "unavailable",
      now: Date.parse("2026-05-14T12:00:05.000Z"),
    });

    expect(series).toEqual([
      {
        t: Date.parse("2026-05-14T12:00:00.000Z"),
        p: 1.1,
      },
    ]);
  });

  it("does not augment the series when the quote state is stale", () => {
    const series = buildLiveChartSeries({
      candles: buildCandles(["2026-05-14T12:00:00.000Z"]),
      liveMid: 1.7777,
      pollMs: 2_000,
      quoteState: "stale",
      now: Date.parse("2026-05-14T12:00:05.000Z"),
    });

    expect(series).toEqual([
      {
        t: Date.parse("2026-05-14T12:00:00.000Z"),
        p: 1.1,
      },
    ]);
  });

  it("keeps the augmented series timestamps unique", () => {
    const now = Date.parse("2026-05-14T12:00:05.000Z");
    const series = buildLiveChartSeries({
      candles: buildCandles(["2026-05-14T11:45:00.000Z", "2026-05-14T12:00:00.000Z"]),
      liveMid: 1.4567,
      pollMs: 2_000,
      quoteState: "live",
      now,
    });

    expect(new Set(series.map((point) => point.t)).size).toBe(series.length);
  });
});

describe("resolveChartCountdownMs", () => {
  it("returns undefined when the timeframe is unsupported", () => {
    expect(
      resolveChartCountdownMs(
        {
          timeframe: "1week",
          candles: buildCandles(["2026-05-14T12:00:00.000Z"]),
        },
        Date.parse("2026-05-14T12:00:30.000Z"),
      ),
    ).toBeUndefined();
  });

  it("computes a positive countdown for supported intraday timeframes", () => {
    expect(
      resolveChartCountdownMs(
        {
          timeframe: "1min",
          candles: buildCandles(["2026-05-14T12:00:00.000Z"]),
        },
        Date.parse("2026-05-14T12:00:30.000Z"),
      ),
    ).toBe(30_000);
  });

  it("clamps the countdown at zero when the next candle time has passed", () => {
    expect(
      resolveChartCountdownMs(
        {
          timeframe: "1min",
          candles: buildCandles(["2026-05-14T12:00:00.000Z"]),
        },
        Date.parse("2026-05-14T12:01:30.000Z"),
      ),
    ).toBe(0);
  });
});

describe("isChartTickFlashActive", () => {
  it("returns false when the quote state is stale", () => {
    expect(isChartTickFlashActive(true, "stale", "up")).toBe(false);
  });
});
