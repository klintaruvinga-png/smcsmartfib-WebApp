import { describe, expect, it, vi } from "vitest";
import type { PairPrice } from "@/types/sniper";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (config: unknown) => config,
  };
});

import { shouldRenderPendingCard } from "./-live.utils";

function buildPrice(overrides: Partial<PairPrice>): PairPrice {
  return {
    symbol: "EURUSD",
    bid: 1.1,
    ask: 1.1002,
    mid: 1.1001,
    changePct1d: 0,
    updatedAt: "2026-05-16T08:00:00Z",
    state: "live",
    source: "mt5",
    ...overrides,
  };
}

describe("shouldRenderPendingCard", () => {
  it("keeps stale MT5 prices visible on the live radar", () => {
    expect(shouldRenderPendingCard(buildPrice({ state: "stale" }), false)).toBe(false);
  });

  it("keeps offline MT5 prices visible on the live radar", () => {
    expect(shouldRenderPendingCard(buildPrice({ state: "offline" }), false)).toBe(false);
  });

  it("uses the pending placeholder when the backend has not emitted an MT5 snapshot", () => {
    expect(shouldRenderPendingCard(buildPrice({ source: "unknown" }), false)).toBe(true);
  });
});
