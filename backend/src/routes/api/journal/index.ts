import { defineEventHandler, readBody, createError, setHeader, getQuery } from "h3";
import { requireAuth } from "../../../lib/auth/middleware";
import { insertTrade, listTrades } from "../../../lib/db/queries/journal";
import { insertTradeSchema } from "../../../lib/risk/schemas";

export default defineEventHandler(async (event) => {
  const payload = await requireAuth(event);
  if (!payload.sub) {
    throw createError({ statusCode: 401, message: "Invalid token: missing subject" });
  }
  setHeader(event, "Cache-Control", "no-store, no-cache, must-revalidate, private");

  if (event.method === "GET") {
    const status = (getQuery(event).status as string) as
      | "open"
      | "closed"
      | "cancelled"
      | undefined;
    return await listTrades(payload.sub, { status });
  }

  if (event.method === "POST") {
    const body = await readBody(event);
    const parsed = insertTradeSchema.safeParse(body);
    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        message: "Invalid trade payload",
        data: parsed.error.flatten(),
      });
    }
    return await insertTrade({
      userId: payload.sub,
      symbol: parsed.data.symbol,
      direction: parsed.data.direction,
      entryPrice: String(parsed.data.entryPrice),
      exitPrice: parsed.data.exitPrice !== undefined ? String(parsed.data.exitPrice) : undefined,
      lotSize: String(parsed.data.lotSize),
      pnl: parsed.data.pnl !== undefined ? String(parsed.data.pnl) : undefined,
      status: parsed.data.status,
      notes: parsed.data.notes,
    });
  }

  throw createError({ statusCode: 405, message: "Method not allowed" });
});
