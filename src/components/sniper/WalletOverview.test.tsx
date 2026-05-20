/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hookMocks = vi.hoisted(() => ({
  useAccountTelemetry: vi.fn(),
}));

vi.mock("@/hooks/useSniperData", () => ({
  useAccountTelemetry: hookMocks.useAccountTelemetry,
}));

import { WalletOverview } from "./WalletOverview";

describe("WalletOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders backend account telemetry values read-only", () => {
    hookMocks.useAccountTelemetry.mockReturnValue({
      data: {
        accountId: "32206603",
        terminalId: "terminal-1",
        balance: 12500,
        equity: 12725,
        margin: 1500,
        freeMargin: 11225,
        marginLevel: 848.33,
        floatingPl: 225,
        currency: "USC",
        leverage: 500,
        eaVersion: "1.00",
        lastSeenAt: "2026-05-20T10:15:00Z",
        updatedAt: "2026-05-20T10:15:00Z",
        state: "live",
      },
      isLoading: false,
      error: null,
    });

    render(<WalletOverview />);

    expect(screen.getByText("Account")).toBeTruthy();
    expect(screen.getByText("$12,725.00")).toBeTruthy();
    expect(screen.getByText("$12,500.00")).toBeTruthy();
    expect(screen.getByText("+225.00")).toBeTruthy();
  });

  it("shows the degraded backend-owned state when telemetry is unavailable", () => {
    hookMocks.useAccountTelemetry.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("account telemetry unavailable"),
    });

    render(<WalletOverview />);

    expect(screen.getByText(/Account data unavailable/)).toBeTruthy();
  });
});
