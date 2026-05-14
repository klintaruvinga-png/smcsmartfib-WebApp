/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fmtPrice } from "@/lib/format";

const chartMocks = vi.hoisted(() => {
  const seriesApi = {
    setData: vi.fn(),
    createPriceLine: vi.fn(() => ({ id: "fib-line" })),
    removePriceLine: vi.fn(),
    priceToCoordinate: vi.fn(() => 24),
  };

  const chartApi = {
    addSeries: vi.fn(() => seriesApi),
    remove: vi.fn(),
  };

  return {
    createChart: vi.fn(() => chartApi),
    chartApi,
    seriesApi,
  };
});

vi.mock("lightweight-charts", () => ({
  createChart: chartMocks.createChart,
  LineSeries: {},
}));

import { TVChart } from "./TVChart";

describe("TVChart", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("omits the candle countdown when no countdown value is provided", () => {
    const { container } = render(
      <TVChart
        series={[{ t: Date.parse("2026-05-14T12:00:00.000Z"), p: 1.2345 }]}
        fibs={[]}
        symbol="EURUSD"
      />,
    );

    expect(container.querySelector(".candle-countdown")).toBeNull();
  });

  it("renders a formatted candle countdown when a countdown value is provided", () => {
    render(
      <TVChart
        series={[{ t: Date.parse("2026-05-14T12:00:00.000Z"), p: 1.2345 }]}
        fibs={[]}
        symbol="EURUSD"
        candleCountdownMs={65_000}
      />,
    );

    expect(screen.getByText("1:05").textContent).toBe("1:05");
  });

  it("applies the live pulse class to the chart price display when tickFlash is true", () => {
    render(
      <TVChart
        series={[{ t: Date.parse("2026-05-14T12:00:00.000Z"), p: 1.2345 }]}
        fibs={[]}
        symbol="EURUSD"
        tickFlash
      />,
    );

    expect(screen.getByText(fmtPrice(1.2345, "EURUSD")).className).toContain("live-dot");
  });

  it("does not apply the live pulse class when tickFlash is false", () => {
    render(
      <TVChart
        series={[{ t: Date.parse("2026-05-14T12:00:00.000Z"), p: 1.2345 }]}
        fibs={[]}
        symbol="EURUSD"
        tickFlash={false}
      />,
    );

    expect(screen.getByText(fmtPrice(1.2345, "EURUSD")).className).not.toContain("live-dot");
  });
});
