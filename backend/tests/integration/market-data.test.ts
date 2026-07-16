import { describe, it, expect, beforeEach, vi } from "vitest";
import { dbMock, setDbResult, resetCalls } from "./dbMock";

// Lazy JWT secret: auth/index.ts reads process.env.JWT_SECRET at call time,
// so setting it here (module load) is enough for jose to sign/verify.
process.env.JWT_SECRET = "test-secret-key-for-unit-tests-must-be-long-enough-32bytes";

vi.mock("../../src/lib/db/index", () => ({ db: dbMock }));

import { fetchMarketData, MarketDataError } from "../../src/lib/market-data/handlers";

beforeEach(() => {
  resetCalls();
  setDbResult([]);
});

const threeRows = [
  {
    id: 1,
    timeframe: "H1",
    family: "LTF_SF",
    ratio: "50",
    price: "1.1",
    source: "mt5",
    trend: null,
    calculatedAt: new Date("2024-01-01T00:00:00Z"),
  },
  {
    id: 2,
    timeframe: "H1",
    family: "HTF_AF",
    ratio: "-25",
    price: "1.05",
    source: "mt5",
    trend: null,
    calculatedAt: new Date("2024-01-02T00:00:00Z"),
  },
  {
    id: 3,
    timeframe: "M15",
    family: "LTF_SF",
    ratio: "100",
    price: "1.2",
    source: "mt5",
    trend: null,
    calculatedAt: new Date("2024-01-03T00:00:00Z"),
  },
];

describe("market-data endpoint", () => {
  it("success + grouping by timeframe/family with number conversion", async () => {
    setDbResult(threeRows);
    const r = await fetchMarketData("u1", { symbol: "eurusd" });
    expect(r.symbol).toBe("EURUSD");
    expect(r.fibs["H1"]["LTF_SF"][0].ratio).toBe(50);
    expect(r.fibs["H1"]["HTF_AF"][0].ratio).toBe(-25);
    expect(r.fibs["M15"]["LTF_SF"][0].ratio).toBe(100);
    expect(r.fibs["H1"]["LTF_SF"][0].price).toBe(1.1);
  });

  it("family filter (DB-level)", async () => {
    // Mock returns only LTF_SF rows to simulate DB-level filtering
    setDbResult([threeRows[0], threeRows[2]]);
    const r = await fetchMarketData("u1", { symbol: "eurusd", family: "LTF_SF" });
    expect(r.fibs["H1"]["LTF_SF"]).toBeDefined();
    expect(r.fibs["H1"]["HTF_AF"]).toBeUndefined();
    expect(r.fibs["M15"]["LTF_SF"]).toBeDefined();
  });

  it("timeframe filtering is DB-enforced (mock returns exactly what it is given)", async () => {
    setDbResult([
      {
        id: 1,
        timeframe: "H1",
        family: "LTF_SF",
        ratio: "50",
        price: "1.1",
        source: "mt5",
        trend: null,
        calculatedAt: new Date(),
      },
    ]);
    const r = await fetchMarketData("u1", { symbol: "eurusd", timeframe: "H1" });
    expect(r.fibs["H1"]).toBeDefined();
    expect(r.fibs["M15"]).toBeUndefined();
  });

  it("invalid query (empty symbol)", async () => {
    const err = await fetchMarketData("u1", { symbol: "" }).catch((e) => e);
    expect(err).toBeInstanceOf(MarketDataError);
    expect((err as MarketDataError).statusCode).toBe(400);
  });
});
