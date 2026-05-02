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
} from "@/types/sniper";

const now = () => new Date().toISOString();
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const WATCHLIST: Symbol[] = [
  "GBPUSD",
  "AUDUSD",
  "EURUSD",
  "NZDUSD",
  "USDJPY",
  "AUDJPY",
  "EURJPY",
  "XAUUSD",
];

export const mockPrices: PairPrice[] = [
  {
    symbol: "GBPUSD",
    bid: 1.2674,
    ask: 1.2676,
    mid: 1.2675,
    changePct1d: 0.42,
    updatedAt: now(),
    state: "mock",
  },
  {
    symbol: "AUDUSD",
    bid: 0.6582,
    ask: 0.6583,
    mid: 0.65825,
    changePct1d: -0.18,
    updatedAt: now(),
    state: "mock",
  },
  {
    symbol: "EURUSD",
    bid: 1.0823,
    ask: 1.0824,
    mid: 1.08235,
    changePct1d: 0.11,
    updatedAt: now(),
    state: "mock",
  },
  {
    symbol: "NZDUSD",
    bid: 0.6011,
    ask: 0.6013,
    mid: 0.6012,
    changePct1d: -0.34,
    updatedAt: minutesAgo(4),
    state: "stale",
  },
  {
    symbol: "USDJPY",
    bid: 156.42,
    ask: 156.45,
    mid: 156.435,
    changePct1d: 0.61,
    updatedAt: now(),
    state: "mock",
  },
  {
    symbol: "AUDJPY",
    bid: 102.95,
    ask: 102.99,
    mid: 102.97,
    changePct1d: 0.45,
    updatedAt: minutesAgo(6),
    state: "stale",
  },
  {
    symbol: "EURJPY",
    bid: 169.38,
    ask: 169.41,
    mid: 169.395,
    changePct1d: 0.72,
    updatedAt: now(),
    state: "mock",
  },
  {
    symbol: "XAUUSD",
    bid: 2331.4,
    ask: 2331.9,
    mid: 2331.65,
    changePct1d: -0.22,
    updatedAt: now(),
    state: "unavailable",
  },
];

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

export const mockPlan: TradePlan = {
  signalId: "sig-001",
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
};

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

export const mockEngineHealth: EngineHealth = {
  backendSync: "mock",
  priceFeed: "mock",
  twelveDataKey: "present",
  twelveDataKeyStatus: "ok",
  lastBatchAt: minutesAgo(1),
  lastEngineRunAt: minutesAgo(1),
};

export const mockSettings: DashboardSettings = {
  backendUrl: "https://trader.stokvelsociety.co.za/wp-json",
  apiKeyStatus: "missing",
  refreshIntervalSec: 15,
  staleThresholdSec: 180,
  watchlist: WATCHLIST,
  riskAllocation: { perTradePct: 0.5, dailyMaxPct: 2.0, ddCapPct: 6.0 },
};

export const mockRiskProfile: RiskProfile = {
  tier: "balanced",
  maxConcurrentTrades: 3,
  perTradePct: 0.5,
  dailyMaxPct: 2.0,
  ddCapPct: 6.0,
  cooldownMin: 30,
  updatedAt: minutesAgo(60),
};

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

// Synthetic price series for charts
export function mockPriceSeries(symbol: Symbol, points = 80) {
  const base = mockPrices.find((p) => p.symbol === symbol)?.mid ?? 1;
  const vol = base * 0.0015;
  let v = base;
  const out: { t: number; p: number }[] = [];
  for (let i = points - 1; i >= 0; i--) {
    v += (Math.random() - 0.5) * vol;
    out.push({
      t: Date.now() - i * 60_000,
      p: Number(v.toFixed(symbol === "XAUUSD" ? 2 : symbol.endsWith("JPY") ? 3 : 5)),
    });
  }
  return out;
}

export function mockFibLevels(symbol: Symbol) {
  const base = mockPrices.find((p) => p.symbol === symbol)?.mid ?? 1;
  const range = base * 0.005;
  const ratios = [0, 25, 50, 62.5, 75, 100] as const;

  return ratios.map((ratio) => ({
    ratio,
    label: `${ratio}%`,
    price: base + range - (ratio / 100) * range * 2,
    role: (ratio < 50 ? "premium" : ratio === 50 ? "equilibrium" : "discount") as FibRole,
  }));
}

// Equity curve for analytics
export const mockEquityCurve = Array.from({ length: 30 }).map((_, i) => ({
  day: i + 1,
  equity: 24000 + i * 30 + Math.sin(i / 3) * 80,
}));
