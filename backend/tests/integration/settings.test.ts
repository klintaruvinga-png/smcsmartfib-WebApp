import { describe, it, expect, beforeEach, vi } from "vitest";
import { dbMock, setDbResult, setDbResultQueue, getDbCalls, resetCalls } from "./dbMock";
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
  it("getUserSettings throws SettingsError(404) when the user row is missing", async () => {
    setDbResult([]);
    await expect(getUserSettings("u-1")).rejects.toBeInstanceOf(SettingsError);
  });

  it("getUserSettings returns the stored settings object", async () => {
    setDbResult([{ settings: { theme: "dark" } }]);
    expect(await getUserSettings("u-1")).toEqual({ theme: "dark" });
  });

  it("updateUserSettings deep-merges in a transaction, preserving nested properties", async () => {
    // Set up the scenario: current settings have nested notifications with both
    // email and push properties. We'll patch only email; push should be preserved.
    const currentSettings = {
      theme: "dark",
      watchlist: ["EURUSD"],
      notifications: { email: false, push: true },
    };

    const mergedSettings = {
      theme: "dark",
      watchlist: ["EURUSD"],
      notifications: { email: true, push: true },
    };

    // Use the result queue to simulate the transaction flow:
    // 1. First query (SELECT current settings) returns currentSettings
    // 2. Second query (UPDATE.returning()) returns the merged result
    setDbResultQueue([
      [{ settings: currentSettings }],  // SELECT result
      [{ settings: mergedSettings }],   // UPDATE.returning() result
    ]);

    const patch = { notifications: { email: true } };
    const result = await updateUserSettings("u-1", patch);

    // Verify the returned result has the deep-merged structure
    expect(result).toEqual(mergedSettings);
    expect(result.notifications?.push).toBe(true); // Preserved from original
    expect(result.notifications?.email).toBe(true); // Updated from patch

    // Verify transaction, SELECT, and UPDATE calls occurred
    const calls = getDbCalls();
    expect(calls.some((c) => c.method === "select")).toBe(true);
    expect(calls.some((c) => c.method === "update")).toBe(true);

    // Verify the UPDATE.set() call received the deep-merged settings
    const setCall = calls.find((c) => c.method === "set");
    expect(setCall).toBeDefined();
    const setArg = setCall!.args[0] as Record<string, unknown>;
    expect(setArg.settings).toBeDefined();
    // The settings passed to .set() should have both email and push (deep merge result)
    const settingsInSet = setArg.settings as Record<string, unknown>;
    expect((settingsInSet.notifications as Record<string, unknown>)?.email).toBe(true);
    expect((settingsInSet.notifications as Record<string, unknown>)?.push).toBe(true);
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
