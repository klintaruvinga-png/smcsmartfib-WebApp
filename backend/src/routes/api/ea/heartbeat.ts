import { defineEventHandler, readBody, createError } from "h3";
import { requireEaAuth } from "../../../lib/auth/middleware";
import { updateEaSessionPing } from "../../../lib/db/queries";

export default defineEventHandler(async (event) => {
  const eaUser = await requireEaAuth(event);

  try {
    const body = await readBody(event);
    if (
      body &&
      typeof body === "object" &&
      typeof (body as Record<string, unknown>).status === "string"
    ) {
      const status = (body as Record<string, unknown>).status as string;
      if (!["connected", "disconnected", "error"].includes(status)) {
        throw createError({ statusCode: 400, message: "Invalid status" });
      }
    }
  } catch {
    // ignore parse issues; heartbeat only requires auth
  }

  await updateEaSessionPing(eaUser.eaApiKey as string);

  return { ok: true };
});
