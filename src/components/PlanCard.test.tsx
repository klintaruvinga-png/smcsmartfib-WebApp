/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SignalCandidate, TradePlan } from "@/types/sniper";

const hookMocks = vi.hoisted(() => ({
  useAccountTelemetry: vi.fn(),
}));

vi.mock("@/hooks/useSniperData", () => ({
  useAccountTelemetry: hookMocks.useAccountTelemetry,
}));

import { PlanCandidateCard } from "./PlanCard";

describe("PlanCandidateCard", () => {
  beforeEach(() => {
    hookMocks.useAccountTelemetry.mockReturnValue({
      data: { currency: "USC" },
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders risk reward values as ratios instead of Rand-looking currency", () => {
    render(<PlanCandidateCard signal={signal} plan={plan} planComplete />);

    expect(screen.getAllByText("1:3.25").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1:5").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1:--").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^R\s/)).toBeNull();
    expect(screen.queryByText("R --")).toBeNull();
  });

  it("renders XAUUSD stage minimums inside compact entry rows without a separate pending ladder block", () => {
    render(
      <PlanCandidateCard
        signal={{ ...signal, symbol: "XAUUSD", direction: "SHORT" }}
        plan={{
          ...plan,
          symbol: "XAUUSD",
          entries: { e1: 0.59041, e2: 0.58981, e3: 0.58829 },
          sl: 0.58879,
          stops: { e1: 0.58966, e2: 0.58814, e3: 0.58662 },
          tps: { tp1: 0.59117, tp2: 0.59269, tp3: 0.5942 },
          rr: { tp1: 1, tp2: 3, tp3: 5 },
          lotSize: { e1: 0.08, e2: 0.09, e3: 0.15 },
          drawdownImpactPct: 0.5,
          state: "ACTIVE",
          stageFills: { e1: false, e2: false, e3: false },
        }}
        planComplete
      />,
    );

    const cardText = screen.getByTestId("plan-candidate-card").textContent ?? "";
    expect(cardText).toContain("0.08 lot");
    expect(cardText).toContain("0.09 lot");
    expect(cardText).toContain("0.15 lot");
    expect(screen.getAllByText("Below min 0.10")).toHaveLength(2);
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.queryByText("Ladder Status")).toBeNull();
    expect(cardText).not.toContain("E1 Pending");
    expect(
      (screen.getByRole("button", { name: "Send to execution" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("preserves below-minimum lot precision instead of rounding up to the executable threshold", () => {
    render(
      <PlanCandidateCard
        signal={{ ...signal, symbol: "XAUUSD", direction: "SHORT" }}
        plan={{
          ...plan,
          symbol: "XAUUSD",
          lotSize: { e1: 0.099, e2: 0.1, e3: 0.15 },
        }}
        planComplete
      />,
    );

    const cardText = screen.getByTestId("plan-candidate-card").textContent ?? "";
    expect(cardText).toContain("0.099 lot");
    expect(cardText).toContain("Below min 0.10");
    expect(cardText).not.toContain("0.10 lotBelow min 0.10");
  });
});

const signal: SignalCandidate = {
  id: "sig-rr-format",
  symbol: "EURUSD",
  direction: "LONG",
  status: "READY",
  confluence: [],
  verdict: "A",
  computedBy: "backend",
  backendConfirmed: true,
  engineBlocker: "OK",
  createdAt: "2026-06-02T10:00:00.000Z",
};

const plan: TradePlan = {
  signalId: "sig-rr-format",
  symbol: "EURUSD",
  entries: { e1: 1.1, e2: 1.101, e3: 1.102 },
  sl: 1.095,
  stops: { e1: 1.095, e2: 1.095, e3: 1.095 },
  tps: { tp1: 1.11, tp2: 1.115, tp3: 1.12 },
  rr: { tp1: 3.25, tp2: 5, tp3: undefined as unknown as number },
  lotSize: { e1: 0.01, e2: 0.02, e3: 0.03 },
  riskUSC: 12.5,
  riskZAR: 250,
  drawdownImpactPct: 0.25,
  source: "backend-blueprint",
};
