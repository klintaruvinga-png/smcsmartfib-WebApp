import { defineEventHandler, readBody, createError } from "h3";
import { refreshAccessToken, AuthError } from "../../../lib/auth/handlers";

export default defineEventHandler(async (event) => {
  const { refresh_token } = (await readBody(event)) ?? {};
  try {
    return await refreshAccessToken(refresh_token);
  } catch (err) {
    if (err instanceof AuthError)
      throw createError({ statusCode: err.statusCode, message: err.message });
    throw err;
  }
});
