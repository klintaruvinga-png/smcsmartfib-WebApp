export type FreshnessState =
  | "live"
  | "stale"
  | "unavailable"
  | "blocked"
  | "offline"
  | "pending-sync"
  | "mock";

// All instruments in the spec registry. Extend here as new instruments are added.
export type Symbol =
  // FOREX — USD quoted
  | "GBPUSD" | "AUDUSD" | "EURUSD" | "NZDUSD"
  // FOREX — JPY quoted
  | "USDJPY" | "AUDJPY" | "EURJPY" | "GBPJPY" | "NZDJPY" | "CADJPY" | "CHFJPY"
  // FOREX — USD-base, non-USD quote
  | "USDCAD" | "USDCHF"
  // FOREX — cross pairs
  | "EURGBP" | "EURAUD" | "EURNZD" | "EURCHF" | "EURCAD"
  | "GBPAUD" | "GBPNZD" | "GBPCAD" | "GBPCHF"
  | "AUDNZD" | "AUDCAD" | "AUDCHF" | "NZDCAD" | "NZDCHF" | "CADCHF"
  // METALS
  | "XAUUSD" | "XAGUSD"
  // INDICES
  | "US30" | "NAS100"
  // CRYPTO
  | "BTCUSD" | "ETHUSD";

export type InstrumentType = "forex" | "metal" | "index" | "crypto";

export interface InstrumentSpec {
  type: InstrumentType;
  pip_size: number;          // price units per 1 pip
  contract_size: number;     // units per 1.0 standard lot
  quote: string;             // ISO 4217 quote currency (e.g. "USD", "JPY")
  min_stop_pips: number;     // minimum stop-loss distance in pips
  user_overrideable: boolean;// user can adjust contract_size/pip_size for their broker
}

export interface PairPrice {
  symbol: Symbol;
  bid: number;
  ask: number;
  mid: number;
  changePct1d: number;
  updatedAt: string;
  state: FreshnessState;
}

export interface RegimeState {
  symbol: Symbol;
  bias: "BULL" | "BEAR" | "RANGING";
  chop: number; // 0..1
  nearestFib: number | null;
  updatedAt: string;
  state: FreshnessState;
}

export interface GateState {
  symbol: Symbol;
  allow: "BUY" | "SELL" | "BOTH" | "BLOCKED";
  reason?: string;
  state: FreshnessState;
}

export type SignalStatus = "WATCH" | "ARMED" | "READY" | "EXPIRED" | "BLOCKED";
export type Verdict = "A+" | "A" | "B" | "C";

export interface SignalCandidate {
  id: string;
  symbol: Symbol;
  direction: "LONG" | "SHORT";
  status: SignalStatus;
  confluence: string[];
  verdict: Verdict;
  computedBy: "frontend" | "backend";
  backendConfirmed: boolean;
  createdAt: string;
}

export interface TradePlanStage {
  entry: number | null;
  lot: number;
  riskAmount: number;  // in account_currency
  currency: string;    // ISO 4217
  slPips: number;
}

export interface TradePlan {
  signalId: string;
  entries: { e1: number; e2: number; e3: number };
  sl: number;
  tps: { tp1: number; tp2: number; tp3: number };
  rr: { tp1: number; tp2: number; tp3: number };
  lotSize: { e1: number; e2: number; e3: number };
  riskAmount: number;     // total risk in account_currency
  currency: string;       // ISO 4217 (e.g. "USD", "ZAR")
  drawdownImpactPct: number;
  source: "frontend-preview" | "backend-blueprint";
}

export interface Position {
  id: string;
  symbol: Symbol;
  direction: "LONG" | "SHORT";
  entry: number;
  current: number;
  lots: number;
  pnlAmount: number;  // in account_currency
  currency: string;
  pnlPct: number;
  openedAt: string;
  state: FreshnessState;
}

export interface PendingOrder {
  id: string;
  symbol: Symbol;
  direction: "LONG" | "SHORT";
  type: "LIMIT" | "STOP";
  price: number;
  lots: number;
  sl: number;
  tp: number;
  placedAt: string;
  state: FreshnessState;
}

export interface EngineHealth {
  backendSync: FreshnessState;
  priceFeed: FreshnessState;
  twelveDataKey: "present" | "missing";
  lastBatchAt: string | null;
  lastEngineRunAt: string | null;
}

export interface InstrumentOverride {
  contract_size?: number;
  pip_size?: number;
}

export interface DashboardSettings {
  backendUrl: string;
  apiKeyStatus: "ok" | "missing" | "invalid";
  refreshIntervalSec: number;
  staleThresholdSec: number;
  watchlist: Symbol[];
  riskAllocation: { perTradePct: number; dailyMaxPct: number; ddCapPct: number };
}

export interface RiskProfile {
  // Account currency configuration
  accountCurrency: string;        // ISO 4217: "USD" | "GBP" | "EUR" | "ZAR" | …
  usdToAccountRate: number;       // how many account-currency units equal 1 USD (1.0 for USD)
  instrumentOverrides: Record<string, InstrumentOverride>; // per-user broker adjustments
  // Risk parameters
  tier: "conservative" | "balanced" | "aggressive";
  maxConcurrentTrades: number;
  perTradePct: number;
  dailyMaxPct: number;
  ddCapPct: number;
  cooldownMin: number;
  updatedAt: string;
}

export interface AccountState {
  balance: number;      // in accountCurrency
  equity: number;       // in accountCurrency
  currency: string;     // ISO 4217
  marginUsedPct: number;
  drawdownPct: number;
  openPositions: number;
  pendingOrders: number;
  pnlToday: number;     // in accountCurrency
  pnlTodayPct: number;
  state: FreshnessState;
}
