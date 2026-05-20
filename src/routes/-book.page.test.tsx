/* @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hookMocks = vi.hoisted(() => ({
  useUserTrades: vi.fn(),
  useSnapshot: vi.fn(),
  usePollingUiState: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (config: unknown) => config,
  };
});

vi.mock("@/hooks/useSniperData", () => ({
  useUserTrades: hookMocks.useUserTrades,
  useSnapshot: hookMocks.useSnapshot,
  usePollingUiState: hookMocks.usePollingUiState,
}));

import { BookPage } from "./book";

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
  });

  it("shows a degraded state when backend trade telemetry is unreachable", () => {
    hookMocks.useUserTrades.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("positions unavailable"),
    });

    render(<BookPage />);

    expect(
      screen.getByText("Active book unavailable while backend trade telemetry is unreachable."),
    ).toBeTruthy();
  });

  it("groups live positions by symbol and direction", () => {
    hookMocks.useUserTrades.mockReturnValue({
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

    expect(screen.getAllByText("EURUSD")).toHaveLength(2);
    expect(screen.getAllByText("LONG").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SHORT").length).toBeGreaterThan(0);
  });
});
