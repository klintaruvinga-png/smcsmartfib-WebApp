export {
  FOREX_PAIRS,
  METALS,
  INDICES,
  CRYPTO,
  ALL_KNOWN_SYMBOLS,
  DEFAULT_WATCHLIST,
  isKnownSymbol,
  isJpyPair,
  isCrypto,
  isMetal,
} from "./symbols.js";

export {
  TRADING_SESSIONS,
  activeSession,
  currentSessionName,
} from "./sessions.js";

export type { TradingSession } from "./sessions.js";

/** REST API namespace prefix (relative to WP root). */
export const API_NAMESPACE = "/wp-json/sniper/v1";

/** Default backend URL. */
export const DEFAULT_BACKEND_URL = "https://trader.stokvelsociety.co.za/wp-json";

/** Default dashboard refresh interval in seconds. */
export const DEFAULT_REFRESH_INTERVAL_SEC = 2;

/** Default stale threshold in seconds. */
export const DEFAULT_STALE_THRESHOLD_SEC = 10;

/** Verdict ranking — higher index = higher quality. */
export const VERDICT_RANK: Record<string, number> = {
  "A+": 3,
  A: 2,
  B: 1,
  C: 0,
};

/** Signal status progression — higher index = closer to execution. */
export const SIGNAL_STATUS_RANK: Record<string, number> = {
  WATCH: 0,
  ARMED: 1,
  READY: 2,
};
