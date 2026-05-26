import type { FibLevel, FibRole } from "../types/index.js";

/**
 * The canonical 16-ratio set used by the backend Fibonacci engine.
 * Must stay in sync with ratio_label / fib_role PHP functions.
 */
export const FIB_RATIOS = [
  -200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300,
] as const;

export type FibRatio = (typeof FIB_RATIOS)[number];

/** Return the semantic role for a Fibonacci ratio. */
export function fibRole(ratio: number): FibRole {
  if (ratio < 0) return "premium-extension";
  if (ratio > 100) return "discount-extension";
  if (ratio < 50) return "premium";
  if (ratio === 50) return "equilibrium";
  return "discount";
}

/** Return the display label for a ratio (e.g. 62.5 → "62.5%"). */
export function fibLabel(ratio: number): string {
  return `${ratio}%`;
}

/**
 * Calculate the price at a given ratio between two anchor prices.
 *
 * @param high  Anchor high price (0% in LTF_SF convention)
 * @param low   Anchor low price (100% in LTF_SF convention)
 * @param ratio Fibonacci ratio percentage (e.g. 61.8 for 0.618)
 */
export function fibPriceAtRatio(high: number, low: number, ratio: number): number {
  const range = high - low;
  return high - (ratio / 100) * range;
}

/**
 * Find the nearest Fibonacci level to a given price.
 * Returns null when the levels array is empty.
 */
export function nearestFibLevel(price: number, levels: FibLevel[]): FibLevel | null {
  if (!levels.length) return null;
  let nearest = levels[0];
  let minDist = Math.abs(price - nearest.price);
  for (let i = 1; i < levels.length; i++) {
    const dist = Math.abs(price - levels[i].price);
    if (dist < minDist) {
      minDist = dist;
      nearest = levels[i];
    }
  }
  return nearest;
}

/**
 * Filter Fibonacci levels to only those within a given distance (in price) of a target.
 */
export function fibLevelsNear(price: number, levels: FibLevel[], threshold: number): FibLevel[] {
  return levels.filter((l) => Math.abs(l.price - price) <= threshold);
}

/**
 * Determine which P/D zone a price sits in given a set of Fibonacci levels.
 *
 * Returns:
 *  - "PREMIUM"           ratio < 50 zone (above equilibrium)
 *  - "EQUILIBRIUM"       within ±3 ratio points of 50%
 *  - "DISCOUNT"          ratio > 50 zone (below equilibrium)
 *  - "EXTENDED_PREMIUM"  ratio < 0 (above the swing high)
 *  - "EXTENDED_DISCOUNT" ratio > 100 (below the swing low)
 *  - null                if no equilibrium level can be found
 */
export function pdZone(
  price: number,
  levels: FibLevel[],
): "PREMIUM" | "EQUILIBRIUM" | "DISCOUNT" | "EXTENDED_PREMIUM" | "EXTENDED_DISCOUNT" | null {
  const eq = levels.find((l) => l.ratio === 50);
  const top = levels.find((l) => l.ratio === 0);
  const bot = levels.find((l) => l.ratio === 100);

  if (!eq || !top || !bot) return null;

  const eqBand = Math.abs(top.price - bot.price) * 0.03;

  if (Math.abs(price - eq.price) <= eqBand) return "EQUILIBRIUM";
  if (price > top.price) return "EXTENDED_PREMIUM";
  if (price < bot.price) return "EXTENDED_DISCOUNT";
  if (price > eq.price) return "PREMIUM";
  return "DISCOUNT";
}
