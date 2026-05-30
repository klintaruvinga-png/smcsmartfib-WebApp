import type { EngineBlocker, FreshnessState, SignalCandidate } from "../types/index.js";

export function isLive(state: FreshnessState): boolean {
  return state === "live";
}

export function isStale(state: FreshnessState): boolean {
  return state === "stale";
}

export function isUnavailable(state: FreshnessState): boolean {
  return state === "unavailable" || state === "offline";
}

export function isBlocked(state: FreshnessState): boolean {
  return state === "blocked";
}

export function isMock(state: FreshnessState): boolean {
  return state === "mock";
}

export function isPendingSync(state: FreshnessState): boolean {
  return state === "pending-sync";
}

/** True if the data is usable for decision-making (live or stale but not absent). */
export function isUsable(state: FreshnessState): boolean {
  return state === "live" || state === "stale" || state === "mock";
}

/** Human-readable label for a freshness state. */
export function freshnessLabel(state: FreshnessState): string {
  const labels: Record<FreshnessState, string> = {
    live: "Live",
    stale: "Stale",
    unavailable: "Unavailable",
    blocked: "Blocked",
    offline: "Offline",
    "pending-sync": "Syncing",
    mock: "Mock",
  };
  return labels[state] ?? state;
}

/** Semantic colour hint for a freshness state (for use with CSS variables or Tailwind). */
export function freshnessColor(
  state: FreshnessState,
): "green" | "yellow" | "red" | "gray" | "blue" {
  switch (state) {
    case "live":
      return "green";
    case "stale":
    case "pending-sync":
      return "yellow";
    case "blocked":
    case "unavailable":
    case "offline":
      return "red";
    case "mock":
      return "blue";
    default:
      return "gray";
  }
}

/** True if a signal is ready to be acted on (READY status, backend confirmed). */
export function isSignalActionable(signal: SignalCandidate): boolean {
  return signal.status === "READY" && signal.backendConfirmed;
}

/** True if an engine blocker prevents execution. */
export function isEngineBlocked(blocker: EngineBlocker | undefined): boolean {
  return blocker !== undefined && blocker !== "OK";
}

/** Human-readable label for an engine blocker. */
export function blockerLabel(blocker: EngineBlocker): string {
  const labels: Partial<Record<EngineBlocker, string>> = {
    KEY_MISSING: "API key missing",
    KEY_INVALID: "API key invalid",
    RATE_LIMITED: "Rate limited",
    QUOTE_UNAVAILABLE: "Quote unavailable",
    PRICE_STALE: "Price stale",
    PRICE_NOT_MT5_FRESH: "MT5 price not fresh",
    CANDLES_MISSING: "Candles missing",
    CANDLES_STALE: "Candles stale",
    INSUFFICIENT_CANDLE_HISTORY: "Insufficient candle history",
    READY_NOT_CONFIRMED_STALE_DATA: "Ready signal on stale data",
    CHOP_GATE_BLOCKED: "Chop gate blocked",
    AOV_EQUILIBRIUM_ZONE: "AOV equilibrium zone",
    OK: "OK",
  };
  return labels[blocker] ?? blocker;
}
