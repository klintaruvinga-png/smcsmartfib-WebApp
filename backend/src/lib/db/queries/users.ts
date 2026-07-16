/**
 * User query helpers for the SMC SuperFIB backend.
 *
 * Thin Drizzle wrappers around the `users` table. Passwords are stored as
 * bcrypt hashes in the `password_hash` column; this layer is used by the
 * custom-password auth path (distinct from Supabase auth.users). DB errors are
 * intentionally allowed to propagate to the caller.
 *
 * NOTE: `users.id` has a foreign key to Supabase `auth.users(id)`. In production
 * the auth user must pre-exist; in Phase 1 unit tests the db client is mocked so
 * the FK is never exercised.
 */
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { db } from "../index";
import { users } from "../schema";
import type { User, UserRole } from "../schema";

/**
 * Create a user profile row with a bcrypt-hashed password.
 * Generates a UUID for `id` (the column has no DB default).
 * Returns the inserted row.
 */
export async function createUser(
  email: string,
  password: string,
  role: UserRole = "user",
  eaApiKey?: string,
  username?: string
): Promise<User> {
  // Hash the plaintext password before persistence (cost factor 10).
  const passwordHash = await bcrypt.hash(password, 10);

  // `id` has no DB default, so generate one. Omit `eaApiKey` / `username` when
  // undefined so we don't insert a literal `undefined` (which Drizzle rejects).
  const values: {
    id: string;
    email: string;
    role: UserRole;
    passwordHash: string;
    eaApiKey?: string;
    username?: string;
  } = {
    id: randomUUID(),
    email,
    role,
    passwordHash,
  };
  if (eaApiKey !== undefined) {
    values.eaApiKey = eaApiKey;
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
 * Verify a plaintext password against a stored bcrypt hash.
 * Returns true if they match, false otherwise.
 */
export async function verifyUserPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
