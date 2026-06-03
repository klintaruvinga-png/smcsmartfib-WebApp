/* @vitest-environment jsdom */

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradingLoadingScreen } from "./TradingLoadingScreen";

describe("TradingLoadingScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("waits for both backend readiness and the minimum hold before firing onReady", () => {
    const onReady = vi.fn();
    const { rerender } = render(
      <TradingLoadingScreen backendReady={false} minHoldMs={3000} onReady={onReady} />,
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onReady).not.toHaveBeenCalled();

    rerender(<TradingLoadingScreen backendReady minHoldMs={3000} onReady={onReady} />);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("does not fire onReady before the minimum hold even when backend is ready", () => {
    const onReady = vi.fn();
    render(<TradingLoadingScreen backendReady minHoldMs={3000} onReady={onReady} />);

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(onReady).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});
