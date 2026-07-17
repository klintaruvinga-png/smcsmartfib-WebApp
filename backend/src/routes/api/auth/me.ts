import { defineEventHandler, createError } from "h3";
import { requireAuth } from "../../../lib/auth/middleware";
import { getMeUser, AuthError } from "../../../lib/auth/handlers";

export default defineEventHandler(async (event) => {
  const payload = await requireAuth(event);
  try {
    return await getMeUser(payload.sub);
  } catch (err) {
    if (err instanceof AuthError)
      throw createError({ statusCode: err.statusCode, message: err.message });
    throw err;
  }
});
