/**
 * GET /api/health — Phase 0 acceptance check.
 * Returns { status: "ok" } so `curl localhost:3000/api/health` validates the
 * Nitro dev server is serving the API.
 */
import { defineEventHandler } from "h3";

export default defineEventHandler(() => {
  return {
    status: "ok",
    service: "smc-superfib-backend",
    timestamp: new Date().toISOString(),
  };
});
