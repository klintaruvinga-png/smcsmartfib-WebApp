import { describe, it, expect, beforeEach, vi } from "vitest";
import { dbMock, setDbResult, getDbCalls, resetCalls, setInsertError } from "./dbMock";
import type { H3Event } from "h3";
import type { User } from "../../src/lib/db/schema";

// Lazy JWT secret: auth/index.ts reads process.env.JWT_SECRET at call time.
process.env.JWT_SECRET = "test-secret-key-for-unit-tests-must-be-long-enough-32bytes";

vi.mock("../../src/lib/db/index", () => ({
  db: dbMock,
}));

import { submitEaFibLevels, EaEndpointError } from "../../src/lib/ea/handlers";
import { requireEaAuth } from "../../src/lib/auth/middleware";

beforeEach(() => {
  resetCalls();
  setDbResult([]);
  setInsertError(null);
});

describe("EA bridge contract: auth gate (requireEaAuth)", () => {
  it("rejects when X-EA-API-Key header is missing", async () => {
    const event = { context: {}, node: { req: { headers: {} } } } as H3Event;
    const err = await requireEaAuth(event).catch((e) => e);
    expect(err.statusCode).toBe(401);
    await expect(requireEaAuth(event)).rejects.toThrow();
  });

  it("rejects a key with no matching user row", async () => {
    setDbResult([]);
    const event = {
      context: {},
      node: { req: { headers: { "x-ea-api-key": "missing-key" } } },
    } as H3Event;
    const err = await requireEaAuth(event).catch((e) => e);
    expect(err.statusCode).toBe(401);
    await expect(requireEaAuth(event)).rejects.toThrow();
  });

  it("rejects a key whose user has role !== 'ea'", async () => {
    setDbResult([{ id: "u1", eaApiKey: "hashed", role: "user" }]);
    const event = {
      context: {},
      node: { req: { headers: { "x-ea-api-key": "key" } } },
    } as H3Event;
    const err = await requireEaAuth(event).catch((e) => e);
    expect(err.statusCode).toBe(401);
    await expect(requireEaAuth(event)).rejects.toThrow();
  });

  it("accepts a valid key for an ea-role user and attaches context", async () => {
    setDbResult([{ id: "u1", eaApiKey: "hashed", role: "ea" }]);
    const event = {
      context: {},
      node: { req: { headers: { "x-ea-api-key": "key" } } },
    } as H3Event;
    const u = await requireEaAuth(event);
    expect(u.role).toBe("ea");
    expect((event.context as { eaUser?: User }).eaUser).toBeDefined();
  });
});

describe("EA bridge contract: fib-levels ingest (submitEaFibLevels)", () => {
  it("rejects an empty/invalid payload with 400", async () => {
    const err = await submitEaFibLevels("key", { symbol: "", levels: [] } as unknown).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(EaEndpointError);
    expect((err as EaEndpointError).statusCode).toBe(400);
  });

  it("rejects an out-of-enum ratio (not in VALID_RATIOS) without writing", async () => {
    setDbResult([{ id: "u1" }]);
    const body = {
      symbol: "eurusd",
      levels: [{ timeframe: "H1", ltf_sf: [{ ratio: 999, price: 1.1 }], htf_af: [] }],
    };
    const r = await submitEaFibLevels("key", body);
    expect(r.levels_written).toBe(0);
    expect(r.levels_failed).toBe(1);
    expect(r.ok).toBe(false);
    expect(getDbCalls().filter((c) => c.method === "insert").length).toBe(0);
  });

  it("writes valid levels and reports partial failure on insert error", async () => {
    setDbResult([{ id: "u1" }]);
    setInsertError(Object.assign(new Error("db down"), { code: "XX000" }));
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
    // 2 valid ratios -> 1 deduplicated batch of 2 -> insert throws -> both fail.
    expect(r.levels_written).toBe(0);
    expect(r.levels_failed).toBe(2);
    setInsertError(null);
  });

  it("normalizes symbol to uppercase in the response", async () => {
    setDbResult([{ id: "u1" }]);
    const body = {
      symbol: "eurusd",
      levels: [{ timeframe: "H1", ltf_sf: [{ ratio: 50, price: 1.1 }], htf_af: [] }],
    };
    const r = await submitEaFibLevels("key", body);
    expect(r.symbol).toBe("EURUSD");
    expect(r.levels_written).toBe(1);
  });

  it("deduplicates duplicate (family, ratio) pairs and counts one persisted row", async () => {
    setDbResult([{ id: "u1" }]);
    const body = {
      symbol: "eurusd",
      levels: [
        {
          timeframe: "H1",
          ltf_sf: [
            { ratio: 50, price: 1.1 },
            { ratio: 50, price: 1.15 },
          ],
          htf_af: [],
        },
      ],
    };
    const r = await submitEaFibLevels("key", body);
    expect(r.levels_written).toBe(1);
    expect(r.levels_failed).toBe(0);
    expect(r.ok).toBe(true);
    const insertCalls = getDbCalls().filter((c) => c.method === "insert");
    expect(insertCalls.length).toBe(1);
  });

  it("resolves the owning user from the EA key before writing", async () => {
    setDbResult([{ id: "owner-uuid" }]);
    const body = {
      symbol: "eurusd",
      levels: [{ timeframe: "H1", ltf_sf: [{ ratio: 50, price: 1.1 }], htf_af: [] }],
    };
    await submitEaFibLevels("key", body);
    // The insert chain must reference the resolved user id on the values row.
    const valuesCall = getDbCalls().find((c) => c.method === "values");
    expect(valuesCall).toBeDefined();
    const rows = (valuesCall!.args[0] as Array<Record<string, unknown>>) ?? [];
    expect(rows.some((row) => row.userId === "owner-uuid")).toBe(true);
    expect(rows.some((row) => row.eaApiKey === "key")).toBe(true);
  });
});
