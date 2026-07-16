import { describe, it, expect, beforeEach, vi } from "vitest";
import { dbMock, setDbResult, getDbCalls, resetCalls } from "./dbMock";
import { users } from "../../src/lib/db/schema";

vi.mock("../../src/lib/db/index", () => ({ db: dbMock }));

import {
  createUser,
  getUserByApiKey,
  getUserById,
  verifyUserPassword,
} from "../../src/lib/db/queries";

beforeEach(() => {
  resetCalls();
  setDbResult([]);
});

describe("users queries", () => {
  it("createUser hashes the password and inserts a profile", async () => {
    setDbResult([
      {
        id: "u-1",
        email: "a@b.com",
        role: "user",
        eaApiKey: null,
        passwordHash: "x",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const user = await createUser("a@b.com", "secret", "user");
    expect(user.id).toBe("u-1");

    const insertCall = getDbCalls().find((c) => c.method === "insert");
    expect(insertCall).toBeDefined();
    expect(insertCall!.args[0]).toBe(users);

    const valuesCall = getDbCalls().find((c) => c.method === "values");
    expect(valuesCall).toBeDefined();
    const values = valuesCall!.args[0] as Record<string, unknown>;
    expect(values.email).toBe("a@b.com");
    expect(values.passwordHash).toBeTruthy();
    expect(values.passwordHash).not.toBe("secret");
    expect("eaApiKey" in values).toBe(false);
  });

  it("getUserByApiKey returns the user when found", async () => {
    setDbResult([{ id: "u-1", email: "a@b.com" }]);
    expect((await getUserByApiKey("key"))?.id).toBe("u-1");
  });

  it("getUserByApiKey returns null when not found", async () => {
    setDbResult([]);
    expect(await getUserByApiKey("nope")).toBeNull();
  });

  it("getUserById returns the user when found", async () => {
    setDbResult([{ id: "u-1", email: "a@b.com" }]);
    expect((await getUserById("u-1"))?.id).toBe("u-1");
  });

  it("getUserById returns null when not found", async () => {
    setDbResult([]);
    expect(await getUserById("missing")).toBeNull();
  });

  it("verifyUserPassword matches and rejects passwords", async () => {
    const bcrypt = (await import("bcryptjs")).default;
    const h = await bcrypt.hash("pw", 10);
    expect(await verifyUserPassword("pw", h)).toBe(true);
    expect(await verifyUserPassword("wrong", h)).toBe(false);
  });
});
