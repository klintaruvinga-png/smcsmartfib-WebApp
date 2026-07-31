import { describe, it, expect, beforeEach, vi } from "vitest";
import { dbMock, setDbResult, getDbCalls, resetCalls } from "./dbMock";

// Lazy JWT secret: auth/index.ts reads process.env.JWT_SECRET at call time,
// so setting it here (module load) is enough for jose to sign/verify.
process.env.JWT_SECRET = "test-secret-key-for-unit-tests-must-be-long-enough-32bytes";

vi.mock("../../src/lib/db/index", () => ({ db: dbMock }));

import { submitEaFibLevels, EaEndpointError } from "../../src/lib/ea/handlers";

beforeEach(() => {
  resetCalls();
  setDbResult([]);
});

describe("EA fib-levels endpoint", () => {
  it("valid submission with one invalid ratio (partial write)", async () => {
    setDbResult([{ id: "u1" }]);
    const body = {
      symbol: "eurusd",
      levels: [
        {
          timeframe: "H1",
          ltf_sf: [
            { ratio: 50, price: 1.1 },
            { ratio: 999, price: 1 },
          ],
          htf_af: [{ ratio: -25, price: 1.05 }],
        },
      ],
    };
    const r = await submitEaFibLevels("key", body);
    expect(r.levels_written).toBe(2);
    expect(r.levels_failed).toBe(1);
    expect(r.symbol).toBe("EURUSD");
    expect(r.ok).toBe(false);
    expect(getDbCalls().filter((c) => c.method === "insert").length).toBe(1);
  });

  it("invalid payload (zod)", async () => {
    const err = await submitEaFibLevels("key", { symbol: "", levels: [] } as unknown).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(EaEndpointError);
    expect((err as EaEndpointError).statusCode).toBe(400);
  });

  it("unknown API key is resilient (all levels fail, none written)", async () => {
    // resolveUserIdByApiKey returns nothing -> createFibLevel throws per-level.
    setDbResult([]);
    const body = {
      symbol: "eurusd",
      levels: [
        {
          timeframe: "H1",
          ltf_sf: [{ ratio: 50, price: 1.1 }],
          htf_af: [{ ratio: -25, price: 1.05 }],
        },
      ],
    };
    const r = await submitEaFibLevels("key", body);
    expect(r.levels_failed).toBe(2);
    expect(r.levels_written).toBe(0);
  });
});
