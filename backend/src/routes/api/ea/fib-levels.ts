import { defineEventHandler, readBody, createError } from "h3";
import { requireEaAuth } from "../../../lib/auth/middleware";
import { submitEaFibLevels, EaEndpointError } from "../../../lib/ea/handlers";

export default defineEventHandler(async (event) => {
  const eaUser = await requireEaAuth(event);
  const body = await readBody(event);
  try {
    return await submitEaFibLevels(eaUser.eaApiKey as string, body);
  } catch (err) {
    if (err instanceof EaEndpointError) {
      throw createError({ statusCode: err.statusCode, message: err.message, data: err.data });
    }
    throw err;
  }
});
