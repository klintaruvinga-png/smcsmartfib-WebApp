import { defineEventHandler, readBody, createError, setHeader } from "h3";
import { requireAuth } from "../../../lib/auth/middleware";
import {
  getUserSettings,
  updateUserSettings,
  SettingsError,
} from "../../../lib/db/queries/users";
import { userSettingsSchema } from "../../../lib/user/settings-schema";
import type { UserSettings } from "../../../lib/db/schema";

export default defineEventHandler(async (event) => {
  const payload = await requireAuth(event);
  if (!payload.sub) {
    throw createError({ statusCode: 401, message: "Invalid token: missing subject" });
  }

  // Prevent cross-user staleness of cached preferences.
  setHeader(event, "Cache-Control", "no-store, no-cache, must-revalidate, private");
  setHeader(event, "Pragma", "no-cache");
  setHeader(event, "Expires", "0");

  try {
    if (event.method === "GET") {
      return await getUserSettings(payload.sub);
    }

    if (event.method === "PUT" || event.method === "POST") {
      const body = await readBody(event);
      const parsed = userSettingsSchema.safeParse(body);
      if (!parsed.success) {
        throw createError({
          statusCode: 400,
          message: "Invalid settings payload",
          data: parsed.error.flatten(),
        });
      }
      return await updateUserSettings(payload.sub, parsed.data as UserSettings);
    }

    throw createError({ statusCode: 405, message: "Method not allowed" });
  } catch (err) {
    if (err instanceof SettingsError) {
      throw createError({ statusCode: err.statusCode, message: err.message });
    }
    throw err;
  }
});
