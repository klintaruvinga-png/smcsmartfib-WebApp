import { defineEventHandler, readBody, getHeader, getRequestIP, createError } from "h3";
import { loginUser, AuthError } from "../../../lib/auth/handlers";

export default defineEventHandler(async (event) => {
  const { email, password } = await readBody(event);
  try {
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
