/* @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChartCountdownMs } from "./chartCountdown";

describe("useChartCountdownMs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-14T12:00:30.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("registers and clears the countdown interval while updating once per second", () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");

    const view = renderHook(() =>
      useChartCountdownMs({
        timeframe: "1min",
        candles: [
          {
            time: "2026-05-14T12:00:00.000Z",
            open: 1.23,
            high: 1.24,
            low: 1.22,
            close: 1.2345,
          },
        ],
      }),
    );

    expect(view.result.current).toBe(30_000);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(view.result.current).toBe(29_000);

    view.unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
