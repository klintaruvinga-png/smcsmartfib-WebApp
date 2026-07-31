import { defineEventHandler, getHeader, createError } from "h3";
import { requireEaAuth } from "../../../lib/auth/middleware";

export default defineEventHandler(async (event) => {
  await requireEaAuth(event);
  const clientVersion = getHeader(event, "x-ea-version") ?? "unknown";
  return {
    status: "approved",
    allowed: true,
    backend: "smc-superfib-backend",
    eaVersion: clientVersion,
    timestamp: new Date().toISOString(),
  };
});
