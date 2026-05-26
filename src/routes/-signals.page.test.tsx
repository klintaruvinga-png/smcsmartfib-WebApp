/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { SignalCandidate, Symbol } from "@/types/sniper";

const hookMocks = vi.hoisted(() => ({
  useEngineHealth: vi.fn(),
  useEngineBatch: vi.fn(),
  useLiveSignals: vi.fn(),
  useCanonicalWatchlist: vi.fn(),
  usePollingUiState: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (config: unknown) => config,
  };
});

vi.mock("@/hooks/useSniperData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useSniperData")>();
  return {
    ...actual,
    useEngineHealth: hookMocks.useEngineHealth,
    useEngineBatch: hookMocks.useEngineBatch,
    useLiveSignals: hookMocks.useLiveSignals,
    useCanonicalWatchlist: hookMocks.useCanonicalWatchlist,
    usePollingUiState: hookMocks.usePollingUiState,
  };
});

vi.mock("@/components/sniper/FreshnessBadge", () => ({
  FreshnessBadge: ({ state }: { state: string }) => <div>{state}</div>,
}));

vi.mock("@/components/sniper/SettingsQueryErrorState", () => ({
  SettingsQueryErrorState: ({ errorDetail }: { errorDetail?: string | null }) => (
    <div>{errorDetail ?? "settings error"}</div>
  ),
}));

vi.mock("@/components/sniper/VerdictBadge", () => ({
  VerdictBadge: ({ verdict }: { verdict: string }) => <div>{verdict}</div>,
}));

vi.mock("@/components/sniper/Warnings", () => ({
  DivergenceBanner: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { SignalsPage } from "./-signals.page";

function buildSignal(overrides: Partial<SignalCandidate> = {}): SignalCandidate {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    symbol: "EURUSD",
    direction: "LONG",
    status: "READY",
    confluence: ["sweep"],
    verdict: "A+",
    computedBy: "backend",
    backendConfirmed: true,
    createdAt: "2026-05-25T08:00:00.000Z",
    ...overrides,
  };
}

function mockWatchlist(symbols: Symbol[]) {
  hookMocks.useCanonicalWatchlist.mockReturnValue({
    watchlist: symbols,
    watchlistSet: new Set(symbols),
  });
}

describe("SignalsPage watchlist filtering", () => {
  beforeEach(() => {
    hookMocks.useEngineBatch.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
    hookMocks.useEngineHealth.mockReturnValue({
      data: {
        backendSync: "live",
        feedStatus: "live",
        priceFeed: "live",
        engineRunState: "live",
        twelveDataKey: "present",
        lastBatchAt: "2026-05-25T08:00:00.000Z",
        lastEngineRunAt: "2026-05-25T08:00:00.000Z",
      },
    });
    hookMocks.usePollingUiState.mockReturnValue({
      backendReady: true,
      pendingSettingsLoad: false,
      missingBackendUrl: false,
      settingsLoadFailed: false,
      settingsLoadError: null,
      pollMs: 5_000,
      retrySettingsLoad: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps suffix-normalized watchlist matches visible and still toggles to all symbols", () => {
    hookMocks.useLiveSignals.mockReturnValue({
      data: [
        buildSignal({ id: "sig-eurusd", symbol: "EURUSD.r" }),
        buildSignal({ id: "sig-btcusd", symbol: "BTCUSD", direction: "SHORT" }),
        buildSignal({ id: "sig-audusd", symbol: "AUDUSD.pro" }),
      ],
    });
    mockWatchlist(["EURUSD", "BTCUSD"]);

    render(<SignalsPage />);

    expect(screen.getByText("EURUSD.r")).toBeTruthy();
    expect(screen.getByText("BTCUSD")).toBeTruthy();
    expect(screen.queryByText("AUDUSD.pro")).toBeNull();
    expect(
      screen.getAllByText((_, element) =>
        (element?.textContent ?? "").replace(/\s+/g, " ").includes("2 / 3 total"),
      ).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "watchlist" }));

    expect(screen.getByRole("button", { name: "all symbols" })).toBeTruthy();
    expect(screen.getByText("AUDUSD.pro")).toBeTruthy();
  });
});
