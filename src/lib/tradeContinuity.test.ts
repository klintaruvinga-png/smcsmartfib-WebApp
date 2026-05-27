import { describe, expect, it } from "vitest";
import { reconcileUserTrades, type UserTradesData } from "./tradeContinuity";

function buildTrades(overrides?: Partial<UserTradesData>): UserTradesData {
  return {
    positions: [
      {
        id: "pos-1",
        symbol: "EURUSD",
        direction: "LONG",
        entry: 1.08,
        current: 1.081,
        lots: 0.5,
        pnlUSC: 25,
        pnlPct: 2,
        openedAt: "2026-05-27T10:00:00Z",
        state: "live",
      },
      {
        id: "pos-2",
        symbol: "GBPUSD",
        direction: "SHORT",
        entry: 1.25,
        current: 1.249,
        lots: 0.25,
        pnlUSC: 10,
        pnlPct: 1.2,
        openedAt: "2026-05-27T10:05:00Z",
        state: "live",
      },
    ],
    orders: [
      {
        id: "ord-1",
        symbol: "EURUSD",
        direction: "LONG",
        type: "LIMIT",
        price: 1.079,
        lots: 0.25,
        sl: 1.075,
        tp: 1.089,
        placedAt: "2026-05-27T10:01:00Z",
        state: "live",
      },
    ],
    ...overrides,
  };
}

describe("reconcileUserTrades", () => {
  it("reuses previous row objects when the incoming values are unchanged", () => {
    const first = reconcileUserTrades(null, buildTrades(), 1_000, 2_000);
    const second = reconcileUserTrades(first.state, buildTrades(), 2_000, 2_000);

    expect(second.data.positions[0]).toBe(first.data.positions[0]);
    expect(second.data.positions[1]).toBe(first.data.positions[1]);
    expect(second.data.orders[0]).toBe(first.data.orders[0]);
  });

  it("keeps prior rows for one grace window on a transient empty poll and marks them stale", () => {
    const initial = reconcileUserTrades(null, buildTrades(), 1_000, 2_000);
    const transientGap = reconcileUserTrades(
      initial.state,
      { positions: [], orders: [] },
      3_000,
      2_000,
    );

    expect(transientGap.data.positions).toHaveLength(2);
    expect(transientGap.data.orders).toHaveLength(1);
    expect(transientGap.data.positions.every((row) => row.state === "stale")).toBe(true);
    expect(transientGap.data.orders.every((row) => row.state === "stale")).toBe(true);
  });

  it("keeps a missing row through one partial poll and restores its live state when it returns", () => {
    const baseline = buildTrades();
    const initial = reconcileUserTrades(null, baseline, 1_000, 2_000);
    const partial = reconcileUserTrades(
      initial.state,
      buildTrades({ positions: [baseline.positions[0]], orders: [] }),
      3_000,
      2_000,
    );
    const recovered = reconcileUserTrades(partial.state, buildTrades(), 4_000, 2_000);

    expect(partial.data.positions).toHaveLength(2);
    expect(partial.data.positions[1]?.id).toBe("pos-2");
    expect(partial.data.positions[1]?.state).toBe("stale");
    expect(recovered.data.positions[1]?.id).toBe("pos-2");
    expect(recovered.data.positions[1]?.state).toBe("live");
  });

  it("drops missing rows once the grace window expires", () => {
    const initial = reconcileUserTrades(null, buildTrades(), 1_000, 2_000);
    const carried = reconcileUserTrades(initial.state, { positions: [], orders: [] }, 3_000, 2_000);
    const expired = reconcileUserTrades(carried.state, { positions: [], orders: [] }, 5_000, 2_000);

    expect(expired.data.positions).toEqual([]);
    expect(expired.data.orders).toEqual([]);
  });
});
