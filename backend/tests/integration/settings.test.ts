import { describe, it, expect, beforeEach, vi } from "vitest";
import { dbMock, setDbResult, getDbCalls, resetCalls } from "./dbMock";
import { users } from "../../src/lib/db/schema";
import { userSettingsSchema } from "../../src/lib/user/settings-schema";

vi.mock("../../src/lib/db/index", () => ({ db: dbMock }));

import {
  getUserSettings,
  updateUserSettings,
  SettingsError,
} from "../../src/lib/db/queries/users";

beforeEach(() => {
  resetCalls();
  setDbResult([]);
});

describe("user settings queries", () => {
  it("getUserSettings returns {} when no row exists", async () => {
    setDbResult([]);
    expect(await getUserSettings("u-1")).toEqual({});
  });

  it("getUserSettings returns the stored settings object", async () => {
    setDbResult([{ settings: { theme: "dark" } }]);
    expect(await getUserSettings("u-1")).toEqual({ theme: "dark" });
  });

  it("updateUserSettings issues the JSONB merge and returns the post-merge row", async () => {
    // The JSONB `||` merge runs in Postgres; the mock returns what the DB
    // would return after merging the patch into the existing row. We assert the
    // handler returns that merged row and that the update targets `users`.
    const merged = {
      theme: "dark",
      watchlist: ["EURUSD"],
      notifications: { email: true },
    };
    setDbResult([{ settings: merged }]);
    const result = await updateUserSettings("u-1", { notifications: { email: true } });
    expect(result).toEqual(merged);

    const updateCall = getDbCalls().find((c) => c.method === "update");
    expect(updateCall).toBeDefined();
    expect(updateCall!.args[0]).toBe(users);

    // The merge is expressed as a SQL expression (atomic, no read-before-write).
    const setCall = getDbCalls().find((c) => c.method === "set");
    expect(setCall).toBeDefined();
    expect((setCall!.args[0] as Record<string, unknown>).settings).toBeDefined();
  });

  it("updateUserSettings throws SettingsError(404) when the user is missing", async () => {
    setDbResult([]);
    await expect(updateUserSettings("u-x", { theme: "light" })).rejects.toBeInstanceOf(
      SettingsError
    );
  });
});

describe("user settings zod schema", () => {
  it("accepts a partial settings object", () => {
    const parsed = userSettingsSchema.safeParse({ theme: "dark", watchlist: ["GBPUSD"] });
    expect(parsed.success).toBe(true);
  });

  it("rejects an invalid theme enum value", () => {
    const parsed = userSettingsSchema.safeParse({ theme: "neon" });
    expect(parsed.success).toBe(false);
  });

  it("rejects an out-of-range risk percentage", () => {
    const parsed = userSettingsSchema.safeParse({ risk: { maxRiskPercent: 150 } });
    expect(parsed.success).toBe(false);
  });

  it("accepts a deeply nested partial patch", () => {
    const parsed = userSettingsSchema.safeParse({
      notifications: { push: true },
      risk: { riskRewardRatio: 2.5 },
    });
    expect(parsed.success).toBe(true);
  });
});
