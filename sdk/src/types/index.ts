// ─── Freshness & engine state ────────────────────────────────────────────────

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
  | "PRICE_NOT_MT5_FRESH"
  | "CANDLES_MISSING"
  | "CANDLES_STALE"
  | "INSUFFICIENT_CANDLE_HISTORY"
  | "READY_NOT_CONFIRMED_STALE_DATA"
  | "ANCHOR_CHOP_BLOCKED"
  | "AOV_EQUILIBRIUM_ZONE"
  | "FUNDAMENTAL_HTF_OPPOSED"
  | "OK";

export type PriceSource = "mt5" | "twelve-data" | "unknown" | "mock";

export type TwelveDataKeyStatus =
  | "missing"
  | "ok"
  | "invalid"
  | "rate-limited"
  | "blocked"
  | "testing";

// ─── Symbol types ─────────────────────────────────────────────────────────────

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
  | "ETHUSD"
  | "XRPUSD"
  | "BNBUSD"
  | "SOLUSD";

/** A known forex/crypto/index symbol, or any other string symbol. */
export type Symbol = KnownSymbol | (string & {});

// ─── Fibonacci ────────────────────────────────────────────────────────────────

export type FibFamily = "HTA_SF" | "LTF_SF" | "F3" | "EF_RESEARCH";

export type FibRole =
  | "premium"
  | "equilibrium"
  | "discount"
  | "premium-extension"
  | "discount-extension";

export type SignalLifecycleState =
  | "DISPLAY_ACTIVE"
  | "STALE_HELD"
  | "ENTRY_HIT"
  | "FILLED_CONFIRMED"
  | "STOP_HIT"
  | "REPLACED"
  | "EXPIRED"
  | "INVALIDATED";

export interface SignalValidity {
  state: SignalLifecycleState;
  entryHitAt: string | null;
  stopHitAt: string | null;
  invalidationReason: string | null;
}

export interface SignalPersistence {
  firstSeenAt: string;
  lastConfirmedAt: string;
  lastEvaluatedAt: string;
  expiresAt: string | null;
  replacedBy: string | null;
}

export interface LiveSignalsMeta {
  boardSize: 3 | 5 | 10;
  totalActive: number;
}

export interface FibLevel {
  family: FibFamily;
  ratio: number;
  label: string;
  price: number;
  role: FibRole;
}

// ─── Market data ─────────────────────────────────────────────────────────────

export type SequenceState = "present" | "absent" | "partial" | "ambiguous";
export type DisplacementQuality = "none" | "weak" | "clean" | "strong";
export type PdState =
  | "PREMIUM"
  | "DISCOUNT"
  | "EQUILIBRIUM"
  | "EXTENDED_PREMIUM"
  | "EXTENDED_DISCOUNT";

export interface SymbolDiagnostic {
  symbol: Symbol;
  priceState: FreshnessState;
  candleState: "live" | "stale" | "missing" | "not_checked";
  lastPriceAt: string | null;
  lastCandleAt: string | null;
  candleCount: number;
  engineBlocker: EngineBlocker;
}

export interface PairPrice {
  symbol: Symbol;
  bid: number;
  ask: number;
  mid: number;
  changePct1d: number;
  updatedAt: string;
  state: FreshnessState;
  source: PriceSource;
  age_sec?: number;
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
  updatedAt: string | null;
  state: FreshnessState;
}

export interface RegimeState {
  symbol: Symbol;
  bias: "BULL" | "BEAR" | "RANGING";
  /** Choppiness index: 0 (trending) → 1 (ranging). */
  chop: number;
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

// ─── Signals ─────────────────────────────────────────────────────────────────

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
  qualityScore?: number;
  lifecycleState?: SignalLifecycleState;
  signalFamilyKey?: string;
  entryPrice?: number;
  slPrice?: number | null;
  tpPrice?: number | null;
  validity?: SignalValidity;
  persistence?: SignalPersistence;
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

export interface LiveSignalsResponse {
  signals: SignalCandidate[];
  polledAt: string;
  meta?: LiveSignalsMeta;
}

// ─── Trade plans ─────────────────────────────────────────────────────────────

export interface TradePlan {
  signalId: string;
  symbol?: Symbol;
  entries: { e1: number; e2: number; e3: number };
  sl: number;
  stops?: { e1: number; e2: number; e3: number };
  tps: { tp1: number; tp2: number; tp3: number };
  rr: { tp1: number; tp2: number; tp3: number };
  lotSize: { e1: number; e2: number; e3: number };
  minExecutableLot?: number;
  ladder?: {
    e1: { ratio: number; stopRatio: number; family: "LTF_SF" };
    e2: { ratio: number; stopRatio: number; family: "LTF_SF" };
    e3: { ratio: number; stopRatio: number; family: "LTF_SF" };
  };
  riskUSC: number;
  riskZAR: number;
  drawdownImpactPct: number;
  source: "frontend-preview" | "backend-blueprint" | "pending-blueprint" | "watch-blueprint";
  executionSource?: "LTF_SF";
  ladderId?: string;
  direction?: "LONG" | "SHORT";
  stageFills?: { e1: boolean; e2: boolean; e3: boolean };
  state?: "ACTIVE" | "INVALID";
}

// ─── Positions & orders ───────────────────────────────────────────────────────

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

// ─── Engine health ────────────────────────────────────────────────────────────

export interface EngineHealth {
  backendSync: FreshnessState;
  priceFeed: FreshnessState;
  feedStatus?: FreshnessState | "rate-limited";
  engineRunState?: "live" | "cached" | "stale" | "failed";
  twelveDataKey: "present" | "missing";
  twelveDataKeyStatus?: TwelveDataKeyStatus;
  lastBatchAt: string | null;
  lastEngineRunAt: string | null;
  perSymbolDiagnostics?: SymbolDiagnostic[];
}

// ─── Settings & risk ─────────────────────────────────────────────────────────

export interface DashboardSettings {
  backendUrl: string;
  apiKeyStatus: TwelveDataKeyStatus;
  refreshIntervalSec: number;
  staleThresholdSec: number;
  watchlist: Symbol[];
  riskAllocation: { perTradePct: number; dailyMaxPct: number; ddCapPct: number };
  signalBoardSize?: 3 | 5 | 10;
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

// ─── Account ──────────────────────────────────────────────────────────────────

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

export interface AccountTelemetry {
  accountId: string;
  terminalId: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  floatingPl: number;
  currency: string;
  leverage: number;
  eaVersion: string;
  lastSeenAt: string | null;
  updatedAt: string | null;
  state: FreshnessState;
}

// ─── Progress & milestones ────────────────────────────────────────────────────

export type UserProgressState = "LIVE" | "STALE" | "UNAVAILABLE";

export interface UserProgressEquityPulse {
  equityUSC: number;
  todayPnlUSC: number;
  state: UserProgressState;
}

export interface UserProgressStreak {
  currentStreakDays: number;
  lastActiveDate: string | null;
  state: UserProgressState;
}

export interface UserProgressMilestones {
  firstHeartbeat: boolean;
  firstMarketStream: boolean;
  firstTradeTelemetry: boolean;
  state: UserProgressState;
}

export interface UserProgress {
  equityPulse: UserProgressEquityPulse;
  streak: UserProgressStreak;
  milestones: UserProgressMilestones;
  generatedAt: string;
}

// ─── Soak testing ─────────────────────────────────────────────────────────────

export type SoakEvidenceType =
  | "baseline_metadata"
  | "signal_parity_confirm"
  | "feed_stable_window"
  | "engine_run_observation"
  | "manual_note";

export interface SoakEvidenceRow {
  id: number;
  evidence_key: string;
  evidence_type: SoakEvidenceType;
  evidence_value: string;
  operator: string;
  created_at: string;
  updated_at: string;
}

export interface SoakEvidencePayload {
  evidence_key: string;
  evidence_type: SoakEvidenceType;
  evidence_value: string;
  operator: string;
}

export type SoakCheckpointType = "baseline" | "checkpoint";

export interface SoakCheckpointSnapshot {
  health: EngineHealth;
  watchlist_count: number | null;
  snapshots_24h: number | null;
  candles_24h: number | null;
  engine_runs_summary: {
    total_24h: number;
    success_24h: number;
    error_24h: number;
    last_run_at: string | null;
  };
  audit_events_summary: {
    total_24h: number;
    error_count_24h: number;
    warning_count_24h: number;
  };
  manual_evidence: SoakEvidenceRow[];
  generated_at: string;
}

export interface SoakCheckpointRow {
  id: number;
  checkpoint_type: SoakCheckpointType;
  snapshot_data: SoakCheckpointSnapshot;
  operator_notes: string | null;
  created_at: string;
}

export interface SoakReport {
  health: EngineHealth;
  watchlist_count: number | null;
  snapshots_24h: number | null;
  candles_24h: number | null;
  engine_runs_summary: {
    total_24h: number;
    success_24h: number;
    error_24h: number;
    last_run_at: string | null;
  };
  audit_events_summary: {
    total_24h: number;
    error_count_24h: number;
    warning_count_24h: number;
  };
  manual_evidence: SoakEvidenceRow[];
  baseline_checkpoint: SoakCheckpointRow | null;
  checkpoints: SoakCheckpointRow[];
  generated_at: string;
  seeded?: boolean;
}

export type SoakType = "PHASE_0_RESTART_72H" | "PHASE_3_STABILITY_72H" | "CUSTOM";

export interface SoakTemplateConfig {
  soakType: SoakType;
  label: string;
  description: string;
  defaultDurationHours: number;
  defaultCheckpointCount: number;
  checkpointLabels: string[];
}

export const SOAK_TEMPLATES: Record<SoakType, SoakTemplateConfig> = {
  PHASE_0_RESTART_72H: {
    soakType: "PHASE_0_RESTART_72H",
    label: "Phase 0 - Restart Soak",
    description: "72h restart soak with fixed Phase 0 checkpoint intervals.",
    defaultDurationHours: 72,
    defaultCheckpointCount: 4,
    checkpointLabels: ["T+12h", "T+24h", "T+48h", "T+72h"],
  },
  PHASE_3_STABILITY_72H: {
    soakType: "PHASE_3_STABILITY_72H",
    label: "Phase 3 - Stability Soak",
    description: "72h stability soak pending operator-confirmed checkpoint naming.",
    defaultDurationHours: 72,
    defaultCheckpointCount: 3,
    checkpointLabels: ["T+24h", "T+48h", "T+72h"],
  },
  CUSTOM: {
    soakType: "CUSTOM",
    label: "Custom Soak",
    description: "Operator-defined soak duration and checkpoint schedule.",
    defaultDurationHours: 0,
    defaultCheckpointCount: 0,
    checkpointLabels: [],
  },
};

// ─── SDK-specific ─────────────────────────────────────────────────────────────

/** Snapshot response from GET /snapshot. */
export interface MarketSnapshot {
  prices: PairPrice[];
  regimes: RegimeState[];
  gates: GateState[];
  diagnostics: SymbolDiagnostic[];
}

/** Session info from GET /session. */
export interface SessionInfo {
  name: string;
  openUtc: string;
  closeUtc: string;
  state: string;
}
