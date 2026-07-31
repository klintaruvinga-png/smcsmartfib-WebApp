import { defineEventHandler, readBody, getHeader, getRequestIP, createError } from "h3";
import { registerUser, AuthError } from "../../../lib/auth/handlers";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    if (!body || typeof body !== "object") {
      throw createError({ statusCode: 400, message: "Request body is required" });
    }
    const { email, password, username } = body;
    return await registerUser(email, password, username, {
      userAgent: getHeader(event, "user-agent"),
      ipAddress: getRequestIP(event) ?? null,
    });
  } catch (err) {
    if (err instanceof AuthError)
      throw createError({ statusCode: err.statusCode, message: err.message });
    throw err;
  }
});
