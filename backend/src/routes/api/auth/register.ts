import { defineEventHandler, readBody, getHeader, getRequestIP, createError } from "h3";
import { registerUser, AuthError } from "../../../lib/auth/handlers";

export default defineEventHandler(async (event) => {
  const { email, password, username } = (await readBody(event)) ?? {};
  try {
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
