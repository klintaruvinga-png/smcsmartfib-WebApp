import { defineEventHandler, readBody, createError, setHeader, getRouterParam } from "h3";
import { requireAuth } from "../../../lib/auth/middleware";
import {
  getTrade,
  updateTrade,
  deleteTrade,
} from "../../../lib/db/queries/journal";
import { updateTradeSchema } from "../../../lib/risk/schemas";

export default defineEventHandler(async (event) => {
  const payload = await requireAuth(event);
  if (!payload.sub) {
    throw createError({ statusCode: 401, message: "Invalid token: missing subject" });
  }
  setHeader(event, "Cache-Control", "no-store, no-cache, must-revalidate, private");

  const id = Number(getRouterParam(event, "id"));
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, message: "Invalid trade id" });
  }

  if (event.method === "GET") {
    const trade = await getTrade(payload.sub, id);
    if (!trade) throw createError({ statusCode: 404, message: "Trade not found" });
    return trade;
  }

  if (event.method === "PUT" || event.method === "PATCH") {
    const body = await readBody(event);
    const parsed = updateTradeSchema.safeParse(body);
    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        message: "Invalid trade update",
        data: parsed.error.flatten(),
      });
    }
    const patch: Record<string, unknown> = {};
    if (parsed.data.symbol !== undefined) patch.symbol = parsed.data.symbol;
    if (parsed.data.direction !== undefined) patch.direction = parsed.data.direction;
    if (parsed.data.entryPrice !== undefined) patch.entryPrice = String(parsed.data.entryPrice);
    if (parsed.data.exitPrice !== undefined) patch.exitPrice = String(parsed.data.exitPrice);
    if (parsed.data.lotSize !== undefined) patch.lotSize = String(parsed.data.lotSize);
    if (parsed.data.pnl !== undefined) patch.pnl = String(parsed.data.pnl);
    if (parsed.data.status !== undefined) patch.status = parsed.data.status;
    if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;
    if (parsed.data.closedAt !== undefined) patch.closedAt = new Date(parsed.data.closedAt);
    const updated = await updateTrade(payload.sub, id, patch as any);
    if (!updated) throw createError({ statusCode: 404, message: "Trade not found" });
    return updated;
  }

  if (event.method === "DELETE") {
    const ok = await deleteTrade(payload.sub, id);
    if (!ok) throw createError({ statusCode: 404, message: "Trade not found" });
    return { deleted: true };
  }

  throw createError({ statusCode: 405, message: "Method not allowed" });
});
