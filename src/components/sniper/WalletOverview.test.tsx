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

  it("renders USC telemetry in account currency with local-currency subtitles", () => {
    hookMocks.useAccountTelemetry.mockReturnValue({
      data: {
        accountId: "32206603",
        terminalId: "terminal-1",
        balance: 5535.59,
        equity: 9206.75,
        margin: 1500,
        freeMargin: 11225,
        marginLevel: 848.33,
        floatingPl: 3671.16,
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
    expect(screen.getByText("USC 9,206.75")).toBeTruthy();
    expect(screen.getByText("USC 5,535.59")).toBeTruthy();
    expect(screen.getByText("+USC 3,671.16")).toBeTruthy();
    expect(screen.getByText("Local ZAR 1,703.25")).toBeTruthy();
    expect(screen.getByText("Local ZAR 1,024.08")).toBeTruthy();
    expect(screen.queryByText("$9,206.75")).toBeNull();
  });

  it("renders ZAR cent account telemetry without applying USD conversion", () => {
    hookMocks.useAccountTelemetry.mockReturnValue({
      data: {
        accountId: "32206604",
        terminalId: "terminal-1",
        balance: 5535.59,
        equity: 9206.75,
        margin: 1500,
        freeMargin: 11225,
        marginLevel: 848.33,
        floatingPl: 3671.16,
        currency: "ZAR.c",
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

    expect(screen.getByText("ZAR.C 9,206.75")).toBeTruthy();
    expect(screen.getByText("ZAR.C 5,535.59")).toBeTruthy();
    expect(screen.getByText("+ZAR.C 3,671.16")).toBeTruthy();
    expect(screen.getByText("Local ZAR 92.07")).toBeTruthy();
    expect(screen.getByText("Local ZAR 55.36")).toBeTruthy();
    expect(screen.queryByText("Local ZAR 170,324.88")).toBeNull();
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

  it("renders account-shaped skeleton cells while telemetry is loading", () => {
    hookMocks.useAccountTelemetry.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    render(<WalletOverview />);

    expect(screen.getByText("EQUITY")).toBeTruthy();
    expect(screen.getByText("BALANCE")).toBeTruthy();
    expect(screen.getByText("FLOATING P/L")).toBeTruthy();
    expect(screen.getByText("MARGIN LEVEL")).toBeTruthy();
    expect(screen.queryByText("Loading...")).toBeNull();
  });
});
