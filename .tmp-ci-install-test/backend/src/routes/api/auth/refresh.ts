import { defineEventHandler, readBody, createError } from "h3";
import { refreshAccessToken, AuthError } from "../../../lib/auth/handlers";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    if (!body || typeof body !== "object") {
      throw createError({ statusCode: 400, message: "Request body is required" });
    }
    const { refreshToken } = body;
    return await refreshAccessToken(refreshToken);
  } catch (err) {
    if (err instanceof AuthError)
      throw createError({ statusCode: err.statusCode, message: err.message });
    throw err;
  }
});
