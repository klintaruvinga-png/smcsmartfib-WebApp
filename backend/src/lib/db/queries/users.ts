/**
 * User query helpers for the SMC SuperFIB backend.
 *
 * Thin Drizzle wrappers around the `users` table. Passwords are stored as
 * PBKDF2 hashes in the `password_hash` column; this layer is used by the
 * custom-password auth path (distinct from Supabase auth.users). DB errors are
 * intentionally allowed to propagate to the caller.
 *
 * NOTE: `users.id` is a standalone UUID. The historical foreign key to
 * Supabase `auth.users(id)` was removed (see 003_drop_users_auth_fk.sql)
 * because this is a fully custom auth flow: passwords live in
 * `public.users.password_hash` and sessions are custom jose JWTs, so no
 * `auth.users` row is ever created or required.
 */
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../index";
import { users } from "../schema";
import type { User, UserRole, UserSettings } from "../schema";
import { hashToken, hashPassword, verifyPassword } from "../../auth/index";

export class SettingsError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "SettingsError";
  }
}

/**
 * Create a user profile row with a PBKDF2-hashed password.
 * If an id is provided, uses it (for Supabase auth FK compatibility).
 * Otherwise generates a UUID for `id` (the column has no DB default).
 * If an eaApiKey is provided, it is hashed before storage.
 * Returns the inserted row.
 */
export async function createUser(
  email: string,
  password: string,
  role: UserRole = "user",
  eaApiKey?: string,
  username?: string,
  id?: string
): Promise<User> {
  // Hash the plaintext password before persistence using edge-compatible PBKDF2.
  const passwordHash = await hashPassword(password);

  // Use provided id or generate one. Omit `eaApiKey` / `username` when
  // undefined so we don't insert a literal `undefined` (which Drizzle rejects).
  const values: {
    id: string;
    email: string;
    role: UserRole;
    passwordHash: string;
    eaApiKey?: string;
    username?: string;
  } = {
    id: id ?? randomUUID(),
    email,
    role,
    passwordHash,
  };
  if (eaApiKey !== undefined) {
    // Hash the API key before storing it
    values.eaApiKey = await hashToken(eaApiKey);
  }
  if (username !== undefined) {
    values.username = username;
  }

  const [row] = await db.insert(users).values(values).returning();
  return row;
}

/**
 * Find a user by their EA API key. Returns null if not found.
 */
export async function getUserByApiKey(eaApiKey: string): Promise<User | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.eaApiKey, eaApiKey));
  return row ?? null;
}

/**
 * Find a user by UUID. Returns null if not found.
 */
export async function getUserById(id: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row ?? null;
}

/**
 * Update a user's password hash by user ID.
 * Used to upgrade legacy bcrypt hashes to PBKDF2 after successful authentication.
 */
export async function updateUserPasswordHash(
  userId: string,
  newPasswordHash: string
): Promise<void> {
  await db
    .update(users)
    .set({ passwordHash: newPasswordHash })
    .where(eq(users.id, userId));
}

/**
 * Verify a plaintext password against a stored hash.
 * Supports both PBKDF2 and legacy bcrypt hashes.
 * Returns true if they match, false otherwise.
 */
export async function verifyUserPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return verifyPassword(plain, hash);
}

/**
 * Retrieve a user's structured settings (JSONB column).
 * Returns `{}` when the user or their settings are absent so callers always
 * receive a valid object.
 */
export async function getUserSettings(userId: string): Promise<UserSettings> {
  const [row] = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return (row?.settings ?? {}) as UserSettings;
}

/**
 * Patch a user's settings using JSONB `||` merge (atomic, no read-before-write
 * race). Only the supplied top-level keys are merged; existing keys are preserved.
 * Returns the full merged settings object. Throws SettingsError(404) if the
 * user row does not exist.
 */
export async function updateUserSettings(
  userId: string,
  settings: UserSettings
): Promise<UserSettings> {
  const [row] = await db
    .update(users)
    .set({
      settings: sql`COALESCE(${users.settings}, '{}'::jsonb) || ${JSON.stringify(settings)}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({ settings: users.settings });
  if (!row) throw new SettingsError(404, "User not found");
  return row.settings as UserSettings;
}
