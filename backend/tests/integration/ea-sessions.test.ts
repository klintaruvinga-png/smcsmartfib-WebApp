import { describe, it, expect, beforeEach, vi } from "vitest";
import { dbMock, setDbResult, getDbCalls, resetCalls } from "./dbMock";
import { eaSessions } from "../../src/lib/db/schema";

vi.mock("../../src/lib/db/index", () => ({ db: dbMock }));

import {
  createEaSession,
  updateEaSessionPing,
  getActiveEaSessions,
} from "../../src/lib/db/queries";

beforeEach(() => {
  resetCalls();
  setDbResult([]);
});

describe("ea-sessions queries", () => {
  it("createEaSession throws on unknown key", async () => {
    setDbResult([]);
    await expect(createEaSession("bad", "1.2.3.4", "ua")).rejects.toThrow(/No user found/);
  });

  it("createEaSession resolves and inserts a session", async () => {
    setDbResult([{ id: "sess-1" }]);
    const s = await createEaSession("key", "1.2.3.4", "ua");
    expect(s.id).toBe("sess-1");

    const insertCall = getDbCalls().find((c) => c.method === "insert");
    expect(insertCall).toBeDefined();
    expect(insertCall!.args[0]).toBe(eaSessions);
  });

  it("updateEaSessionPing resolves and updates", async () => {
    setDbResult([]);
    await expect(updateEaSessionPing("key")).resolves.toBeUndefined();

    const updateCall = getDbCalls().find((c) => c.method === "update");
    expect(updateCall).toBeDefined();
    expect(updateCall!.args[0]).toBe(eaSessions);

    const setCall = getDbCalls().find((c) => c.method === "set");
    expect(setCall).toBeDefined();
  });

  it("getActiveEaSessions returns rows", async () => {
    setDbResult([{ id: "sess-1", status: "connected", lastPing: new Date() }]);
    const rows = await getActiveEaSessions("key");
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0].id).toBe("sess-1");
  });
});
