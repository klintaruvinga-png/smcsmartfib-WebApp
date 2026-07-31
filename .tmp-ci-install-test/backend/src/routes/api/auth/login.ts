import { defineEventHandler, readBody, getHeader, getRequestIP, createError } from "h3";
import { loginUser, AuthError } from "../../../lib/auth/handlers";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    if (!body || typeof body !== "object") {
      throw createError({ statusCode: 400, message: "Request body is required" });
    }
    const { email, password } = body;
    return await loginUser(email, password, {
      userAgent: getHeader(event, "user-agent"),
      ipAddress: getRequestIP(event) ?? null,
    });
  } catch (err) {
    if (err instanceof AuthError)
      throw createError({ statusCode: err.statusCode, message: err.message });
    throw err;
  }
});
