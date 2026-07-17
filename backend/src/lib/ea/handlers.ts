import { z } from "zod";
import { createFibLevel, type FibLevelInput } from "../db/queries";
import type { FibFamily, FibTimeframe } from "../db/schema";

const VALID_RATIOS = [-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300];

const levelEntrySchema = z.object({ ratio: z.number(), price: z.number() });
const tfEntrySchema = z.object({
  timeframe: z.enum(["M15", "H1", "H4", "D1"]),
  ltf_sf: z.array(levelEntrySchema).default([]),
  htf_af: z.array(levelEntrySchema).default([]),
});
const fibLevelSchema = z.object({
  symbol: z.string().min(1).max(24),
  levels: z.array(tfEntrySchema),
  calculatedAt: z.string().datetime().optional(),
});

export class EaEndpointError extends Error {
  constructor(public statusCode: number, message: string, public data?: unknown) {
    super(message);
    this.name = "EaEndpointError";
  }
}

export async function submitEaFibLevels(eaApiKey: string, rawBody: unknown) {
  const parsed = fibLevelSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new EaEndpointError(400, "Invalid payload", parsed.error.flatten());
  }
  const { symbol, levels, calculatedAt } = parsed.data;
  const sym = symbol.toUpperCase();
  let inserted = 0;
  let failed = 0;

  for (const tfEntry of levels) {
    const families: Array<[FibFamily, { ratio: number; price: number }[]]> = [
      ["LTF_SF", tfEntry.ltf_sf ?? []],
      ["HTF_AF", tfEntry.htf_af ?? []],
    ];

    // Collect all valid levels for this timeframe into one deduplicated batch.
    // Duplicate (family, ratio) pairs collapse to a single row via the Map key.
    const batchMap = new Map<string, FibLevelInput>();
    for (const [family, entries] of families) {
      for (const { ratio, price } of entries) {
        if (!VALID_RATIOS.includes(ratio)) {
          failed++;
          continue;
        }
        const key = `${family}:${ratio}`;
        batchMap.set(key, { family, ratio, price } as FibLevelInput);
      }
    }

    const batch = Array.from(batchMap.values());

    // Skip empty batches (all levels were invalid)
    if (batch.length === 0) {
      continue;
    }

    // Call createFibLevel once per timeframe with the entire batch. Count the
    // deduplicated rows actually written (batch.length), not the raw valid-entry
    // count, so levels_written is not overstated when duplicate (family, ratio)
    // pairs are submitted in one payload.
    try {
      await createFibLevel(
        eaApiKey,
        sym,
        tfEntry.timeframe as FibTimeframe,
        null,
        batch,
        calculatedAt ? new Date(calculatedAt) : undefined
      );
      inserted += batch.length;
    } catch {
      failed += batch.length;
    }
  }

  return { ok: failed === 0, symbol: sym, levels_written: inserted, levels_failed: failed };
}
