import { db } from "../db";
import { users } from "../db/schema";
import type { User } from "../db/schema";
import { eq } from "drizzle-orm";
import { createUser, getUserById, updateUserPasswordHash } from "../db/queries";
import {
  createAccessToken,
  createRefreshToken,
  verifyPassword,
  hashPassword,
  isBcryptHash,
  PBKDF2_ITERATIONS,
} from "./index";
import { createRefreshSession, validateRefreshSession, deleteRefreshSession } from "../db/queries";

export class AuthError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
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

// Constant-cost PBKDF2 hash used only to equalize response timing on the
// not-found path so an attacker cannot enumerate registered emails by
// measuring login latency (the real hash check is skipped when no user row
// exists). Valid PBKDF2 format is salt$iterations$hash; the iteration count
// must match PBKDF2_ITERATIONS so both paths cost the same.
const DUMMY_PASSWORD_HASH = `00000000000000000000000000000000$${PBKDF2_ITERATIONS}$0000000000000000000000000000000000000000000000000000000000000000`;

export async function loginUser(
  email: string,
  password: string,
  meta: { userAgent?: string | null; ipAddress?: string | null },
) {
  if (!email || !password) throw new AuthError(400, "Email and password required");
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  // Run a constant-cost verification whether or not the user exists so response
  // latency does not reveal whether the email is registered (user-enumeration
  // hardening). When the row/ hash is missing we verify against the dummy hash,
  // which costs the same as a real check.
  const hashToCheck = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const passwordOk = await verifyPassword(password, hashToCheck);

  if (!user || !passwordOk) {
    throw new AuthError(401, "Invalid credentials");
  }

  // After successful authentication, check if the user has a legacy bcrypt hash
  // and asynchronously upgrade it to PBKDF2. This is a fire-and-forget operation
  // that doesn't block the login response.
  if (user.passwordHash && isBcryptHash(user.passwordHash)) {
    // Fire-and-forget: upgrade the hash in the background without blocking the response
    (async () => {
      try {
        const newHash = await hashPassword(password);
        await updateUserPasswordHash(user.id, newHash);
      } catch (err) {
        // Log the error but don't crash or block the login
        console.error(`Failed to upgrade bcrypt hash for user ${user.id}:`, err);
      }
    })();
  }

  const accessToken = await createAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  const refreshToken = await createRefreshToken();
  await createRefreshSession(
    user.id,
    refreshToken,
    meta?.userAgent ?? null,
    meta?.ipAddress ?? null,
  );
  return { accessToken, refreshToken, user: toUserView(user) };
}

export async function registerUser(
  email: string,
  password: string,
  username?: string,
  meta?: { userAgent?: string | null; ipAddress?: string | null },
) {
  if (!email || !password) throw new AuthError(400, "Email and password required");
  if (password.length < 8) throw new AuthError(400, "Password must be at least 8 characters");

  // NOTE: This is a fully custom auth flow. Passwords live in public.users.password_hash,
  // sessions are custom jose JWTs, and the public.users.id -> auth.users(id) FK was dropped
  // (see migration 003_drop_users_auth_fk.sql), so NO Supabase Auth user is created.
  // Supabase Auth's `handle_new_user` trigger on auth.users calls seed_user_pairs() and
  // fails, which would roll back any auth.admin.createUser call. Because nothing in the
  // app reads auth.users, we skip Supabase Auth entirely and keep the flow self-contained.
  try {
    // Create the database user (standalone UUID). No auth.users row is (or needs to be) created.
    const user = await createUser(email, password, "user", undefined, username);
    const accessToken = await createAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = await createRefreshToken();
    await createRefreshSession(
      user.id,
      refreshToken,
      meta?.userAgent ?? null,
      meta?.ipAddress ?? null,
    );
    return { accessToken, refreshToken, user: toUserView(user) };
  } catch (err: unknown) {
    if (err instanceof AuthError) throw err;
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: unknown }).code === "23505"
    ) {
      // Parse constraint name from error detail to return specific message
      // postgres.js format: Key (email)=(x) already exists.
      // Standard format: Key (email)=(x) violates constraint "users_email_key"
      const detail = (err as { detail?: unknown }).detail;
      const constraint =
        typeof detail === "string"
          ? detail.match(/constraint "([^"]+)"/)?.[1] || detail.match(/Key \(([^)]+)\)=/)?.[1]
          : undefined;

      if (constraint === "users_email_key" || constraint === "email") {
        throw new AuthError(409, "Email already exists");
      } else if (constraint === "users_username_key" || constraint === "username") {
        throw new AuthError(409, "Username already exists");
      } else if (constraint === "users_ea_api_key_key" || constraint === "ea_api_key") {
        throw new AuthError(409, "EA API key already exists");
      }
      // Fallback for other unique constraints
      throw new AuthError(409, "A record with this information already exists");
    }
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
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user) throw new AuthError(404, "User not found");
  await deleteRefreshSession(refreshToken);
  const newRefresh = await createRefreshToken();
  await createRefreshSession(
    user.id,
    newRefresh,
    session.userAgent ?? null,
    session.ipAddress ?? null,
  );
  const accessToken = await createAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  return { accessToken, refreshToken: newRefresh };
}
