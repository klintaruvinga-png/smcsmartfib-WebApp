/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { SignalCandidate, Symbol, TradePlan } from "@/types/sniper";
import { mockPlan } from "@/mocks/sniperData";

const hookMocks = vi.hoisted(() => ({
  useLiveSignals: vi.fn(),
  useLadders: vi.fn(),
  useSnapshot: vi.fn(),
  useCanonicalWatchlist: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (config: unknown) => config,
  };
});

vi.mock("@/hooks/useSniperData", () => ({
  useLiveSignals: hookMocks.useLiveSignals,
  useLadders: hookMocks.useLadders,
  useSnapshot: hookMocks.useSnapshot,
  useCanonicalWatchlist: hookMocks.useCanonicalWatchlist,
}));

vi.mock("@/hooks/useAnimatedNumber", () => ({
  useAnimatedNumber: (value: number | undefined) => ({
    value,
    direction: null,
    heldDirection: null,
    motionKey: "test",
    motionImpulse: 0,
  }),
}));

vi.mock("@/lib/tickMotion", () => ({
  tickMotionHoldMs: () => 0,
  tickMotionStyle: () => ({}),
}));

vi.mock("@/components/sniper/FreshnessBadge", () => ({
  FreshnessBadge: ({ state }: { state: string }) => <div>{state}</div>,
}));

vi.mock("@/components/sniper/VerdictBadge", () => ({
  VerdictBadge: ({ verdict }: { verdict: string }) => <div>{verdict}</div>,
}));

vi.mock("@/components/sniper/Warnings", () => ({
  WarningLine: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DivergenceBanner: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/sniper/WalletOverview", () => ({
  WalletOverview: () => <div>Wallet overview</div>,
}));

vi.mock("@/lib/api/sniperClient", () => ({
  apiClient: {
    postExecuteSignals: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { PlanPage } from "./plan";
import { isTradePlanComplete } from "./-plan.utils";

function buildSignal(overrides: Partial<SignalCandidate> = {}): SignalCandidate {
  return {
    id: "sig-001",
    symbol: "GBPUSD",
    direction: "LONG",
    status: "READY",
    confluence: ["sweep", "MSS"],
    verdict: "A+",
    computedBy: "backend",
    backendConfirmed: true,
    createdAt: "2026-05-14T08:00:00.000Z",
    ...overrides,
  };
}

function buildPlan(overrides: Partial<TradePlan> = {}): TradePlan {
  return {
    ...mockPlan,
    ...overrides,
    entries: { ...mockPlan.entries, ...overrides.entries },
    tps: { ...mockPlan.tps, ...overrides.tps },
    rr: { ...mockPlan.rr, ...overrides.rr },
    lotSize: { ...mockPlan.lotSize, ...overrides.lotSize },
    stops: { ...mockPlan.stops, ...overrides.stops },
  };
}

function mockWatchlist(symbols: Symbol[]) {
  hookMocks.useCanonicalWatchlist.mockReturnValue({
    watchlist: symbols,
    watchlistSet: new Set(symbols),
  });
}

function renderPlanPage({
  signals,
  ladders,
  watchlist,
}: {
  signals: SignalCandidate[];
  ladders: TradePlan[];
  watchlist?: Symbol[];
}) {
  hookMocks.useLiveSignals.mockReturnValue({
    data: signals,
    isLoading: false,
  });
  hookMocks.useLadders.mockReturnValue({
    data: ladders,
    isLoading: false,
  });
  mockWatchlist(watchlist ?? (signals.map((signal) => signal.symbol) as Symbol[]));

  render(<PlanPage />);
}

function getRenderedCards() {
  return screen.queryAllByTestId("plan-candidate-card");
}

function getRenderedSymbols() {
  return getRenderedCards().map((card) => card.textContent ?? "");
}

describe("isTradePlanComplete", () => {
  it("returns true for a full three-stage ladder plan", () => {
    expect(isTradePlanComplete(mockPlan)).toBe(true);
  });

  it("returns false when TP2 and TP3 R:R values are missing", () => {
    expect(
      isTradePlanComplete(
        buildPlan({
          rr: { tp1: 1.2, tp2: 0, tp3: 0 },
        }),
      ),
    ).toBe(false);
  });

  it("returns false when TP2 and TP3 prices are missing", () => {
    expect(
      isTradePlanComplete(
        buildPlan({
          tps: { tp1: 1.2705, tp2: 0, tp3: 0 },
        }),
      ),
    ).toBe(false);
  });

  it("returns false when all R:R values are missing", () => {
    expect(
      isTradePlanComplete(
        buildPlan({
          rr: { tp1: 0, tp2: 0, tp3: 0 },
        }),
      ),
    ).toBe(false);
  });

  it("returns false when TP/RR keys are absent from the backend payload", () => {
    expect(
      isTradePlanComplete({
        ...buildPlan(),
        tps: { tp1: 1.2705 } as TradePlan["tps"],
        rr: { tp1: 1.2 } as TradePlan["rr"],
      }),
    ).toBe(false);
  });
});

describe("PlanPage ranking and execution guards", () => {
  beforeEach(() => {
    hookMocks.useSnapshot.mockReturnValue({
      data: { prices: [], diagnostics: [] },
      isLoading: false,
    });
    mockWatchlist(["GBPUSD", "USDJPY", "AUDUSD", "EURUSD", "XAUUSD"]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the incomplete-plan warning and disables execution when backend data is partial", () => {
    renderPlanPage({
      signals: [buildSignal()],
      ladders: [
        buildPlan({
          rr: { tp1: 1.2, tp2: 0, tp3: 3.6 },
          tps: { tp1: 1.2705, tp2: 1.2738, tp3: 0 },
        }),
      ],
    });

    expect(
      screen.getByText(
        /Backend plan is missing TP2\/TP3 or R:R values\. Full 3-stage ladder is not confirmed\./,
      ),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Send to execution" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("treats absent TP/RR keys as incomplete and keeps the page rendered", () => {
    renderPlanPage({
      signals: [buildSignal()],
      ladders: [
        {
          ...buildPlan(),
          tps: { tp1: 1.2705 } as TradePlan["tps"],
          rr: { tp1: 1.2 } as TradePlan["rr"],
        },
      ],
    });

    expect(
      screen.getByText(
        /Backend plan is missing TP2\/TP3 or R:R values\. Full 3-stage ladder is not confirmed\./,
      ),
    ).toBeTruthy();
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(3);
    expect(
      (screen.getByRole("button", { name: "Send to execution" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("keeps execution available for a complete backend-confirmed plan", () => {
    renderPlanPage({
      signals: [buildSignal()],
      ladders: [buildPlan()],
    });

    expect(screen.queryByText(/Backend plan is missing TP2\/TP3 or R:R values\./)).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Send to execution" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("scopes rendered cards to the canonical watchlist", () => {
    renderPlanPage({
      signals: [
        buildSignal({ id: "sig-001", symbol: "GBPUSD", verdict: "A+" }),
        buildSignal({
          id: "sig-002",
          symbol: "NZDUSD",
          verdict: "A",
          createdAt: "2026-05-14T08:01:00.000Z",
        }),
      ],
      ladders: [
        buildPlan({ signalId: "sig-001", symbol: "GBPUSD" }),
        buildPlan({ signalId: "sig-002", symbol: "NZDUSD" }),
      ],
      watchlist: ["GBPUSD"],
    });

    const cards = getRenderedCards();
    expect(cards).toHaveLength(1);
    expect(cards[0]?.textContent).toContain("GBPUSD");
    expect(screen.queryByText("NZDUSD")).toBeNull();
  });

  it("limits rendering to the top 3 eligible watchlist candidates", () => {
    renderPlanPage({
      signals: [
        buildSignal({ id: "sig-001", symbol: "GBPUSD", verdict: "A+" }),
        buildSignal({
          id: "sig-002",
          symbol: "USDJPY",
          verdict: "A",
          createdAt: "2026-05-14T08:01:00.000Z",
        }),
        buildSignal({
          id: "sig-003",
          symbol: "AUDUSD",
          verdict: "B",
          createdAt: "2026-05-14T08:02:00.000Z",
        }),
        buildSignal({
          id: "sig-004",
          symbol: "EURUSD",
          verdict: "C",
          createdAt: "2026-05-14T08:03:00.000Z",
        }),
        buildSignal({
          id: "sig-005",
          symbol: "XAUUSD",
          verdict: "B",
          createdAt: "2026-05-14T08:04:00.000Z",
        }),
      ],
      ladders: [
        buildPlan({ signalId: "sig-001", symbol: "GBPUSD" }),
        buildPlan({ signalId: "sig-002", symbol: "USDJPY" }),
        buildPlan({ signalId: "sig-003", symbol: "AUDUSD" }),
        buildPlan({ signalId: "sig-004", symbol: "EURUSD" }),
        buildPlan({ signalId: "sig-005", symbol: "XAUUSD" }),
      ],
      watchlist: ["GBPUSD", "USDJPY", "AUDUSD", "EURUSD", "XAUUSD"],
    });

    expect(getRenderedCards()).toHaveLength(3);
  });

  it("renders fewer than 3 cards when only 2 watchlist candidates have plans", () => {
    renderPlanPage({
      signals: [
        buildSignal({ id: "sig-001", symbol: "GBPUSD", verdict: "A+" }),
        buildSignal({
          id: "sig-002",
          symbol: "USDJPY",
          verdict: "A",
          createdAt: "2026-05-14T08:01:00.000Z",
        }),
      ],
      ladders: [
        buildPlan({ signalId: "sig-001", symbol: "GBPUSD" }),
        buildPlan({ signalId: "sig-002", symbol: "USDJPY" }),
      ],
      watchlist: ["GBPUSD", "USDJPY"],
    });

    expect(getRenderedCards()).toHaveLength(2);
  });

  it("uses verdict-led full-array ranking instead of first-match ladder selection", () => {
    renderPlanPage({
      signals: [
        buildSignal({
          id: "sig-001",
          symbol: "GBPUSD",
          verdict: "A+",
          backendConfirmed: true,
          createdAt: "2026-05-14T08:00:00.000Z",
        }),
        buildSignal({
          id: "sig-002",
          symbol: "USDJPY",
          verdict: "A",
          backendConfirmed: true,
          createdAt: "2026-05-14T08:01:00.000Z",
        }),
        buildSignal({
          id: "sig-003",
          symbol: "AUDUSD",
          verdict: "B",
          backendConfirmed: true,
          createdAt: "2026-05-14T08:02:00.000Z",
        }),
      ],
      ladders: [
        buildPlan({
          signalId: "sig-001",
          symbol: "GBPUSD",
          rr: { tp1: 1.2, tp2: 0, tp3: 3.6 },
        }),
        buildPlan({ signalId: "sig-002", symbol: "USDJPY" }),
        buildPlan({ signalId: "sig-003", symbol: "AUDUSD" }),
      ],
      watchlist: ["GBPUSD", "USDJPY", "AUDUSD"],
    });

    const renderedSymbols = getRenderedSymbols();
    expect(renderedSymbols[0]).toContain("GBPUSD");
    expect(renderedSymbols[1]).toContain("USDJPY");
    expect(renderedSymbols[2]).toContain("AUDUSD");
    expect(
      screen.getByText(
        /Backend plan is missing TP2\/TP3 or R:R values\. Full 3-stage ladder is not confirmed\./,
      ),
    ).toBeTruthy();
  });

  it("excludes watchlist candidates that do not have plan objects", () => {
    renderPlanPage({
      signals: [
        buildSignal({ id: "sig-001", symbol: "GBPUSD", verdict: "A+" }),
        buildSignal({
          id: "sig-002",
          symbol: "USDJPY",
          verdict: "A",
          createdAt: "2026-05-14T08:01:00.000Z",
        }),
        buildSignal({
          id: "sig-003",
          symbol: "AUDUSD",
          verdict: "B",
          createdAt: "2026-05-14T08:02:00.000Z",
        }),
      ],
      ladders: [
        buildPlan({ signalId: "sig-001", symbol: "GBPUSD" }),
        buildPlan({ signalId: "sig-003", symbol: "AUDUSD" }),
      ],
      watchlist: ["GBPUSD", "USDJPY", "AUDUSD"],
    });

    const renderedSymbols = getRenderedSymbols();
    expect(getRenderedCards()).toHaveLength(2);
    expect(renderedSymbols[0]).toContain("GBPUSD");
    expect(renderedSymbols[1]).toContain("AUDUSD");
    expect(screen.queryByText("USDJPY")).toBeNull();
  });
});
