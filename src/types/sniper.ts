export type FreshnessState =
  | "live"
  | "stale"
  | "unavailable"
  | "blocked"
  | "offline"
  | "pending-sync"
  | "mock";

export type Symbol =
  | "GBPUSD"
  | "AUDUSD"
  | "EURUSD"
  | "NZDUSD"
  | "USDJPY"
  | "AUDJPY"
  | "EURJPY"
  | "XAUUSD";

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

export interface TradePlan {
  signalId: string;
  entries: { e1: number; e2: number; e3: number };
  sl: number;
  tps: { tp1: number; tp2: number; tp3: number };
  rr: { tp1: number; tp2: number; tp3: number };
  lotSize: { e1: number; e2: number; e3: number };
  riskUSC: number;
  riskZAR: number;
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
  pnlUSC: number;
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

export interface DashboardSettings {
  backendUrl: string;
  apiKeyStatus: "ok" | "missing" | "invalid";
  refreshIntervalSec: number;
  staleThresholdSec: number;
  watchlist: Symbol[];
  riskAllocation: { perTradePct: number; dailyMaxPct: number; ddCapPct: number };
}

export interface RiskProfile {
  tier: "conservative" | "balanced" | "aggressive";
  maxConcurrentTrades: number;
  perTradePct: number;
  dailyMaxPct: number;
  ddCapPct: number;
  cooldownMin: number;
  updatedAt: string;
}

export interface AccountState {
  balanceUSC: number;
  equityUSC: number;
  marginUsedPct: number;
  drawdownPct: number;
  openPositions: number;
  pendingOrders: number;
  todayPnlUSC: number;
  todayPnlPct: number;
  state: FreshnessState;
}
