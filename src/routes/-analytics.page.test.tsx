/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hookMocks = vi.hoisted(() => ({
  useAccountTelemetry: vi.fn(),
  useUserAccount: vi.fn(),
  useStableUserTrades: vi.fn(),
  useUserRiskProfile: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (config: unknown) => config,
  };
});

vi.mock("@/hooks/useSniperData", () => ({
  useAccountTelemetry: hookMocks.useAccountTelemetry,
  useUserAccount: hookMocks.useUserAccount,
  useStableUserTrades: hookMocks.useStableUserTrades,
  useUserRiskProfile: hookMocks.useUserRiskProfile,
}));

vi.mock("@/lib/api/sniperClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/sniperClient")>();
  return {
    ...actual,
    MOCK_MODE: false,
  };
});

import { AnalyticsPage } from "./analytics";

describe("AnalyticsPage", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    hookMocks.useUserRiskProfile.mockReturnValue({
      data: { ddCapPct: 6 },
    });
    hookMocks.useUserAccount.mockReturnValue({
      data: {
        balanceUSC: 10000,
        equityUSC: 10100,
        marginUsedPct: 10,
        drawdownPct: 1.5,
        openPositions: 1,
        pendingOrders: 0,
        todayPnlUSC: 50,
        todayPnlPct: 0.5,
        state: "live",
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a degraded state instead of fabricated floating P/L when telemetry fails", () => {
    hookMocks.useAccountTelemetry.mockReturnValue({
      data: undefined,
      error: new Error("account telemetry unavailable"),
    });
    hookMocks.useStableUserTrades.mockReturnValue({
      data: undefined,
      error: new Error("trade telemetry unavailable"),
    });

    render(<AnalyticsPage />);

    expect(screen.getByText("Floating P/L")).toBeTruthy();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(screen.getByText("Waiting for backend trade telemetry")).toBeTruthy();
  });

  it("derives floating P/L from backend positions telemetry", () => {
    hookMocks.useAccountTelemetry.mockReturnValue({
      data: {
        accountId: "32206603",
        terminalId: "terminal-1",
        balance: 10000,
        equity: 10125,
        margin: 1000,
        freeMargin: 9125,
        marginLevel: 1012.5,
        floatingPl: 125,
        currency: "USC",
        leverage: 500,
        eaVersion: "1.00",
        lastSeenAt: "2026-05-20T10:15:00Z",
        updatedAt: "2026-05-20T10:15:00Z",
        state: "live",
      },
      error: null,
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
            pnlUSC: 125,
            pnlPct: 2,
            openedAt: "2026-05-20T10:00:00Z",
            state: "live",
          },
        ],
        orders: [],
      },
      error: null,
    });

    render(<AnalyticsPage />);

    expect(screen.getByText("+$125.00")).toBeTruthy();
    expect(screen.getByText("1 positions")).toBeTruthy();
  });

  it("marks floating P/L stale when positions are carried across a trade gap", () => {
    hookMocks.useAccountTelemetry.mockReturnValue({
      data: {
        accountId: "32206603",
        terminalId: "terminal-1",
        balance: 10000,
        equity: 10125,
        margin: 1000,
        freeMargin: 9125,
        marginLevel: 1012.5,
        floatingPl: 125,
        currency: "USC",
        leverage: 500,
        eaVersion: "1.00",
        lastSeenAt: "2026-05-20T10:15:00Z",
        updatedAt: "2026-05-20T10:15:00Z",
        state: "live",
      },
      error: null,
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
            pnlUSC: 125,
            pnlPct: 2,
            openedAt: "2026-05-20T10:00:00Z",
            state: "stale",
          },
        ],
        orders: [],
      },
      error: null,
    });

    render(<AnalyticsPage />);

    expect(screen.getByText("Floating P/L")).toBeTruthy();
    expect(screen.getByText("1 positions")).toBeTruthy();
    expect(screen.getAllByText("STALE").length).toBeGreaterThan(0);
  });
});
