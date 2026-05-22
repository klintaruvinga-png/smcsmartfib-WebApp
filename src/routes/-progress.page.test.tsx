/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hookMocks = vi.hoisted(() => ({
  useUserAccount: vi.fn(),
  useUserProgress: vi.fn(),
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
  useUserAccount: hookMocks.useUserAccount,
  useUserProgress: hookMocks.useUserProgress,
  useUserRiskProfile: hookMocks.useUserRiskProfile,
}));

import { ProgressPage } from "./progress";

describe("ProgressPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    hookMocks.useUserAccount.mockReturnValue({
      data: {
        balanceUSC: 10000,
        equityUSC: 10125,
        marginUsedPct: 10,
        drawdownPct: 1.5,
        openPositions: 1,
        pendingOrders: 0,
        todayPnlUSC: 48.5,
        todayPnlPct: 0.48,
        state: "live",
      },
    });
    hookMocks.useUserRiskProfile.mockReturnValue({
      data: { ddCapPct: 6 },
    });
  });

  it("renders live streak and milestone data from /user/progress without changing the equity card source", () => {
    hookMocks.useUserProgress.mockReturnValue({
      data: {
        equityPulse: {
          equityUSC: 99999,
          todayPnlUSC: 999,
          state: "LIVE",
        },
        streak: {
          currentStreakDays: 4,
          lastActiveDate: "2026-05-20",
          state: "LIVE",
        },
        milestones: {
          firstHeartbeat: true,
          firstMarketStream: false,
          firstTradeTelemetry: true,
          state: "LIVE",
        },
        generatedAt: "2026-05-20T10:15:00Z",
      },
      isLoading: false,
      isError: false,
    });

    render(<ProgressPage />);

    expect(screen.getByText("$10,125.00")).toBeTruthy();
    expect(screen.getByText("+$48.50 today")).toBeTruthy();
    expect(screen.getByText("4d")).toBeTruthy();
    expect(screen.getByText("Last active 2026-05-20")).toBeTruthy();
    expect(screen.getByText("First heartbeat")).toBeTruthy();
    expect(screen.getAllByText("Complete").length).toBeGreaterThan(0);
    expect(screen.getByText("Pending")).toBeTruthy();
  });

  it("shows unavailable progress states instead of crashing when streak remains unresolved", () => {
    hookMocks.useUserProgress.mockReturnValue({
      data: {
        equityPulse: {
          equityUSC: 10125,
          todayPnlUSC: 48.5,
          state: "LIVE",
        },
        streak: {
          currentStreakDays: 0,
          lastActiveDate: "2026-05-20",
          state: "UNAVAILABLE",
        },
        milestones: {
          firstHeartbeat: false,
          firstMarketStream: false,
          firstTradeTelemetry: false,
          state: "UNAVAILABLE",
        },
        generatedAt: "2026-05-20T10:15:00Z",
      },
      isLoading: false,
      isError: false,
    });

    render(<ProgressPage />);

    expect(
      screen.getByText(
        "No engine run data found for this account yet.",
      ),
    ).toBeTruthy();
    expect(screen.getAllByText("Pending").length).toBe(3);
  });

  it("shows loading and error fallbacks for the new progress panels", () => {
    hookMocks.useUserProgress.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { rerender } = render(<ProgressPage />);

    expect(screen.getAllByLabelText("Loading progress data").length).toBe(2);

    hookMocks.useUserProgress.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    rerender(<ProgressPage />);

    expect(
      screen.getByText("Progress data unavailable while /user/progress is unreachable."),
    ).toBeTruthy();
    expect(
      screen.getByText("Milestone progress is unavailable while /user/progress is unreachable."),
    ).toBeTruthy();
  });
});
