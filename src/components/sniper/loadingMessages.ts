/**
 * Shared quirky loading message pool used by TradingLoadingScreen and PlanBoardSkeleton.
 * Both components draw from the same source so the personality is consistent across phases.
 */
export const QUIRKY_LOADING_MESSAGES = [
  "Dodging fakeouts...",
  "Counting pips like rent is due...",
  "Checking if that breakout was lying...",
  "Sniffing out liquidity...",
  "Trying not to FOMO...",
  "Asking the candles to behave...",
  "Convincing the market to stop playing games...",
  "Checking if the broker is awake...",
  "Finding stops so we do not become liquidity...",
  "Checking if that wick was personal...",
  "Separating signal from noise...",
  "Measuring risk before the market gets dramatic...",
  "Polishing the plan cards...",
  "Looking for clean entries...",
] as const;

export const ALL_LOADING_MESSAGES = [
  "Lighting candles...",
  "Calibrating Fibonacci wizardry...",
  "Scanning for liquidity voids...",
  "Checking backend readiness...",
  "Building your signal board...",
  "Waiting for backend confirmation...",
  ...QUIRKY_LOADING_MESSAGES,
] as const;

/**
 * Returns a random index that is guaranteed to differ from the current one.
 * Used by both loading components to avoid repeating the same message twice.
 */
export function nextRandomIndex(currentIndex: number, total: number): number {
  if (total <= 1) return 0;
  let next = currentIndex;
  while (next === currentIndex) {
    next = Math.floor(Math.random() * total);
  }
  return next;
}
