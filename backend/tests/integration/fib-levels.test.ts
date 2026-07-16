import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { dbMock, setDbResult, getDbCalls, resetCalls } from "./dbMock";
import { fibLevels } from "../../src/lib/db/schema";

vi.mock("../../src/lib/db/index", () => ({ db: dbMock }));

import {
  createFibLevel,
  getLatestFibLevels,
  getMarketData,
} from "../../src/lib/db/queries";

beforeEach(() => {
  resetCalls();
  setDbResult([]);
  // The shared mock's `transaction` is a plain function (not a vi.fn), so wrap
  // it to track calls and satisfy the `.mock.calls.length` assertion below.
  vi.spyOn(dbMock as Record<string, unknown>, "transaction");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fib-levels queries", () => {
  it("createFibLevel throws when the EA API key is unknown", async () => {
    setDbResult([]);
    await expect(
      createFibLevel("bad", "EURUSD", "H1", null, [
        { family: "LTF_SF", ratio: 50, price: 1.1 },
      ])
    ).rejects.toThrow(/No user found/);
  });

  it("createFibLevel upserts when the user resolves", async () => {
    setDbResult([{ id: "user-1" }]);
    await createFibLevel("key", "EURUSD", "H1", "up", [
      { family: "LTF_SF", ratio: 50, price: 1.1 },
      { family: "HTF_AF", ratio: -25, price: 1.05 },
    ]);

    // transaction callback ran
    expect((dbMock as any).transaction.mock.calls.length).toBeGreaterThan(0);

    const insertCall = getDbCalls().find((c) => c.method === "insert");
    expect(insertCall).toBeDefined();
    expect(insertCall!.args[0]).toBe(fibLevels);

    const valuesCall = getDbCalls().find((c) => c.method === "values");
    expect(valuesCall).toBeDefined();
    const rows = valuesCall!.args[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.userId).toBe("user-1");
      expect(row.eaApiKey).toBe("key");
      expect(row.symbol).toBe("EURUSD");
      expect(row.timeframe).toBe("H1");
      expect(row.trend).toBe("up");
    }
  });

  it("getLatestFibLevels converts decimals to numbers", async () => {
    setDbResult([
      {
        id: 1,
        family: "LTF_SF",
        ratio: "50",
        price: "1.10000000",
        source: "mt5",
        trend: null,
        calculatedAt: new Date("2024-01-01T00:00:00Z"),
      },
    ]);
    const rows = await getLatestFibLevels("key", "EURUSD", "H1");
    expect(rows[0].ratio).toBe(50);
    expect(rows[0].price).toBe(1.1);
    expect(typeof rows[0].calculatedAt).toBe("string");
  });

  it("getMarketData returns the same transformed shape", async () => {
    setDbResult([
      {
        id: 2,
        family: "HTF_AF",
        ratio: "-25",
        price: "1.05000000",
        source: "mt5",
        trend: "down",
        calculatedAt: new Date("2024-01-02T00:00:00Z"),
      },
    ]);
    const rows = await getMarketData("key", "EURUSD", "H1");
    expect(rows[0].ratio).toBe(-25);
    expect(rows[0].price).toBe(1.05);
  });
});
