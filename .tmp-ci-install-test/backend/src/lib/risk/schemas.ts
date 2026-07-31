/**
 * Zod validation schemas for SMC-06 journal + risk endpoints.
 */
import { z } from "zod";

export const tradeDirectionSchema = z.enum(["long", "short"]);
export const tradeStatusSchema = z.enum(["open", "closed", "cancelled"]);

export const insertTradeSchema = z.object({
  symbol: z.string().min(1).max(24),
  direction: tradeDirectionSchema,
  entryPrice: z.number().positive(),
  exitPrice: z.number().positive().optional(),
  lotSize: z.number().positive(),
  pnl: z.number().optional(),
  status: tradeStatusSchema.optional(),
  notes: z.string().max(2000).optional(),
});

export const updateTradeSchema = insertTradeSchema.partial().extend({
  closedAt: z.string().datetime().optional(),
});

export const riskLimitsSchema = z.object({
  dailyLossLimit: z.number().min(0).optional(),
  maxOpenPositions: z.number().int().min(1).optional(),
  maxPositionSize: z.number().min(0).optional(),
  maxPerSymbolExposure: z.number().min(0).optional(),
});

export const evaluateTradeSchema = z.object({
  symbol: z.string().min(1).max(24),
  direction: tradeDirectionSchema,
  lotSize: z.number().positive(),
  estimatedRisk: z.number().min(0).optional(),
});

export type InsertTradeInput = z.infer<typeof insertTradeSchema>;
export type UpdateTradeInput = z.infer<typeof updateTradeSchema>;
export type RiskLimitsInput = z.infer<typeof riskLimitsSchema>;
export type EvaluateTradeInput = z.infer<typeof evaluateTradeSchema>;
