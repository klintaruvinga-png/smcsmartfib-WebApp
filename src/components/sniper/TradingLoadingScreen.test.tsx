/* @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradingLoadingScreen } from "./TradingLoadingScreen";
import { ALL_LOADING_MESSAGES } from "./loadingMessages";

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

  it("renders the SMC SuperFIB brand name and platform subtitle", () => {
    render(<TradingLoadingScreen backendReady={false} minHoldMs={3000} onReady={vi.fn()} />);

    expect(screen.getByText("SMC SuperFIB")).toBeTruthy();
    expect(screen.getByText("Signal Intelligence Platform")).toBeTruthy();
  });

  it("renders at least one loading message from the message pool on initial render", () => {
    render(<TradingLoadingScreen backendReady={false} minHoldMs={3000} onReady={vi.fn()} />);

    const anyMessageVisible = ALL_LOADING_MESSAGES.some((msg) => {
      try {
        return screen.getByText(msg) !== null;
      } catch {
        return false;
      }
    });
    expect(anyMessageVisible).toBe(true);
  });

  it("advances to a different message after the rotation interval", () => {
    render(<TradingLoadingScreen backendReady={false} minHoldMs={10000} onReady={vi.fn()} />);

    const firstVisible = ALL_LOADING_MESSAGES.find((msg) => {
      try {
        return screen.getByText(msg) !== null;
      } catch {
        return false;
      }
    });
    expect(firstVisible).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.queryByText(firstVisible!)).toBeNull();
  });
});
