import { defineEventHandler, readBody, createError, setHeader } from "h3";
import { requireAuth } from "../../../lib/auth/middleware";
import { getRiskLimits, upsertRiskLimits } from "../../../lib/db/queries/risk";
import { riskLimitsSchema } from "../../../lib/risk/schemas";

export default defineEventHandler(async (event) => {
  const payload = await requireAuth(event);
  if (!payload.sub) {
    throw createError({ statusCode: 401, message: "Invalid token: missing subject" });
  }
  setHeader(event, "Cache-Control", "no-store, no-cache, must-revalidate, private");

  if (event.method === "GET") {
    return (await getRiskLimits(payload.sub)) ?? null;
  }

  if (event.method === "POST" || event.method === "PUT" || event.method === "PATCH") {
    const body = await readBody(event);
    const parsed = riskLimitsSchema.safeParse(body);
    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        message: "Invalid risk limits payload",
        data: parsed.error.flatten(),
      });
    }
    const patch: Record<string, unknown> = {};
    if (parsed.data.dailyLossLimit !== undefined) patch.dailyLossLimit = String(parsed.data.dailyLossLimit);
    if (parsed.data.maxOpenPositions !== undefined) patch.maxOpenPositions = String(parsed.data.maxOpenPositions);
    if (parsed.data.maxPositionSize !== undefined) patch.maxPositionSize = String(parsed.data.maxPositionSize);
    if (parsed.data.maxPerSymbolExposure !== undefined) patch.maxPerSymbolExposure = String(parsed.data.maxPerSymbolExposure);
    return await upsertRiskLimits(payload.sub, patch as any);
  }

  throw createError({ statusCode: 405, message: "Method not allowed" });
});
