import { H3Event, getHeader, createError } from "h3";
import { verifyAccessToken, JwtPayload, hashToken } from "./index";
import { getUserByApiKey } from "../db/queries";
import type { User } from "../db/schema";

export async function requireAuth(event: H3Event): Promise<JwtPayload> {
  const authHeader = getHeader(event, "authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw createError({ statusCode: 401, message: "Missing or invalid Authorization header" });
  }
  const token = authHeader.slice(7).trim();
  const payload = await verifyAccessToken(token);
  if (!payload) {
    throw createError({ statusCode: 401, message: "Invalid or expired token" });
  }
  event.context.authUser = payload;
  return payload;
}

export async function requireEaAuth(event: H3Event): Promise<User> {
  const apiKey = getHeader(event, "x-ea-api-key");
  if (!apiKey) {
    throw createError({ statusCode: 401, message: "Missing X-EA-API-Key header" });
  }
  const hashedApiKey = await hashToken(apiKey);
  const user = await getUserByApiKey(hashedApiKey);
  if (!user || user.role !== "ea") {
    throw createError({ statusCode: 401, message: "Invalid or missing EA API key" });
  }
  event.context.eaUser = user;
  return user;
}
