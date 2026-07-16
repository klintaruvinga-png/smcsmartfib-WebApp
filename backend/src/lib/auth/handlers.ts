import { db } from "../db";
import { users } from "../db/schema";
import type { User } from "../db/schema";
import { eq } from "drizzle-orm";
import { createUser, getUserById } from "../db/queries";
import {
  createAccessToken,
  createRefreshToken,
  verifyPassword,
} from "./index";
import {
  createRefreshSession,
  validateRefreshSession,
  deleteRefreshSession,
} from "../db/queries";

export class AuthError extends Error {
  constructor(public statusCode: number, message: string, public code?: string) {
    super(message);
    this.name = "AuthError";
  }
}

export type AuthUserView = {
  id: string;
  email: string;
  role: string;
  username?: string | null;
};

function toUserView(u: User): AuthUserView {
  return { id: u.id, email: u.email, role: u.role, username: u.username };
}

export async function loginUser(
  email: string,
  password: string,
  meta: { userAgent?: string | null; ipAddress?: string | null }
) {
  if (!email || !password) throw new AuthError(400, "Email and password required");
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (
    !user ||
    !user.passwordHash ||
    !(await verifyPassword(password, user.passwordHash))
  ) {
    throw new AuthError(401, "Invalid credentials");
  }
  const accessToken = await createAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  const refreshToken = await createRefreshToken();
  await createRefreshSession(user.id, refreshToken, meta.userAgent, meta.ipAddress);
  return { accessToken, refreshToken, user: toUserView(user) };
}

export async function registerUser(
  email: string,
  password: string,
  username?: string,
  meta?: { userAgent?: string | null; ipAddress?: string | null }
) {
  if (!email || !password) throw new AuthError(400, "Email and password required");
  if (password.length < 8)
    throw new AuthError(400, "Password must be at least 8 characters");
  try {
    const user = await createUser(email, password, "user", undefined, username);
    const accessToken = await createAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = await createRefreshToken();
    await createRefreshSession(user.id, refreshToken, meta?.userAgent ?? null, meta?.ipAddress ?? null);
    return { accessToken, refreshToken, user: toUserView(user) };
  } catch (err: any) {
    if (err && err.code === "23505") throw new AuthError(409, "Email already exists");
    throw err;
  }
}

export async function getMeUser(userId: string): Promise<AuthUserView> {
  const user = await getUserById(userId);
  if (!user) throw new AuthError(404, "User not found");
  return toUserView(user);
}

export async function refreshAccessToken(refreshToken: string) {
  if (!refreshToken) throw new AuthError(400, "Refresh token required");
  const session = await validateRefreshSession(refreshToken);
  if (!session) throw new AuthError(401, "Invalid or expired refresh token");
  // True rotation: invalidate the old refresh token, issue a brand-new pair.
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user) throw new AuthError(404, "User not found");
  await deleteRefreshSession(refreshToken);
  const newRefresh = await createRefreshToken();
  await createRefreshSession(
    user.id,
    newRefresh,
    session.userAgent ?? null,
    session.ipAddress ?? null
  );
  const accessToken = await createAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  return { accessToken, refreshToken: newRefresh };
}
