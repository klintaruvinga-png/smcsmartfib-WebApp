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
