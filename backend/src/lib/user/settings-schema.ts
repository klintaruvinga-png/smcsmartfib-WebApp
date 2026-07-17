/**
 * Validation schemas for the user settings endpoint (BACKEND-1).
 * Mirrors the `UserSettings` shape defined in `lib/db/schema.ts`.
 * Every field is optional so clients may PATCH a subset of preferences
 * without resending the entire object.
 */
import { z } from "zod";

export const notificationSettingsSchema = z
  .object({
    email: z.boolean().optional(),
    push: z.boolean().optional(),
    tradeAlerts: z.boolean().optional(),
  })
  .partial();

export const riskSettingsSchema = z
  .object({
    maxRiskPercent: z.number().min(0).max(100).optional(),
    defaultLotSize: z.number().min(0).optional(),
    riskRewardRatio: z.number().min(0).optional(),
  })
  .partial();

export const userSettingsSchema = z
  .object({
    notifications: notificationSettingsSchema.optional(),
    theme: z.enum(["light", "dark", "system"]).optional(),
    watchlist: z.array(z.string()).optional(),
    risk: riskSettingsSchema.optional(),
  })
  .partial();

export type UserSettingsInput = z.infer<typeof userSettingsSchema>;
