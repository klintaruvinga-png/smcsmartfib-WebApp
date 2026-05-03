export type FreshnessState =
  | "live"
  | "stale"
  | "unavailable"
  | "blocked"
  | "offline"
  | "pending-sync"
  | "mock";

export type EngineBlocker =
  | "KEY_MISSING"
  | "KEY_INVALID"
  | "RATE_LIMITED"
  | "QUOTE_UNAVAILABLE"
  | "PRICE_STALE"
  | "CANDLES_MISSING"
  | "CANDLES_STALE"
  | "INSUFFICIENT_CANDLE_HISTORY"
  | "READY_NOT_CONFIRMED_STALE_DATA"
  | "OK";

export interface SymbolDiagnostic {
  symbol: Symbol;
  priceState: FreshnessState;
  candleState: "live" | "stale" | "missing";
  lastPriceAt: string | null;
  lastCandleAt: string | null;
  candleCount: number;
  engineBlocker: EngineBlocker;
}

export type KnownSymbol =
  | "GBPUSD"
  | "AUDUSD"
  | "EURUSD"
  | "NZDUSD"
  | "USDJPY"
  | "AUDJPY"
  | "EURJPY"
  | "GBPJPY"
  | "NZDJPY"
  | "CADJPY"
  | "CHFJPY"
  | "USDCAD"
  | "USDCHF"
  | "EURGBP"
  | "EURAUD"
  | "EURNZD"
  | "EURCHF"
  | "EURCAD"
  | "GBPAUD"
  | "GBPNZD"
  | "GBPCAD"
  | "GBPCHF"
  | "AUDNZD"
  | "AUDCAD"
  | "AUDCHF"
  | "NZDCAD"
  | "NZDCHF"
  | "CADCHF"
  | "XAUUSD"
  | "XAGUSD"
  | "US30"
  | "NAS100"
  | "BTCUSD"
  | "ETHUSD";

export type Symbol = KnownSymbol | (string & {});
export type TwelveDataKeyStatus =
  | "missing"
  | "ok"
  | "invalid"
  | "rate-limited"
  | "blocked"
  | "testing";
export type FibFamily = "HTA_SF" | "LTF_SF" | "F3" | "EF_RESEARCH";
export type FibRole =
  | "premium"
  | "equilibrium"
  | "discount"
  | "premium-extension"
  | "discount-extension";
export type SequenceState = "present" | "absent" | "partial" | "ambiguous";
export type DisplacementQuality = "none" | "weak" | "clean" | "strong";
export type PdState =
  | "PREMIUM"
  | "DISCOUNT"
  | "EQUILIBRIUM"
  | "EXTENDED_PREMIUM"
  | "EXTENDED_DISCOUNT";

export interface FibLevel {
  family: FibFamily;
  ratio: number;
  label: string;
  price: number;
  role: FibRole;
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

export interface ChartCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartSnapshot {
  symbol: Symbol;
  timeframe: string;
  candles: ChartCandle[];
  fibLevels: FibLevel[];
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

export type SignalStatus = "WATCH" | "ARMED" | "READY";
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
  engineBlocker?: EngineBlocker;
  createdAt: string;
  engine?: {
    htfBias: "BULL" | "BEAR" | "TRANSITIONAL";
    pdState: PdState;
    drawOnLiquidity: string | null;
    sweep: SequenceState;
    mss: SequenceState;
    displacement: DisplacementQuality;
    htaOverride: boolean;
    f3Chop: "clear" | "caution";
    ltfLevel: FibLevel | null;
    firstReactionFamily: FibFamily | null;
    chartState: string;
    panelState: string | null;
  };
}

export interface TradePlan {
  signalId: string;
  symbol?: Symbol;
  entries: { e1: number; e2: number; e3: number };
  sl: number;
  stops?: { e1: number; e2: number; e3: number };
  tps: { tp1: number; tp2: number; tp3: number };
  rr: { tp1: number; tp2: number; tp3: number };
  lotSize: { e1: number; e2: number; e3: number };
  ladder?: {
    e1: { ratio: number; stopRatio: number; family: "LTF_SF" };
    e2: { ratio: number; stopRatio: number; family: "LTF_SF" };
    e3: { ratio: number; stopRatio: number; family: "LTF_SF" };
  };
  riskUSC: number;
  riskZAR: number;
  drawdownImpactPct: number;
  source: "frontend-preview" | "backend-blueprint";
  executionSource?: "LTF_SF";
  ladderId?: string;
  direction?: "LONG" | "SHORT";
  stageFills?: { e1: boolean; e2: boolean; e3: boolean };
  state?: "ACTIVE" | "INVALID";
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
  /** Separates runtime feed health from credential validity. */
  feedStatus?: FreshnessState | "rate-limited";
  engineRunState?: "live" | "cached" | "stale" | "failed";
  twelveDataKey: "present" | "missing";
  twelveDataKeyStatus?: TwelveDataKeyStatus;
  lastBatchAt: string | null;
  lastEngineRunAt: string | null;
  perSymbolDiagnostics?: SymbolDiagnostic[];
}

export interface DashboardSettings {
  backendUrl: string;
  apiKeyStatus: TwelveDataKeyStatus;
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
