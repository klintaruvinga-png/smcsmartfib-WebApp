/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { SignalCandidate, TradePlan } from "@/types/sniper";
import { mockPlan } from "@/mocks/sniperData";

const hookMocks = vi.hoisted(() => ({
  useLiveSignals: vi.fn(),
  useLadders: vi.fn(),
  useSnapshot: vi.fn(),
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
});

describe("PlanPage execution guard", () => {
  beforeEach(() => {
    hookMocks.useSnapshot.mockReturnValue({
      data: { prices: [], diagnostics: [] },
      isLoading: false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the incomplete-plan warning and disables execution when backend data is partial", () => {
    hookMocks.useLiveSignals.mockReturnValue({
      data: [buildSignal()],
      isLoading: false,
    });
    hookMocks.useLadders.mockReturnValue({
      data: [
        buildPlan({
          rr: { tp1: 1.2, tp2: 0, tp3: 3.6 },
          tps: { tp1: 1.2705, tp2: 1.2738, tp3: 0 },
        }),
      ],
      isLoading: false,
    });

    render(<PlanPage />);

    expect(
      screen.getByText(
        /Backend plan is missing TP2\/TP3 or R:R values\. Full 3-stage ladder is not confirmed\./,
      ),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Send to execution" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("keeps execution available for a complete backend-confirmed plan", () => {
    hookMocks.useLiveSignals.mockReturnValue({
      data: [buildSignal()],
      isLoading: false,
    });
    hookMocks.useLadders.mockReturnValue({
      data: [buildPlan()],
      isLoading: false,
    });

    render(<PlanPage />);

    expect(screen.queryByText(/Backend plan is missing TP2\/TP3 or R:R values\./)).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Send to execution" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
