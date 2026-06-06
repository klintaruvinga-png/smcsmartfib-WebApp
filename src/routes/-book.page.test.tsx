/* @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hookMocks = vi.hoisted(() => ({
  useStableUserTrades: vi.fn(),
  useSnapshot: vi.fn(),
  usePollingUiState: vi.fn(),
  useAccountTelemetry: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (config: unknown) => config,
  };
});

vi.mock("@/hooks/useSniperData", () => ({
  useStableUserTrades: hookMocks.useStableUserTrades,
  useSnapshot: hookMocks.useSnapshot,
  usePollingUiState: hookMocks.usePollingUiState,
  useAccountTelemetry: hookMocks.useAccountTelemetry,
}));

import { BookPage } from "./-book.page";

describe("BookPage", () => {
  beforeEach(() => {
    hookMocks.useSnapshot.mockReturnValue({ data: { prices: [] } });
    hookMocks.usePollingUiState.mockReturnValue({
      pendingSettingsLoad: false,
      missingBackendUrl: false,
      settingsLoadFailed: false,
      settingsLoadError: null,
      retrySettingsLoad: vi.fn(),
    });
    hookMocks.useAccountTelemetry.mockReturnValue({ data: { currency: "USD", equity: 1000 } });
  });

  it("shows a degraded state when backend trade telemetry is unreachable", () => {
    hookMocks.useStableUserTrades.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("positions unavailable"),
    });

    render(<BookPage />);

    expect(
      screen.getByText("Active book unavailable while backend trade telemetry is unreachable."),
    ).toBeTruthy();
  });

  it("groups live positions by symbol regardless of direction", () => {
    hookMocks.useSnapshot.mockReturnValue({
      data: {
        prices: [{ symbol: "EURUSD", state: "live", updatedAt: "2026-05-27T10:10:00Z" }],
        regimes: [{ symbol: "EURUSD", bias: "BULL", chop: 0, updatedAt: "2026-05-27T10:10:00Z", state: "live" }],
        todayOiImpacts: [
          {
            symbol: "EURUSD",
            todayOiPnlImpactUSC: 12.5,
            todayBaselineQuality: "day_start",
          },
        ],
      },
    });
    hookMocks.useStableUserTrades.mockReturnValue({
      data: {
        positions: [
          {
            id: "1",
            symbol: "EURUSD",
            direction: "LONG",
            entry: 1.08,
            current: 1.081,
            lots: 0.5,
            pnlUSC: 25,
            pnlPct: 2,
            openedAt: "2026-05-20T10:00:00Z",
            state: "live",
          },
          {
            id: "2",
            symbol: "EURUSD",
            direction: "SHORT",
            entry: 1.082,
            current: 1.081,
            lots: 0.5,
            pnlUSC: 15,
            pnlPct: 1,
            openedAt: "2026-05-20T10:05:00Z",
            state: "live",
          },
        ],
        orders: [],
      },
      isLoading: false,
      error: null,
    });

    render(<BookPage />);

    // Symbol appears once as group header (no longer split by direction)
    expect(screen.getAllByText("EURUSD")).toHaveLength(1);
    expect(screen.getByText("Long 0.50")).toBeTruthy();
    expect(screen.getByText("Short 0.50")).toBeTruthy();
    expect(screen.getByText("BULL")).toBeTruthy();
    expect(screen.getByText("OI Today %")).toBeTruthy();
    expect(screen.getByText("+1.25%")).toBeTruthy();
    expect(screen.queryByText("+4.00%")).toBeNull();
  });

  it("uses backend-provided today OI equity impact percentage when available", () => {
    hookMocks.useSnapshot.mockReturnValue({
      data: {
        prices: [{ symbol: "XAUUSD", state: "live", updatedAt: "2026-05-27T10:10:00Z" }],
        todayOiImpacts: [
          {
            symbol: "XAUUSD",
            todayOiPnlImpactUSC: 50,
            todayOiEquityImpactPct: -0.75,
            todayBaselineQuality: "first_seen_today",
          },
        ],
      },
    });
    hookMocks.useStableUserTrades.mockReturnValue({
      data: {
        positions: [
          {
            id: "1",
            symbol: "XAUUSD",
            direction: "LONG",
            entry: 2300,
            current: 2301,
            lots: 0.1,
            pnlUSC: 40,
            pnlPct: 2,
            openedAt: "2026-05-20T10:00:00Z",
            state: "live",
          },
        ],
        orders: [],
      },
      isLoading: false,
      error: null,
    });

    render(<BookPage />);

    expect(screen.getByText("-0.75%")).toBeTruthy();
    expect(screen.queryByText("+4.00%")).toBeNull();
  });

  it("keeps rendering carried-forward stale positions instead of flashing empty", () => {
    hookMocks.useSnapshot.mockReturnValue({
      data: {
        prices: [{ symbol: "EURUSD", state: "live", updatedAt: "2026-05-27T10:10:00Z" }],
      },
    });
    hookMocks.useStableUserTrades.mockReturnValue({
      data: {
        positions: [
          {
            id: "1",
            symbol: "EURUSD",
            direction: "LONG",
            entry: 1.08,
            current: 1.081,
            lots: 0.5,
            pnlUSC: 25,
            pnlPct: 2,
            openedAt: "2026-05-20T10:00:00Z",
            state: "stale",
          },
        ],
        orders: [],
      },
      isLoading: false,
      error: null,
    });

    render(<BookPage />);

    expect(screen.queryByText("No open positions.")).toBeNull();
    expect(screen.getByText("STALE")).toBeTruthy();
  });
});
