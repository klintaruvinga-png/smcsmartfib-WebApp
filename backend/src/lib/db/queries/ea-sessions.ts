/**
 * EA session persistence queries.
 *
 * Tracks live connections from the Expert Advisor (EA) client. Each row
 * represents one EA connection/heartbeat session scoped to a user via their
 * `ea_api_key`. Rows rely on DB defaults for `id`, `connected_at`, `last_ping`,
 * and `status` (`connected`).
 */
import { eq, desc, and } from "drizzle-orm";
import { db } from "../index";
import { users, eaSessions } from "../schema";
import type { EaSession, EaSessionStatus } from "../schema";

/**
 * Create an EA connection/heartbeat session row (status defaults to 'connected').
 * Resolves userId from the EA API key (rows are scoped per-user). Returns the row.
 */
export async function createEaSession(
  eaApiKey: string,
  ip: string | null,
  userAgent: string | null
): Promise<EaSession> {
  // Resolve the owning user from the EA API key.
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.eaApiKey, eaApiKey));
  if (!u) throw new Error("No user found for EA API key");

  // Omit id / connectedAt / lastPing / status — those use DB defaults.
  const [row] = await db
    .insert(eaSessions)
    .values({
      eaApiKey,
      userId: u.id,
      ipAddress: ip,
      userAgent,
      status: "connected",
    })
    .returning();
  return row;
}

/**
 * Heartbeat: bump last_ping to now and ensure status='connected' for the EA's
 * sessions.
 */
export async function updateEaSessionPing(eaApiKey: string): Promise<void> {
  // Updates all of the key's sessions; acceptable for a heartbeat signal.
  await db
    .update(eaSessions)
    .set({ lastPing: new Date(), status: "connected" })
    .where(eq(eaSessions.eaApiKey, eaApiKey));
}

/**
 * Return the EA's currently-active (status='connected') sessions, newest ping
 * first.
 */
export async function getActiveEaSessions(
  eaApiKey: string
): Promise<EaSession[]> {
  return db
    .select()
    .from(eaSessions)
    .where(
      and(
        eq(eaSessions.eaApiKey, eaApiKey),
        eq(eaSessions.status, "connected")
      )
    )
    .orderBy(desc(eaSessions.lastPing));
}

// Re-export the status type for callers that branch on session state.
export type { EaSession, EaSessionStatus };
