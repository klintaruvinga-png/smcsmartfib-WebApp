import { defineEventHandler, getQuery, createError } from "h3";
import { requireAuth } from "../../../lib/auth/middleware";
import { fetchMarketData, MarketDataError } from "../../../lib/market-data/handlers";

export default defineEventHandler(async (event) => {
  const payload = await requireAuth(event);
  const query = getQuery(event);
  try {
    return await fetchMarketData(payload.sub, query);
  } catch (err) {
    if (err instanceof MarketDataError) {
      throw createError({ statusCode: err.statusCode, message: err.message, data: err.data });
    }
    throw err;
  }
});
