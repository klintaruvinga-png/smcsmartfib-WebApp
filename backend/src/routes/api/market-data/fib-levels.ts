import { defineEventHandler, getQuery, createError, setHeader } from "h3";
import { requireAuth } from "../../../lib/auth/middleware";
import { fetchMarketData, MarketDataError } from "../../../lib/market-data/handlers";

export default defineEventHandler(async (event) => {
  const payload = await requireAuth(event);
  if (!payload.sub) {
    throw createError({ statusCode: 401, message: "Invalid token: missing subject" });
  }
  const query = getQuery(event);
  
  // Set anti-cache headers to prevent cross-user staleness
  setHeader(event, "Cache-Control", "no-store, no-cache, must-revalidate, private");
  setHeader(event, "Pragma", "no-cache");
  setHeader(event, "Expires", "0");
  
  try {
    return await fetchMarketData(payload.sub, query);
  } catch (err) {
    if (err instanceof MarketDataError) {
      throw createError({ statusCode: err.statusCode, message: err.message, data: err.data });
    }
    throw err;
  }
});
