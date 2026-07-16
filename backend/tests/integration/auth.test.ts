import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { dbMock, setDbResult, getDbCalls, resetCalls, setInsertError } from "./dbMock";

// Lazy JWT secret: auth/index.ts reads process.env.JWT_SECRET at call time,
// so setting it here (module load) is enough for jose to sign/verify.
process.env.JWT_SECRET = "test-secret-key-for-unit-tests-must-be-long-enough-32bytes";

vi.mock("../../src/lib/db/index", () => ({ db: dbMock }));

import { loginUser, registerUser, getMeUser, refreshAccessToken, AuthError } from "../../src/lib/auth/handlers";
import { requireAuth, requireEaAuth } from "../../src/lib/auth/middleware";
import { createAccessToken } from "../../src/lib/auth";

beforeEach(() => {
  resetCalls();
  setDbResult([]);
  setInsertError(null);
});

describe("auth handlers", () => {
  it("login success", async () => {
    const hash = await bcrypt.hash("pw", 10);
    setDbResult([{ id: "u1", email: "a@b.com", passwordHash: hash, role: "user", username: null }]);
    const r = await loginUser("a@b.com", "pw", {});
    expect(typeof r.accessToken === "string" && r.accessToken.length > 10).toBe(true);
    expect(r.user.id).toBe("u1");
    expect(typeof (r as { refreshToken?: unknown }).refreshToken === "string").toBe(true);
    expect(getDbCalls().some((c) => c.method === "insert")).toBe(true);
  });

  it("login wrong password", async () => {
    const hash = await bcrypt.hash("other", 10);
    setDbResult([{ id: "u1", email: "a@b.com", passwordHash: hash, role: "user", username: null }]);
    const err = await loginUser("a@b.com", "pw", {}).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).statusCode).toBe(401);
  });

  it("login missing fields", async () => {
    const err = await loginUser("", "").catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).statusCode).toBe(400);
  });

  it("login unknown user", async () => {
    setDbResult([]);
    const err = await loginUser("x@y.z", "pw", {}).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).statusCode).toBe(401);
  });

  it("register success", async () => {
    setDbResult([{ id: "u2", email: "n@b.com", role: "user", username: null, passwordHash: "x" }]);
    const r = await registerUser("n@b.com", "longenough", "nick");
    expect(typeof r.accessToken === "string").toBe(true);
    expect(r.user.id).toBe("u2");
  });

  it("register short password", async () => {
    const err = await registerUser("n@b.com", "short").catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).statusCode).toBe(400);
  });

  it("register duplicate email (simulated unique violation)", async () => {
    setInsertError(Object.assign(new Error("dup"), { code: "23505" }));
    const err = await registerUser("n@b.com", "longenough").catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).statusCode).toBe(409);
    setInsertError(null);
  });

  it("getMeUser success (never leaks passwordHash)", async () => {
    setDbResult([{
      id: "u1",
      email: "a@b.com",
      role: "user",
      username: null,
      fullName: null,
      avatarUrl: null,
      createdAt: new Date(),
      passwordHash: "x",
    }]);
    const u = await getMeUser("u1");
    expect(u.id).toBe("u1");
    expect(!("passwordHash" in u)).toBe(true);
  });

  it("getMeUser not found", async () => {
    setDbResult([]);
    const err = await getMeUser("u1").catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).statusCode).toBe(404);
  });

  it("refresh success (true rotation)", async () => {
    setDbResult([{
      id: "s1",
      userId: "u1",
      userAgent: "ua",
      ipAddress: "1.2.3.4",
      tokenHash: "h",
      expiresAt: new Date(Date.now() + 100000),
    }]);
    const r = await refreshAccessToken("sometoken");
    expect(typeof r.accessToken === "string").toBe(true);
    expect(typeof r.refreshToken === "string").toBe(true);
    expect(getDbCalls().some((c) => c.method === "delete")).toBe(true);
    expect(getDbCalls().filter((c) => c.method === "insert").length >= 1).toBe(true);
  });

  it("refresh invalid token", async () => {
    setDbResult([]);
    const err = await refreshAccessToken("bad").catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).statusCode).toBe(401);
  });

  it("refresh missing token", async () => {
    const err = await refreshAccessToken("").catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).statusCode).toBe(400);
  });
});

describe("auth middleware", () => {
  it("requireAuth valid token", async () => {
    const token = await createAccessToken({ sub: "u1", email: "a@b.com", role: "user" });
    const event = {
      context: {},
      node: { req: { headers: { authorization: "Bearer " + token } } },
    } as any;
    const p = await requireAuth(event);
    expect(p.sub).toBe("u1");
    expect((event.context as any).authUser.sub).toBe("u1");
  });

  it("requireAuth invalid token", async () => {
    const event = {
      context: {},
      node: { req: { headers: { authorization: "Bearer notajwt" } } },
    } as any;
    await expect(requireAuth(event)).rejects.toThrow();
  });

  it("requireAuth missing header", async () => {
    const event = { context: {}, node: { req: { headers: {} } } } as any;
    await expect(requireAuth(event)).rejects.toThrow();
  });

  it("requireEaAuth valid key", async () => {
    setDbResult([{ id: "u1", eaApiKey: "key", role: "ea" }]);
    const event = {
      context: {},
      node: { req: { headers: { "x-ea-api-key": "key" } } },
    } as any;
    const u = await requireEaAuth(event);
    expect(u.role).toBe("ea");
    expect((event.context as any).eaUser).toBeDefined();
  });

  it("requireEaAuth wrong role", async () => {
    setDbResult([{ id: "u1", eaApiKey: "key", role: "user" }]);
    const event = {
      context: {},
      node: { req: { headers: { "x-ea-api-key": "key" } } },
    } as any;
    await expect(requireEaAuth(event)).rejects.toThrow();
  });

  it("requireEaAuth missing key", async () => {
    const event = { context: {}, node: { req: { headers: {} } } } as any;
    await expect(requireEaAuth(event)).rejects.toThrow();
  });
});
