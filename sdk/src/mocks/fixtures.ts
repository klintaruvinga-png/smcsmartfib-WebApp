import type {
  AccountState,
  DashboardSettings,
  EngineHealth,
  FibRole,
  GateState,
  PairPrice,
  PendingOrder,
  Position,
  RegimeState,
  RiskProfile,
  SignalCandidate,
  Symbol,
  TradePlan,
  UserProgress,
} from "../types/index.js";
import { DEFAULT_BACKEND_URL } from "../constants/index.js";

const now = () => new Date().toISOString();
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

// ─── Watchlist ────────────────────────────────────────────────────────────────

export const MOCK_WATCHLIST: Symbol[] = [
  "GBPUSD",
  "AUDUSD",
  "EURUSD",
  "NZDUSD",
  "USDJPY",
  "AUDJPY",
  "EURJPY",
  "XAUUSD",
];

// ─── Prices ───────────────────────────────────────────────────────────────────

export const mockPrices: PairPrice[] = [
  {
    symbol: "GBPUSD",
    bid: 1.2674,
    ask: 1.2676,
    mid: 1.2675,
    changePct1d: 0.42,
    updatedAt: now(),
    state: "mock",
    source: "mock",
  },
  {
    symbol: "AUDUSD",
    bid: 0.6582,
    ask: 0.6583,
    mid: 0.65825,
    changePct1d: -0.18,
    updatedAt: now(),
    state: "mock",
    source: "mock",
  },
  {
    symbol: "EURUSD",
    bid: 1.0823,
    ask: 1.0824,
    mid: 1.08235,
    changePct1d: 0.11,
    updatedAt: now(),
    state: "mock",
    source: "mock",
  },
  {
    symbol: "NZDUSD",
    bid: 0.6011,
    ask: 0.6013,
    mid: 0.6012,
    changePct1d: -0.34,
    updatedAt: minutesAgo(4),
    state: "stale",
    source: "mock",
  },
  {
    symbol: "USDJPY",
    bid: 156.42,
    ask: 156.45,
    mid: 156.435,
    changePct1d: 0.61,
    updatedAt: now(),
    state: "mock",
    source: "mock",
  },
  {
    symbol: "AUDJPY",
    bid: 102.95,
    ask: 102.99,
    mid: 102.97,
    changePct1d: 0.45,
    updatedAt: minutesAgo(6),
    state: "stale",
    source: "mock",
  },
  {
    symbol: "EURJPY",
    bid: 169.38,
    ask: 169.41,
    mid: 169.395,
    changePct1d: 0.72,
    updatedAt: now(),
    state: "mock",
    source: "mock",
  },
  {
    symbol: "XAUUSD",
    bid: 2331.4,
    ask: 2331.9,
    mid: 2331.65,
    changePct1d: -0.22,
    updatedAt: now(),
    state: "unavailable",
    source: "mock",
  },
];

// ─── Regimes ──────────────────────────────────────────────────────────────────

export const mockRegimes: RegimeState[] = [
  {
    symbol: "GBPUSD",
    bias: "BULL",
    chop: 0.22,
    nearestFib: 1.267,
    updatedAt: now(),
    state: "mock",
  },
  {
    symbol: "AUDUSD",
    bias: "BEAR",
    chop: 0.34,
    nearestFib: 0.658,
    updatedAt: now(),
    state: "mock",
  },
  {
    symbol: "EURUSD",
    bias: "RANGING",
    chop: 0.71,
    nearestFib: 1.082,
    updatedAt: now(),
    state: "mock",
  },
  {
    symbol: "NZDUSD",
    bias: "BEAR",
    chop: 0.45,
    nearestFib: 0.6,
    updatedAt: minutesAgo(4),
    state: "stale",
  },
  {
    symbol: "USDJPY",
    bias: "BULL",
    chop: 0.18,
    nearestFib: 156.2,
    updatedAt: now(),
    state: "mock",
  },
  {
    symbol: "AUDJPY",
    bias: "BULL",
    chop: 0.28,
    nearestFib: 102.8,
    updatedAt: minutesAgo(6),
    state: "stale",
  },
  { symbol: "EURJPY", bias: "BULL", chop: 0.2, nearestFib: 169.1, updatedAt: now(), state: "mock" },
  {
    symbol: "XAUUSD",
    bias: "RANGING",
    chop: 0.62,
    nearestFib: null,
    updatedAt: now(),
    state: "unavailable",
  },
];

// ─── Gates ────────────────────────────────────────────────────────────────────

export const mockGates: GateState[] = [
  { symbol: "GBPUSD", allow: "BOTH", state: "mock" },
  { symbol: "AUDUSD", allow: "SELL", state: "mock" },
  { symbol: "EURUSD", allow: "BLOCKED", reason: "chop > 0.7", state: "blocked" },
  { symbol: "NZDUSD", allow: "SELL", state: "stale" },
  { symbol: "USDJPY", allow: "BUY", state: "mock" },
  { symbol: "AUDJPY", allow: "BUY", state: "mock" },
  { symbol: "EURJPY", allow: "BUY", state: "mock" },
  { symbol: "XAUUSD", allow: "BLOCKED", reason: "feed unavailable", state: "unavailable" },
];

// ─── Signals ──────────────────────────────────────────────────────────────────

export const mockSignals: SignalCandidate[] = [
  {
    id: "sig-001",
    symbol: "GBPUSD",
    direction: "LONG",
    status: "READY",
    confluence: ["sweep", "MSS", "fib-OB", "London-AM"],
    verdict: "A+",
    computedBy: "backend",
    backendConfirmed: true,
    createdAt: minutesAgo(3),
  },
  {
    id: "sig-002",
    symbol: "USDJPY",
    direction: "LONG",
    status: "ARMED",
    confluence: ["MSS", "session", "fib-0.618"],
    verdict: "A",
    computedBy: "backend",
    backendConfirmed: true,
    createdAt: minutesAgo(8),
  },
  {
    id: "sig-003",
    symbol: "AUDUSD",
    direction: "SHORT",
    status: "WATCH",
    confluence: ["fib-0.5", "trendline"],
    verdict: "B",
    computedBy: "frontend",
    backendConfirmed: false,
    createdAt: minutesAgo(12),
  },
  {
    id: "sig-004",
    symbol: "EURJPY",
    direction: "LONG",
    status: "ARMED",
    confluence: ["sweep", "fib-OB"],
    verdict: "A",
    computedBy: "frontend",
    backendConfirmed: false,
    createdAt: minutesAgo(2),
  },
  {
    id: "sig-005",
    symbol: "EURUSD",
    direction: "SHORT",
    status: "WATCH",
    confluence: ["fib-0.382"],
    verdict: "C",
    computedBy: "backend",
    backendConfirmed: false,
    createdAt: minutesAgo(20),
  },
];

// ─── Trade plan ───────────────────────────────────────────────────────────────

export const mockPlan: TradePlan = {
  signalId: "sig-001",
  symbol: "GBPUSD",
  entries: { e1: 1.2675, e2: 1.2662, e3: 1.265 },
  sl: 1.2628,
  stops: { e1: 1.2662, e2: 1.265, e3: 1.2628 },
  tps: { tp1: 1.2705, tp2: 1.2738, tp3: 1.2782 },
  rr: { tp1: 1.2, tp2: 2.1, tp3: 3.6 },
  lotSize: { e1: 0.12, e2: 0.16, e3: 0.22 },
  ladder: {
    e1: { ratio: 62.5, stopRatio: 75, family: "LTF_SF" },
    e2: { ratio: 75, stopRatio: 100, family: "LTF_SF" },
    e3: { ratio: 100, stopRatio: 125, family: "LTF_SF" },
  },
  riskUSC: 124.0,
  riskZAR: 2280,
  drawdownImpactPct: 0.62,
  source: "backend-blueprint",
  executionSource: "LTF_SF",
  direction: "LONG",
};

// ─── Positions & orders ───────────────────────────────────────────────────────

export const mockPositions: Position[] = [
  {
    id: "pos-1",
    symbol: "GBPUSD",
    direction: "LONG",
    entry: 1.2662,
    current: 1.2675,
    lots: 0.16,
    pnlUSC: 20.8,
    pnlPct: 0.1,
    openedAt: minutesAgo(45),
    state: "mock",
  },
  {
    id: "pos-2",
    symbol: "USDJPY",
    direction: "LONG",
    entry: 156.1,
    current: 156.42,
    lots: 0.1,
    pnlUSC: 21.4,
    pnlPct: 0.2,
    openedAt: minutesAgo(120),
    state: "mock",
  },
  {
    id: "pos-3",
    symbol: "AUDJPY",
    direction: "LONG",
    entry: 102.7,
    current: 102.95,
    lots: 0.08,
    pnlUSC: 14.2,
    pnlPct: 0.24,
    openedAt: minutesAgo(35),
    state: "stale",
  },
];

export const mockOrders: PendingOrder[] = [
  {
    id: "ord-1",
    symbol: "GBPUSD",
    direction: "LONG",
    type: "LIMIT",
    price: 1.2662,
    lots: 0.16,
    sl: 1.2628,
    tp: 1.2738,
    placedAt: minutesAgo(3),
    state: "mock",
  },
  {
    id: "ord-2",
    symbol: "GBPUSD",
    direction: "LONG",
    type: "LIMIT",
    price: 1.265,
    lots: 0.22,
    sl: 1.2628,
    tp: 1.2782,
    placedAt: minutesAgo(3),
    state: "mock",
  },
  {
    id: "ord-3",
    symbol: "USDJPY",
    direction: "LONG",
    type: "LIMIT",
    price: 156.0,
    lots: 0.12,
    sl: 155.6,
    tp: 156.9,
    placedAt: minutesAgo(10),
    state: "mock",
  },
  {
    id: "ord-4",
    symbol: "EURJPY",
    direction: "LONG",
    type: "STOP",
    price: 169.5,
    lots: 0.1,
    sl: 169.0,
    tp: 170.4,
    placedAt: minutesAgo(2),
    state: "pending-sync",
  },
];

// ─── Engine health ────────────────────────────────────────────────────────────

export const mockEngineHealth: EngineHealth = {
  backendSync: "mock",
  priceFeed: "mock",
  twelveDataKey: "present",
  twelveDataKeyStatus: "ok",
  lastBatchAt: minutesAgo(1),
  lastEngineRunAt: minutesAgo(1),
};

// ─── Settings ─────────────────────────────────────────────────────────────────

export const mockSettings: DashboardSettings = {
  backendUrl: DEFAULT_BACKEND_URL,
  apiKeyStatus: "missing",
  refreshIntervalSec: 2,
  staleThresholdSec: 10,
  watchlist: MOCK_WATCHLIST,
  riskAllocation: { perTradePct: 0.5, dailyMaxPct: 2.0, ddCapPct: 6.0 },
};

// ─── Risk profile ─────────────────────────────────────────────────────────────

export const mockRiskProfile: RiskProfile = {
  tier: "balanced",
  maxConcurrentTrades: 3,
  perTradePct: 0.5,
  dailyMaxPct: 2.0,
  ddCapPct: 6.0,
  cooldownMin: 30,
  updatedAt: minutesAgo(60),
};

// ─── Account ──────────────────────────────────────────────────────────────────

export const mockAccount: AccountState = {
  balanceUSC: 24820,
  equityUSC: 24876,
  marginUsedPct: 4.2,
  drawdownPct: 1.1,
  openPositions: 3,
  pendingOrders: 4,
  todayPnlUSC: 56.4,
  todayPnlPct: 0.23,
  state: "mock",
};

// ─── User progress ────────────────────────────────────────────────────────────

export const mockUserProgress: UserProgress = {
  equityPulse: {
    equityUSC: mockAccount.equityUSC,
    todayPnlUSC: mockAccount.todayPnlUSC,
    state: "LIVE",
  },
  streak: {
    currentStreakDays: 4,
    lastActiveDate: new Date().toISOString().slice(0, 10),
    state: "LIVE",
  },
  milestones: {
    firstHeartbeat: true,
    firstMarketStream: true,
    firstTradeTelemetry: true,
    state: "LIVE",
  },
  generatedAt: now(),
};

// ─── Synthetic price series ───────────────────────────────────────────────────

function xorshift32(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

function symbolSeed(symbol: string): number {
  return [...symbol].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0x9e3779b9);
}

/** Generate a synthetic 1-minute price series for development and testing. */
export function mockPriceSeries(symbol: Symbol, points = 80): { t: number; p: number }[] {
  const base = mockPrices.find((p) => p.symbol === symbol)?.mid ?? 1;
  const drift = 0.00008;
  const volatility = 0.0012;
  const maxTickPct = 0.0005;
  const ts = symbol === "XAUUSD" ? 0.01 : symbol.endsWith("JPY") ? 0.001 : 0.0001;
  const decimals = symbol === "XAUUSD" ? 2 : symbol.endsWith("JPY") ? 3 : 5;
  const count = Number.isFinite(points) ? Math.max(1, Math.floor(points)) : 80;
  const nowTs = Date.now();
  const rand = xorshift32(symbolSeed(symbol));
  const out: { t: number; p: number }[] = [];

  out.push({ t: nowTs - (count - 1) * 60_000, p: Number(base.toFixed(decimals)) });

  let v = base;
  for (let i = count - 2; i >= 0; i--) {
    const shock = (rand() - 0.5) * 2;
    const rawPct = drift + volatility * shock;
    const cappedPct = Math.max(-maxTickPct, Math.min(maxTickPct, rawPct));
    v = Math.max(ts, v * (1 + cappedPct));
    v = Math.round(v / ts) * ts;
    out.push({ t: nowTs - i * 60_000, p: Number(v.toFixed(decimals)) });
  }
  return out;
}

// ─── Fibonacci levels ─────────────────────────────────────────────────────────

const ALL_FIB_RATIOS = [
  -200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300,
] as const;

function _fibRole(ratio: number): FibRole {
  if (ratio < 0) return "premium-extension";
  if (ratio > 100) return "discount-extension";
  if (ratio < 50) return "premium";
  if (ratio === 50) return "equilibrium";
  return "discount";
}

/** Generate mock Fibonacci levels anchored to a symbol's current mock mid price. */
export function mockFibLevels(symbol: Symbol) {
  const base = mockPrices.find((p) => p.symbol === symbol)?.mid ?? 1;
  const range = base * 0.005;
  return ALL_FIB_RATIOS.map((ratio) => ({
    ratio,
    label: `${ratio}%`,
    price: base + range - (ratio / 100) * range * 2,
    role: _fibRole(ratio),
  }));
}

// ─── Equity curve ─────────────────────────────────────────────────────────────

/** 30-day synthetic equity curve for analytics views. */
export const mockEquityCurve = Array.from({ length: 30 }).map((_, i) => ({
  day: i + 1,
  equity: 24000 + i * 30 + Math.sin(i / 3) * 80,
}));
