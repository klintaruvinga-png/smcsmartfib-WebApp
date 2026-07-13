import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import { useRouterState, Outlet, useRouter, Link, createRootRouteWithContext, HeadContent, Scripts, createFileRoute, lazyRouteComponent, redirect, createRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation, keepPreviousData, QueryClientProvider, QueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useMemo, useRef, useEffect, useState } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Activity, Target, Radar, Crosshair, LineChart, Briefcase, ListChecks, BarChart3, TrendingUp, Settings, LogOut, RefreshCw, Info, AlertTriangle, ShieldCheck, Flag, ClipboardList, CheckCircle2, Lock } from "lucide-react";
import { Toaster } from "sonner";
import { ResponsiveContainer, AreaChart, YAxis, Tooltip, Area } from "recharts";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
const appCss = "/assets/styles-CIetmNWb.css";
const KEY = "smc_wp_auth";
function setCredentials(username, appPassword) {
  sessionStorage.setItem(KEY, btoa(`${username}:${appPassword}`));
}
function getAuthHeader() {
  if (typeof window === "undefined") return null;
  const v = sessionStorage.getItem(KEY);
  return v ? `Basic ${v}` : null;
}
function clearCredentials() {
  if (typeof window !== "undefined") sessionStorage.removeItem(KEY);
}
function hasCredentials() {
  if (typeof window === "undefined") return false;
  return Boolean(sessionStorage.getItem(KEY));
}
function hasWordPressNonce() {
  if (typeof window === "undefined") return false;
  return Boolean(getWordPressNonce());
}
function getWordPressNonce() {
  if (typeof window === "undefined") return null;
  const wpWindow = window;
  return wpWindow.SNIPER?.nonce ?? wpWindow.wpApiSettings?.nonce ?? null;
}
const SOAK_EVIDENCE_TYPES$1 = [
  "baseline_metadata",
  "signal_parity_confirm",
  "feed_stable_window",
  "engine_run_observation",
  "manual_note"
];
const SOAK_EVIDENCE_TYPE_SET = new Set(SOAK_EVIDENCE_TYPES$1);
function isSoakEvidenceType(value) {
  return typeof value === "string" && SOAK_EVIDENCE_TYPE_SET.has(value);
}
function assertValidSoakEvidencePayload(payload, logger = console) {
  const entries = Array.isArray(payload) ? payload : [payload];
  const invalidEntries = entries.filter((entry) => !isSoakEvidenceType(entry.evidence_type));
  if (invalidEntries.length === 0) {
    return;
  }
  logger.error("[PHASE0_SOAK] Invalid soak evidence payload", {
    allowedEvidenceTypes: SOAK_EVIDENCE_TYPES$1,
    payload
  });
  const invalidValues = invalidEntries.map((entry) => String(entry.evidence_type)).join(", ");
  throw new Error(
    `Invalid soak evidence payload: unsupported evidence_type value(s): ${invalidValues}`
  );
}
function toFiniteNumber$1(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return typeof fallback === "number" && Number.isFinite(fallback) ? fallback : 0;
}
function normalizeAccountTelemetry(response) {
  return {
    accountId: response.account_id ?? "",
    terminalId: response.terminal_id ?? "",
    balance: toFiniteNumber$1(response.balance),
    equity: toFiniteNumber$1(response.equity),
    margin: toFiniteNumber$1(response.margin),
    freeMargin: toFiniteNumber$1(response.free_margin),
    marginLevel: toFiniteNumber$1(response.margin_level),
    floatingPl: toFiniteNumber$1(response.floating_pl),
    currency: response.currency ?? "",
    leverage: toFiniteNumber$1(response.leverage),
    eaVersion: response.ea_version ?? "",
    lastSeenAt: response.last_seen_at ?? null,
    updatedAt: response.updated_at ?? null,
    state: response.freshness ?? "unavailable"
  };
}
function normalizeTelemetryPositions(rows) {
  return (rows ?? []).map((row) => {
    const pnlUSC = toFiniteNumber$1(row.profit);
    const entry = toFiniteNumber$1(row.entry_price);
    const current = toFiniteNumber$1(row.current_price, entry);
    const volume = toFiniteNumber$1(row.volume);
    const notional = Math.abs(entry * volume);
    return {
      id: row.position_id,
      symbol: row.symbol,
      direction: row.direction,
      entry,
      current,
      lots: volume,
      pnlUSC,
      pnlPct: notional > 0 ? pnlUSC / notional * 100 : 0,
      openedAt: row.opened_at ?? (/* @__PURE__ */ new Date(0)).toISOString(),
      state: row.freshness ?? "unavailable"
    };
  });
}
function normalizeTelemetryOrders(rows) {
  return (rows ?? []).map((row) => {
    const rawType = String(row.order_type ?? "").toUpperCase();
    const type = rawType.includes("STOP") ? "STOP" : "LIMIT";
    return {
      id: row.order_id,
      symbol: row.symbol,
      direction: row.direction,
      type,
      price: toFiniteNumber$1(row.entry_price),
      lots: toFiniteNumber$1(row.volume),
      sl: toFiniteNumber$1(row.sl),
      tp: toFiniteNumber$1(row.tp),
      placedAt: row.placed_at ?? (/* @__PURE__ */ new Date(0)).toISOString(),
      state: row.freshness ?? "unavailable"
    };
  });
}
function normalizeUserProgressState(value) {
  return value === "LIVE" || value === "STALE" || value === "UNAVAILABLE" ? value : "UNAVAILABLE";
}
function normalizeUserProgress(response) {
  return {
    equityPulse: {
      equityUSC: toFiniteNumber$1(response.equity_pulse?.equity_usc),
      todayPnlUSC: toFiniteNumber$1(response.equity_pulse?.today_pnl_usc),
      state: normalizeUserProgressState(response.equity_pulse?.state)
    },
    streak: {
      currentStreakDays: toFiniteNumber$1(response.streak?.current_streak_days),
      lastActiveDate: response.streak?.last_active_date ?? null,
      state: normalizeUserProgressState(response.streak?.state)
    },
    milestones: {
      firstHeartbeat: Boolean(response.milestones?.first_heartbeat),
      firstMarketStream: Boolean(response.milestones?.first_market_stream),
      firstTradeTelemetry: Boolean(response.milestones?.first_trade_telemetry),
      state: normalizeUserProgressState(response.milestones?.state)
    },
    generatedAt: response.generated_at ?? (/* @__PURE__ */ new Date(0)).toISOString()
  };
}
function normalizeLiveSignalsEnvelope(raw) {
  if (Array.isArray(raw)) {
    return { signals: raw, polledAt: (/* @__PURE__ */ new Date()).toISOString() };
  }
  if (raw && Array.isArray(raw.signals)) return raw;
  throw new Error("/live-signals: backend response missing signals array");
}
function normalizeSnapshot(snapshot) {
  return {
    ...snapshot,
    prices: (snapshot.prices ?? []).map((price) => ({
      ...price,
      bid: toFiniteNumber$1(price.bid),
      ask: toFiniteNumber$1(price.ask),
      mid: toFiniteNumber$1(price.mid),
      changePct1d: toFiniteNumber$1(price.changePct1d),
      age_sec: price.age_sec === void 0 ? void 0 : toFiniteNumber$1(price.age_sec),
      sourceDetail: typeof price.sourceDetail === "string" ? price.sourceDetail : void 0,
      feed_key: typeof price.feed_key === "string" ? price.feed_key : void 0,
      source_count: price.source_count == null ? void 0 : (() => {
        const converted = Number(price.source_count);
        return Number.isFinite(converted) ? converted : void 0;
      })()
    })),
    regimes: (snapshot.regimes ?? []).map((regime) => ({
      ...regime,
      chop: toFiniteNumber$1(regime.chop),
      anchorChop: regime.anchorChop ?? null,
      sfPosition: regime.sfPosition === null || regime.sfPosition === void 0 ? null : toFiniteNumber$1(regime.sfPosition),
      afPosition: regime.afPosition === null || regime.afPosition === void 0 ? null : toFiniteNumber$1(regime.afPosition),
      nearestFib: regime.nearestFib === null || regime.nearestFib === void 0 ? null : toFiniteNumber$1(regime.nearestFib)
    })),
    gates: snapshot.gates ?? [],
    diagnostics: snapshot.diagnostics ?? []
  };
}
const now = () => (/* @__PURE__ */ new Date()).toISOString();
const minutesAgo = (m) => new Date(Date.now() - m * 6e4).toISOString();
const WATCHLIST = [
  "GBPUSD",
  "AUDUSD",
  "EURUSD",
  "NZDUSD",
  "USDJPY",
  "AUDJPY",
  "EURJPY",
  "XAUUSD"
];
const mockPrices = [
  {
    symbol: "GBPUSD",
    bid: 1.2674,
    ask: 1.2676,
    mid: 1.2675,
    changePct1d: 0.42,
    updatedAt: now(),
    state: "mock",
    source: "mock"
  },
  {
    symbol: "AUDUSD",
    bid: 0.6582,
    ask: 0.6583,
    mid: 0.65825,
    changePct1d: -0.18,
    updatedAt: now(),
    state: "mock",
    source: "mock"
  },
  {
    symbol: "EURUSD",
    bid: 1.0823,
    ask: 1.0824,
    mid: 1.08235,
    changePct1d: 0.11,
    updatedAt: now(),
    state: "mock",
    source: "mock"
  },
  {
    symbol: "NZDUSD",
    bid: 0.6011,
    ask: 0.6013,
    mid: 0.6012,
    changePct1d: -0.34,
    updatedAt: minutesAgo(4),
    state: "stale",
    source: "mock"
  },
  {
    symbol: "USDJPY",
    bid: 156.42,
    ask: 156.45,
    mid: 156.435,
    changePct1d: 0.61,
    updatedAt: now(),
    state: "mock",
    source: "mock"
  },
  {
    symbol: "AUDJPY",
    bid: 102.95,
    ask: 102.99,
    mid: 102.97,
    changePct1d: 0.45,
    updatedAt: minutesAgo(6),
    state: "stale",
    source: "mock"
  },
  {
    symbol: "EURJPY",
    bid: 169.38,
    ask: 169.41,
    mid: 169.395,
    changePct1d: 0.72,
    updatedAt: now(),
    state: "mock",
    source: "mock"
  },
  {
    symbol: "XAUUSD",
    bid: 2331.4,
    ask: 2331.9,
    mid: 2331.65,
    changePct1d: -0.22,
    updatedAt: now(),
    state: "unavailable",
    source: "mock"
  }
];
const mockRegimes = [
  {
    symbol: "GBPUSD",
    bias: "BULL",
    chop: 0.22,
    anchorChop: "none",
    sfPosition: 28.4,
    afPosition: 22.1,
    nearestFib: 1.267,
    updatedAt: now(),
    state: "mock"
  },
  {
    symbol: "AUDUSD",
    bias: "BEAR",
    chop: 0.34,
    anchorChop: "AF",
    sfPosition: 31.2,
    afPosition: 51.7,
    nearestFib: 0.658,
    updatedAt: now(),
    state: "mock"
  },
  {
    symbol: "EURUSD",
    bias: "RANGING",
    chop: 0.71,
    anchorChop: "SF+AF",
    sfPosition: 49.3,
    afPosition: 52.8,
    nearestFib: 1.082,
    updatedAt: now(),
    state: "mock"
  },
  {
    symbol: "NZDUSD",
    bias: "BEAR",
    chop: 0.45,
    anchorChop: "none",
    sfPosition: 18.6,
    afPosition: 24,
    nearestFib: 0.6,
    updatedAt: minutesAgo(4),
    state: "stale"
  },
  {
    symbol: "USDJPY",
    bias: "BULL",
    chop: 0.18,
    anchorChop: "none",
    sfPosition: 15.2,
    afPosition: 12.9,
    nearestFib: 156.2,
    updatedAt: now(),
    state: "mock"
  },
  {
    symbol: "AUDJPY",
    bias: "BULL",
    chop: 0.28,
    anchorChop: "SF",
    sfPosition: 44.1,
    afPosition: 30.5,
    nearestFib: 102.8,
    updatedAt: minutesAgo(6),
    state: "stale"
  },
  {
    symbol: "EURJPY",
    bias: "BULL",
    chop: 0.2,
    anchorChop: "none",
    sfPosition: 21.3,
    afPosition: 19.8,
    nearestFib: 169.1,
    updatedAt: now(),
    state: "mock"
  },
  {
    symbol: "XAUUSD",
    bias: "RANGING",
    chop: 0.62,
    anchorChop: null,
    sfPosition: null,
    afPosition: null,
    nearestFib: null,
    updatedAt: now(),
    state: "unavailable"
  }
];
const mockGates = [
  { symbol: "GBPUSD", allow: "BOTH", state: "mock" },
  { symbol: "AUDUSD", allow: "SELL", state: "mock" },
  {
    symbol: "EURUSD",
    allow: "BLOCKED",
    reason: "SF+AF dual equilibrium — anchor chop zone",
    state: "blocked"
  },
  { symbol: "NZDUSD", allow: "SELL", state: "stale" },
  { symbol: "USDJPY", allow: "BUY", state: "mock" },
  { symbol: "AUDJPY", allow: "BUY", state: "mock" },
  { symbol: "EURJPY", allow: "BUY", state: "mock" },
  { symbol: "XAUUSD", allow: "BLOCKED", reason: "feed unavailable", state: "unavailable" }
];
const mockSignals = [
  {
    id: "sig-001",
    symbol: "GBPUSD",
    direction: "LONG",
    status: "READY",
    confluence: ["sweep", "MSS", "fib-OB", "London-AM"],
    verdict: "A+",
    computedBy: "backend",
    backendConfirmed: true,
    createdAt: minutesAgo(3)
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
    createdAt: minutesAgo(8)
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
    createdAt: minutesAgo(12)
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
    createdAt: minutesAgo(2)
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
    createdAt: minutesAgo(20)
  }
];
const mockPlan = {
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
    e3: { ratio: 100, stopRatio: 125, family: "LTF_SF" }
  },
  riskUSC: 124,
  riskZAR: 2280,
  drawdownImpactPct: 0.62,
  source: "backend-blueprint",
  executionSource: "LTF_SF"
};
const mockPositions = [
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
    state: "mock"
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
    state: "mock"
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
    state: "stale"
  }
];
const mockOrders = [
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
    state: "mock"
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
    state: "mock"
  },
  {
    id: "ord-3",
    symbol: "USDJPY",
    direction: "LONG",
    type: "LIMIT",
    price: 156,
    lots: 0.12,
    sl: 155.6,
    tp: 156.9,
    placedAt: minutesAgo(10),
    state: "mock"
  },
  {
    id: "ord-4",
    symbol: "EURJPY",
    direction: "LONG",
    type: "STOP",
    price: 169.5,
    lots: 0.1,
    sl: 169,
    tp: 170.4,
    placedAt: minutesAgo(2),
    state: "pending-sync"
  }
];
const mockEngineHealth = {
  backendSync: "mock",
  priceFeed: "mock",
  twelveDataKey: "present",
  twelveDataKeyStatus: "ok",
  lastBatchAt: minutesAgo(1),
  lastEngineRunAt: minutesAgo(1)
};
const mockSettings = {
  backendUrl: "https://trader.stokvelsociety.co.za/wp-json",
  apiKeyStatus: "missing",
  refreshIntervalSec: 2,
  staleThresholdSec: 10,
  watchlist: WATCHLIST,
  riskAllocation: { perTradePct: 0.5, dailyMaxPct: 2, ddCapPct: 6 }
};
const mockRiskProfile = {
  tier: "balanced",
  maxConcurrentTrades: 3,
  perTradePct: 0.5,
  dailyMaxPct: 2,
  ddCapPct: 6,
  cooldownMin: 30,
  updatedAt: minutesAgo(60)
};
const mockAccount = {
  balanceUSC: 24820,
  equityUSC: 24876,
  marginUsedPct: 4.2,
  drawdownPct: 1.1,
  openPositions: 3,
  pendingOrders: 4,
  todayPnlUSC: 56.4,
  todayPnlPct: 0.23,
  state: "mock"
};
const mockUserProgress = {
  equityPulse: {
    equityUSC: mockAccount.equityUSC,
    todayPnlUSC: mockAccount.todayPnlUSC,
    state: "LIVE"
  },
  streak: {
    currentStreakDays: 4,
    lastActiveDate: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    state: "LIVE"
  },
  milestones: {
    firstHeartbeat: true,
    firstMarketStream: true,
    firstTradeTelemetry: true,
    state: "LIVE"
  },
  generatedAt: now()
};
function xorshift32(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967295;
  };
}
function symbolSeed(symbol) {
  return [...symbol].reduce((acc, c) => acc * 31 + c.charCodeAt(0) | 0, 2654435769);
}
function mockPriceSeries(symbol, points = 80) {
  const base = mockPrices.find((p) => p.symbol === symbol)?.mid ?? 1;
  const drift = 8e-5;
  const volatility = 12e-4;
  const maxTickPct = 5e-4;
  const tickSize = symbol === "XAUUSD" ? 0.01 : symbol.endsWith("JPY") ? 1e-3 : 1e-4;
  const decimals = symbol === "XAUUSD" ? 2 : symbol.endsWith("JPY") ? 3 : 5;
  const pointCount = Number.isFinite(points) ? Math.max(1, Math.floor(points)) : 80;
  const nowTs = Date.now();
  const rand = xorshift32(symbolSeed(symbol));
  const out = [];
  out.push({
    t: nowTs - (pointCount - 1) * 6e4,
    p: Number(base.toFixed(decimals))
  });
  let v = base;
  for (let i = pointCount - 2; i >= 0; i -= 1) {
    const shock = (rand() - 0.5) * 2;
    const rawPct = drift + volatility * shock;
    const cappedPct = Math.max(-maxTickPct, Math.min(maxTickPct, rawPct));
    v = Math.max(tickSize, v * (1 + cappedPct));
    v = Math.round(v / tickSize) * tickSize;
    out.push({
      t: nowTs - i * 6e4,
      p: Number(v.toFixed(decimals))
    });
  }
  return out;
}
const ALL_FIB_RATIOS = [
  -200,
  -162.5,
  -100,
  -62.5,
  -25,
  0,
  25,
  50,
  62.5,
  75,
  100,
  125,
  162.5,
  200,
  262.5,
  300
];
function fibLabel(ratio) {
  return Number.isInteger(ratio) ? `${ratio}%` : `${ratio}%`;
}
function fibRole(ratio) {
  if (ratio < 0) return "premium-extension";
  if (ratio > 100) return "discount-extension";
  if (ratio < 50) return "premium";
  if (ratio === 50) return "equilibrium";
  return "discount";
}
function mockFibLevels(symbol) {
  const base = mockPrices.find((p) => p.symbol === symbol)?.mid ?? 1;
  const range = base * 5e-3;
  return ALL_FIB_RATIOS.map((ratio) => ({
    ratio,
    label: fibLabel(ratio),
    price: base + range - ratio / 100 * range * 2,
    role: fibRole(ratio)
  }));
}
const mockEquityCurve = Array.from({ length: 30 }).map((_, i) => ({
  day: i + 1,
  equity: 24e3 + i * 30 + Math.sin(i / 3) * 80
}));
class AuthError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthError";
  }
}
const WORDPRESS_BACKEND_URL = "https://trader.stokvelsociety.co.za/wp-json";
function resolveDefaultBackendUrl(buildVal, runtimeOrigin) {
  const normalizedBuildVal = normalizeBackendUrl(buildVal);
  if (normalizedBuildVal) return normalizedBuildVal;
  if (runtimeOrigin) {
    try {
      const { hostname, origin } = new URL(runtimeOrigin);
      if (hostname === "trader.stokvelsociety.co.za") {
        return `${origin}/wp-json`;
      }
    } catch {
    }
  }
  return WORDPRESS_BACKEND_URL;
}
const DEFAULT_BACKEND_URL = resolveDefaultBackendUrl(
  void 0,
  typeof window !== "undefined" ? window.location.origin : void 0
);
const MOCK_MODE = String("false").toLowerCase() === "true";
let backendUrl = DEFAULT_BACKEND_URL;
function normalizeBackendUrl(url) {
  return typeof url === "string" ? url.trim() : "";
}
function setBackendUrl(url) {
  backendUrl = normalizeBackendUrl(url) || DEFAULT_BACKEND_URL;
}
function requireLaddersResponse(raw) {
  if (Array.isArray(raw)) return raw;
  throw new Error("/ladders: backend response missing ladder array");
}
function requireWatchlistResponse(path, watchlist) {
  if (!Array.isArray(watchlist)) {
    const message = `${path}: backend response missing watchlist array`;
    console.error(message);
    throw new Error(message);
  }
  return watchlist;
}
async function call(path, opts = {}) {
  const headers = {};
  if (opts.body) headers["Content-Type"] = "application/json";
  if (!opts.skipAuthHeaders) {
    const authHeader = getAuthHeader();
    if (authHeader) {
      headers["Authorization"] = authHeader;
    } else {
      const nonce = getWordPressNonce();
      if (nonce) headers["X-WP-Nonce"] = nonce;
    }
  }
  let url = `${backendUrl.replace(/\/$/, "")}/sniper/v1${path}`;
  if ((opts.method ?? "GET") === "GET" && opts.cacheBust) {
    url += `${url.includes("?") ? "&" : "?"}_=${Date.now()}`;
  }
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      cache: opts.cacheBust ? "no-store" : "default",
      credentials: opts.authenticated === false ? "omit" : "include",
      body: opts.body ? JSON.stringify(opts.body) : void 0
    });
    if (res.status === 401) {
      clearCredentials();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("smc:auth-required"));
      }
      throw new AuthError();
    }
    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`API ${path} failed: ${res.status}${errorBody ? ` - ${errorBody}` : ""}`);
    }
    if (res.status === 204) {
      if (opts.allowEmptyResponse) return {};
      throw new Error(`API ${path} failed: expected response body but got 204 No Content`);
    }
    const text = await res.text();
    if (!text.trim()) {
      if (opts.allowEmptyResponse) return {};
      throw new Error(`API ${path} failed: expected response body but got empty 2xx response`);
    }
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (error instanceof Error) throw error;
    throw new Error(`API ${path} failed: ${String(error)}`);
  }
}
async function fetchAdminHealth() {
  return call("/admin/health", { cacheBust: true });
}
async function fetchSoakReport() {
  return call("/admin/soak-report", { cacheBust: true });
}
async function upsertSoakEvidence(payload) {
  assertValidSoakEvidencePayload(payload);
  return call("/admin/soak-evidence", {
    method: "POST",
    body: payload
  });
}
async function createSoakCheckpoint(opts) {
  return call("/admin/soak-checkpoint", {
    method: "POST",
    body: {
      operator_notes: opts?.operatorNotes ?? "",
      checkpoint_type: opts?.checkpointType ?? "checkpoint"
    }
  });
}
async function resetSoak() {
  return call("/admin/soak-reset", { method: "DELETE" });
}
const apiClient = {
  async getUnifiedSnapshot(mock = MOCK_MODE) {
    if (mock) {
      const wl = new Set(mockSettings.watchlist);
      return {
        prices: mockPrices.filter((p) => wl.has(p.symbol)),
        regimes: mockRegimes.filter((r) => wl.has(r.symbol)),
        gates: mockGates.filter((g) => wl.has(g.symbol)),
        diagnostics: []
      };
    }
    const snapshot = await call("/snapshot/unified", { cacheBust: true });
    return normalizeSnapshot(snapshot);
  },
  /** Compatibility alias — delegates to getUnifiedSnapshot. */
  async getSnapshot(mock = MOCK_MODE) {
    return this.getUnifiedSnapshot(mock);
  },
  async getChartSnapshot(symbol, timeframe = "15min", mock = MOCK_MODE) {
    if (mock) {
      const candles = mockPriceSeries(symbol).map((p) => ({
        time: new Date(p.t).toISOString(),
        open: p.p,
        high: p.p,
        low: p.p,
        close: p.p
      }));
      return {
        symbol,
        timeframe,
        candles,
        fibLevels: mockFibLevels(symbol).map((f) => ({
          family: "LTF_SF",
          ratio: f.ratio,
          label: f.label,
          price: f.price,
          role: f.role
        })),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        state: "mock"
      };
    }
    return call(
      `/charts?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
      { cacheBust: true }
    );
  },
  async getLiveSignals(mock = MOCK_MODE, boardSize) {
    const response = await this.getDisplaySignals(mock, boardSize);
    return response.signals;
  },
  async getDisplaySignals(mock = MOCK_MODE, boardSize, scope) {
    if (mock) {
      const wl = new Set(mockSettings.watchlist);
      const allSignals = scope === "global" ? mockSignals : mockSignals.filter((s) => wl.has(s.symbol));
      const totalActive = allSignals.length;
      const signals = allSignals.slice(0, boardSize ?? 3);
      return {
        signals,
        polledAt: (/* @__PURE__ */ new Date()).toISOString(),
        meta: { boardSize: boardSize ?? 3, totalActive }
      };
    }
    const params = new URLSearchParams();
    if (boardSize) params.set("board_size", String(boardSize));
    if (scope === "global") params.set("scope", "global");
    const qs = params.toString();
    const path = qs ? `/live-signals?${qs}` : "/live-signals";
    const raw = await call(path, {
      cacheBust: true
    });
    return normalizeLiveSignalsEnvelope(raw);
  },
  async getLadders(symbol, mock = MOCK_MODE) {
    if (mock) return [mockPlan];
    const raw = await call(`/ladders${symbol ? `?symbol=${symbol}` : ""}`, {
      cacheBust: true
    });
    return requireLaddersResponse(raw);
  },
  async getSession(mock = MOCK_MODE) {
    if (mock)
      return { name: "London-AM", openUtc: "07:00", closeUtc: "11:00", state: "mock" };
    return call("/session", {
      skipAuthHeaders: true,
      authenticated: false
    });
  },
  async getEngineHealth(mock = MOCK_MODE) {
    if (mock) return mockEngineHealth;
    return call("/health", { cacheBust: true });
  },
  async getAdminHealth() {
    return fetchAdminHealth();
  },
  async getAccountTelemetry(mock = MOCK_MODE) {
    if (mock) {
      return {
        accountId: "mock-account",
        terminalId: "mock-terminal",
        balance: mockAccount.balanceUSC,
        equity: mockAccount.equityUSC,
        margin: mockAccount.marginUsedPct / 100 * mockAccount.equityUSC,
        freeMargin: mockAccount.equityUSC - mockAccount.marginUsedPct / 100 * mockAccount.equityUSC,
        marginLevel: mockAccount.marginUsedPct > 0 ? 100 / mockAccount.marginUsedPct * 100 : 0,
        floatingPl: mockAccount.equityUSC - mockAccount.balanceUSC,
        currency: "USD",
        leverage: 0,
        eaVersion: "mock",
        lastSeenAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        state: mockAccount.state
      };
    }
    return normalizeAccountTelemetry(
      await call("/account-telemetry", { cacheBust: true })
    );
  },
  // Authenticated user
  async getUserTrades(mock = MOCK_MODE) {
    if (mock) return { positions: mockPositions, orders: mockOrders };
    const [positions, orders] = await Promise.all([
      call("/positions", { cacheBust: true }),
      call("/orders", { cacheBust: true })
    ]);
    return {
      positions: normalizeTelemetryPositions(positions),
      orders: normalizeTelemetryOrders(orders)
    };
  },
  async getUserAccount(mock = MOCK_MODE) {
    if (mock) return mockAccount;
    return call("/user/account", { cacheBust: true });
  },
  async postUserAccount(payload, mock = MOCK_MODE) {
    if (mock) return { ok: true };
    return call("/user/account", { method: "POST", body: payload });
  },
  async getUserSettings(mock = MOCK_MODE) {
    if (mock) return mockSettings;
    return call("/user/settings", { cacheBust: true });
  },
  async postUserSettings(payload, mock = MOCK_MODE) {
    if (mock) return { ok: true };
    return call("/user/settings", { method: "POST", body: payload });
  },
  async postTwelveDataKey(payload, mock = MOCK_MODE) {
    if (mock) return { ok: Boolean(payload.apiKey), status: payload.apiKey ? "ok" : "missing" };
    return call("/user/twelve-data-key", { method: "POST", body: payload });
  },
  async deleteTwelveDataKey(mock = MOCK_MODE) {
    if (mock) return { ok: true, status: "missing" };
    return call("/user/twelve-data-key", { method: "DELETE", allowEmptyResponse: true });
  },
  async getUserRiskProfile(mock = MOCK_MODE) {
    if (mock) return mockRiskProfile;
    return call("/user/risk-profile", { cacheBust: true });
  },
  async getUserProgress(mock = MOCK_MODE) {
    if (mock) return mockUserProgress;
    return normalizeUserProgress(
      await call("/user/progress", { cacheBust: true })
    );
  },
  async postUserRiskProfile(payload, mock = MOCK_MODE) {
    if (mock) return { ok: true };
    return call("/user/risk-profile", { method: "POST", body: payload });
  },
  async postExecuteSignals(payload, mock = MOCK_MODE) {
    if (mock) return { ok: true, queued: payload.signalIds.length };
    return call("/user/execute-signals", { method: "POST", body: payload });
  },
  /** Force a backend market-data refresh + engine run for the given symbols (or full watchlist). */
  async postEngineBatch(symbols, mock = MOCK_MODE) {
    if (mock) return { ok: true, diagnostics: [] };
    return call("/user/engine-batch", { method: "POST", body: symbols ? { symbols } : {} });
  },
  // Dedicated watchlist endpoints - changes persist immediately without a full settings save.
  async postWatchlistAdd(symbol, mock = MOCK_MODE) {
    if (mock) {
      const sym = symbol;
      if (!mockSettings.watchlist.includes(sym)) {
        mockSettings.watchlist = [...mockSettings.watchlist, sym];
      }
      return { ok: true, watchlist: mockSettings.watchlist };
    }
    const result = await call("/user/watchlist/add", {
      method: "POST",
      body: { symbol }
    });
    return {
      ok: result.ok,
      watchlist: requireWatchlistResponse("/user/watchlist/add", result.watchlist)
    };
  },
  async postWatchlistRemove(symbol, mock = MOCK_MODE) {
    if (mock) {
      mockSettings.watchlist = mockSettings.watchlist.filter((s) => s !== symbol);
      return { ok: true, watchlist: mockSettings.watchlist };
    }
    const result = await call("/user/watchlist/remove", {
      method: "POST",
      body: { symbol }
    });
    return {
      ok: result.ok,
      watchlist: requireWatchlistResponse("/user/watchlist/remove", result.watchlist)
    };
  }
};
function reconcileUserTrades(previous, next, now2, graceMs) {
  const positions = reconcileTradeRows(previous?.positions, next.positions, now2, graceMs);
  const orders = reconcileTradeRows(previous?.orders, next.orders, now2, graceMs);
  return {
    data: {
      positions: positions.map((entry) => entry.row),
      orders: orders.map((entry) => entry.row)
    },
    state: {
      positions,
      orders
    }
  };
}
function reconcileTradeRows(previous, incoming, now2, graceMs) {
  const nextRows = [];
  const incomingById = new Map(incoming.map((row) => [row.id, row]));
  const retainedIds = /* @__PURE__ */ new Set();
  for (const previousEntry of previous ?? []) {
    const incomingRow = incomingById.get(previousEntry.row.id);
    if (incomingRow) {
      nextRows.push({
        row: reuseRowWhenUnchanged(previousEntry.row, incomingRow),
        missingSince: null
      });
      retainedIds.add(incomingRow.id);
      continue;
    }
    const missingSince = previousEntry.missingSince ?? now2;
    if (graceMs > 0 && now2 - missingSince < graceMs) {
      nextRows.push({
        row: markRowStale(previousEntry.row),
        missingSince
      });
    }
  }
  for (const incomingRow of incoming) {
    if (retainedIds.has(incomingRow.id)) continue;
    nextRows.push({
      row: incomingRow,
      missingSince: null
    });
  }
  return nextRows;
}
function reuseRowWhenUnchanged(previous, incoming) {
  return shallowEqualTradeRow(previous, incoming) ? previous : incoming;
}
function markRowStale(row) {
  return row.state === "stale" ? row : { ...row, state: "stale" };
}
function shallowEqualTradeRow(left, right) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}
const DEFAULT_POLL_MS = 2e3;
const WATCHLIST_LIMIT = 24;
function useBackendReady() {
  return usePollingQueryState().backendReady;
}
function usePollMs() {
  return usePollingQueryState().pollMs;
}
function resolvePollMs(settings) {
  const sec = settings?.refreshIntervalSec;
  if (!settings) return null;
  return Number.isFinite(sec) && (sec ?? 0) > 0 ? sec * 1e3 : DEFAULT_POLL_MS;
}
function usePollingQueryState() {
  const settingsQuery = useUserSettings();
  const settings = settingsQuery.data;
  const pendingSettingsLoad = settings === void 0 && (settingsQuery.fetchStatus === "fetching" || settingsQuery.isPending || settingsQuery.isLoading);
  const settingsLoadFailed = settings === void 0 && Boolean(settingsQuery.isError);
  const pollMs = pendingSettingsLoad ? null : resolvePollMs(settings);
  const backendUrl2 = normalizeBackendUrl(settings?.backendUrl);
  const backendReady = backendUrl2.length > 0;
  const missingBackendUrl = !pendingSettingsLoad && !settingsLoadFailed && backendUrl2.length === 0;
  const settingsLoadError = settingsLoadFailed && settingsQuery.error instanceof Error ? settingsQuery.error.message : null;
  return {
    backendReady,
    pendingSettingsLoad,
    missingBackendUrl,
    settingsLoadFailed,
    settingsLoadError,
    pollMs,
    retrySettingsLoad: settingsQuery.refetch
  };
}
function usePollingUiState() {
  return usePollingQueryState();
}
function useLivePollingDiagnostics(label, backendReady, pendingSettingsLoad, pollMs) {
  const previousPollMsRef = useRef(pollMs);
  useEffect(() => {
    {
      previousPollMsRef.current = pollMs;
      return;
    }
  }, [backendReady, label, pendingSettingsLoad, pollMs]);
}
function useSnapshot() {
  const { backendReady, pendingSettingsLoad, pollMs } = usePollingQueryState();
  const enabled = backendReady && pollMs !== null;
  useLivePollingDiagnostics("SNAPSHOT_POLL", backendReady, pendingSettingsLoad, pollMs);
  return useQuery({
    queryKey: ["snapshot"],
    queryFn: () => apiClient.getSnapshot(),
    enabled,
    staleTime: 0,
    structuralSharing: false,
    placeholderData: (previousData) => {
      if (previousData?.prices?.some((p) => p.state !== "live")) {
        return void 0;
      }
      return keepPreviousData(previousData);
    },
    refetchOnWindowFocus: false,
    refetchInterval: enabled && pollMs !== null ? pollMs : false
  });
}
function useDisplaySignals(boardSize = 3, scope) {
  const { backendReady, pollMs } = usePollingQueryState();
  const enabled = backendReady && pollMs !== null;
  return useQuery({
    queryKey: ["live-signals", boardSize, scope ?? "watchlist"],
    queryFn: () => apiClient.getDisplaySignals(false, boardSize, scope),
    enabled,
    staleTime: 0,
    structuralSharing: false,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchInterval: enabled && pollMs !== null ? pollMs : false
  });
}
function useLiveSignals() {
  const query = useDisplaySignals(3);
  return { ...query, data: query.data?.signals };
}
function useUserTrades() {
  const { backendReady, pollMs } = usePollingQueryState();
  const enabled = backendReady && pollMs !== null;
  return useQuery({
    queryKey: ["user-trades"],
    queryFn: () => apiClient.getUserTrades(),
    enabled,
    refetchInterval: enabled && pollMs !== null ? pollMs : false
  });
}
function useStableUserTrades() {
  const tradesQuery = useUserTrades();
  const pollMs = usePollMs();
  const continuityRef = useRef(null);
  const continuitySnapshotRef = useRef({
    source: void 0,
    pollMs: null,
    data: void 0,
    dataUpdatedAt: 0
  });
  if (tradesQuery.data == null) {
    if (tradesQuery.error) {
      continuityRef.current = null;
    }
    continuitySnapshotRef.current = {
      source: tradesQuery.data,
      pollMs,
      data: tradesQuery.data,
      dataUpdatedAt: tradesQuery.dataUpdatedAt
    };
  } else if (continuitySnapshotRef.current.source !== tradesQuery.data || continuitySnapshotRef.current.pollMs !== pollMs || continuitySnapshotRef.current.dataUpdatedAt !== tradesQuery.dataUpdatedAt) {
    const reconciled = reconcileUserTrades(
      continuityRef.current,
      tradesQuery.data,
      Date.now(),
      pollMs ?? DEFAULT_POLL_MS
    );
    continuityRef.current = reconciled.state;
    continuitySnapshotRef.current = {
      source: tradesQuery.data,
      pollMs,
      data: reconciled.data,
      dataUpdatedAt: tradesQuery.dataUpdatedAt
    };
  }
  return {
    ...tradesQuery,
    data: continuitySnapshotRef.current.data
  };
}
function useUserAccount() {
  const { backendReady, pollMs } = usePollingQueryState();
  const enabled = backendReady && pollMs !== null;
  return useQuery({
    queryKey: ["user-account"],
    queryFn: () => apiClient.getUserAccount(),
    enabled,
    refetchInterval: enabled && pollMs !== null ? pollMs : false
  });
}
function useUserProgress() {
  const { backendReady, pollMs } = usePollingQueryState();
  const enabled = backendReady && pollMs !== null;
  return useQuery({
    queryKey: ["user-progress"],
    queryFn: () => apiClient.getUserProgress(),
    enabled,
    staleTime: 0,
    refetchInterval: enabled && pollMs !== null ? pollMs : false
  });
}
function useAccountTelemetry() {
  const { backendReady, pollMs } = usePollingQueryState();
  const enabled = backendReady && pollMs !== null;
  return useQuery({
    queryKey: ["account-telemetry"],
    queryFn: () => apiClient.getAccountTelemetry(),
    enabled,
    refetchInterval: enabled && pollMs !== null ? pollMs : false
  });
}
function useUserSettings() {
  return useQuery({
    queryKey: ["user-settings"],
    queryFn: async () => {
      const s = normalizeDashboardSettings(await apiClient.getUserSettings());
      setBackendUrl(s.backendUrl);
      return s;
    },
    staleTime: 3e4
  });
}
function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => apiClient.getSession(),
    refetchInterval: 6e4
    // Session changes infrequently
  });
}
function normalizeWatchlist(watchlist) {
  const canonical = [];
  for (const symbol of watchlist ?? []) {
    if (typeof symbol !== "string") continue;
    const normalized = symbol.trim().toUpperCase();
    if (!normalized || canonical.includes(normalized)) continue;
    canonical.push(normalized);
    if (canonical.length === WATCHLIST_LIMIT) break;
  }
  return canonical;
}
const COMPARISON_SUFFIXES = [
  ".MICRO",
  ".PRO",
  ".ECN",
  ".STP",
  ".RAW",
  ".M",
  ".R",
  "-MICRO",
  "-PRO",
  "-ECN",
  "-STP",
  "-RAW",
  "+"
];
const COMPACT_COMPARISON_SUFFIXES = ["MICRO", "PRO", "ECN", "RAW", "M", "R", "C"];
function normalizeSymbolForWatchlistComparison(symbol) {
  let normalized = typeof symbol === "string" ? symbol.trim().toUpperCase() : "";
  if (!normalized) return "";
  for (const suffix of COMPARISON_SUFFIXES) {
    if (normalized.endsWith(suffix) && normalized.length > suffix.length) {
      normalized = normalized.slice(0, -suffix.length);
      break;
    }
  }
  for (const suffix of COMPACT_COMPARISON_SUFFIXES) {
    if (normalized.endsWith(suffix) && normalized.length > suffix.length) {
      normalized = normalized.slice(0, -suffix.length);
      break;
    }
  }
  return normalized;
}
function normalizeDashboardSettings(settings) {
  return {
    ...settings,
    backendUrl: normalizeBackendUrl(settings.backendUrl),
    watchlist: normalizeWatchlist(settings.watchlist)
  };
}
function clampSymbolToWatchlist(symbol, watchlist) {
  if (symbol && watchlist.includes(symbol)) {
    return symbol;
  }
  return watchlist[0] ?? null;
}
function alignWatchlistItems(items, watchlist) {
  const itemsBySymbol = /* @__PURE__ */ new Map();
  for (const item of items ?? []) {
    if (!itemsBySymbol.has(item.symbol)) itemsBySymbol.set(item.symbol, item);
  }
  return watchlist.map((symbol) => ({ symbol, item: itemsBySymbol.get(symbol) }));
}
function useWatchlist() {
  const { data } = useUserSettings();
  return useMemo(() => normalizeWatchlist(data?.watchlist), [data?.watchlist]);
}
function useCanonicalWatchlist() {
  const watchlist = useWatchlist();
  const watchlistSet = useMemo(() => {
    const members = /* @__PURE__ */ new Set();
    for (const symbol of watchlist) {
      members.add(symbol);
      members.add(normalizeSymbolForWatchlistComparison(symbol));
    }
    return members;
  }, [watchlist]);
  return { watchlist, watchlistSet };
}
async function cancelWatchlistQueries(queryClient) {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: ["user-settings"] }),
    queryClient.cancelQueries({ queryKey: ["snapshot"] }),
    queryClient.cancelQueries({ queryKey: ["live-signals"] }),
    queryClient.cancelQueries({ queryKey: ["ladders"] }),
    queryClient.cancelQueries({ queryKey: ["engine-health"] }),
    queryClient.cancelQueries({ queryKey: ["chart"] })
  ]);
}
async function invalidateWatchlistQueries(queryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["snapshot"], refetchType: "none" }),
    queryClient.invalidateQueries({ queryKey: ["live-signals"], refetchType: "none" }),
    queryClient.invalidateQueries({ queryKey: ["ladders"], refetchType: "none" }),
    queryClient.invalidateQueries({ queryKey: ["engine-health"], refetchType: "none" }),
    queryClient.invalidateQueries({ queryKey: ["chart"], refetchType: "none" })
  ]);
  await Promise.all([
    queryClient.refetchQueries({ queryKey: ["snapshot"], type: "active" }),
    queryClient.refetchQueries({ queryKey: ["live-signals"], type: "active" }),
    queryClient.refetchQueries({ queryKey: ["ladders"], type: "active" }),
    queryClient.refetchQueries({ queryKey: ["engine-health"], type: "active" }),
    queryClient.refetchQueries({ queryKey: ["chart"], type: "active" })
  ]);
}
function writeCanonicalWatchlist(queryClient, watchlist) {
  const canonicalWatchlist = normalizeWatchlist(watchlist);
  queryClient.setQueryData(
    ["user-settings"],
    (old) => old ? { ...old, watchlist: canonicalWatchlist } : old
  );
}
function useWatchlistAdd() {
  const queryClient = useQueryClient();
  return useMutation(
    {
      mutationFn: (symbol) => apiClient.postWatchlistAdd(symbol),
      onMutate: async (symbol) => {
        await cancelWatchlistQueries(queryClient);
        const previousSettings = queryClient.getQueryData(["user-settings"]);
        queryClient.setQueryData(["user-settings"], (old) => {
          if (!old) return old;
          const nextSymbol = symbol;
          if (old.watchlist.includes(nextSymbol)) return old;
          return { ...old, watchlist: normalizeWatchlist([...old.watchlist, nextSymbol]) };
        });
        return { previousSettings };
      },
      onSuccess: async (result) => {
        writeCanonicalWatchlist(queryClient, result.watchlist);
        await invalidateWatchlistQueries(queryClient);
      },
      onError: (_error, _symbol, context) => {
        if (context?.previousSettings) {
          queryClient.setQueryData(["user-settings"], context.previousSettings);
        }
      }
    }
  );
}
function useWatchlistRemove() {
  const queryClient = useQueryClient();
  return useMutation(
    {
      mutationFn: (symbol) => apiClient.postWatchlistRemove(symbol),
      onMutate: async (symbol) => {
        await cancelWatchlistQueries(queryClient);
        const previousSettings = queryClient.getQueryData(["user-settings"]);
        queryClient.setQueryData(["user-settings"], (old) => {
          if (!old) return old;
          return {
            ...old,
            watchlist: normalizeWatchlist(
              old.watchlist.filter((entry) => entry !== symbol)
            )
          };
        });
        return { previousSettings };
      },
      onSuccess: async (result) => {
        writeCanonicalWatchlist(queryClient, result.watchlist);
        await invalidateWatchlistQueries(queryClient);
      },
      onError: (_error, _symbol, context) => {
        if (context?.previousSettings) {
          queryClient.setQueryData(["user-settings"], context.previousSettings);
        }
      }
    }
  );
}
function useEngineHealth() {
  const { backendReady, pollMs } = usePollingQueryState();
  const enabled = backendReady && pollMs !== null;
  return useQuery({
    queryKey: ["engine-health"],
    queryFn: () => apiClient.getEngineHealth(),
    enabled,
    // Phase 0: health query must reflect backend state within one poll cycle; disable caching.
    staleTime: 0,
    refetchInterval: enabled && pollMs !== null ? pollMs : false
  });
}
function useUserRiskProfile() {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: ["user-risk"],
    queryFn: () => apiClient.getUserRiskProfile(),
    enabled: backendReady
  });
}
function createLaddersQueryOptions(enabled, pollMs) {
  return {
    queryKey: ["ladders"],
    queryFn: () => apiClient.getLadders(),
    enabled,
    placeholderData: keepPreviousData,
    refetchInterval: enabled && pollMs !== null ? pollMs : false
  };
}
function useLadders() {
  const { backendReady, pendingSettingsLoad, pollMs } = usePollingQueryState();
  const enabled = backendReady && pollMs !== null;
  useLivePollingDiagnostics("LADDERS_POLL", backendReady, pendingSettingsLoad, pollMs);
  return useQuery(
    createLaddersQueryOptions(enabled, pollMs)
  );
}
function useEngineBatch() {
  const queryClient = useQueryClient();
  return useMutation(
    {
      mutationFn: (symbols) => apiClient.postEngineBatch(symbols),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["snapshot"] });
        queryClient.invalidateQueries({ queryKey: ["live-signals"] });
        queryClient.invalidateQueries({ queryKey: ["engine-health"] });
        queryClient.invalidateQueries({ queryKey: ["ladders"] });
        queryClient.invalidateQueries({ queryKey: ["chart"] });
      }
    }
  );
}
function toFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : void 0;
}
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
function compressImpulse(x) {
  return 1 - Math.exp(-Math.max(0, x) * 900);
}
function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = s + 1831565813 >>> 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function gauss(rand) {
  const u1 = Math.max(rand(), 1e-7);
  const u2 = Math.max(rand(), 1e-7);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function useStreamingTicks(target, pollMsHint = 2e3, holdMs = 700) {
  const numericTarget = toFiniteNumber(target);
  const [value, setValue] = useState(numericTarget);
  const [direction, setDirection] = useState(null);
  const [heldDirection, setHeldDirection] = useState(null);
  const [motionKey, setMotionKey] = useState(0);
  const [motionImpulse, setMotionImpulse] = useState(0);
  const lastEmittedRef = useRef(numericTarget);
  const lastTargetRef = useRef(numericTarget);
  const lastUpdateAtRef = useRef(null);
  const samplesRef = useRef([]);
  const timeoutsRef = useRef([]);
  const dirClearRef = useRef(null);
  const rngSeedRef = useRef((Math.random() * 4294967295 | 0) >>> 0);
  const motionKeyRef = useRef(0);
  function clearScheduled() {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
    if (dirClearRef.current !== null) {
      window.clearTimeout(dirClearRef.current);
      dirClearRef.current = null;
    }
  }
  useEffect(() => {
    if (numericTarget === void 0) {
      clearScheduled();
      lastEmittedRef.current = void 0;
      lastTargetRef.current = void 0;
      setValue(void 0);
      setDirection(null);
      setHeldDirection(null);
      return;
    }
    if (lastTargetRef.current === void 0 || lastEmittedRef.current === void 0) {
      lastTargetRef.current = numericTarget;
      lastEmittedRef.current = numericTarget;
      lastUpdateAtRef.current = performance.now();
      setValue(numericTarget);
      return;
    }
    const prevTarget = lastTargetRef.current;
    if (numericTarget === prevTarget) return;
    const now2 = performance.now();
    const elapsedSec = clamp(
      (now2 - (lastUpdateAtRef.current ?? now2) || pollMsHint) / 1e3,
      0.2,
      10
    );
    lastUpdateAtRef.current = now2;
    lastTargetRef.current = numericTarget;
    const space = prevTarget > 0 && numericTarget > 0 ? "log" : "linear";
    const realizedMove = space === "log" ? Math.log(numericTarget / prevTarget) : numericTarget - prevTarget;
    samplesRef.current = [
      ...samplesRef.current.slice(-11),
      { dtSec: elapsedSec, logMove: realizedMove, space }
    ];
    const driftPerSec = (() => {
      const same = samplesRef.current.filter((s) => s.space === space);
      const totalDt = same.reduce((a, s) => a + s.dtSec, 0);
      if (totalDt <= 0) return 0;
      return same.reduce((a, s) => a + s.logMove, 0) / totalDt;
    })();
    const volPerSqrtSec = (() => {
      const same = samplesRef.current.filter((s) => s.space === space);
      const totalDt = same.reduce((a, s) => a + s.dtSec, 0);
      if (totalDt <= 0) return 0;
      const variance = same.reduce((a, s) => {
        const r = s.logMove - driftPerSec * s.dtSec;
        return a + r * r;
      }, 0) / totalDt;
      return Math.sqrt(Math.max(variance, 0));
    })();
    clearScheduled();
    rngSeedRef.current = (rngSeedRef.current ^ (now2 | 0) * 2654435761) >>> 0;
    const rand = makeRng(rngSeedRef.current);
    const windowMs = Math.max(400, pollMsHint * 0.85);
    const N = 4 + Math.floor(rand() * 6);
    const intervals = [];
    let intervalSum = 0;
    for (let i = 0; i < N; i += 1) {
      const e = -Math.log(Math.max(rand(), 1e-7));
      intervals.push(e);
      intervalSum += e;
    }
    const minStep = 70;
    const offsets = [];
    let acc = 0;
    for (let i = 0; i < N; i += 1) {
      const raw = intervals[i] / intervalSum * (windowMs - minStep * N);
      acc += minStep + Math.max(0, raw);
      offsets.push(acc);
    }
    const startVal = lastEmittedRef.current;
    const seedForBridge = rngSeedRef.current;
    const bridgeRand = makeRng(seedForBridge ^ 2654435769);
    const knotShocks = [0.2, 0.4, 0.6, 0.8].map((p) => {
      const envelope = Math.pow(Math.sin(Math.PI * p), 1.4);
      const base = space === "log" ? volPerSqrtSec * Math.sqrt(elapsedSec) : volPerSqrtSec * Math.sqrt(elapsedSec) * Math.max(Math.abs(prevTarget), 1);
      const amp = Math.min(
        Math.abs(realizedMove) * 0.5 + (space === "log" ? 8e-4 : Math.abs(prevTarget) * 12e-4),
        Math.max(base * 0.45, Math.abs(realizedMove) * 0.18)
      );
      return { p, shock: gauss(bridgeRand) * amp * envelope };
    });
    function bridgeAt(progress) {
      const driftedMove = realizedMove * progress + driftPerSec * (1 - progress) * progress * elapsedSec * 0.15;
      let noise = 0;
      for (let i = 0; i < knotShocks.length; i += 1) {
        const k = knotShocks[i];
        const dist = Math.abs(progress - k.p);
        const w = Math.max(0, 1 - dist * 4);
        noise += k.shock * w;
      }
      const envelope = Math.pow(Math.sin(Math.PI * progress), 1.2);
      const totalMove = driftedMove + noise * envelope;
      if (space === "log") return startVal * Math.exp(totalMove);
      return startVal + totalMove;
    }
    let prevEmitted = startVal;
    for (let i = 0; i < N; i += 1) {
      const isFinal = i === N - 1;
      const delay = offsets[i];
      const id = window.setTimeout(() => {
        const v = isFinal ? numericTarget : bridgeAt((i + 1) / N);
        const dir = v > prevEmitted ? "up" : v < prevEmitted ? "down" : null;
        prevEmitted = v;
        lastEmittedRef.current = v;
        setValue(v);
        if (dir !== null) {
          motionKeyRef.current += 1;
          const impulse = space === "log" ? compressImpulse(Math.abs(Math.log(v / (prevTarget || v)))) : compressImpulse(Math.abs(v - prevTarget) / Math.max(Math.abs(prevTarget), 1));
          setMotionKey(motionKeyRef.current);
          setMotionImpulse(impulse);
          setDirection(dir);
          setHeldDirection(dir);
          if (dirClearRef.current !== null) window.clearTimeout(dirClearRef.current);
          dirClearRef.current = window.setTimeout(() => {
            dirClearRef.current = null;
            setDirection(null);
          }, holdMs);
        }
      }, delay);
      timeoutsRef.current.push(id);
    }
    return () => {
    };
  }, [numericTarget, pollMsHint, holdMs]);
  useEffect(() => () => clearScheduled(), []);
  return { value, direction, heldDirection, motionKey, motionImpulse };
}
function fmtPrice(value, symbol) {
  if (!symbol) return value.toFixed(5);
  if (symbol === "XAUUSD") return value.toFixed(2);
  if (symbol === "XAGUSD") return value.toFixed(3);
  if (symbol.endsWith("JPY")) return value.toFixed(3);
  if (symbol === "XRPUSD") return value.toFixed(4);
  if (symbol === "BTCUSD" || symbol === "ETHUSD" || symbol === "BNBUSD" || symbol === "SOLUSD")
    return value.toFixed(2);
  if (symbol === "US30" || symbol === "NAS100") return value.toFixed(2);
  return value.toFixed(5);
}
function fmtPct(value, signed = true) {
  const s = value.toFixed(2);
  if (signed && value > 0) return `+${s}%`;
  return `${s}%`;
}
function fmtCurrency(value, currency, signed = false) {
  const sign = signed && value > 0 ? "+" : "";
  const cur = (currency ?? "").toUpperCase();
  if (!cur || cur === "USD") {
    return `${sign}$${value.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (cur === "USC") {
    return `${sign}USC ${value.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (cur === "EUR") {
    return `${sign}€${value.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (cur === "GBP") {
    return `${sign}£${value.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (cur === "JPY") {
    return `${sign}¥${value.toLocaleString(void 0, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return `${sign}${cur} ${value.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtLocalCurrency(value, currencyCode, locale) {
  if (value === void 0 || value === null || !Number.isFinite(value)) return "--";
  const resolvedLocale = typeof navigator !== "undefined" ? navigator.language : "en-ZA";
  return new Intl.NumberFormat(resolvedLocale, {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2
  }).format(value);
}
function relTime(iso) {
  if (!iso) return "unknown";
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return "unknown";
  const diff = Date.now() - timestamp;
  if (diff <= 0) return "just now";
  const s = Math.floor(diff / 1e3);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function ranged(hash, base, spread) {
  return base + (spread > 0 ? hash % (spread + 1) : 0);
}
function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}
function resolveTickMotionTimings({
  baseDurationMs,
  durationSpreadMs,
  delayMaxMs,
  dotBaseDurationMs = baseDurationMs,
  dotDurationSpreadMs = durationSpreadMs,
  dotDelayMaxMs = delayMaxMs
}, impulse) {
  return {
    durationBase: baseDurationMs + Math.round(baseDurationMs * 0.14 * impulse),
    durationSpread: Math.max(12, Math.round(durationSpreadMs * (0.55 + impulse * 0.8))),
    delaySpread: Math.max(0, Math.round(delayMaxMs * (1.05 - impulse * 0.65))),
    dotDurationBase: dotBaseDurationMs + Math.round(dotBaseDurationMs * 0.12 * impulse),
    dotDurationSpread: Math.max(12, Math.round(dotDurationSpreadMs * (0.5 + impulse * 0.9))),
    dotDelaySpread: Math.max(0, Math.round(dotDelayMaxMs * (1.05 - impulse * 0.6)))
  };
}
function tickMotionHoldMs(options, motionEvent) {
  const timings = resolveTickMotionTimings(
    options,
    1
  );
  const flashTotal = timings.durationBase + timings.durationSpread + timings.delaySpread;
  const dotTotal = timings.dotDurationBase + timings.dotDurationSpread + timings.dotDelaySpread;
  return Math.max(flashTotal, dotTotal) + 16;
}
function tickMotionStyle(key, {
  baseDurationMs,
  durationSpreadMs,
  delayMaxMs,
  dotBaseDurationMs = baseDurationMs,
  dotDurationSpreadMs = durationSpreadMs,
  dotDelayMaxMs = delayMaxMs
}, motionEvent) {
  const impulse = clamp01(motionEvent?.motionImpulse ?? 0);
  const eventKey = motionEvent?.motionKey ?? "steady";
  const durationHash = hashString(`${key}:${eventKey}:duration`);
  const delayHash = hashString(`${key}:${eventKey}:delay`);
  const dotDurationHash = hashString(`${key}:${eventKey}:dot-duration`);
  const dotDelayHash = hashString(`${key}:${eventKey}:dot-delay`);
  const {
    durationBase,
    durationSpread,
    delaySpread,
    dotDurationBase,
    dotDurationSpread,
    dotDelaySpread
  } = resolveTickMotionTimings(
    {
      baseDurationMs,
      durationSpreadMs,
      delayMaxMs,
      dotBaseDurationMs,
      dotDurationSpreadMs,
      dotDelayMaxMs
    },
    impulse
  );
  return {
    "--tick-flash-duration": `${ranged(durationHash, durationBase, durationSpread)}ms`,
    "--tick-flash-delay": `${ranged(delayHash, 0, delaySpread)}ms`,
    "--tick-flash-dot-duration": `${ranged(dotDurationHash, dotDurationBase, dotDurationSpread)}ms`,
    "--tick-flash-dot-delay": `${ranged(dotDelayHash, 0, dotDelaySpread)}ms`
  };
}
function cn(...inputs) {
  return twMerge(clsx(inputs));
}
function deduplicateById(items) {
  const seen = /* @__PURE__ */ new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
function SyncChip({ state, label = "BACKEND" }) {
  const map = {
    live: { dot: "pulse-dot", text: "text-buy", word: "LIVE" },
    "pending-sync": { dot: "pulse-dot warn", text: "text-info", word: "SYNC" },
    stale: { dot: "pulse-dot warn", text: "text-warn", word: "STALE" },
    closed_session: { dot: "pulse-dot warn", text: "text-info", word: "CLOSED" },
    mock: { dot: "pulse-dot warn", text: "text-violet", word: "MOCK" },
    blocked: { dot: "pulse-dot sell", text: "text-sell", word: "BLOCK" },
    offline: { dot: "pulse-dot sell", text: "text-sell", word: "OFFLINE" },
    unavailable: { dot: "pulse-dot sell", text: "text-mute", word: "N/A" }
  };
  const s = map[state] ?? map.stale;
  return /* @__PURE__ */ jsxs("div", { className: "inline-flex items-center gap-2 rounded-md border border-bd bg-bg2/60 px-2.5 py-1.5", children: [
    /* @__PURE__ */ jsx("span", { className: s.dot }),
    /* @__PURE__ */ jsx("span", { className: "text-[10px] font-semibold tracking-wider text-mute", children: label }),
    /* @__PURE__ */ jsx("span", { className: cn("text-[11px] font-semibold tracking-wider font-mono", s.text), children: s.word })
  ] });
}
function SignalStatusChip({
  ready,
  armed,
  watch
}) {
  return /* @__PURE__ */ jsxs("div", { className: "inline-flex items-center gap-3 rounded-md border border-bd bg-bg2/60 px-2.5 py-1.5 font-mono text-[11px]", children: [
    /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1", children: [
      /* @__PURE__ */ jsx("span", { className: "text-mute", children: "RDY" }),
      /* @__PURE__ */ jsx("span", { className: "text-buy font-semibold", children: ready })
    ] }),
    /* @__PURE__ */ jsx("span", { className: "text-bd", children: "·" }),
    /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1", children: [
      /* @__PURE__ */ jsx("span", { className: "text-mute", children: "ARM" }),
      /* @__PURE__ */ jsx("span", { className: "text-warn font-semibold", children: armed })
    ] }),
    /* @__PURE__ */ jsx("span", { className: "text-bd", children: "·" }),
    /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1", children: [
      /* @__PURE__ */ jsx("span", { className: "text-mute", children: "WTC" }),
      /* @__PURE__ */ jsx("span", { className: "text-info font-semibold", children: watch })
    ] })
  ] });
}
function BrandPulseLogo({ size = "sm", animated = false }) {
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: cn(
        "brand-mark relative overflow-hidden",
        size === "lg" ? "flex h-24 w-24 items-center justify-center rounded-2xl shadow-xl md:h-28 md:w-28" : "flex h-8 w-8 items-center justify-center rounded-md",
        animated && "loading-brand-mark"
      ),
      children: [
        /* @__PURE__ */ jsx(
          Activity,
          {
            className: cn("text-[#1a1208]", size === "lg" ? "h-12 w-12 md:h-14 md:w-14" : "h-4 w-4"),
            strokeWidth: 2.5
          }
        ),
        animated && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("span", { className: "pulse-light pulse-light-buy", "aria-hidden": "true" }),
          /* @__PURE__ */ jsx("span", { className: "pulse-light pulse-light-sell", "aria-hidden": "true" })
        ] })
      ]
    }
  );
}
const APP_VERSION = "13.1.0";
const SCHEMA_VERSION = "1";
const APP_VERSION_LABEL = `v${APP_VERSION}`;
const NAV = [
  { to: "/plan", label: "Plan", short: "Plan", icon: Target },
  { to: "/live", label: "Live Radar", short: "Live", icon: Radar },
  { to: "/signals", label: "Signal Engine", short: "Sigs", icon: Crosshair },
  { to: "/charts", label: "Charts", short: "Chart", icon: LineChart },
  { to: "/book", label: "Active Book", short: "Book", icon: Briefcase },
  { to: "/orders", label: "Pending Orders", short: "Ord", icon: ListChecks },
  { to: "/analytics", label: "Analytics", short: "Anly", icon: BarChart3 },
  { to: "/progress", label: "Progress", short: "Prog", icon: TrendingUp },
  { to: "/account", label: "Account", short: "Acct", icon: Settings }
];
const HEADER_TICK_MOTION = {
  baseDurationMs: 220,
  durationSpreadMs: 120,
  delayMaxMs: 110,
  dotBaseDurationMs: 180,
  dotDurationSpreadMs: 110,
  dotDelayMaxMs: 90
};
function priceDayKey(updatedAt) {
  if (!updatedAt) return null;
  const time = Date.parse(updatedAt);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
}
function inferReferenceOpen(price) {
  const denominator = 1 + price.changePct1d / 100;
  if (Number.isFinite(price.mid) && price.mid > 0 && Number.isFinite(price.changePct1d) && Number.isFinite(denominator) && Math.abs(denominator) > Number.EPSILON) {
    return price.mid / denominator;
  }
  return Number.isFinite(price.mid) && price.mid > 0 ? price.mid : void 0;
}
function HeaderTickerItem({ price, pollMs }) {
  const flashHoldMs = tickMotionHoldMs(HEADER_TICK_MOTION);
  const referenceOpenRef = useRef(null);
  const {
    value: animatedMid,
    direction: midDir,
    heldDirection: heldMidDir,
    motionKey: midMotionKey,
    motionImpulse: midMotionImpulse
  } = useStreamingTicks(price.mid, pollMs, flashHoldMs);
  const motionStyle = tickMotionStyle(`${price.symbol}:header-mid`, HEADER_TICK_MOTION, {
    motionKey: midMotionKey,
    motionImpulse: midMotionImpulse
  });
  const displayMid = animatedMid ?? price.mid;
  const dayKey = priceDayKey(price.updatedAt);
  const inferredReference = inferReferenceOpen(price);
  const referenceNeedsReset = referenceOpenRef.current === null || referenceOpenRef.current.symbol !== price.symbol || referenceOpenRef.current.dayKey !== dayKey || !Number.isFinite(referenceOpenRef.current.reference) || referenceOpenRef.current.reference <= 0;
  if (referenceNeedsReset && inferredReference !== void 0) {
    referenceOpenRef.current = {
      symbol: price.symbol,
      dayKey,
      reference: inferredReference
    };
  }
  const reference = referenceOpenRef.current?.reference ?? inferredReference ?? price.mid;
  const livePct = Number.isFinite(reference) && reference > 0 && Number.isFinite(displayMid) ? (displayMid - reference) / reference * 100 : price.changePct1d;
  return /* @__PURE__ */ jsxs(
    "div",
    {
      style: motionStyle,
      className: "flex items-center gap-2 whitespace-nowrap font-mono text-xs",
      children: [
        /* @__PURE__ */ jsx(
          "span",
          {
            className: cn(
              "header-tick-dot",
              heldMidDir === "up" && "header-tick-dot-hold-up",
              heldMidDir === "down" && "header-tick-dot-hold-down",
              midDir === "up" && "header-tick-dot-up",
              midDir === "down" && "header-tick-dot-down"
            )
          }
        ),
        /* @__PURE__ */ jsx("span", { className: "text-mute inline-block w-[7ch]", children: price.symbol }),
        /* @__PURE__ */ jsx(
          "span",
          {
            className: cn(
              "text-tx inline-block w-[10ch] text-right rounded px-1 -mx-1 tabular-nums price-smooth",
              heldMidDir === "up" && "tick-hold-up",
              heldMidDir === "down" && "tick-hold-down",
              midDir === "up" && "tick-flash-up-fast",
              midDir === "down" && "tick-flash-down-fast"
            ),
            children: fmtPrice(displayMid, price.symbol)
          }
        ),
        /* @__PURE__ */ jsx(
          "span",
          {
            className: cn(
              "inline-block w-[8ch] text-right rounded px-1 -mx-1 tabular-nums price-smooth",
              livePct >= 0 ? "text-buy" : "text-sell"
            ),
            children: fmtPct(livePct)
          }
        )
      ]
    }
  );
}
function HeaderTicker() {
  const { data } = useSnapshot();
  const pollMs = usePollMs() ?? 2e3;
  const { watchlist } = useCanonicalWatchlist();
  const aligned = alignWatchlistItems(data?.prices, watchlist);
  const loop = [...aligned, ...aligned];
  return /* @__PURE__ */ jsxs("div", { className: "relative flex-1 overflow-hidden border-y border-bd bg-bg2/40", children: [
    /* @__PURE__ */ jsx("div", { className: "ticker-track flex w-max items-center gap-6 py-2 px-4", children: loop.map(
      (entry, i) => entry.item && entry.item.mid > 0 && (entry.item.state === "live" || entry.item.state === "mock") ? /* @__PURE__ */ jsx(HeaderTickerItem, { price: entry.item, pollMs }, `${entry.symbol}-${i}`) : /* @__PURE__ */ jsxs(
        "div",
        {
          className: "flex items-center gap-2 whitespace-nowrap font-mono text-xs opacity-60",
          children: [
            /* @__PURE__ */ jsx("span", { className: "header-tick-dot" }),
            /* @__PURE__ */ jsx("span", { className: "text-mute", children: entry.symbol }),
            /* @__PURE__ */ jsx("span", { className: "text-dim tabular-nums", children: "—" }),
            /* @__PURE__ */ jsx("span", { className: "text-mute text-[10px]", children: "awaiting" })
          ]
        },
        `${entry.symbol}-${i}-pending`
      )
    ) }),
    /* @__PURE__ */ jsx("div", { className: "pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-bg to-transparent" }),
    /* @__PURE__ */ jsx("div", { className: "pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-bg to-transparent" })
  ] });
}
function HeaderChips() {
  const qc = useQueryClient();
  const { data: snap } = useSnapshot();
  const { data: signals } = useLiveSignals();
  const { data: health } = useEngineHealth();
  const { data: session } = useSession();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const syncState = health?.backendSync ?? snap?.prices?.[0]?.state ?? "offline";
  const counts = useMemo(() => {
    const unique = deduplicateById(signals ?? []);
    return {
      ready: unique.filter((s) => s.status === "READY").length,
      armed: unique.filter((s) => s.status === "ARMED").length,
      watch: unique.filter((s) => s.status === "WATCH").length
    };
  }, [signals]);
  async function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await qc.refetchQueries({ type: "active" });
    } finally {
      setIsRefreshing(false);
    }
  }
  return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
    session?.name && /* @__PURE__ */ jsx("span", { className: "hidden sm:inline-flex items-center rounded border border-bd bg-bg2/60 px-2 py-0.5 text-[10px] font-mono text-dim", children: session.name }),
    /* @__PURE__ */ jsx(SyncChip, { state: syncState }),
    /* @__PURE__ */ jsx(SignalStatusChip, { ...counts }),
    /* @__PURE__ */ jsx(
      "button",
      {
        onClick: () => void handleRefresh(),
        disabled: isRefreshing,
        className: "inline-flex h-9 w-9 items-center justify-center rounded-md border border-bd bg-bg2/60 text-mute hover:text-tx hover:border-bd2 transition-colors disabled:opacity-50",
        "aria-label": "Refresh",
        children: /* @__PURE__ */ jsx(RefreshCw, { className: cn("h-4 w-4", isRefreshing && "animate-spin") })
      }
    )
  ] });
}
function BrandMark({ compactUntilLg = false }) {
  return /* @__PURE__ */ jsxs(Link, { to: "/plan", className: "flex items-center gap-2.5 shrink-0", children: [
    /* @__PURE__ */ jsx(BrandPulseLogo, { size: "sm" }),
    /* @__PURE__ */ jsxs("div", { className: cn("flex flex-col leading-tight", compactUntilLg && "hidden lg:flex"), children: [
      /* @__PURE__ */ jsx("span", { className: "text-sm font-semibold tracking-tight text-tx", children: "SMC SuperFIB" }),
      /* @__PURE__ */ jsx("span", { className: "text-[10px] tracking-[0.18em] text-mute font-mono", children: APP_VERSION_LABEL })
    ] })
  ] });
}
function LeftRail() {
  const router2 = useRouter();
  const qc = useQueryClient();
  function handleLogout() {
    clearCredentials();
    qc.clear();
    router2.navigate({ to: "/login" });
  }
  return /* @__PURE__ */ jsxs("aside", { className: "hidden md:flex w-16 lg:w-52 shrink-0 flex-col border-r border-bd bg-bg1/40 sticky top-0 h-screen", children: [
    /* @__PURE__ */ jsx("div", { className: "flex justify-center lg:justify-start px-2 lg:px-4 pt-4 pb-3 border-b border-bd", children: /* @__PURE__ */ jsx(BrandMark, { compactUntilLg: true }) }),
    /* @__PURE__ */ jsx("nav", { className: "flex flex-col gap-1 px-2 py-3 overflow-y-auto", children: NAV.map((item) => /* @__PURE__ */ jsxs(
      Link,
      {
        to: item.to,
        title: item.label,
        "aria-label": item.label,
        className: "group flex items-center justify-center gap-3 rounded-xl text-sm text-dim transition-colors hover:bg-bg2/70 hover:text-tx md:mx-auto md:size-11 lg:mx-0 lg:h-auto lg:w-full lg:justify-start lg:px-3 lg:py-2",
        activeProps: {
          className: "bg-bg2/90 text-tx md:shadow-[inset_0_0_0_1px_rgba(216,163,93,0.18),0_8px_18px_-14px_rgba(216,163,93,0.7)] md:[&>svg]:text-accent lg:border-l-2 lg:border-accent lg:shadow-[inset_0_0_0_1px_rgba(216,163,93,0.1)]"
        },
        children: [
          /* @__PURE__ */ jsx(item.icon, { className: "h-4 w-4 text-mute group-hover:text-tx" }),
          /* @__PURE__ */ jsx("span", { className: "hidden lg:inline", children: item.label })
        ]
      },
      item.to
    )) }),
    /* @__PURE__ */ jsxs("div", { className: "mt-auto p-2 lg:p-3 border-t border-bd space-y-2", children: [
      /* @__PURE__ */ jsxs("div", { className: "hidden lg:block text-[10px] font-mono text-mute leading-relaxed", children: [
        "SMC SuperFIB ",
        APP_VERSION_LABEL,
        /* @__PURE__ */ jsx("br", {}),
        "Backend = source of truth"
      ] }),
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: handleLogout,
          className: "flex w-full items-center justify-center lg:justify-start gap-2 rounded-xl px-2 py-1.5 text-xs text-mute hover:text-sell hover:bg-sell/10 transition-colors md:mx-auto md:size-10 lg:mx-0 lg:h-auto lg:w-full",
          "aria-label": "Sign out",
          children: [
            /* @__PURE__ */ jsx(LogOut, { className: "h-3.5 w-3.5" }),
            /* @__PURE__ */ jsx("span", { className: "hidden lg:inline", children: "Sign out" })
          ]
        }
      )
    ] })
  ] });
}
function BottomNav() {
  const { location } = useRouterState();
  return /* @__PURE__ */ jsx("nav", { className: "md:hidden fixed inset-x-0 bottom-0 z-30 grid grid-cols-9 border-t border-bd bg-bg/95 backdrop-blur", children: NAV.map((item) => {
    const active = location.pathname.startsWith(item.to);
    return /* @__PURE__ */ jsxs(
      Link,
      {
        to: item.to,
        className: cn(
          "flex flex-col items-center justify-center gap-0.5 py-2 text-[9px] font-mono uppercase tracking-wider transition-colors",
          active ? "text-accent" : "text-mute hover:text-dim"
        ),
        children: [
          /* @__PURE__ */ jsx(item.icon, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsx("span", { children: item.short })
        ]
      },
      item.to
    );
  }) });
}
function Header() {
  return /* @__PURE__ */ jsxs("header", { className: "sticky top-0 z-30 border-b border-bd bg-bg/85 backdrop-blur", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-stretch gap-3 px-3 py-2 lg:px-4", children: [
      /* @__PURE__ */ jsx("div", { className: "md:hidden", children: /* @__PURE__ */ jsx(BrandMark, {}) }),
      /* @__PURE__ */ jsx(HeaderTicker, {}),
      /* @__PURE__ */ jsx("div", { className: "hidden md:flex items-center", children: /* @__PURE__ */ jsx(HeaderChips, {}) })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex md:hidden items-center justify-end gap-2 px-3 pb-2", children: /* @__PURE__ */ jsx(HeaderChips, {}) })
  ] });
}
function AppShell() {
  useUserSettings();
  const isNavigating = useRouterState({ select: (state) => state.status === "pending" });
  const showLoader = isNavigating;
  return /* @__PURE__ */ jsxs("div", { className: "flex min-h-screen", children: [
    /* @__PURE__ */ jsx(LeftRail, {}),
    /* @__PURE__ */ jsxs("div", { className: "flex min-w-0 flex-1 flex-col", children: [
      /* @__PURE__ */ jsx(Header, {}),
      /* @__PURE__ */ jsxs("main", { className: "relative flex-1 px-3 py-4 pb-20 md:pb-4 lg:px-6 lg:py-6 max-w-[1400px] w-full mx-auto", children: [
        showLoader && /* @__PURE__ */ jsx("div", { className: "absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-accent/20 pointer-events-none", children: /* @__PURE__ */ jsx("div", { className: "nav-progress-bar h-full w-1/3 bg-accent" }) }),
        /* @__PURE__ */ jsx("div", { className: cn("transition-opacity duration-150", isNavigating && "opacity-75"), children: /* @__PURE__ */ jsx(Outlet, {}) })
      ] }),
      /* @__PURE__ */ jsx(BottomNav, {})
    ] }),
    /* @__PURE__ */ jsx(
      Toaster,
      {
        theme: "dark",
        position: "top-right",
        toastOptions: {
          style: {
            background: "#102033",
            border: "1px solid rgba(164,191,223,0.34)",
            color: "#fff"
          }
        }
      }
    )
  ] });
}
function NotFoundComponent() {
  return /* @__PURE__ */ jsx("div", { className: "flex min-h-screen items-center justify-center bg-bg px-4", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md text-center", children: [
    /* @__PURE__ */ jsx("h1", { className: "text-7xl font-bold text-tx font-mono", children: "404" }),
    /* @__PURE__ */ jsx("h2", { className: "mt-4 text-xl font-semibold text-tx", children: "Signal not found" }),
    /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-mute", children: "This route is not in the engine map." }),
    /* @__PURE__ */ jsx("div", { className: "mt-6", children: /* @__PURE__ */ jsx(
      Link,
      {
        to: "/plan",
        className: "inline-flex items-center justify-center rounded-md border border-accent/60 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20",
        children: "Return to Signal Plan"
      }
    ) })
  ] }) });
}
const Route$d = createRootRouteWithContext()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SMC SuperFIB — Trading Dashboard" },
      {
        name: "description",
        content: "Mobile-first SMC SuperFIB dashboard mirroring the WordPress signal engine."
      },
      { name: "theme-color", content: "#07111b" },
      { property: "og:title", content: "SMC SuperFIB" },
      { property: "og:description", content: "Institutional SMC + Fibonacci trading dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" }
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
      }
    ]
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent
});
function RootShell({ children }) {
  return /* @__PURE__ */ jsxs("html", { lang: "en", className: "dark", children: [
    /* @__PURE__ */ jsx("head", { children: /* @__PURE__ */ jsx(HeadContent, {}) }),
    /* @__PURE__ */ jsxs("body", { children: [
      children,
      /* @__PURE__ */ jsx(Scripts, {})
    ] })
  ] });
}
function RootComponent() {
  const { queryClient } = Route$d.useRouteContext();
  const router2 = useRouter();
  const { location } = useRouterState();
  const isLogin = location.pathname === "/login";
  const isLanding = location.pathname === "/";
  useEffect(() => {
    if (!isLogin && !isLanding && !hasCredentials() && !hasWordPressNonce()) {
      router2.navigate({ to: "/login" });
    }
    const handleAuthRequired = () => {
      clearCredentials();
      queryClient.clear();
      if (location.pathname !== "/login") {
        router2.navigate({ to: "/login" });
      }
    };
    window.addEventListener("smc:auth-required", handleAuthRequired);
    return () => window.removeEventListener("smc:auth-required", handleAuthRequired);
  }, [isLogin, location.pathname, queryClient, router2]);
  return /* @__PURE__ */ jsx(QueryClientProvider, { client: queryClient, children: isLogin || isLanding ? /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Outlet, {}),
    /* @__PURE__ */ jsx(
      Toaster,
      {
        theme: "dark",
        position: "top-right",
        toastOptions: {
          style: {
            background: "#102033",
            border: "1px solid rgba(164,191,223,0.34)",
            color: "#fff"
          }
        }
      }
    )
  ] }) : /* @__PURE__ */ jsx(AppShell, {}) });
}
const $$splitComponentImporter$8 = () => import("./signals-J2KOsEfj.js");
const Route$c = createFileRoute("/signals")({
  head: () => ({
    meta: [{
      title: "Signal Engine — SMC SuperFIB"
    }, {
      name: "description",
      content: "Engine readiness checklist and live signal candidates with backend confirmation."
    }, {
      property: "og:title",
      content: "Signal Engine — SMC SuperFIB"
    }, {
      property: "og:description",
      content: "Engine health and live candidate signals."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$8, "component")
});
const $$splitComponentImporter$7 = () => import("./progress-BW0iwO5X.js");
const Route$b = createFileRoute("/progress")({
  head: () => ({
    meta: [{
      title: "Progress - SMC SuperFIB"
    }, {
      name: "description",
      content: "Account pulse, milestones and trading streaks."
    }, {
      property: "og:title",
      content: "Progress - SMC SuperFIB"
    }, {
      property: "og:description",
      content: "Track milestones and account growth."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$7, "component")
});
const $$splitComponentImporter$6 = () => import("./plan-BQSy6dif.js");
const Route$a = createFileRoute("/plan")({
  head: () => ({
    meta: [{
      title: "Signal Plans - SMC SuperFIB"
    }, {
      name: "description",
      content: "Top ranked watchlist execution plans with backend blueprints, risk, and ladder status."
    }, {
      property: "og:title",
      content: "Signal Plans - SMC SuperFIB"
    }, {
      property: "og:description",
      content: "Backend-confirmed entry ladders, SL, TP, and risk allocation for the top watchlist candidates."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$6, "component")
});
const STYLES = {
  live: { label: "LIVE", cls: "bg-buy/15 text-buy border-buy/40" },
  stale: { label: "STALE", cls: "bg-warn/15 text-warn border-warn/40" },
  unavailable: { label: "N/A", cls: "bg-mute/15 text-mute border-mute/40" },
  blocked: { label: "BLOCKED", cls: "bg-sell/15 text-sell border-sell/40" },
  offline: { label: "OFFLINE", cls: "bg-sell/15 text-sell border-sell/40" },
  "pending-sync": { label: "SYNCING", cls: "bg-info/15 text-info border-info/40" },
  closed_session: { label: "CLOSED", cls: "bg-info/15 text-info border-info/40" },
  mock: { label: "MOCK", cls: "bg-violet/15 text-violet border-violet/40" }
};
function FreshnessBadge({
  state,
  className
}) {
  const s = STYLES[state] ?? STYLES["stale"];
  return /* @__PURE__ */ jsxs(
    "span",
    {
      "data-testid": "freshness-badge",
      className: cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono",
        s.cls,
        className
      ),
      children: [
        state === "live" && /* @__PURE__ */ jsx("span", { className: "pulse-dot", style: { width: 5, height: 5 } }),
        s.label
      ]
    }
  );
}
function WarningLine({
  level = "warn",
  children,
  className
}) {
  const isWatch = level === "watch";
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: cn(
        "flex items-start gap-2 rounded border px-2.5 py-1.5 text-xs",
        level === "warn" ? "border-warn/40 bg-warn/10 text-warn" : isWatch ? "border-info/40 bg-info/10 text-info" : "border-sell/50 bg-sell/10 text-sell",
        className
      ),
      children: [
        isWatch ? /* @__PURE__ */ jsx(Info, { className: "mt-0.5 h-3.5 w-3.5 shrink-0", "aria-hidden": true }) : /* @__PURE__ */ jsx("span", { "aria-hidden": true, children: "⚠️" }),
        /* @__PURE__ */ jsx("span", { className: "leading-tight", children })
      ]
    }
  );
}
function DivergenceBanner({ children }) {
  return /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-2 rounded-md border border-sell/60 bg-sell/10 px-3 py-2 text-sm text-sell", children: [
    /* @__PURE__ */ jsx("span", { className: "mt-0.5", children: "⚠️" }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("div", { className: "font-semibold tracking-wide", children: "FRONTEND / BACKEND DIVERGENCE" }),
      /* @__PURE__ */ jsx("div", { className: "text-sell/80 text-xs leading-snug", children })
    ] })
  ] });
}
const Route$9 = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Pending Orders — SMC SuperFIB" },
      { name: "description", content: "Working and queued orders grouped by symbol." },
      { property: "og:title", content: "Pending Orders — SMC SuperFIB" },
      { property: "og:description", content: "All working orders awaiting fill." }
    ]
  }),
  component: OrdersPage
});
function OrdersPage() {
  const { data: trades, isLoading, error } = useStableUserTrades();
  const orders = trades?.orders ?? [];
  if (isLoading) {
    return /* @__PURE__ */ jsx("div", { className: "text-mute text-sm", children: "Loading pending orders..." });
  }
  if (error) {
    return /* @__PURE__ */ jsx("div", { className: "text-mute text-sm", children: "Pending orders unavailable while backend trade telemetry is unreachable." });
  }
  const grouped = orders.reduce((acc, o) => {
    (acc[o.symbol] ??= []).push(o);
    return acc;
  }, {});
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsx("div", { className: "flex items-end justify-between", children: /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold tracking-tight", children: "Pending Orders" }),
      /* @__PURE__ */ jsxs("p", { className: "text-xs text-mute mt-0.5", children: [
        orders.length,
        " working"
      ] })
    ] }) }),
    Object.keys(grouped).length === 0 && /* @__PURE__ */ jsx("div", { className: "text-mute text-sm", children: "No pending orders." }),
    /* @__PURE__ */ jsx("div", { className: "space-y-4", children: Object.entries(grouped).map(([symbol, list]) => {
      const pending = list.some((o) => o.state === "pending-sync");
      const stale = list.some((o) => o.state === "stale");
      const groupState = pending ? "pending-sync" : stale ? "stale" : list[0]?.state ?? "unavailable";
      return /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd bg-bg1/60 overflow-hidden", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between px-4 py-2.5 border-b border-bd bg-bg2/30", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsx("span", { className: "font-mono text-sm font-semibold", children: symbol }),
            /* @__PURE__ */ jsxs("span", { className: "text-[10px] font-mono text-mute", children: [
              list.length,
              " order",
              list.length > 1 ? "s" : ""
            ] })
          ] }),
          /* @__PURE__ */ jsx(FreshnessBadge, { state: groupState })
        ] }),
        (pending || stale) && /* @__PURE__ */ jsx("div", { className: "px-4 py-2 border-b border-bd", children: /* @__PURE__ */ jsx(WarningLine, { level: "warn", children: pending ? `${symbol} has orders not yet acknowledged by backend.` : `${symbol} order telemetry is being carried forward while backend confirmation catches up.` }) }),
        /* @__PURE__ */ jsx("div", { className: "divide-y divide-bd", children: list.map((o) => /* @__PURE__ */ jsxs(
          "div",
          {
            className: "grid grid-cols-12 items-center gap-2 px-4 py-3 text-xs",
            children: [
              /* @__PURE__ */ jsx(
                "span",
                {
                  className: cn(
                    "col-span-2 sm:col-span-1 inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono w-fit",
                    o.direction === "LONG" ? "border-buy/40 text-buy bg-buy/10" : "border-sell/40 text-sell bg-sell/10"
                  ),
                  children: o.direction
                }
              ),
              /* @__PURE__ */ jsx("span", { className: "col-span-2 sm:col-span-1 inline-flex items-center justify-center rounded border border-bd bg-bg2/60 px-1.5 py-0.5 text-[10px] font-mono w-fit text-mute", children: o.type }),
              /* @__PURE__ */ jsxs("div", { className: "col-span-3 sm:col-span-2 font-mono", children: [
                /* @__PURE__ */ jsx("div", { className: "text-[10px] text-mute", children: "PRICE" }),
                /* @__PURE__ */ jsx("div", { className: "text-tx", children: fmtPrice(o.price, o.symbol) })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "col-span-2 font-mono", children: [
                /* @__PURE__ */ jsx("div", { className: "text-[10px] text-mute", children: "LOTS" }),
                /* @__PURE__ */ jsx("div", { className: "text-dim", children: o.lots.toFixed(2) })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "col-span-3 sm:col-span-2 font-mono", children: [
                /* @__PURE__ */ jsx("div", { className: "text-[10px] text-mute", children: "SL / TP" }),
                /* @__PURE__ */ jsxs("div", { className: "text-dim", children: [
                  /* @__PURE__ */ jsx("span", { className: "text-sell", children: fmtPrice(o.sl, o.symbol) }),
                  " / ",
                  /* @__PURE__ */ jsx("span", { className: "text-buy", children: fmtPrice(o.tp, o.symbol) })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "col-span-2 sm:col-span-4 text-right text-[10px] font-mono text-mute", children: [
                "placed ",
                relTime(o.placedAt)
              ] })
            ]
          },
          o.id
        )) })
      ] }, symbol);
    }) })
  ] });
}
const $$splitComponentImporter$5 = () => import("./login-CgCkX8F2.js");
const Route$8 = createFileRoute("/login")({
  component: lazyRouteComponent($$splitComponentImporter$5, "component")
});
const $$splitComponentImporter$4 = () => import("./live-BWE0Hf4N.js");
const Route$7 = createFileRoute("/live")({
  head: () => ({
    meta: [{
      title: "Live Radar - SMC SuperFIB"
    }, {
      name: "description",
      content: "Per-pair live prices, regime, gate state and chop meter."
    }, {
      property: "og:title",
      content: "Live Radar - SMC SuperFIB"
    }, {
      property: "og:description",
      content: "Real-time multi-pair regime + gate radar."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$4, "component")
});
const $$splitComponentImporter$3 = () => import("./charts-dO0XznkI.js");
const Route$6 = createFileRoute("/charts")({
  head: () => ({
    meta: [{
      title: "Charts - SMC SuperFIB"
    }, {
      name: "description",
      content: "Per-pair price and Fibonacci visualisation."
    }, {
      property: "og:title",
      content: "Charts - SMC SuperFIB"
    }, {
      property: "og:description",
      content: "Price action with key Fibonacci levels."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$3, "component")
});
const $$splitComponentImporter$2 = () => import("./book--2k-pHOP.js");
const Route$5 = createFileRoute("/book")({
  head: () => ({
    meta: [{
      title: "Active Book - SMC SuperFIB"
    }, {
      name: "description",
      content: "Open positions grouped by symbol with pair-level freshness warnings."
    }, {
      property: "og:title",
      content: "Active Book - SMC SuperFIB"
    }, {
      property: "og:description",
      content: "All open positions in one consolidated book."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$2, "component")
});
const Route$4 = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — SMC SuperFIB" },
      {
        name: "description",
        content: "Equity curve, exposure, drawdown vs cap and win/loss split."
      },
      { property: "og:title", content: "Analytics — SMC SuperFIB" },
      { property: "og:description", content: "Account performance analytics." }
    ]
  }),
  component: AnalyticsPage
});
function AnalyticsPage() {
  const { data: accountTelemetry, error: accountTelemetryError } = useAccountTelemetry();
  const { data: account } = useUserAccount();
  const { data: trades, error: tradesError } = useStableUserTrades();
  const { data: risk } = useUserRiskProfile();
  if (!risk) return null;
  const positions = trades?.positions ?? [];
  const floatingPnl = positions.reduce((s, p) => s + p.pnlUSC, 0);
  const tradeTelemetryState = positions.some((position) => position.state === "stale") ? "stale" : accountTelemetry?.state ?? "unavailable";
  const ddRatio = (account?.drawdownPct ?? 0) / risk.ddCapPct;
  const equityCurveData = MOCK_MODE ? mockEquityCurve : null;
  const telemetryUnavailable = accountTelemetryError != null || tradesError != null || !accountTelemetry || trades == null;
  const accountFreshness = telemetryUnavailable ? "unavailable" : accountTelemetry.state;
  const balanceValue = accountTelemetry?.balance ?? 0;
  const equityValue = accountTelemetry?.equity ?? 0;
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold tracking-tight", children: "Analytics" }),
      /* @__PURE__ */ jsx("p", { className: "text-xs text-mute mt-0.5", children: "Equity · exposure · drawdown · split" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid gap-3 lg:grid-cols-2", children: [
      /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd bg-bg1/60 p-4 lg:col-span-2", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-3", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("div", { className: "text-[11px] font-mono uppercase tracking-wider text-mute", children: "Equity (30d)" }),
            /* @__PURE__ */ jsx("div", { className: "font-mono text-2xl font-semibold mt-1", children: telemetryUnavailable ? "Unavailable" : fmtCurrency(equityValue, accountTelemetry?.currency) })
          ] }),
          /* @__PURE__ */ jsx(FreshnessBadge, { state: accountFreshness })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "h-[200px] -mx-2", children: equityCurveData ? /* @__PURE__ */ jsx(ResponsiveContainer, { width: "100%", height: "100%", children: /* @__PURE__ */ jsxs(
          AreaChart,
          {
            data: equityCurveData,
            margin: { top: 5, right: 10, bottom: 5, left: 5 },
            children: [
              /* @__PURE__ */ jsx("defs", { children: /* @__PURE__ */ jsxs("linearGradient", { id: "eq", x1: "0", y1: "0", x2: "0", y2: "1", children: [
                /* @__PURE__ */ jsx("stop", { offset: "0%", stopColor: "#46d19a", stopOpacity: 0.4 }),
                /* @__PURE__ */ jsx("stop", { offset: "100%", stopColor: "#46d19a", stopOpacity: 0 })
              ] }) }),
              /* @__PURE__ */ jsx(
                YAxis,
                {
                  domain: ["dataMin", "dataMax"],
                  width: 60,
                  tick: { fill: "#9cb0c9", fontSize: 10, fontFamily: "JetBrains Mono" },
                  axisLine: false,
                  tickLine: false,
                  tickFormatter: (v) => `$${(v / 1e3).toFixed(1)}k`
                }
              ),
              /* @__PURE__ */ jsx(
                Tooltip,
                {
                  contentStyle: {
                    background: "#102033",
                    border: "1px solid rgba(164,191,223,0.34)",
                    borderRadius: 6,
                    fontSize: 11,
                    fontFamily: "JetBrains Mono"
                  },
                  labelFormatter: (l) => `Day ${l}`,
                  formatter: (v) => [`$${v.toFixed(2)}`, "EQUITY"]
                }
              ),
              /* @__PURE__ */ jsx(
                Area,
                {
                  type: "monotone",
                  dataKey: "equity",
                  stroke: "#46d19a",
                  strokeWidth: 1.5,
                  fill: "url(#eq)"
                }
              )
            ]
          }
        ) }) : /* @__PURE__ */ jsx("div", { className: "flex h-full items-center justify-center text-xs font-mono text-mute", children: "No historical equity data — connect backend to populate" }) })
      ] }),
      /* @__PURE__ */ jsx(
        Stat,
        {
          label: "Today P/L",
          value: fmtCurrency(account?.todayPnlUSC ?? 0, accountTelemetry?.currency, true),
          sub: fmtPct(account?.todayPnlPct ?? 0),
          tone: (account?.todayPnlUSC ?? 0) >= 0 ? "buy" : "sell",
          state: account?.state ?? "unavailable"
        }
      ),
      /* @__PURE__ */ jsx(
        Stat,
        {
          label: "Floating P/L",
          value: telemetryUnavailable ? "Unavailable" : fmtCurrency(floatingPnl, accountTelemetry?.currency, true),
          sub: telemetryUnavailable ? "Waiting for backend trade telemetry" : `${positions.length} positions`,
          tone: floatingPnl >= 0 ? "buy" : "sell",
          state: telemetryUnavailable ? "unavailable" : tradeTelemetryState
        }
      ),
      /* @__PURE__ */ jsx(
        Stat,
        {
          label: "Margin used",
          value: telemetryUnavailable ? "Unavailable" : fmtPct(
            equityValue > 0 ? (accountTelemetry?.margin ?? 0) / equityValue * 100 : 0,
            false
          ),
          sub: telemetryUnavailable ? "Waiting for backend account telemetry" : `${fmtCurrency(balanceValue, accountTelemetry?.currency)} bal`,
          tone: "info",
          state: accountFreshness
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd bg-bg1/60 p-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-3", children: [
          /* @__PURE__ */ jsx("div", { className: "text-[11px] font-mono uppercase tracking-wider text-mute", children: "Drawdown vs cap" }),
          /* @__PURE__ */ jsx(FreshnessBadge, { state: account?.state ?? "unavailable" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "font-mono text-xl", children: [
          /* @__PURE__ */ jsx(
            "span",
            {
              className: cn(ddRatio > 0.7 ? "text-sell" : ddRatio > 0.4 ? "text-warn" : "text-buy"),
              children: fmtPct(account?.drawdownPct ?? 0, false)
            }
          ),
          /* @__PURE__ */ jsxs("span", { className: "text-mute text-sm", children: [
            " / ",
            fmtPct(risk.ddCapPct, false)
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "mt-2 h-2 overflow-hidden rounded-full bg-bg3", children: /* @__PURE__ */ jsx(
          "div",
          {
            className: cn(
              "h-full transition-all",
              ddRatio > 0.7 ? "bg-sell" : ddRatio > 0.4 ? "bg-warn" : "bg-buy"
            ),
            style: { width: `${Math.min(100, ddRatio * 100)}%` }
          }
        ) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd bg-bg1/60 p-4 lg:col-span-2", children: [
        /* @__PURE__ */ jsx("div", { className: "text-[11px] font-mono uppercase tracking-wider text-mute mb-3", children: "Win / loss split (30d)" }),
        MOCK_MODE ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { className: "flex h-3 overflow-hidden rounded-full", children: [
            /* @__PURE__ */ jsx("div", { className: "bg-buy", style: { width: "62%" } }),
            /* @__PURE__ */ jsx("div", { className: "bg-sell", style: { width: "38%" } })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "mt-3 flex items-center justify-between text-xs font-mono", children: [
            /* @__PURE__ */ jsx("span", { className: "text-buy", children: "62% wins · 31" }),
            /* @__PURE__ */ jsx("span", { className: "text-sell", children: "38% loss · 19" })
          ] })
        ] }) : /* @__PURE__ */ jsx("div", { className: "text-xs font-mono text-mute py-2", children: "— historical trade data not yet available" })
      ] })
    ] })
  ] });
}
function Stat({
  label,
  value,
  sub,
  tone,
  state
}) {
  const toneCls = tone === "buy" ? "text-buy" : tone === "sell" ? "text-sell" : "text-info";
  return /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd bg-bg1/60 p-4", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-2", children: [
      /* @__PURE__ */ jsx("div", { className: "text-[11px] font-mono uppercase tracking-wider text-mute", children: label }),
      /* @__PURE__ */ jsx(FreshnessBadge, { state })
    ] }),
    /* @__PURE__ */ jsx("div", { className: cn("font-mono text-2xl font-semibold", toneCls), children: value }),
    /* @__PURE__ */ jsx("div", { className: "text-[10px] font-mono text-mute mt-0.5", children: sub })
  ] });
}
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return /* @__PURE__ */ jsx(Comp, { className: cn(buttonVariants({ variant, size, className })), ref, ...props });
  }
);
Button.displayName = "Button";
const Input = React.forwardRef(
  ({ className, type, ...props }, ref) => {
    return /* @__PURE__ */ jsx(
      "input",
      {
        type,
        className: cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        ),
        ref,
        ...props
      }
    );
  }
);
Input.displayName = "Input";
const Textarea = React.forwardRef(
  ({ className, ...props }, ref) => {
    return /* @__PURE__ */ jsx(
      "textarea",
      {
        className: cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        ),
        ref,
        ...props
      }
    );
  }
);
Textarea.displayName = "Textarea";
const SOAK_TEMPLATES = {
  PHASE_0_RESTART_72H: {
    soakType: "PHASE_0_RESTART_72H",
    label: "Phase 0 - Restart Soak",
    description: "72h restart soak with fixed Phase 0 checkpoint intervals.",
    durationDays: 3,
    symbols: [],
    defaultDurationHours: 72,
    defaultCheckpointCount: 4,
    checkpointLabels: ["T+12h", "T+24h", "T+48h", "T+72h"]
  },
  PHASE_3_STABILITY_72H: {
    soakType: "PHASE_3_STABILITY_72H",
    label: "Phase 3 - Stability Soak",
    description: "72h stability soak pending operator-confirmed checkpoint naming.",
    durationDays: 3,
    symbols: [],
    defaultDurationHours: 72,
    defaultCheckpointCount: 3,
    checkpointLabels: ["T+24h", "T+48h", "T+72h"]
  },
  PHASE_4_30_DAY: {
    soakType: "PHASE_4_30_DAY",
    label: "Phase 4 - 30-Day Live Soak",
    description: "30-day live parity soak for EURUSD, USDJPY, and XAUUSD corpus capture.",
    durationDays: 30,
    symbols: ["EURUSD", "USDJPY", "XAUUSD"],
    defaultDurationHours: 720,
    defaultCheckpointCount: 4,
    checkpointLabels: ["T+7d", "T+14d", "T+21d", "T+30d"]
  },
  CUSTOM: {
    soakType: "CUSTOM",
    label: "Custom Soak",
    description: "Operator-defined soak duration and checkpoint schedule.",
    durationDays: 0,
    symbols: [],
    defaultDurationHours: 0,
    defaultCheckpointCount: 0,
    checkpointLabels: []
  }
};
const Route$3 = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Health - SMC SuperFIB" },
      {
        name: "description",
        content: "Admin-only backend health summary and soak workspace."
      }
    ]
  }),
  component: AdminPage
});
const SOAK_EVIDENCE_TYPES = [
  "baseline_metadata",
  "signal_parity_confirm",
  "feed_stable_window",
  "engine_run_observation",
  "manual_note"
];
function AdminPage() {
  const router2 = useRouter();
  const [state, setState] = useState({ kind: "loading" });
  const [soakState, setSoakState] = useState({ kind: "loading" });
  const [pageAccessedAt] = useState(() => defaultDateTimeLocalValue());
  const [soakType, setSoakType] = useState("PHASE_3_STABILITY_72H");
  const [durationHours, setDurationHours] = useState(
    SOAK_TEMPLATES.PHASE_3_STABILITY_72H.defaultDurationHours
  );
  const [checkpointCount, setCheckpointCount] = useState(
    SOAK_TEMPLATES.PHASE_3_STABILITY_72H.defaultCheckpointCount
  );
  const [baselineForm, setBaselineForm] = useState(
    () => createBaselineFormDefaults({
      pageAccessedAt,
      autoBaselineFields: {
        frontendWatchlist: "",
        watchlistLiveSymbols: "",
        notes: ""
      },
      health: null,
      soakType: "PHASE_3_STABILITY_72H"
    })
  );
  const [evidenceForm, setEvidenceForm] = useState({
    evidence_key: "",
    evidence_type: "manual_note",
    evidence_value: "",
    operator: resolveOperatorIdentifier()
  });
  const [checkpointNotes, setCheckpointNotes] = useState("");
  const [baselineSaving, setBaselineSaving] = useState(false);
  const [evidenceSaving, setEvidenceSaving] = useState(false);
  const [checkpointSaving, setCheckpointSaving] = useState(false);
  const [baselineResetRequested, setBaselineResetRequested] = useState(false);
  const [previousBaselineCheckpoint, setPreviousBaselineCheckpoint] = useState(null);
  const [panelMessage, setPanelMessage] = useState(null);
  const [panelError, setPanelError] = useState(null);
  const [soakRefreshing, setSoakRefreshing] = useState(false);
  const [autoBaselineFields, setAutoBaselineFields] = useState({
    frontendWatchlist: "",
    watchlistLiveSymbols: "",
    notes: ""
  });
  const soakRefreshInFlight = useRef(null);
  const soakTypeInitializedFromReport = useRef(false);
  const soakTypeManuallyChanged = useRef(false);
  useEffect(() => {
    if (!hasCredentials() && !hasWordPressNonce()) {
      void router2.navigate({ to: "/login" });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const health2 = await fetchAdminHealth();
        if (!cancelled) {
          setState({ kind: "ready", health: health2 });
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof AuthError) {
          void router2.navigate({ to: "/login" });
          return;
        }
        setState({ kind: "denied" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router2]);
  useEffect(() => {
    if (!hasCredentials() && !hasWordPressNonce()) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const report = await fetchSoakReport();
        if (!cancelled) {
          setSoakState({ kind: "ready", report });
          setPanelError(null);
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof AuthError) {
          void router2.navigate({ to: "/login" });
          return;
        }
        const message = formatSoakReportError(error, "load");
        console.error("[SOAK] Failed to load soak report", error);
        setSoakState({
          kind: "error",
          message
        });
        setPanelError(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router2]);
  useEffect(() => {
    if (!hasCredentials() && !hasWordPressNonce()) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [settings, snapshot] = await Promise.all([
          apiClient.getUserSettings(),
          apiClient.getSnapshot()
        ]);
        if (cancelled) return;
        const derived = deriveAutoBaselineFields(
          settings,
          snapshot.prices ?? [],
          snapshot.diagnostics ?? []
        );
        setAutoBaselineFields(derived);
        setBaselineForm((current) => ({
          ...current,
          frontendWatchlist: current.frontendWatchlist !== "" ? current.frontendWatchlist : derived.frontendWatchlist,
          watchlistLiveSymbols: current.watchlistLiveSymbols !== "" ? current.watchlistLiveSymbols : derived.watchlistLiveSymbols,
          notes: current.notes !== "" ? current.notes : derived.notes
        }));
      } catch {
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (state.kind !== "ready") return;
    const resolvedHealth2 = resolveDisplayHealth(state.health);
    setBaselineForm((current) => ({
      ...current,
      t0HealthSummary: current.t0HealthSummary !== "" ? current.t0HealthSummary : buildHealthSummary(state.health),
      twelveDataKeyStatus: current.twelveDataKeyStatus !== "" ? current.twelveDataKeyStatus : resolvedHealth2.twelveDataKeyStatus
    }));
  }, [state]);
  useEffect(() => {
    if (soakState.kind !== "ready") return;
    setBaselineForm((current) => hydrateBaselineForm(current, soakState.report.manual_evidence));
  }, [soakState]);
  useEffect(() => {
    if (soakState.kind !== "ready") return;
    if (soakTypeInitializedFromReport.current) return;
    if (soakTypeManuallyChanged.current) return;
    const reportSoakType = inferSoakTypeFromReport(soakState.report);
    soakTypeInitializedFromReport.current = true;
    if (!reportSoakType || reportSoakType === "CUSTOM") return;
    setSoakType(reportSoakType);
    setDurationHours(SOAK_TEMPLATES[reportSoakType].defaultDurationHours);
    setCheckpointCount(SOAK_TEMPLATES[reportSoakType].defaultCheckpointCount);
  }, [soakState]);
  if (state.kind === "loading") {
    return /* @__PURE__ */ jsx("div", { className: "text-mute text-sm", children: "Loading admin health..." });
  }
  if (state.kind === "denied") {
    return /* @__PURE__ */ jsxs("div", { className: "max-w-2xl space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold tracking-tight", children: "Admin Health" }),
        /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-xs text-mute", children: "Administrator capability required" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "rounded-lg border border-sell/30 bg-sell/10 p-4", children: /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
        /* @__PURE__ */ jsx(AlertTriangle, { className: "mt-0.5 h-4 w-4 text-sell" }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
          /* @__PURE__ */ jsx("div", { className: "text-sm font-semibold text-sell", children: "Access denied" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-dim", children: "This route is restricted to WordPress administrators. No backend diagnostics were exposed." })
        ] })
      ] }) })
    ] });
  }
  const health = state.health;
  const resolvedHealth = resolveDisplayHealth(health);
  const baselineCheckpoint = soakState.kind === "ready" ? soakState.report.baseline_checkpoint : null;
  const latestCheckpoint = soakState.kind === "ready" ? soakState.report.checkpoints[0] ?? null : null;
  const selectedSoakTemplate = SOAK_TEMPLATES[soakType];
  const derivedCheckpointLabels = deriveCheckpointLabels(soakType, durationHours, checkpointCount);
  const derivedCheckpointSummary = derivedCheckpointLabels.length > 0 ? derivedCheckpointLabels.join(", ") : "configured checkpoints once duration and count are set";
  const nextCheckpointLabel = derivedCheckpointLabels[soakState.kind === "ready" ? soakState.report.checkpoints.length : 0] ?? null;
  const baselineCaptureLocked = baselineCheckpoint !== null && !baselineResetRequested;
  const preservedBaselineCheckpoint = previousBaselineCheckpoint ?? baselineCheckpoint;
  const evidenceRows = soakState.kind === "ready" ? soakState.report.manual_evidence : [];
  const baselineAge = formatSoakAge(baselineCheckpoint?.created_at ?? null);
  const checkpointAge = formatSoakAge(
    latestCheckpoint?.created_at ?? baselineCheckpoint?.created_at ?? null
  );
  function handleSoakTypeChange(nextType) {
    soakTypeManuallyChanged.current = true;
    const template = SOAK_TEMPLATES[nextType];
    setSoakType(nextType);
    setDurationHours(template.defaultDurationHours);
    setCheckpointCount(template.defaultCheckpointCount);
    setCheckpointNotes("");
    setPanelMessage(null);
    setPanelError(null);
    setBaselineForm(
      hydrateBaselineForm(
        createBaselineFormDefaults({
          pageAccessedAt,
          autoBaselineFields,
          health: state.kind === "ready" ? state.health : null,
          soakType: nextType
        }),
        soakState.kind === "ready" ? soakState.report.manual_evidence : []
      )
    );
  }
  function handleStartNewSoak() {
    if (!baselineCheckpoint) return;
    setPreviousBaselineCheckpoint(baselineCheckpoint);
    setBaselineResetRequested(true);
    setBaselineForm((current) => ({
      ...current,
      soakType
    }));
    setPanelMessage(null);
    setPanelError(null);
  }
  function handleKeepCurrentBaseline() {
    setBaselineResetRequested(false);
    setPreviousBaselineCheckpoint(null);
    setPanelMessage(null);
    setPanelError(null);
  }
  async function refreshSoakReport() {
    if (soakRefreshInFlight.current) {
      return soakRefreshInFlight.current;
    }
    setSoakRefreshing(true);
    setSoakState({ kind: "loading" });
    const refreshPromise = (async () => {
      try {
        const report = await fetchSoakReport();
        setSoakState({ kind: "ready", report });
        setPanelError(null);
        return report;
      } catch (error) {
        if (error instanceof AuthError) {
          void router2.navigate({ to: "/login" });
          return null;
        }
        const message = formatSoakReportError(error, "refresh");
        console.error("[SOAK] Failed to refresh soak report", error);
        setSoakState({ kind: "error", message });
        setPanelError(null);
        return null;
      } finally {
        soakRefreshInFlight.current = null;
        setSoakRefreshing(false);
      }
    })();
    soakRefreshInFlight.current = refreshPromise;
    return refreshPromise;
  }
  async function saveEvidenceEntries(entries) {
    for (const entry of entries) {
      if (!entry.evidence_value.trim()) continue;
      await upsertSoakEvidence(entry);
    }
  }
  async function handleBaselineSubmit(event) {
    event.preventDefault();
    setBaselineSaving(true);
    setPanelMessage(null);
    setPanelError(null);
    try {
      const creatingNewBaseline = !baselineCheckpoint || baselineResetRequested;
      const operator = baselineForm.startedBy.trim() || resolveOperatorIdentifier();
      const baselineEntries = buildBaselineEvidenceEntries(baselineForm, operator);
      console.debug("[SOAK] Baseline evidence entries", baselineEntries);
      if (creatingNewBaseline) {
        if (baselineResetRequested) {
          await resetSoak();
          await refreshSoakReport();
        } else {
          await createSoakCheckpoint({
            checkpointType: "baseline",
            operatorNotes: baselineForm.notes
          });
        }
      }
      await saveEvidenceEntries(baselineEntries);
      const refreshed = await refreshSoakReport();
      if (!refreshed) return;
      if (creatingNewBaseline) {
        setBaselineResetRequested(false);
        setPreviousBaselineCheckpoint(null);
      }
      setPanelMessage(
        creatingNewBaseline ? "Baseline captured. The first soak snapshot is now marked as baseline." : "Baseline metadata updated."
      );
    } catch (error) {
      if (error instanceof AuthError) {
        void router2.navigate({ to: "/login" });
        return;
      }
      setPanelError(error instanceof Error ? error.message : "Failed to capture baseline.");
    } finally {
      setBaselineSaving(false);
    }
  }
  async function handleEvidenceSubmit(event) {
    event.preventDefault();
    setEvidenceSaving(true);
    setPanelMessage(null);
    setPanelError(null);
    try {
      await upsertSoakEvidence(evidenceForm);
      const refreshed = await refreshSoakReport();
      if (!refreshed) return;
      setPanelMessage(`Saved evidence key "${evidenceForm.evidence_key}".`);
      setEvidenceForm((current) => ({
        ...current,
        evidence_key: "",
        evidence_type: "manual_note",
        evidence_value: ""
      }));
    } catch (error) {
      if (error instanceof AuthError) {
        void router2.navigate({ to: "/login" });
        return;
      }
      setPanelError(error instanceof Error ? error.message : "Failed to save soak evidence.");
    } finally {
      setEvidenceSaving(false);
    }
  }
  async function handleCheckpointSave() {
    setCheckpointSaving(true);
    setPanelMessage(null);
    setPanelError(null);
    try {
      await createSoakCheckpoint({
        checkpointType: "checkpoint",
        operatorNotes: checkpointNotes
      });
      const refreshed = await refreshSoakReport();
      if (!refreshed) return;
      setPanelMessage("Saved soak checkpoint snapshot.");
      setCheckpointNotes("");
    } catch (error) {
      if (error instanceof AuthError) {
        void router2.navigate({ to: "/login" });
        return;
      }
      setPanelError(error instanceof Error ? error.message : "Failed to save checkpoint.");
    } finally {
      setCheckpointSaving(false);
    }
  }
  function handleExportMarkdown() {
    if (soakState.kind !== "ready") return;
    const datePart = (soakState.report.generated_at || (/* @__PURE__ */ new Date()).toISOString()).slice(0, 10);
    const fileName = `${selectedSoakTemplate.soakType.toLowerCase().replace(/_/g, "-")}-${datePart}.md`;
    const blob = new Blob([buildSoakReportMarkdown(soakState.report, selectedSoakTemplate)], {
      type: "text/markdown;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }
  function handlePrint() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsx("style", { children: `
        @page {
          margin: 12mm;
        }

        @media print {
          body {
            background: #ffffff;
          }

          body * {
            visibility: hidden;
          }

          .soak-report-print-section,
          .soak-report-print-section * {
            visibility: visible;
          }

          .soak-report-print-section {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            border: 0;
            box-shadow: none;
            background: #ffffff;
            color: #000000;
            padding: 0;
          }

          .soak-report-print-block,
          .soak-report-print-card,
          .soak-report-print-table {
            display: block !important;
          }

          .soak-report-print-grid {
            display: grid !important;
          }

          .soak-report-print-section summary {
            display: none;
          }

          .soak-report-print-section [data-print-hide="true"] {
            display: none !important;
          }

          .soak-report-print-card,
          .soak-report-print-block,
          .soak-report-print-grid,
          .soak-report-print-table {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .soak-report-print-card,
          .soak-report-print-block {
            border: 1px solid #d1d5db !important;
            background: #ffffff !important;
            color: #111827 !important;
            box-shadow: none !important;
          }

          .soak-report-print-section h2,
          .soak-report-print-section h3,
          .soak-report-print-section h4 {
            break-inside: avoid;
            page-break-after: avoid;
            page-break-inside: avoid;
          }

          .soak-report-print-section table {
            width: 100%;
            border-collapse: collapse;
          }

          .soak-report-print-section th,
          .soak-report-print-section td {
            border-color: #d1d5db !important;
            color: #111827 !important;
          }

          .soak-report-print-section .text-dim,
          .soak-report-print-section .text-mute,
          .soak-report-print-section .text-tx,
          .soak-report-print-section .text-buy,
          .soak-report-print-section .text-warn,
          .soak-report-print-section .text-sell,
          .soak-report-print-section .text-accent {
            color: #111827 !important;
          }
        }
      ` }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold tracking-tight", children: "Admin Health" }),
      /* @__PURE__ */ jsxs("p", { className: "mt-0.5 text-xs text-mute", children: [
        "Administrator-only backend status and soak workspace from",
        " ",
        /* @__PURE__ */ jsx("span", { className: "font-mono", children: "/sniper/v1/admin/*" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs(
      "section",
      {
        "data-section": "backend-health-readonly",
        className: "space-y-4 rounded-lg border border-accent/30 bg-accent/5 p-4",
        children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
            /* @__PURE__ */ jsx(ShieldCheck, { className: "mt-0.5 h-4 w-4 text-accent" }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h2", { className: "text-sm font-semibold tracking-tight", children: "Backend Health Status" }),
              /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-xs text-mute", children: "Read-only - values are owned and updated by the backend." }),
              /* @__PURE__ */ jsxs("p", { className: "mt-1 text-[11px] text-dim", children: [
                "This section mirrors ",
                /* @__PURE__ */ jsx("span", { className: "font-mono", children: "/admin/health" }),
                " and does not accept local edits or form submissions."
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "grid gap-3 sm:grid-cols-2 xl:grid-cols-3", children: [
            /* @__PURE__ */ jsx(
              HealthCard,
              {
                label: "System status",
                value: resolvedHealth.feedStatus,
                tone: toneForStatus(resolvedHealth.feedStatus)
              }
            ),
            /* @__PURE__ */ jsx(
              HealthCard,
              {
                label: "Backend sync",
                value: resolvedHealth.backendSync,
                tone: toneForStatus(resolvedHealth.backendSync)
              }
            ),
            /* @__PURE__ */ jsx(
              HealthCard,
              {
                label: "Engine run",
                value: resolvedHealth.engineRunState,
                tone: toneForStatus(resolvedHealth.engineRunState)
              }
            ),
            /* @__PURE__ */ jsx(
              HealthCard,
              {
                label: "Price feed",
                value: resolvedHealth.priceFeed,
                tone: toneForStatus(resolvedHealth.priceFeed)
              }
            ),
            /* @__PURE__ */ jsx(
              HealthCard,
              {
                label: "Twelve Data key",
                value: resolvedHealth.twelveDataKeyStatus,
                tone: toneForStatus(resolvedHealth.twelveDataKeyStatus)
              }
            ),
            /* @__PURE__ */ jsx(
              HealthCard,
              {
                label: "Per-symbol diagnostics",
                value: String(resolvedHealth.perSymbolDiagnostics.length)
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "grid gap-3 lg:grid-cols-2", children: [
            /* @__PURE__ */ jsx(TimestampCard, { label: "Last batch", value: resolvedHealth.lastBatchAt }),
            /* @__PURE__ */ jsx(TimestampCard, { label: "Last engine run", value: resolvedHealth.lastEngineRunAt })
          ] }),
          resolvedHealth.perSymbolDiagnostics.length > 0 && /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd bg-bg1/60 p-4 space-y-3", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx(ShieldCheck, { className: "h-4 w-4 text-accent" }),
              /* @__PURE__ */ jsx("div", { className: "text-[11px] font-mono uppercase tracking-wider text-mute", children: "Per-symbol diagnostics" })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("table", { className: "min-w-full text-left text-xs", children: [
              /* @__PURE__ */ jsx("thead", { className: "text-mute", children: /* @__PURE__ */ jsxs("tr", { className: "border-b border-bd", children: [
                /* @__PURE__ */ jsx("th", { className: "px-2 py-2 font-mono uppercase tracking-wider", children: "Symbol" }),
                /* @__PURE__ */ jsx("th", { className: "px-2 py-2 font-mono uppercase tracking-wider", children: "Price" }),
                /* @__PURE__ */ jsx("th", { className: "px-2 py-2 font-mono uppercase tracking-wider", children: "Candle" }),
                /* @__PURE__ */ jsx("th", { className: "px-2 py-2 font-mono uppercase tracking-wider", children: "Count" }),
                /* @__PURE__ */ jsx("th", { className: "px-2 py-2 font-mono uppercase tracking-wider", children: "Last Price" }),
                /* @__PURE__ */ jsx("th", { className: "px-2 py-2 font-mono uppercase tracking-wider", children: "Last Candle" }),
                /* @__PURE__ */ jsx("th", { className: "px-2 py-2 font-mono uppercase tracking-wider", children: "Blocker" })
              ] }) }),
              /* @__PURE__ */ jsx("tbody", { children: resolvedHealth.perSymbolDiagnostics.map((diagnostic) => /* @__PURE__ */ jsxs("tr", { className: "border-b border-bd/50 last:border-b-0", children: [
                /* @__PURE__ */ jsx("td", { className: "px-2 py-2 font-mono text-tx", children: diagnostic.symbol }),
                /* @__PURE__ */ jsx("td", { className: "px-2 py-2 text-dim", children: diagnostic.priceState }),
                /* @__PURE__ */ jsx("td", { className: "px-2 py-2 text-dim", children: diagnostic.candleState }),
                /* @__PURE__ */ jsx("td", { className: "px-2 py-2 text-dim", children: String(diagnostic.candleCount) }),
                /* @__PURE__ */ jsx("td", { className: "px-2 py-2 text-dim", children: formatTimestamp(diagnostic.lastPriceAt) }),
                /* @__PURE__ */ jsx("td", { className: "px-2 py-2 text-dim", children: formatTimestamp(diagnostic.lastCandleAt) }),
                /* @__PURE__ */ jsx("td", { className: "px-2 py-2 text-dim", children: diagnostic.engineBlocker })
              ] }, diagnostic.symbol)) })
            ] }) })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsxs("details", { open: true, className: "soak-report-print-section rounded-lg border border-bd bg-bg1/60", children: [
      /* @__PURE__ */ jsx("summary", { className: "cursor-pointer list-none border-b border-bd px-4 py-3", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h2", { className: "text-sm font-semibold tracking-tight", children: selectedSoakTemplate.label }),
          /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-xs text-mute", children: "Capture the baseline, store operator evidence, and save checkpoint snapshots during the live soak." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2 print:hidden", "data-print-hide": "true", children: [
          /* @__PURE__ */ jsx(
            Button,
            {
              type: "button",
              variant: "outline",
              size: "sm",
              onClick: handleExportMarkdown,
              disabled: soakState.kind !== "ready",
              children: "Export Markdown"
            }
          ),
          /* @__PURE__ */ jsx(
            Button,
            {
              type: "button",
              variant: "outline",
              size: "sm",
              onClick: handlePrint,
              disabled: soakState.kind !== "ready",
              children: "Print / Save PDF"
            }
          )
        ] })
      ] }) }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-4 p-4", children: [
        soakState.kind === "ready" && /* @__PURE__ */ jsxs("div", { className: "hidden print:block soak-report-print-block", children: [
          /* @__PURE__ */ jsxs("h3", { className: "text-base font-semibold tracking-tight text-tx", children: [
            selectedSoakTemplate.label,
            " Report"
          ] }),
          /* @__PURE__ */ jsxs("p", { className: "mt-1 text-xs text-dim", children: [
            "Generated ",
            formatTimestamp(soakState.report.generated_at)
          ] })
        ] }),
        panelMessage && /* @__PURE__ */ jsx("div", { className: "rounded-md border border-buy/30 bg-buy/10 px-3 py-2 text-xs text-buy", children: panelMessage }),
        panelError && /* @__PURE__ */ jsx("div", { className: "rounded-md border border-sell/30 bg-sell/10 px-3 py-2 text-xs text-sell", children: panelError }),
        soakState.kind === "loading" && /* @__PURE__ */ jsx("div", { className: "text-sm text-mute", children: "Loading soak report..." }),
        soakState.kind === "error" && /* @__PURE__ */ jsxs("div", { className: "space-y-3 rounded-md border border-sell/30 bg-sell/10 px-3 py-3 text-xs text-sell", children: [
          /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsx("div", { className: "font-semibold", children: "Soak report failed to load." }),
            /* @__PURE__ */ jsx("p", { className: "text-[11px] text-dim", children: soakState.message })
          ] }),
          /* @__PURE__ */ jsx(
            Button,
            {
              type: "button",
              variant: "outline",
              size: "sm",
              onClick: () => void refreshSoakReport(),
              disabled: soakRefreshing,
              children: soakRefreshing ? "Retrying soak report..." : "Retry soak report"
            }
          )
        ] }),
        soakState.kind === "ready" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { className: "soak-report-print-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-6", children: [
            /* @__PURE__ */ jsx(
              HealthCard,
              {
                label: "Baseline",
                value: baselineCheckpoint ? "captured" : "pending",
                tone: baselineCheckpoint ? "positive" : "warning",
                badge: "BASELINE",
                badgeTone: baselineCheckpoint ? "positive" : "warning",
                icon: baselineCheckpoint ? /* @__PURE__ */ jsx(ShieldCheck, { className: "h-3.5 w-3.5", "aria-hidden": "true" }) : /* @__PURE__ */ jsx(Flag, { className: "h-3.5 w-3.5", "aria-hidden": "true" }),
                headerDetail: baselineCheckpoint ? `Captured ${baselineAge} ago` : "Waiting for baseline capture.",
                className: "soak-report-print-card"
              }
            ),
            /* @__PURE__ */ jsx(
              HealthCard,
              {
                label: "Baseline age",
                value: baselineAge,
                badge: "BASELINE",
                badgeTone: baselineCheckpoint ? "positive" : "warning",
                icon: /* @__PURE__ */ jsx(Flag, { className: "h-3.5 w-3.5", "aria-hidden": "true" }),
                headerDetail: baselineCheckpoint ? `Captured at ${formatTimestamp(baselineCheckpoint.created_at)}` : "Baseline timestamp unavailable.",
                className: "soak-report-print-card"
              }
            ),
            /* @__PURE__ */ jsx(
              HealthCard,
              {
                label: "Checkpoint age",
                value: checkpointAge,
                badge: "CHECKPOINT",
                badgeTone: latestCheckpoint ? "positive" : baselineCheckpoint ? "warning" : "neutral",
                icon: /* @__PURE__ */ jsx(ClipboardList, { className: "h-3.5 w-3.5", "aria-hidden": "true" }),
                headerDetail: latestCheckpoint ? `Latest checkpoint at ${formatTimestamp(latestCheckpoint.created_at)}` : baselineCheckpoint ? "Using baseline timestamp until the first checkpoint is saved." : "No checkpoint source available yet.",
                className: "soak-report-print-card"
              }
            ),
            /* @__PURE__ */ jsx(
              HealthCard,
              {
                label: "Checkpoints",
                value: String(soakState.report.checkpoints.length),
                badge: "CHECKPOINT",
                badgeTone: soakState.report.checkpoints.length > 0 ? "positive" : "neutral",
                icon: /* @__PURE__ */ jsx(CheckCircle2, { className: "h-3.5 w-3.5", "aria-hidden": "true" }),
                headerDetail: latestCheckpoint ? `Latest checkpoint ${checkpointAge} ago` : baselineCheckpoint ? "Checkpoint history has not started yet." : "Capture baseline before saving checkpoints.",
                className: "soak-report-print-card"
              }
            ),
            /* @__PURE__ */ jsx(
              HealthCard,
              {
                label: "Manual evidence",
                value: String(soakState.report.manual_evidence.length),
                className: "soak-report-print-card"
              }
            ),
            /* @__PURE__ */ jsx(
              HealthCard,
              {
                label: "Watchlist symbols",
                value: soakState.report.watchlist_count === null ? "Unavailable" : String(soakState.report.watchlist_count),
                className: "soak-report-print-card"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "soak-report-print-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4", children: [
            /* @__PURE__ */ jsx(
              HealthCard,
              {
                label: "Snapshots 24h",
                value: stringOrUnavailable(soakState.report.snapshots_24h),
                className: "soak-report-print-card"
              }
            ),
            /* @__PURE__ */ jsx(
              HealthCard,
              {
                label: "Candles 24h",
                value: stringOrUnavailable(soakState.report.candles_24h),
                className: "soak-report-print-card"
              }
            ),
            /* @__PURE__ */ jsx(
              HealthCard,
              {
                label: "Engine runs 24h",
                value: String(soakState.report.engine_runs_summary.total_24h),
                className: "soak-report-print-card"
              }
            ),
            /* @__PURE__ */ jsx(
              HealthCard,
              {
                label: "Audit events 24h",
                value: String(soakState.report.audit_events_summary.total_24h),
                className: "soak-report-print-card"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs(
            "div",
            {
              "data-section": "operator-evidence-entry",
              className: "soak-report-print-block rounded-lg border border-bd bg-bg2/40 px-4 py-3",
              children: [
                /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold tracking-tight", children: "Operator Evidence - enter metadata only" }),
                /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-xs text-mute", children: "Use the forms below to record soak metadata, evidence, and checkpoints. These entries do not edit backend health state." }),
                /* @__PURE__ */ jsxs("div", { className: "mt-3 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]", children: [
                  /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
                    /* @__PURE__ */ jsx(
                      "label",
                      {
                        htmlFor: "soak-type",
                        className: "text-[11px] font-mono uppercase tracking-wider text-mute",
                        children: "Soak type"
                      }
                    ),
                    /* @__PURE__ */ jsx(
                      "select",
                      {
                        id: "soak-type",
                        className: "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        value: soakType,
                        onChange: (event) => handleSoakTypeChange(event.target.value),
                        children: Object.values(SOAK_TEMPLATES).map((template) => /* @__PURE__ */ jsx("option", { value: template.soakType, children: template.label }, template.soakType))
                      }
                    ),
                    /* @__PURE__ */ jsx("div", { className: "text-[11px] text-dim", children: selectedSoakTemplate.description })
                  ] }),
                  soakType === "CUSTOM" ? /* @__PURE__ */ jsxs("div", { className: "grid gap-3 md:grid-cols-2", children: [
                    /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
                      /* @__PURE__ */ jsx(
                        "label",
                        {
                          htmlFor: "custom-duration-hours",
                          className: "text-[11px] font-mono uppercase tracking-wider text-mute",
                          children: "Duration (hours)"
                        }
                      ),
                      /* @__PURE__ */ jsx(
                        Input,
                        {
                          id: "custom-duration-hours",
                          type: "number",
                          min: 1,
                          max: 720,
                          step: 1,
                          value: durationHours,
                          onChange: (event) => setDurationHours(Number.parseInt(event.target.value || "0", 10) || 0)
                        }
                      )
                    ] }),
                    /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
                      /* @__PURE__ */ jsx(
                        "label",
                        {
                          htmlFor: "custom-checkpoint-count",
                          className: "text-[11px] font-mono uppercase tracking-wider text-mute",
                          children: "Checkpoint count"
                        }
                      ),
                      /* @__PURE__ */ jsx(
                        Input,
                        {
                          id: "custom-checkpoint-count",
                          type: "number",
                          min: 1,
                          max: 24,
                          step: 1,
                          value: checkpointCount,
                          onChange: (event) => setCheckpointCount(Number.parseInt(event.target.value || "0", 10) || 0)
                        }
                      )
                    ] })
                  ] }) : /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-bd bg-bg1/60 px-3 py-3", children: [
                    /* @__PURE__ */ jsx("div", { className: "text-[11px] font-mono uppercase tracking-wider text-mute", children: "Template schedule" }),
                    /* @__PURE__ */ jsxs("div", { className: "mt-2 grid gap-1 text-xs text-dim", children: [
                      /* @__PURE__ */ jsxs("div", { children: [
                        "Duration: ",
                        selectedSoakTemplate.defaultDurationHours,
                        "h"
                      ] }),
                      /* @__PURE__ */ jsxs("div", { children: [
                        "Checkpoints: ",
                        selectedSoakTemplate.defaultCheckpointCount
                      ] }),
                      /* @__PURE__ */ jsxs("div", { children: [
                        "Labels: ",
                        selectedSoakTemplate.checkpointLabels.join(", ")
                      ] })
                    ] })
                  ] })
                ] })
              ]
            }
          ),
          /* @__PURE__ */ jsxs("div", { className: "soak-report-print-grid grid gap-4 xl:grid-cols-[1.1fr_0.9fr]", children: [
            /* @__PURE__ */ jsxs("div", { className: "soak-report-print-block rounded-lg border border-bd bg-bg2/40 p-4 space-y-4", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
                /* @__PURE__ */ jsx(Flag, { className: "mt-0.5 h-4 w-4 text-accent" }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsxs("h3", { className: "text-sm font-semibold tracking-tight", children: [
                    selectedSoakTemplate.label,
                    " - Operator Baseline"
                  ] }),
                  /* @__PURE__ */ jsxs("p", { className: "mt-0.5 text-xs text-mute", children: [
                    "Capture the T0 baseline at soak start. Use checkpoint snapshots for",
                    " ",
                    derivedCheckpointSummary,
                    ". If no baseline exists yet, the first snapshot saved here is automatically marked",
                    " ",
                    /* @__PURE__ */ jsx("span", { className: "font-mono", children: "baseline" }),
                    "."
                  ] }),
                  /* @__PURE__ */ jsx("p", { className: "mt-1 text-[11px] text-dim", children: "Auto-prefilled where current data already exists: page access start time, frontend watchlist, live watchlist symbols, and notes summary." })
                ] })
              ] }),
              baselineCheckpoint && /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
                /* @__PURE__ */ jsxs("div", { className: "soak-report-print-block rounded-md border border-buy/30 bg-buy/10 px-3 py-3 text-xs text-buy", children: [
                  /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 font-semibold", children: [
                    /* @__PURE__ */ jsx(CheckCircle2, { className: "h-4 w-4" }),
                    "Baseline captured"
                  ] }),
                  /* @__PURE__ */ jsxs("div", { className: "mt-1 text-dim", children: [
                    "Saved at ",
                    formatTimestamp(baselineCheckpoint.created_at),
                    ". Additional edits here update the operator baseline evidence but do not create a second baseline snapshot."
                  ] })
                ] }),
                baselineResetRequested ? /* @__PURE__ */ jsxs("div", { className: "soak-report-print-block rounded-md border border-accent/40 bg-accent/10 px-3 py-3 text-xs text-accent", children: [
                  /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 font-semibold", children: [
                    /* @__PURE__ */ jsx(Flag, { className: "h-4 w-4" }),
                    "New soak baseline armed"
                  ] }),
                  /* @__PURE__ */ jsx("div", { className: "mt-1 text-dim", children: preservedBaselineCheckpoint ? `Previous baseline from ${formatTimestamp(
                    preservedBaselineCheckpoint.created_at
                  )} remains preserved until a new baseline snapshot is captured.` : "Previous baseline remains preserved until a new baseline snapshot is captured." })
                ] }) : /* @__PURE__ */ jsxs("div", { className: "soak-report-print-block rounded-md border border-warn/40 bg-warn/10 px-3 py-3 text-xs text-warn", children: [
                  /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 font-semibold", children: [
                    /* @__PURE__ */ jsx(AlertTriangle, { className: "h-4 w-4" }),
                    "Baseline already captured - do not replace"
                  ] }),
                  /* @__PURE__ */ jsx("div", { className: "mt-1 text-dim", children: "The preserved baseline snapshot remains the soak reference point. A new baseline capture is locked on this admin session." })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("form", { className: "space-y-3", onSubmit: handleBaselineSubmit, children: [
                /* @__PURE__ */ jsxs("div", { className: "grid gap-3 md:grid-cols-2", children: [
                  /* @__PURE__ */ jsx(
                    Field,
                    {
                      label: "Started by",
                      value: baselineForm.startedBy,
                      onChange: (value) => setBaselineForm((current) => ({ ...current, startedBy: value })),
                      placeholder: "Kudzie"
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    Field,
                    {
                      label: "Start time",
                      value: baselineForm.startedAt,
                      onChange: (value) => setBaselineForm((current) => ({ ...current, startedAt: value })),
                      type: "datetime-local"
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    Field,
                    {
                      label: "MT5 terminal status",
                      value: baselineForm.mt5TerminalStatus,
                      onChange: (value) => setBaselineForm((current) => ({
                        ...current,
                        mt5TerminalStatus: value
                      })),
                      placeholder: "Online, running multiple clients"
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    Field,
                    {
                      label: "Auth confirmed",
                      value: baselineForm.authConfirmed,
                      onChange: (value) => setBaselineForm((current) => ({ ...current, authConfirmed: value })),
                      placeholder: "YES"
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    Field,
                    {
                      label: "Health endpoint",
                      value: baselineForm.backendHealthEndpoint,
                      onChange: (value) => setBaselineForm((current) => ({
                        ...current,
                        backendHealthEndpoint: value
                      })),
                      placeholder: "https://.../wp-json/sniper/v1/health"
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    Field,
                    {
                      label: "T+0 health summary",
                      value: baselineForm.t0HealthSummary,
                      onChange: (value) => setBaselineForm((current) => ({ ...current, t0HealthSummary: value })),
                      placeholder: "feedStatus=stale, backendSync=live, twelveDataKeyStatus=ok"
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    Field,
                    {
                      label: "Twelve Data key status",
                      value: baselineForm.twelveDataKeyStatus,
                      onChange: (value) => setBaselineForm((current) => ({
                        ...current,
                        twelveDataKeyStatus: value
                      })),
                      placeholder: "ok"
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    Field,
                    {
                      label: "Soak objective",
                      value: baselineForm.soakPurpose,
                      onChange: (value) => setBaselineForm((current) => ({
                        ...current,
                        soakPurpose: value
                      })),
                      placeholder: "Stability soak for live feed parity and dashboard diagnostics"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsx(
                  TextField,
                  {
                    label: "EA symbols running",
                    value: baselineForm.eaSymbols,
                    onChange: (value) => setBaselineForm((current) => ({ ...current, eaSymbols: value })),
                    placeholder: "EURUSD, USDJPY, GBPUSD..."
                  }
                ),
                /* @__PURE__ */ jsx(
                  TextField,
                  {
                    label: "Frontend watchlist",
                    value: baselineForm.frontendWatchlist,
                    onChange: (value) => setBaselineForm((current) => ({ ...current, frontendWatchlist: value })),
                    placeholder: "USDJPY, NZDUSD, USDCHF...",
                    hint: autoBaselineFields.frontendWatchlist
                  }
                ),
                /* @__PURE__ */ jsx(
                  TextField,
                  {
                    label: "Watchlist live symbols at T+0",
                    value: baselineForm.watchlistLiveSymbols,
                    onChange: (value) => setBaselineForm((current) => ({
                      ...current,
                      watchlistLiveSymbols: value
                    })),
                    placeholder: "7 currency pairs plus BTCUSD live",
                    hint: autoBaselineFields.watchlistLiveSymbols
                  }
                ),
                /* @__PURE__ */ jsx(
                  TextField,
                  {
                    label: "Baseline notes",
                    value: baselineForm.notes,
                    onChange: (value) => setBaselineForm((current) => ({ ...current, notes: value })),
                    placeholder: "Lowest candle count observed was 33...",
                    hint: autoBaselineFields.notes
                  }
                ),
                baselineCaptureLocked ? /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
                  /* @__PURE__ */ jsx(
                    Button,
                    {
                      type: "button",
                      disabled: true,
                      variant: "outline",
                      title: "Baseline already captured. Saving a new baseline is not permitted.",
                      "aria-label": "Baseline already captured. Saving a new baseline is not permitted.",
                      children: "Capture Baseline & Start Soak"
                    }
                  ),
                  /* @__PURE__ */ jsx(Button, { type: "submit", disabled: baselineSaving, children: baselineSaving ? "Saving..." : "Update Baseline Evidence" }),
                  /* @__PURE__ */ jsx(Button, { type: "button", variant: "outline", onClick: handleStartNewSoak, children: "Start New Soak" })
                ] }) : /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
                  /* @__PURE__ */ jsx(Button, { type: "submit", disabled: baselineSaving, children: baselineSaving ? "Saving..." : "Capture Baseline & Start Soak" }),
                  baselineCheckpoint ? /* @__PURE__ */ jsx(
                    Button,
                    {
                      type: "button",
                      variant: "outline",
                      onClick: handleKeepCurrentBaseline,
                      children: "Keep Current Baseline"
                    }
                  ) : null
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "soak-report-print-block rounded-lg border border-bd bg-bg2/40 p-4 space-y-4", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
                /* @__PURE__ */ jsx(ClipboardList, { className: "mt-0.5 h-4 w-4 text-accent" }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsxs("h3", { className: "text-sm font-semibold tracking-tight", children: [
                    selectedSoakTemplate.label,
                    " Timeline"
                  ] }),
                  /* @__PURE__ */ jsxs("p", { className: "mt-0.5 text-xs text-mute", children: [
                    "Use checkpoint snapshots for ",
                    derivedCheckpointSummary,
                    ". Baseline is stored separately and never overwritten by later checkpoints."
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "space-y-2 text-xs text-dim", children: [
                renderTimelineRow("T0 baseline", baselineCheckpoint),
                derivedCheckpointLabels.map(
                  (label, index) => renderTimelineRow(label, soakState.report.checkpoints[index] ?? null)
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "soak-report-print-block rounded-md border border-bd bg-bg1/60 px-3 py-3", children: [
                /* @__PURE__ */ jsx("div", { className: "text-[11px] font-mono uppercase tracking-wider text-mute", children: "Latest engine summary" }),
                /* @__PURE__ */ jsxs("div", { className: "mt-2 grid gap-2 text-xs text-dim", children: [
                  /* @__PURE__ */ jsxs("div", { children: [
                    "Engine runs 24h: ",
                    String(soakState.report.engine_runs_summary.total_24h)
                  ] }),
                  /* @__PURE__ */ jsxs("div", { children: [
                    "Success 24h: ",
                    String(soakState.report.engine_runs_summary.success_24h)
                  ] }),
                  /* @__PURE__ */ jsxs("div", { children: [
                    "Errors 24h: ",
                    String(soakState.report.engine_runs_summary.error_24h)
                  ] }),
                  /* @__PURE__ */ jsxs("div", { children: [
                    "Last run:",
                    " ",
                    formatTimestamp(soakState.report.engine_runs_summary.last_run_at)
                  ] })
                ] })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "soak-report-print-grid grid gap-4 xl:grid-cols-[1.1fr_0.9fr]", children: [
            /* @__PURE__ */ jsxs("div", { className: "soak-report-print-block rounded-lg border border-bd bg-bg2/40 p-4 space-y-4", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold tracking-tight", children: "Manual Evidence" }),
                /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-xs text-mute", children: "Save operator-confirmed proof such as parity checks, stale-window behavior, restarts, screenshots, or copied log findings." })
              ] }),
              /* @__PURE__ */ jsxs("form", { className: "space-y-3", onSubmit: handleEvidenceSubmit, children: [
                /* @__PURE__ */ jsxs("div", { className: "grid gap-3 md:grid-cols-2", children: [
                  /* @__PURE__ */ jsx(
                    Field,
                    {
                      label: "Evidence key",
                      value: evidenceForm.evidence_key,
                      onChange: (value) => setEvidenceForm((current) => ({ ...current, evidence_key: value })),
                      placeholder: "soak-feed-window-2026-05-10"
                    }
                  ),
                  /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
                    /* @__PURE__ */ jsx("label", { className: "text-[11px] font-mono uppercase tracking-wider text-mute", children: "Evidence type" }),
                    /* @__PURE__ */ jsx(
                      "select",
                      {
                        className: "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        value: evidenceForm.evidence_type,
                        onChange: (event) => setEvidenceForm((current) => ({
                          ...current,
                          evidence_type: event.target.value
                        })),
                        children: SOAK_EVIDENCE_TYPES.map((type) => /* @__PURE__ */ jsx("option", { value: type, children: type }, type))
                      }
                    )
                  ] })
                ] }),
                /* @__PURE__ */ jsx(
                  TextField,
                  {
                    label: "Evidence value",
                    value: evidenceForm.evidence_value,
                    onChange: (value) => setEvidenceForm((current) => ({ ...current, evidence_value: value })),
                    placeholder: "Describe the observation, pasted log lines, screenshot reference, or SQL result."
                  }
                ),
                /* @__PURE__ */ jsxs("div", { className: "grid gap-3 md:grid-cols-[1fr_auto] md:items-end", children: [
                  /* @__PURE__ */ jsx(
                    Field,
                    {
                      label: "Operator",
                      value: evidenceForm.operator,
                      onChange: (value) => setEvidenceForm((current) => ({ ...current, operator: value })),
                      placeholder: "wordpress-admin"
                    }
                  ),
                  /* @__PURE__ */ jsx(Button, { type: "submit", disabled: evidenceSaving, children: evidenceSaving ? "Saving..." : "Save Evidence" })
                ] })
              ] }),
              /* @__PURE__ */ jsx("div", { className: "soak-report-print-table overflow-x-auto", children: /* @__PURE__ */ jsxs("table", { className: "min-w-full text-left text-xs", children: [
                /* @__PURE__ */ jsx("thead", { className: "text-mute", children: /* @__PURE__ */ jsxs("tr", { className: "border-b border-bd", children: [
                  /* @__PURE__ */ jsx("th", { className: "px-2 py-2 font-mono uppercase tracking-wider", children: "Key" }),
                  /* @__PURE__ */ jsx("th", { className: "px-2 py-2 font-mono uppercase tracking-wider", children: "Type" }),
                  /* @__PURE__ */ jsx("th", { className: "px-2 py-2 font-mono uppercase tracking-wider", children: "Operator" }),
                  /* @__PURE__ */ jsx("th", { className: "px-2 py-2 font-mono uppercase tracking-wider", children: "Updated" })
                ] }) }),
                /* @__PURE__ */ jsx("tbody", { children: evidenceRows.length === 0 ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { className: "px-2 py-3 text-dim", colSpan: 4, children: "No manual evidence saved yet." }) }) : evidenceRows.map((row) => /* @__PURE__ */ jsxs("tr", { className: "border-b border-bd/50 last:border-b-0", children: [
                  /* @__PURE__ */ jsxs("td", { className: "px-2 py-2 align-top font-mono text-tx", children: [
                    /* @__PURE__ */ jsx("div", { children: row.evidence_key }),
                    /* @__PURE__ */ jsx("div", { className: "mt-1 whitespace-pre-wrap text-dim", children: row.evidence_value })
                  ] }),
                  /* @__PURE__ */ jsx("td", { className: "px-2 py-2 align-top text-dim", children: row.evidence_type }),
                  /* @__PURE__ */ jsx("td", { className: "px-2 py-2 align-top text-dim", children: row.operator }),
                  /* @__PURE__ */ jsx("td", { className: "px-2 py-2 align-top text-dim", children: formatTimestamp(row.updated_at) })
                ] }, row.id)) })
              ] }) })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "soak-report-print-block rounded-lg border border-bd bg-bg2/40 p-4 space-y-4", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold tracking-tight", children: "Checkpoint Snapshots" }),
                /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-xs text-mute", children: "Save periodic snapshots during the soak. These are separate from the baseline and preserved as point-in-time evidence." })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
                /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-bd bg-bg1/60 px-3 py-3", children: [
                  /* @__PURE__ */ jsx("div", { className: "text-[11px] font-mono uppercase tracking-wider text-mute", children: "Next checkpoint" }),
                  /* @__PURE__ */ jsx("div", { className: "mt-1 text-xs text-dim", children: nextCheckpointLabel ?? "All planned checkpoints are already labeled." })
                ] }),
                /* @__PURE__ */ jsx(
                  TextField,
                  {
                    label: "Checkpoint notes",
                    value: checkpointNotes,
                    onChange: setCheckpointNotes,
                    placeholder: "Optional notes for the current soak checkpoint."
                  }
                ),
                /* @__PURE__ */ jsx(
                  Button,
                  {
                    type: "button",
                    onClick: handleCheckpointSave,
                    disabled: checkpointSaving || !baselineCheckpoint || derivedCheckpointLabels.length === 0,
                    children: checkpointSaving ? "Saving..." : nextCheckpointLabel ? `Save ${nextCheckpointLabel} Snapshot` : "Save Checkpoint Snapshot"
                  }
                ),
                !baselineCheckpoint && /* @__PURE__ */ jsx("div", { className: "text-xs text-warn", children: "Capture the baseline first. The soak starts when the baseline snapshot is saved." }),
                baselineCheckpoint && derivedCheckpointLabels.length === 0 && /* @__PURE__ */ jsx("div", { className: "text-xs text-warn", children: "Configure duration and checkpoint count before saving snapshots." })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
                /* @__PURE__ */ jsxs(
                  "section",
                  {
                    "aria-labelledby": "baseline-snapshot-heading",
                    className: "soak-report-print-block space-y-3 rounded-md border border-bd/70 bg-bg1/30 p-3",
                    children: [
                      /* @__PURE__ */ jsxs("div", { className: "border-b border-bd/70 pb-2", children: [
                        /* @__PURE__ */ jsx(
                          "h4",
                          {
                            id: "baseline-snapshot-heading",
                            className: "text-[11px] font-mono uppercase tracking-[0.24em] text-mute",
                            children: "Baseline Snapshot"
                          }
                        ),
                        /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-dim", children: "Immutable reference point for the soak. Saved once, then preserved." })
                      ] }),
                      baselineCheckpoint ? /* @__PURE__ */ jsx(CheckpointCard, { checkpoint: baselineCheckpoint, title: "Baseline" }) : /* @__PURE__ */ jsx("div", { className: "rounded-md border border-dashed border-bd px-3 py-4 text-xs text-dim", children: "Baseline not captured yet." })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs(
                  "section",
                  {
                    "aria-labelledby": "checkpoint-history-heading",
                    className: "soak-report-print-block space-y-3 rounded-md border border-bd/70 bg-bg1/30 p-3",
                    children: [
                      /* @__PURE__ */ jsxs("div", { className: "border-b border-bd/70 pb-2", children: [
                        /* @__PURE__ */ jsx(
                          "h4",
                          {
                            id: "checkpoint-history-heading",
                            className: "text-[11px] font-mono uppercase tracking-[0.24em] text-mute",
                            children: "Checkpoint History"
                          }
                        ),
                        /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-dim", children: "Additive snapshots captured at later soak intervals." })
                      ] }),
                      soakState.report.checkpoints.length === 0 ? /* @__PURE__ */ jsx("div", { className: "rounded-md border border-dashed border-bd px-3 py-4 text-xs text-dim", children: "No non-baseline checkpoints saved yet." }) : soakState.report.checkpoints.slice(0, 6).map((checkpoint) => /* @__PURE__ */ jsx(
                        CheckpointCard,
                        {
                          checkpoint,
                          title: "Checkpoint"
                        },
                        checkpoint.id
                      ))
                    ]
                  }
                )
              ] })
            ] })
          ] })
        ] })
      ] })
    ] })
  ] });
}
function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text"
}) {
  return /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
    /* @__PURE__ */ jsx("label", { className: "text-[11px] font-mono uppercase tracking-wider text-mute", children: label }),
    /* @__PURE__ */ jsx(
      Input,
      {
        type,
        value,
        onChange: (event) => onChange(event.target.value),
        placeholder
      }
    )
  ] });
}
function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint
}) {
  return /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
    /* @__PURE__ */ jsx("label", { className: "text-[11px] font-mono uppercase tracking-wider text-mute", children: label }),
    /* @__PURE__ */ jsx(
      Textarea,
      {
        value,
        onChange: (event) => onChange(event.target.value),
        placeholder
      }
    ),
    hint && value === hint && /* @__PURE__ */ jsx("div", { className: "text-[11px] text-dim", children: "Auto-filled from current app/backend state." })
  ] });
}
function HealthCard({
  label,
  value,
  tone = "neutral",
  detail,
  className,
  icon,
  badge,
  badgeTone,
  headerDetail
}) {
  const toneClass = tone === "positive" ? "border-buy/30 bg-buy/10 text-buy" : tone === "warning" ? "border-warn/30 bg-warn/10 text-warn" : tone === "critical" ? "border-sell/30 bg-sell/10 text-sell" : "border-bd bg-bg2/50 text-tx";
  const badgeClass = (badgeTone ?? tone) === "positive" ? "border-buy/30 bg-buy/10 text-buy" : (badgeTone ?? tone) === "warning" ? "border-warn/30 bg-warn/10 text-warn" : (badgeTone ?? tone) === "critical" ? "border-sell/30 bg-sell/10 text-sell" : "border-bd bg-bg2/50 text-mute";
  return /* @__PURE__ */ jsxs("div", { className: `rounded-lg border border-bd bg-bg1/60 p-4 space-y-2 ${className ?? ""}`, children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-2", children: [
      /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-mute", children: [
          icon ? /* @__PURE__ */ jsx("span", { className: "shrink-0", children: icon }) : null,
          /* @__PURE__ */ jsx("span", { children: label })
        ] }),
        headerDetail ? /* @__PURE__ */ jsx("div", { className: "mt-1 text-[11px] text-dim", children: headerDetail }) : null
      ] }),
      badge ? /* @__PURE__ */ jsx(
        "span",
        {
          className: `inline-flex shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] ${badgeClass}`,
          children: badge
        }
      ) : null
    ] }),
    /* @__PURE__ */ jsx(
      "div",
      {
        className: `inline-flex rounded border px-2 py-1 font-mono text-sm uppercase ${toneClass}`,
        children: value
      }
    ),
    detail ? /* @__PURE__ */ jsx("div", { className: "text-[11px] text-dim", children: detail }) : null
  ] });
}
function TimestampCard({ label, value }) {
  return /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd bg-bg1/60 p-4 space-y-2", children: [
    /* @__PURE__ */ jsx("div", { className: "text-[10px] font-mono uppercase tracking-wider text-mute", children: label }),
    /* @__PURE__ */ jsx("div", { className: "font-mono text-sm text-tx", children: formatTimestamp(value) })
  ] });
}
function CheckpointCard({ checkpoint, title }) {
  const aggregate = checkpoint.snapshot_data;
  const health = resolveDisplayHealth(aggregate?.health);
  const isBaseline = checkpoint.checkpoint_type === "baseline";
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `soak-report-print-block space-y-2 rounded-md border px-3 py-3 ${isBaseline ? "border-sky-400/50 bg-sky-400/8 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.12)]" : "border-slate-400/35 bg-slate-400/5"}`,
      children: [
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
            /* @__PURE__ */ jsx(
              "span",
              {
                className: `inline-flex rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.24em] ${isBaseline ? "border-sky-400/50 bg-sky-400/12 text-sky-200" : "border-slate-300/30 bg-slate-300/10 text-slate-200"}`,
                children: isBaseline ? "BASELINE" : "CHECKPOINT"
              }
            ),
            /* @__PURE__ */ jsxs("div", { className: "text-xs font-mono text-tx", children: [
              title,
              " ",
              isBaseline ? "reference snapshot" : "snapshot"
            ] }),
            isBaseline && /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-1 text-[11px] text-sky-100/90", children: [
              /* @__PURE__ */ jsx(Lock, { className: "h-3.5 w-3.5", "aria-hidden": "true" }),
              /* @__PURE__ */ jsx("span", { children: "Locked reference" })
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "text-[11px] text-dim", children: formatTimestamp(checkpoint.created_at) })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "text-xs text-dim", children: checkpoint.operator_notes || "No operator notes recorded." }),
        /* @__PURE__ */ jsxs("div", { className: "grid gap-1 text-[11px] text-dim sm:grid-cols-2", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            "Feed: ",
            health.feedStatus
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            "Backend: ",
            health.backendSync
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            "Snapshots 24h: ",
            stringOrUnavailable(aggregate?.snapshots_24h ?? null)
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            "Candles 24h: ",
            stringOrUnavailable(aggregate?.candles_24h ?? null)
          ] })
        ] })
      ]
    }
  );
}
function defaultDateTimeLocalValue() {
  const now2 = /* @__PURE__ */ new Date();
  now2.setSeconds(0, 0);
  const local = new Date(now2.getTime() - now2.getTimezoneOffset() * 6e4);
  return local.toISOString().slice(0, 16);
}
function resolveHealthEndpointHint() {
  if (typeof window === "undefined") return "";
  const root = window.SNIPER?.root;
  if (typeof root === "string" && root !== "") {
    return `${root.replace(/\/$/, "")}/sniper/v1/health`;
  }
  return `${window.location.origin}/wp-json/sniper/v1/health`;
}
function resolveOperatorIdentifier() {
  const authHeader = getAuthHeader();
  if (!authHeader?.startsWith("Basic ")) {
    return "";
  }
  try {
    const decoded = atob(authHeader.slice("Basic ".length));
    const [username] = decoded.split(":");
    return username?.trim() ?? "";
  } catch {
    return "";
  }
}
function deriveAutoBaselineFields(settings, prices, diagnostics) {
  const watchlist = settings.watchlist ?? [];
  const frontendWatchlist = watchlist.join(", ");
  const priceBySymbol = new Map(prices.map((price) => [price.symbol, price]));
  const diagnosticBySymbol = new Map(
    diagnostics.map((diagnostic) => [diagnostic.symbol, diagnostic])
  );
  const liveSymbols = watchlist.filter((symbol) => {
    const price = priceBySymbol.get(symbol);
    const diagnostic = diagnosticBySymbol.get(symbol);
    return price?.state === "live" || diagnostic?.priceState === "live";
  });
  const nonLiveSymbols = watchlist.filter((symbol) => !liveSymbols.includes(symbol));
  const watchlistLiveSymbols = watchlist.length === 0 ? "No watchlist configured." : nonLiveSymbols.length === 0 ? `${liveSymbols.length}/${watchlist.length} live: ${liveSymbols.join(", ")}` : `${liveSymbols.length}/${watchlist.length} live: ${liveSymbols.join(", ")} | not live: ${nonLiveSymbols.join(", ")}`;
  const lowestCandleDiagnostic = diagnostics.reduce(
    (lowest, diagnostic) => {
      if (!lowest) return diagnostic;
      return diagnostic.candleCount < lowest.candleCount ? diagnostic : lowest;
    },
    null
  );
  const symbolsBelow30 = diagnostics.filter((diagnostic) => diagnostic.candleCount < 30);
  const blockers = diagnostics.filter((diagnostic) => diagnostic.engineBlocker !== "OK");
  const notesParts = [];
  notesParts.push(`Watchlist symbols: ${watchlist.length}.`);
  if (watchlist.length > 0) {
    notesParts.push(`Live watchlist symbols now: ${liveSymbols.length}/${watchlist.length}.`);
  } else {
    notesParts.push("No watchlist symbols are configured yet.");
  }
  if (lowestCandleDiagnostic) {
    notesParts.push(
      `Lowest candle count currently observed: ${lowestCandleDiagnostic.candleCount} on ${lowestCandleDiagnostic.symbol}.`
    );
  }
  if (symbolsBelow30.length > 0) {
    notesParts.push(
      `Symbols under 30 candles: ${symbolsBelow30.map((diagnostic) => `${diagnostic.symbol}=${diagnostic.candleCount}`).join(", ")}.`
    );
  } else if (diagnostics.length > 0) {
    notesParts.push("No watchlist symbols are currently under 30 candles.");
  }
  if (blockers.length > 0) {
    notesParts.push(
      `Active blockers: ${blockers.map((diagnostic) => `${diagnostic.symbol}=${diagnostic.engineBlocker}`).join(", ")}.`
    );
  }
  return {
    frontendWatchlist,
    watchlistLiveSymbols,
    notes: notesParts.join(" ")
  };
}
function createBaselineFormDefaults({
  pageAccessedAt,
  autoBaselineFields,
  health,
  soakType
}) {
  const resolvedHealth = resolveDisplayHealth(health);
  return {
    soakType,
    soakPurpose: "",
    startedBy: resolveOperatorIdentifier(),
    startedAt: pageAccessedAt,
    eaSymbols: "",
    frontendWatchlist: autoBaselineFields.frontendWatchlist,
    mt5TerminalStatus: "Online",
    backendHealthEndpoint: resolveHealthEndpointHint(),
    t0HealthSummary: health ? buildHealthSummary(health) : "",
    authConfirmed: "YES",
    twelveDataKeyStatus: health ? resolvedHealth.twelveDataKeyStatus : "",
    watchlistLiveSymbols: autoBaselineFields.watchlistLiveSymbols,
    notes: autoBaselineFields.notes
  };
}
function hydrateBaselineForm(form, rows) {
  const evidenceMap = indexEvidenceByKey(rows);
  const hydratedSoakType = (evidenceMap["baseline.soak_type"] ?? evidenceMap["soak.type"] ?? evidenceMap["soak_type"] ?? form.soakType).trim().toUpperCase();
  return {
    ...form,
    soakType: hydratedSoakType === "PHASE_0_RESTART_72H" || hydratedSoakType === "PHASE_3_STABILITY_72H" || hydratedSoakType === "PHASE_4_30_DAY" ? hydratedSoakType : form.soakType,
    soakPurpose: evidenceMap["baseline.soak_purpose"] ?? form.soakPurpose,
    startedBy: evidenceMap["baseline.started_by"] ?? form.startedBy,
    startedAt: evidenceMap["baseline.started_at"] ?? form.startedAt,
    eaSymbols: evidenceMap["baseline.ea_symbols"] ?? form.eaSymbols,
    frontendWatchlist: evidenceMap["baseline.frontend_watchlist"] ?? form.frontendWatchlist,
    mt5TerminalStatus: evidenceMap["baseline.mt5_terminal_status"] ?? form.mt5TerminalStatus,
    backendHealthEndpoint: evidenceMap["baseline.backend_health_endpoint"] ?? form.backendHealthEndpoint,
    t0HealthSummary: evidenceMap["baseline.t0_health_summary"] ?? form.t0HealthSummary,
    authConfirmed: evidenceMap["baseline.auth_confirmed"] ?? form.authConfirmed,
    twelveDataKeyStatus: evidenceMap["baseline.twelve_data_key_status"] ?? form.twelveDataKeyStatus,
    watchlistLiveSymbols: evidenceMap["baseline.watchlist_live_symbols"] ?? form.watchlistLiveSymbols,
    notes: evidenceMap["baseline.notes"] ?? form.notes
  };
}
function buildHealthSummary(health) {
  const resolvedHealth = resolveDisplayHealth(health);
  return [
    `feedStatus=${resolvedHealth.feedStatus}`,
    `backendSync=${resolvedHealth.backendSync}`,
    `twelveDataKeyStatus=${resolvedHealth.twelveDataKeyStatus}`
  ].join(", ");
}
function deriveCheckpointLabels(soakType, durationHours, checkpointCount) {
  if (soakType !== "CUSTOM") {
    return SOAK_TEMPLATES[soakType].checkpointLabels;
  }
  if (durationHours < 1 || checkpointCount < 1) {
    return [];
  }
  return Array.from({ length: checkpointCount }, (_, index) => {
    const checkpointHour = durationHours * (index + 1) / checkpointCount;
    return `T+${formatCheckpointHour(checkpointHour)}h`;
  });
}
function inferSoakTypeFromReport(report) {
  const evidenceMap = indexEvidenceByKey(report.manual_evidence);
  const persistedType = (evidenceMap["baseline.soak_type"] ?? evidenceMap["soak.type"] ?? evidenceMap["soak_type"] ?? "").trim().toUpperCase();
  if (persistedType === "PHASE_0_RESTART_72H" || persistedType === "PHASE_3_STABILITY_72H" || persistedType === "PHASE_4_30_DAY") {
    return persistedType;
  }
  return null;
}
function formatCheckpointHour(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}
function buildBaselineEvidenceEntries(form, operator) {
  return [
    evidenceEntry("baseline.soak_type", "baseline_metadata", form.soakType, operator),
    evidenceEntry("baseline.soak_purpose", "baseline_metadata", form.soakPurpose, operator),
    evidenceEntry("baseline.started_by", "baseline_metadata", form.startedBy, operator),
    evidenceEntry("baseline.started_at", "baseline_metadata", form.startedAt, operator),
    evidenceEntry("baseline.ea_symbols", "baseline_metadata", form.eaSymbols, operator),
    evidenceEntry(
      "baseline.frontend_watchlist",
      "baseline_metadata",
      form.frontendWatchlist,
      operator
    ),
    evidenceEntry(
      "baseline.mt5_terminal_status",
      "baseline_metadata",
      form.mt5TerminalStatus,
      operator
    ),
    evidenceEntry(
      "baseline.backend_health_endpoint",
      "baseline_metadata",
      form.backendHealthEndpoint,
      operator
    ),
    evidenceEntry(
      "baseline.t0_health_summary",
      "baseline_metadata",
      form.t0HealthSummary,
      operator
    ),
    evidenceEntry("baseline.auth_confirmed", "baseline_metadata", form.authConfirmed, operator),
    evidenceEntry(
      "baseline.twelve_data_key_status",
      "baseline_metadata",
      form.twelveDataKeyStatus,
      operator
    ),
    evidenceEntry(
      "baseline.watchlist_live_symbols",
      "baseline_metadata",
      form.watchlistLiveSymbols,
      operator
    ),
    evidenceEntry("baseline.notes", "baseline_metadata", form.notes, operator)
  ];
}
function evidenceEntry(evidence_key, evidence_type, evidence_value, operator) {
  return {
    evidence_key,
    evidence_type,
    evidence_value,
    operator
  };
}
function indexEvidenceByKey(rows) {
  const map = {};
  for (const row of rows) {
    map[row.evidence_key] = row.evidence_value;
  }
  return map;
}
function formatTimestamp(value) {
  if (!value) return "Unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}
function formatSoakAge(value) {
  if (!value) return "Not started";
  const baseline = new Date(value);
  if (Number.isNaN(baseline.getTime())) return "Unknown";
  const diffMs = Date.now() - baseline.getTime();
  if (diffMs < 0) return "0h";
  const totalMinutes = Math.floor(diffMs / 6e4);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}
function formatSoakReportError(error, action) {
  const statusCode = resolveErrorStatusCode(error);
  const errorCode = resolveErrorCode(error);
  const actionLabel = action === "load" ? "initial load" : "refresh";
  const parts = [`Soak report data source failed during ${actionLabel}.`];
  if (statusCode !== null) {
    parts.push(`HTTP ${statusCode}.`);
  }
  if (errorCode) {
    parts.push(`Error code: ${errorCode}.`);
  }
  if (error instanceof Error && error.message.trim()) {
    parts.push(`Detail: ${error.message}.`);
  }
  parts.push("Retry the soak report. Contact backend on-call if this persists.");
  return parts.join(" ");
}
function resolveErrorStatusCode(error) {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = error.status;
    if (typeof status === "number" && Number.isFinite(status)) {
      return status;
    }
  }
  if (error instanceof Error) {
    const match = error.message.match(/failed:\s*(\d{3})\b/i);
    if (match) {
      return Number.parseInt(match[1], 10);
    }
  }
  return null;
}
function resolveErrorCode(error) {
  if (typeof error === "object" && error !== null) {
    const code = error.code;
    if (typeof code === "string" && code.trim()) {
      return code.trim();
    }
  }
  if (error instanceof Error) {
    const match = error.message.match(/"(?:error|code)":"([^"]+)"/i);
    if (match) {
      return match[1];
    }
  }
  return null;
}
function renderTimelineRow(label, checkpoint) {
  return /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between rounded-md border border-bd bg-bg1/60 px-3 py-2", children: [
    /* @__PURE__ */ jsx("div", { className: "font-mono text-tx", children: label }),
    /* @__PURE__ */ jsx("div", { children: checkpoint ? formatTimestamp(checkpoint.created_at) : "Pending" })
  ] });
}
function stringOrUnavailable(value) {
  return value === null ? "Unavailable" : String(value);
}
function toneForStatus(value) {
  switch (value) {
    case "live":
    case "present":
    case "ok":
      return "positive";
    case "cached":
    case "stale":
    case "missing":
    case "rate-limited":
      return "warning";
    case "blocked":
    case "offline":
    case "failed":
      return "critical";
    default:
      return "neutral";
  }
}
function resolveDisplayHealth(health) {
  return {
    feedStatus: health?.feedStatus ?? health?.priceFeed ?? "unknown",
    backendSync: health?.backendSync ?? "unknown",
    engineRunState: health?.engineRunState ?? "unknown",
    priceFeed: health?.priceFeed ?? "unknown",
    twelveDataKeyStatus: health?.twelveDataKeyStatus ?? health?.twelveDataKey ?? "unknown",
    lastBatchAt: health?.lastBatchAt ?? null,
    lastEngineRunAt: health?.lastEngineRunAt ?? null,
    perSymbolDiagnostics: Array.isArray(health?.perSymbolDiagnostics) ? health.perSymbolDiagnostics : []
  };
}
function buildSoakReportMarkdown(report, template) {
  const health = resolveDisplayHealth(report.health);
  const evidenceMap = indexEvidenceByKey(report.manual_evidence);
  const evidenceLines = report.manual_evidence.length === 0 ? ["- None recorded"] : report.manual_evidence.map(
    (row) => `- ${row.evidence_key} | ${row.evidence_type} | ${row.operator} | ${formatTimestamp(row.updated_at)} | ${row.evidence_value.replace(/\r?\n/g, " ")}`
  );
  const checkpointLines = report.checkpoints.length === 0 ? ["- None recorded"] : report.checkpoints.map(
    (row) => `- ${row.checkpoint_type} | ${formatTimestamp(row.created_at)} | ${row.operator_notes ?? "No operator notes"}`
  );
  const baselineLine = report.baseline_checkpoint ? `- ${formatTimestamp(report.baseline_checkpoint.created_at)} | ${report.baseline_checkpoint.operator_notes ?? "No operator notes"}` : "- Pending";
  const soakPurpose = evidenceMap["baseline.soak_purpose"] ?? evidenceMap["soak.purpose"] ?? "";
  const reportLines = [`# ${template.label}`, "", `Soak type: ${template.soakType}`];
  if (soakPurpose) {
    reportLines.push(`Soak objective: ${soakPurpose}`, "");
  } else {
    reportLines.push("");
  }
  reportLines.push(`Generated at: ${report.generated_at}`, "", "## Baseline", baselineLine, "");
  return [
    ...reportLines,
    "## Health",
    `- Feed status: ${health.feedStatus}`,
    `- Backend sync: ${health.backendSync}`,
    `- Engine run state: ${health.engineRunState}`,
    `- Last batch: ${formatTimestamp(health.lastBatchAt)}`,
    `- Last engine run: ${formatTimestamp(health.lastEngineRunAt)}`,
    "",
    "## Aggregates",
    `- Watchlist count: ${report.watchlist_count === null ? "Unavailable" : report.watchlist_count}`,
    `- Snapshots 24h: ${report.snapshots_24h === null ? "Unavailable" : report.snapshots_24h}`,
    `- Candles 24h: ${report.candles_24h === null ? "Unavailable" : report.candles_24h}`,
    `- Engine runs 24h: total=${report.engine_runs_summary.total_24h}, success=${report.engine_runs_summary.success_24h}, error=${report.engine_runs_summary.error_24h}, last=${formatTimestamp(report.engine_runs_summary.last_run_at)}`,
    `- Audit events 24h: total=${report.audit_events_summary.total_24h}, error=${report.audit_events_summary.error_count_24h}, warning=${report.audit_events_summary.warning_count_24h}`,
    "",
    "## Manual Evidence",
    ...evidenceLines,
    "",
    "## Checkpoints",
    ...checkpointLines,
    ""
  ].join("\n");
}
const $$splitComponentImporter$1 = () => import("./account-CNIAEj0x.js");
const Route$2 = createFileRoute("/account")({
  head: () => ({
    meta: [{
      title: "Account & Settings - SMC SuperFIB"
    }, {
      name: "description",
      content: "Backend URL, API key status, refresh interval, watchlist and risk profile."
    }, {
      property: "og:title",
      content: "Account & Settings - SMC SuperFIB"
    }, {
      property: "og:description",
      content: "Configure your dashboard and risk profile."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
const $$splitComponentImporter = () => import("./index-DjOsS8aL.js");
const Route$1 = createFileRoute("/")({
  component: lazyRouteComponent($$splitComponentImporter, "component")
});
const Route = createFileRoute("/admin/soak-report")({
  beforeLoad: () => {
    throw redirect({ to: "/admin", replace: true });
  }
});
const SignalsRoute = Route$c.update({
  id: "/signals",
  path: "/signals",
  getParentRoute: () => Route$d
});
const ProgressRoute = Route$b.update({
  id: "/progress",
  path: "/progress",
  getParentRoute: () => Route$d
});
const PlanRoute = Route$a.update({
  id: "/plan",
  path: "/plan",
  getParentRoute: () => Route$d
});
const OrdersRoute = Route$9.update({
  id: "/orders",
  path: "/orders",
  getParentRoute: () => Route$d
});
const LoginRoute = Route$8.update({
  id: "/login",
  path: "/login",
  getParentRoute: () => Route$d
});
const LiveRoute = Route$7.update({
  id: "/live",
  path: "/live",
  getParentRoute: () => Route$d
});
const ChartsRoute = Route$6.update({
  id: "/charts",
  path: "/charts",
  getParentRoute: () => Route$d
});
const BookRoute = Route$5.update({
  id: "/book",
  path: "/book",
  getParentRoute: () => Route$d
});
const AnalyticsRoute = Route$4.update({
  id: "/analytics",
  path: "/analytics",
  getParentRoute: () => Route$d
});
const AdminRoute = Route$3.update({
  id: "/admin",
  path: "/admin",
  getParentRoute: () => Route$d
});
const AccountRoute = Route$2.update({
  id: "/account",
  path: "/account",
  getParentRoute: () => Route$d
});
const IndexRoute = Route$1.update({
  id: "/",
  path: "/",
  getParentRoute: () => Route$d
});
const AdminSoakReportRoute = Route.update({
  id: "/soak-report",
  path: "/soak-report",
  getParentRoute: () => AdminRoute
});
const AdminRouteChildren = {
  AdminSoakReportRoute
};
const AdminRouteWithChildren = AdminRoute._addFileChildren(AdminRouteChildren);
const rootRouteChildren = {
  IndexRoute,
  AccountRoute,
  AdminRoute: AdminRouteWithChildren,
  AnalyticsRoute,
  BookRoute,
  ChartsRoute,
  LiveRoute,
  LoginRoute,
  OrdersRoute,
  PlanRoute,
  ProgressRoute,
  SignalsRoute
};
const routeTree = Route$d._addFileChildren(rootRouteChildren)._addFileTypes();
const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1e4,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (failureCount, error) => {
          if (error instanceof AuthError) return false;
          return failureCount < 3;
        }
      }
    }
  });
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("SCHEMA_VERSION");
    if (stored && stored !== String(SCHEMA_VERSION)) {
      queryClient.clear();
    }
    localStorage.setItem("SCHEMA_VERSION", String(SCHEMA_VERSION));
  }
  const router2 = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: ({ error }) => /* @__PURE__ */ jsx("div", { className: "flex min-h-[40vh] items-center justify-center px-4", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md text-center", children: [
      /* @__PURE__ */ jsx("div", { className: "text-sell text-sm font-mono", children: "⚠️ ENGINE FAULT" }),
      /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-mute", children: error.message })
    ] }) })
  });
  return router2;
};
const router = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getRouter
}, Symbol.toStringTag, { value: "Module" }));
export {
  AuthError as A,
  BrandPulseLogo as B,
  alignWatchlistItems as C,
  DivergenceBanner as D,
  useStreamingTicks as E,
  FreshnessBadge as F,
  clampSymbolToWatchlist as G,
  useStableUserTrades as H,
  useWatchlistAdd as I,
  useWatchlistRemove as J,
  normalizeBackendUrl as K,
  setBackendUrl as L,
  MOCK_MODE as M,
  hasCredentials as N,
  hasWordPressNonce as O,
  router as P,
  WarningLine as W,
  useEngineHealth as a,
  usePollingUiState as b,
  useEngineBatch as c,
  useCanonicalWatchlist as d,
  deduplicateById as e,
  cn as f,
  useUserAccount as g,
  useAccountTelemetry as h,
  useUserRiskProfile as i,
  useUserProgress as j,
  fmtCurrency as k,
  fmtPct as l,
  fmtPrice as m,
  normalizeSymbolForWatchlistComparison as n,
  fmtLocalCurrency as o,
  apiClient as p,
  tickMotionHoldMs as q,
  relTime as r,
  useDisplaySignals as s,
  tickMotionStyle as t,
  useLiveSignals as u,
  useLadders as v,
  useSnapshot as w,
  useUserSettings as x,
  setCredentials as y,
  usePollMs as z
};
