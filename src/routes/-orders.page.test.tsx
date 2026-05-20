/* @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hookMocks = vi.hoisted(() => ({
  useUserTrades: vi.fn(),
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
}));

import { OrdersPage } from "./orders";

describe("OrdersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a degraded state when backend order telemetry is unreachable", () => {
    hookMocks.useUserTrades.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("orders unavailable"),
    });

    render(<OrdersPage />);

    expect(
      screen.getByText("Pending orders unavailable while backend trade telemetry is unreachable."),
    ).toBeTruthy();
  });

  it("renders backend-owned pending orders from the positions/orders telemetry feed", () => {
    hookMocks.useUserTrades.mockReturnValue({
      data: {
        positions: [],
        orders: [
          {
            id: "ord-1",
            symbol: "EURUSD",
            direction: "LONG",
            type: "LIMIT",
            price: 1.08,
            lots: 0.25,
            sl: 1.075,
            tp: 1.09,
            placedAt: "2026-05-20T10:00:00Z",
            state: "live",
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<OrdersPage />);

    expect(screen.getByText("Pending Orders")).toBeTruthy();
    expect(screen.getByText("EURUSD")).toBeTruthy();
    expect(screen.getByText("LONG")).toBeTruthy();
    expect(screen.getByText("LIMIT")).toBeTruthy();
  });
});
