import { db } from "../index";
import { refreshSessions } from "../schema";
import { eq, and, gt } from "drizzle-orm";
import { hashToken, REFRESH_TOKEN_EXPIRY_MS } from "../../auth";

export async function createRefreshSession(
  userId: string,
  token: string,
  userAgent?: string | null,
  ipAddress?: string | null,
) {
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);
  const [session] = await db
    .insert(refreshSessions)
    .values({ userId, tokenHash, expiresAt, userAgent, ipAddress })
    .returning();
  return session;
}

export async function validateRefreshSession(token: string) {
  const tokenHash = await hashToken(token);
  const [session] = await db
    .select()
    .from(refreshSessions)
    .where(and(eq(refreshSessions.tokenHash, tokenHash), gt(refreshSessions.expiresAt, new Date())))
    .limit(1);
  return session ?? null;
}

export async function deleteRefreshSession(token: string) {
  const tokenHash = await hashToken(token);
  await db.delete(refreshSessions).where(eq(refreshSessions.tokenHash, tokenHash));
}

export async function deleteAllUserSessions(userId: string) {
  await db.delete(refreshSessions).where(eq(refreshSessions.userId, userId));
}
