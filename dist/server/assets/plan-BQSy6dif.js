import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { f as cn, h as useAccountTelemetry, F as FreshnessBadge, k as fmtCurrency, t as tickMotionStyle, m as fmtPrice, r as relTime, D as DivergenceBanner, W as WarningLine, o as fmtLocalCurrency, l as fmtPct, p as apiClient, q as tickMotionHoldMs, B as BrandPulseLogo, s as useDisplaySignals, v as useLadders, w as useSnapshot, b as usePollingUiState, d as useCanonicalWatchlist, e as deduplicateById, n as normalizeSymbolForWatchlistComparison, x as useUserSettings } from "./router-DONb8JY3.js";
import { S as SettingsQueryErrorState } from "./SettingsQueryErrorState-2nE1Yemg.js";
import { Lock, Send, ArrowUpRight, ArrowDownRight, AlertTriangle, Search } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { V as VerdictBadge } from "./VerdictBadge-B6Djk0kB.js";
import { toast } from "sonner";
import "@tanstack/react-router";
import "@tanstack/react-query";
import "clsx";
import "tailwind-merge";
import "recharts";
import "@radix-ui/react-slot";
import "class-variance-authority";
function Skeleton({ className, ...props }) {
  return /* @__PURE__ */ jsx("div", { className: cn("animate-pulse rounded-md bg-primary/10", className), ...props });
}
const USD_TO_ZAR_RATE = 18.5;
function WalletOverview() {
  const { data: account, isLoading, error } = useAccountTelemetry();
  if (isLoading) {
    return /* @__PURE__ */ jsxs("section", { className: "space-y-2", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx("span", { className: "inline-block h-3 w-1 rounded-sm bg-accent" }),
          /* @__PURE__ */ jsx("h2", { className: "text-[11px] font-mono uppercase tracking-[0.18em] text-dim font-semibold", children: "Account" })
        ] }),
        /* @__PURE__ */ jsx(Skeleton, { className: "h-4 w-16 bg-bg3" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "overflow-hidden rounded-lg border border-bd bg-bg1/60", children: /* @__PURE__ */ jsx("div", { className: "grid grid-cols-2 divide-y divide-bd lg:grid-cols-4 lg:divide-x lg:divide-y-0 [&>*]:border-bd", children: ["EQUITY", "BALANCE", "FLOATING P/L", "MARGIN LEVEL"].map((label) => /* @__PURE__ */ jsxs("div", { className: "space-y-2 px-4 py-3 lg:px-5 lg:py-4", children: [
        /* @__PURE__ */ jsx("div", { className: "text-[10px] font-mono uppercase tracking-[0.16em] text-mute font-semibold", children: label }),
        /* @__PURE__ */ jsx(Skeleton, { className: "h-7 w-24 bg-bg3" }),
        /* @__PURE__ */ jsx(Skeleton, { className: "h-3 w-16 bg-bg3" })
      ] }, label)) }) })
    ] });
  }
  if (error || !account) {
    return /* @__PURE__ */ jsxs("section", { className: "space-y-2", children: [
      /* @__PURE__ */ jsx("div", { className: "flex items-center justify-between gap-3", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx("span", { className: "inline-block h-3 w-1 rounded-sm bg-accent" }),
        /* @__PURE__ */ jsx("h2", { className: "text-[11px] font-mono uppercase tracking-[0.18em] text-dim font-semibold", children: "Account" })
      ] }) }),
      /* @__PURE__ */ jsx("div", { className: "text-xs text-warn/80 px-4 py-3", children: "⚠️ Account data unavailable — check backend connection or authentication" })
    ] });
  }
  const cur = account.currency;
  const floating = account.floatingPl;
  const marginLevel = account.marginLevel > 0 ? account.marginLevel : 0;
  const marginStrength = marginLevel > 1e3 ? "Strong" : marginLevel > 200 ? "Healthy" : "Tight";
  return /* @__PURE__ */ jsxs("section", { className: "space-y-2", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx("span", { className: "inline-block h-3 w-1 rounded-sm bg-accent" }),
        /* @__PURE__ */ jsx("h2", { className: "text-[11px] font-mono uppercase tracking-[0.18em] text-dim font-semibold", children: "Account" })
      ] }),
      /* @__PURE__ */ jsx(FreshnessBadge, { state: account.state })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "rounded-lg border border-bd bg-bg1/60 overflow-hidden", children: /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 lg:grid-cols-4 divide-bd divide-y lg:divide-y-0 lg:divide-x [&>*]:border-bd", children: [
      /* @__PURE__ */ jsx(
        Cell,
        {
          label: "EQUITY",
          value: fmtCurrency(account.equity, cur),
          valueClass: "text-buy",
          sub: /* @__PURE__ */ jsx("span", { className: "text-mute", children: formatLocalZar(account.equity, cur) })
        }
      ),
      /* @__PURE__ */ jsx(
        Cell,
        {
          label: "BALANCE",
          value: fmtCurrency(account.balance, cur),
          valueClass: "text-info",
          sub: /* @__PURE__ */ jsx("span", { className: "text-mute", children: formatLocalZar(account.balance, cur) })
        }
      ),
      /* @__PURE__ */ jsx(
        Cell,
        {
          label: "FLOATING P/L",
          value: fmtCurrency(floating, cur, true),
          valueClass: floating >= 0 ? "text-buy" : "text-sell",
          sub: /* @__PURE__ */ jsx("span", { className: "text-mute", children: formatLocalZar(floating, cur) })
        }
      ),
      /* @__PURE__ */ jsx(
        Cell,
        {
          label: "MARGIN LEVEL",
          value: `${Math.round(marginLevel)}%`,
          valueClass: "text-buy",
          sub: /* @__PURE__ */ jsx("span", { className: "text-dim", children: marginStrength })
        }
      )
    ] }) })
  ] });
}
function formatLocalZar(value, currency) {
  const currencyInfo = parseAccountCurrency(currency);
  const baseAmount = value / (currencyInfo.isCent ? 100 : 1);
  const zar = currencyInfo.base === "ZAR" ? baseAmount : currencyInfo.base === "USD" ? baseAmount * USD_TO_ZAR_RATE : null;
  if (zar === null) {
    return "Local ZAR --";
  }
  return `Local ZAR ${zar.toLocaleString(void 0, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}
function parseAccountCurrency(currency) {
  const raw = (currency ?? "").trim().toUpperCase();
  let token = raw.replace(/[^A-Z]/g, "");
  let isCent = false;
  if (token === "USC") {
    return { base: "USD", isCent: true };
  }
  for (const suffix of ["MICRO", "CENT"]) {
    if (token.endsWith(suffix) && token.length > suffix.length) {
      token = token.slice(0, -suffix.length);
      isCent = true;
      break;
    }
  }
  if (!isCent && /(?:^|[.\s_-])[CM]$/.test(raw)) {
    isCent = true;
  }
  if (!isCent && token.length > 3 && ["C", "M"].includes(token.at(-1) ?? "")) {
    token = token.slice(0, -1);
    isCent = true;
  }
  if (token === "EURO") {
    token = "EUR";
  }
  return { base: token.slice(0, 3), isCent };
}
function Cell({
  label,
  value,
  sub,
  valueClass
}) {
  return /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 lg:px-5 lg:py-4 min-w-0", children: [
    /* @__PURE__ */ jsx("div", { className: "text-[10px] font-mono uppercase tracking-[0.16em] text-mute font-semibold", children: label }),
    /* @__PURE__ */ jsx(
      "div",
      {
        className: cn(
          "font-mono text-2xl lg:text-3xl font-bold mt-1 tabular-nums truncate",
          valueClass
        ),
        children: value
      }
    ),
    /* @__PURE__ */ jsx("div", { className: "mt-1 text-[10px] font-mono leading-relaxed", children: sub })
  ] });
}
const SYMBOL_ALIASES = {
  NASDAQ: "NAS100",
  NASDAQ100: "NAS100",
  USTECH100: "NAS100",
  USTECH: "NAS100",
  WALLSTREET: "US30",
  WALLSTREET30: "US30",
  DOW30: "US30",
  DJ30: "US30",
  USSP500: "SPX500",
  USSP: "SPX500",
  US500: "SPX500",
  SP500: "SPX500",
  GOLD: "XAUUSD",
  SILVER: "XAGUSD",
  DAX: "GER40",
  DAX40: "GER40",
  GERMANY40: "GER40",
  DEDE40: "GER40"
};
const INSTRUMENT_TYPES = {
  XAUUSD: "metal",
  XAGUSD: "metal",
  BTCUSD: "crypto",
  ETHUSD: "crypto",
  XRPUSD: "crypto",
  BNBUSD: "crypto",
  SOLUSD: "crypto",
  US30: "index",
  NAS100: "index",
  SPX500: "index",
  GER40: "index"
};
const SYMBOL_MIN_EXECUTABLE_LOTS = {
  USDZAR: 0.1
};
const MIN_EXECUTABLE_STAGE_LOT = 0.01;
const BROKER_SUFFIXES = [
  "MICRO",
  "CENT",
  "PRO",
  "ECN",
  "STP",
  "RAW",
  "M",
  "R",
  "A",
  "B",
  "C"
];
const CENT_ACCOUNT_SUFFIXES = ["MICRO", "CENT", "M", "C"];
function resolveKnownPlanToken(token) {
  const aliased = SYMBOL_ALIASES[token] ?? token;
  return aliased in INSTRUMENT_TYPES || aliased in SYMBOL_MIN_EXECUTABLE_LOTS || token in SYMBOL_ALIASES ? aliased : null;
}
function normalizePlanSymbol(symbol) {
  const token = (symbol ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const directMatch = resolveKnownPlanToken(token);
  if (directMatch) return directMatch;
  for (const suffix of BROKER_SUFFIXES) {
    if (!token.endsWith(suffix) || token.length <= suffix.length) continue;
    const suffixStrippedMatch = resolveKnownPlanToken(token.slice(0, -suffix.length));
    if (suffixStrippedMatch) return suffixStrippedMatch;
  }
  return token;
}
function hasCentOrMicroSuffix(symbol) {
  const token = (symbol ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return CENT_ACCOUNT_SUFFIXES.some(
    (suffix) => token.endsWith(suffix) && token.length > suffix.length
  );
}
function getMinExecutableStageLot(symbol) {
  const token = normalizePlanSymbol(symbol);
  const instrumentType = INSTRUMENT_TYPES[token] ?? "forex";
  if (hasCentOrMicroSuffix(symbol) && instrumentType === "forex") {
    return MIN_EXECUTABLE_STAGE_LOT;
  }
  if (token in SYMBOL_MIN_EXECUTABLE_LOTS) {
    return SYMBOL_MIN_EXECUTABLE_LOTS[token];
  }
  return instrumentType === "metal" || instrumentType === "crypto" || instrumentType === "index" ? 0.1 : MIN_EXECUTABLE_STAGE_LOT;
}
function resolveMinExecutableStageLot(symbol, override) {
  return typeof override === "number" && Number.isFinite(override) && override > 0 ? override : getMinExecutableStageLot(symbol);
}
function isPositiveFinite(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function isExecutableStageLotValue(value, symbol, minExecutableLot) {
  return typeof value === "number" && Number.isFinite(value) && value >= resolveMinExecutableStageLot(symbol, minExecutableLot);
}
function isTradePlanComplete(plan) {
  return [
    plan.tps?.tp1,
    plan.tps?.tp2,
    plan.tps?.tp3,
    plan.rr?.tp1,
    plan.rr?.tp2,
    plan.rr?.tp3
  ].every(isPositiveFinite);
}
function stageLotValues(plan) {
  return [plan.lotSize?.e1, plan.lotSize?.e2, plan.lotSize?.e3];
}
function hasExecutableStageLots(plan) {
  return stageLotValues(plan).some(
    (value) => isExecutableStageLotValue(value, plan.symbol, plan.minExecutableLot)
  );
}
function hasSkippedStageLots(plan) {
  return stageLotValues(plan).some(
    (value) => !isExecutableStageLotValue(value, plan.symbol, plan.minExecutableLot)
  );
}
function toFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return void 0;
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function clamp01(value) {
  return clamp(value, 0, 1);
}
function compressImpulse(value) {
  return 1 - Math.exp(-Math.max(0, value) * 900);
}
function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = state + 1831565813 >>> 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function sampleNormal(random) {
  const u1 = Math.max(random(), 1e-7);
  const u2 = Math.max(random(), 1e-7);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function hermiteInterpolate(start, end, startSlope, endSlope, t) {
  const tt = t * t;
  const ttt = tt * t;
  const h00 = 2 * ttt - 3 * tt + 1;
  const h10 = ttt - 2 * tt + t;
  const h01 = -2 * ttt + 3 * tt;
  const h11 = ttt - tt;
  return h00 * start + h10 * startSlope + h01 * end + h11 * endSlope;
}
function getMotionSpace(from, to) {
  return from > 0 && to > 0 ? "log" : "linear";
}
function measureMovement(from, to, space) {
  if (space === "log") {
    return Math.log(to / from);
  }
  return to - from;
}
function measureImpulse(from, to, space) {
  if (space === "log") {
    return Math.abs(Math.log(to / from));
  }
  return Math.abs(to - from) / Math.max(Math.abs(from), 1);
}
function estimateMotionStats(samples, space) {
  const filtered = samples.filter((sample) => sample.space === space && sample.elapsedSec > 0);
  if (filtered.length === 0) {
    return { driftPerSec: 0, volatilityPerSqrtSec: 0 };
  }
  const elapsedTotal = filtered.reduce((sum, sample) => sum + sample.elapsedSec, 0);
  if (elapsedTotal <= 0) {
    return { driftPerSec: 0, volatilityPerSqrtSec: 0 };
  }
  const driftPerSec = filtered.reduce((sum, sample) => sum + sample.movement, 0) / elapsedTotal;
  const variance = filtered.reduce((sum, sample) => {
    const residual = sample.movement - driftPerSec * sample.elapsedSec;
    return sum + residual * residual;
  }, 0) / elapsedTotal;
  return {
    driftPerSec,
    volatilityPerSqrtSec: Math.sqrt(Math.max(variance, 0))
  };
}
function createMotionProfile({
  from,
  to,
  elapsedSec,
  driftPerSec,
  volatilityPerSqrtSec,
  seed,
  space
}) {
  const realizedMovement = measureMovement(from, to, space);
  const driftMovement = driftPerSec * elapsedSec;
  const slopeLimit = Math.abs(realizedMovement) * 0.9 + (space === "log" ? 18e-5 : Math.max(Math.abs(to - from) * 0.055, 8e-3));
  const shapedSlope = clamp(driftMovement, -slopeLimit, slopeLimit);
  const realizedScale = space === "log" ? Math.abs(realizedMovement) : Math.abs(realizedMovement) / Math.max(Math.abs(from), 1);
  const amplitudeCap = space === "log" ? Math.abs(realizedMovement) * 0.42 + 75e-5 : Math.abs(to - from) * 0.4 + Math.max(Math.abs(from), 1) * 11e-4;
  const volatilityAmplitude = space === "log" ? volatilityPerSqrtSec * Math.sqrt(elapsedSec) : volatilityPerSqrtSec * Math.sqrt(elapsedSec) * Math.max(Math.abs(from), 1);
  const amplitude = Math.min(
    amplitudeCap,
    Math.max(
      amplitudeCap * 0.08,
      volatilityAmplitude * 0.42,
      realizedScale * (space === "log" ? 0.14 : Math.max(Math.abs(from), 1) * 0.1)
    )
  );
  const random = createSeededRandom(seed);
  const bridgeKnots = [0, 0.24, 0.5, 0.76, 1].map((progress, index, points) => {
    if (index === 0 || index === points.length - 1) {
      return { progress, shock: 0 };
    }
    const envelope = Math.pow(Math.sin(Math.PI * progress), 1.45);
    return {
      progress,
      shock: sampleNormal(random) * amplitude * envelope
    };
  });
  const driftBias = clamp(shapedSlope * 0.2, -amplitude * 0.4, amplitude * 0.4);
  const sampleBridge = (progress) => {
    for (let i = 1; i < bridgeKnots.length; i += 1) {
      if (progress <= bridgeKnots[i].progress) {
        const start = bridgeKnots[i - 1];
        const end = bridgeKnots[i];
        const span = end.progress - start.progress || 1;
        const mix = (progress - start.progress) / span;
        return start.shock + (end.shock - start.shock) * mix;
      }
    }
    return 0;
  };
  return (progress) => {
    const t = clamp01(progress);
    const bridgeEnvelope = Math.pow(Math.sin(Math.PI * t), 1.35);
    const trendArc = driftBias * bridgeEnvelope;
    const bridgeShock = sampleBridge(t) * bridgeEnvelope * 0.78;
    const movement = hermiteInterpolate(0, realizedMovement, shapedSlope, shapedSlope, t) + trendArc + bridgeShock;
    if (space === "log") {
      return from * Math.exp(movement);
    }
    return from + movement;
  };
}
function prefersReducedMotion() {
  return typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
}
function useAnimatedNumber(value, durationMs = 300, holdMs = durationMs, resetKey) {
  const numericValue = toFiniteNumber(value);
  const safeDurationMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 300;
  const safeHoldMs = Number.isFinite(holdMs) && holdMs > 0 ? holdMs : safeDurationMs;
  const [animated, setAnimated] = useState(numericValue);
  const [direction, setDirection] = useState(null);
  const [heldDirection, setHeldDirection] = useState(null);
  const rafRef = useRef(null);
  const directionTimeoutRef = useRef(null);
  const fromRef = useRef(numericValue ?? 0);
  const toRef = useRef(numericValue ?? 0);
  const currentRef = useRef(numericValue ?? 0);
  const hasValueRef = useRef(numericValue !== void 0);
  const motionKeyRef = useRef(0);
  const motionImpulseRef = useRef(0);
  const lastUpdateAtRef = useRef(null);
  const motionSamplesRef = useRef([]);
  const randomSeedRef = useRef(Math.random() * 4294967295 >>> 0);
  const resetKeyRef = useRef(resetKey);
  const durationRef = useRef(safeDurationMs);
  durationRef.current = safeDurationMs;
  useEffect(() => {
    if (resetKeyRef.current === resetKey) {
      return;
    }
    resetKeyRef.current = resetKey;
    if (rafRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (directionTimeoutRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(directionTimeoutRef.current);
      directionTimeoutRef.current = null;
    }
    hasValueRef.current = false;
    fromRef.current = numericValue ?? 0;
    toRef.current = numericValue ?? 0;
    currentRef.current = numericValue ?? 0;
    motionKeyRef.current = 0;
    motionImpulseRef.current = 0;
    lastUpdateAtRef.current = null;
    motionSamplesRef.current = [];
    setDirection(null);
    setHeldDirection(null);
    setAnimated(numericValue);
  }, [numericValue, resetKey]);
  useEffect(() => {
    if (numericValue === void 0) {
      if (rafRef.current !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (directionTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(directionTimeoutRef.current);
        directionTimeoutRef.current = null;
      }
      hasValueRef.current = false;
      lastUpdateAtRef.current = null;
      motionSamplesRef.current = [];
      setAnimated(void 0);
      setDirection(null);
      setHeldDirection(null);
      return;
    }
    if (!hasValueRef.current) {
      hasValueRef.current = true;
      fromRef.current = numericValue;
      toRef.current = numericValue;
      currentRef.current = numericValue;
      lastUpdateAtRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
      setAnimated(numericValue);
      setDirection(null);
      setHeldDirection(null);
      return;
    }
    const prev = toRef.current;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const elapsedMs = clamp(now - (lastUpdateAtRef.current ?? now - safeDurationMs), 180, 6e3);
    lastUpdateAtRef.current = now;
    const dir = numericValue > prev ? "up" : numericValue < prev ? "down" : null;
    if (directionTimeoutRef.current !== null) {
      window.clearTimeout(directionTimeoutRef.current);
      directionTimeoutRef.current = null;
    }
    setDirection(dir);
    if (dir !== null) {
      setHeldDirection(dir);
      directionTimeoutRef.current = window.setTimeout(() => {
        directionTimeoutRef.current = null;
        setDirection(null);
      }, safeHoldMs);
    }
    if (dir !== null) {
      const space = getMotionSpace(prev, numericValue);
      const elapsedSec = elapsedMs / 1e3;
      const motionStats = estimateMotionStats(motionSamplesRef.current, space);
      const motionProfile = createMotionProfile({
        from: Number.isFinite(currentRef.current) ? currentRef.current : prev,
        to: numericValue,
        elapsedSec,
        driftPerSec: motionStats.driftPerSec,
        volatilityPerSqrtSec: motionStats.volatilityPerSqrtSec,
        seed: randomSeedRef.current ^ motionKeyRef.current + 1 ^ Math.round(elapsedMs) ^ Math.round(Math.abs(numericValue) * 1e5),
        space
      });
      motionKeyRef.current += 1;
      motionImpulseRef.current = compressImpulse(measureImpulse(prev, numericValue, space));
      motionSamplesRef.current = [
        ...motionSamplesRef.current.slice(-11),
        { elapsedSec, movement: measureMovement(prev, numericValue, space), space }
      ];
      fromRef.current = Number.isFinite(currentRef.current) ? currentRef.current : numericValue;
      toRef.current = numericValue;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (prefersReducedMotion() || typeof window === "undefined") {
        currentRef.current = numericValue;
        setAnimated(numericValue);
        return;
      }
      const start = performance.now();
      const step = (frameNow) => {
        const elapsed = frameNow - start;
        const progress = Math.min(1, elapsed / durationRef.current);
        const interpolated = motionProfile(progress);
        currentRef.current = interpolated;
        setAnimated(interpolated);
        if (progress < 1) {
          rafRef.current = window.requestAnimationFrame(step);
        } else {
          currentRef.current = toRef.current;
          rafRef.current = null;
          setAnimated(toRef.current);
        }
      };
      rafRef.current = window.requestAnimationFrame(step);
      return () => {
        if (rafRef.current !== null) {
          window.cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      };
    }
    fromRef.current = Number.isFinite(currentRef.current) ? currentRef.current : numericValue;
    toRef.current = numericValue;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    currentRef.current = numericValue;
    setAnimated(numericValue);
  }, [numericValue]);
  return {
    value: animated,
    direction,
    heldDirection,
    motionKey: motionKeyRef.current,
    motionImpulse: motionImpulseRef.current
  };
}
const PLAN_CARD_TICK_MOTION = {
  baseDurationMs: 280,
  durationSpreadMs: 120,
  delayMaxMs: 100
};
function PlanCandidateCard({
  signal,
  plan,
  price,
  planComplete
}) {
  const priceFlashHoldMs = tickMotionHoldMs(PLAN_CARD_TICK_MOTION);
  const { value, direction, heldDirection, motionKey, motionImpulse } = useAnimatedNumber(
    price?.mid,
    300,
    priceFlashHoldMs,
    signal.symbol
  );
  const { data: accountTelemetry } = useAccountTelemetry();
  const priceStyle = tickMotionStyle(`${signal.symbol}:plan-mid`, PLAN_CARD_TICK_MOTION, {
    motionKey,
    motionImpulse
  });
  const priceLive = Boolean(
    price && price.mid > 0 && (price.state === "live" || price.state === "mock")
  );
  const divergence = signal.computedBy === "frontend" && !signal.backendConfirmed;
  const executableStageLots = plan ? hasExecutableStageLots(plan) : true;
  const skippedStageLots = plan ? hasSkippedStageLots(plan) : false;
  const planSymbol = plan?.symbol ?? signal.symbol;
  const minExecutableLot = plan?.minExecutableLot && Number.isFinite(plan.minExecutableLot) && plan.minExecutableLot > 0 ? plan.minExecutableLot : getMinExecutableStageLot(planSymbol);
  const pendingBlueprint = plan?.source === "pending-blueprint";
  const watchBlueprint = plan?.source === "watch-blueprint";
  const canExecuteSignal = signal.backendConfirmed && !pendingBlueprint && !watchBlueprint && !signal.engine?.graceHold && planComplete && executableStageLots;
  const entryRows = plan ? [
    {
      stage: "E1",
      entry: fmtPrice(plan.entries.e1, signal.symbol),
      lot: formatLotSize(plan.lotSize.e1, minExecutableLot),
      lotBelowMinimum: !isExecutableStageLotValue(
        plan.lotSize.e1,
        planSymbol,
        minExecutableLot
      ),
      stop: fmtPrice(plan.stops?.e1 ?? plan.sl, signal.symbol),
      target: formatOptionalPrice(plan.tps?.tp1, signal.symbol),
      rr: formatOptionalRatio(plan.rr?.tp1),
      status: getStageStatus({
        filled: plan.stageFills?.e1,
        lot: plan.lotSize.e1,
        minLot: minExecutableLot,
        planState: plan.state,
        planSource: plan.source
      })
    },
    {
      stage: "E2",
      entry: fmtPrice(plan.entries.e2, signal.symbol),
      lot: formatLotSize(plan.lotSize.e2, minExecutableLot),
      lotBelowMinimum: !isExecutableStageLotValue(
        plan.lotSize.e2,
        planSymbol,
        minExecutableLot
      ),
      stop: fmtPrice(plan.stops?.e2 ?? plan.sl, signal.symbol),
      target: formatOptionalPrice(plan.tps?.tp2, signal.symbol),
      rr: formatOptionalRatio(plan.rr?.tp2),
      status: getStageStatus({
        filled: plan.stageFills?.e2,
        lot: plan.lotSize.e2,
        minLot: minExecutableLot,
        planState: plan.state,
        planSource: plan.source
      })
    },
    {
      stage: "E3",
      entry: fmtPrice(plan.entries.e3, signal.symbol),
      lot: formatLotSize(plan.lotSize.e3, minExecutableLot),
      lotBelowMinimum: !isExecutableStageLotValue(
        plan.lotSize.e3,
        planSymbol,
        minExecutableLot
      ),
      stop: fmtPrice(plan.stops?.e3 ?? plan.sl, signal.symbol),
      target: formatOptionalPrice(plan.tps?.tp3, signal.symbol),
      rr: formatOptionalRatio(plan.rr?.tp3),
      status: getStageStatus({
        filled: plan.stageFills?.e3,
        lot: plan.lotSize.e3,
        minLot: minExecutableLot,
        planState: plan.state,
        planSource: plan.source
      })
    }
  ] : null;
  const targetRows = plan ? [
    {
      label: "TP1",
      price: formatOptionalPrice(plan.tps?.tp1, signal.symbol),
      ratio: formatOptionalRatio(plan.rr?.tp1)
    },
    {
      label: "TP2",
      price: formatOptionalPrice(plan.tps?.tp2, signal.symbol),
      ratio: formatOptionalRatio(plan.rr?.tp2)
    },
    {
      label: "TP3",
      price: formatOptionalPrice(plan.tps?.tp3, signal.symbol),
      ratio: formatOptionalRatio(plan.rr?.tp3)
    }
  ] : null;
  return /* @__PURE__ */ jsxs(
    "section",
    {
      "data-testid": "plan-candidate-card",
      className: cn(
        "rounded-lg border border-bd bg-bg1/60 p-4 lg:p-5 transition-colors space-y-4",
        priceLive && heldDirection === "up" && "tick-surface-hold-up",
        priceLive && heldDirection === "down" && "tick-surface-hold-down"
      ),
      children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-3 flex-wrap", children: [
          /* @__PURE__ */ jsx("div", { className: "space-y-2 min-w-0", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [
            /* @__PURE__ */ jsx(VerdictBadge, { verdict: signal.verdict }),
            /* @__PURE__ */ jsx("span", { className: "font-mono text-lg font-semibold", children: signal.symbol }),
            /* @__PURE__ */ jsx(DirectionBadge, { direction: signal.direction }),
            /* @__PURE__ */ jsx(
              StatusBadge,
              {
                status: pendingBlueprint && signal.status === "READY" ? "ARMED" : signal.status
              }
            ),
            signal.lifecycleState && signal.lifecycleState !== "DISPLAY_ACTIVE" && /* @__PURE__ */ jsx(MetaPill, { children: signal.lifecycleState }),
            /* @__PURE__ */ jsx(FreshnessBadge, { state: price?.state ?? "pending-sync" }),
            /* @__PURE__ */ jsxs(MetaPill, { title: signal.id, children: [
              "#",
              shortSignalId(signal.id)
            ] }),
            /* @__PURE__ */ jsx("span", { className: "text-xs text-mute font-mono", children: relTime(signal.createdAt) })
          ] }) }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [
            /* @__PURE__ */ jsx(
              "span",
              {
                style: priceLive ? priceStyle : void 0,
                className: cn(
                  "rounded border border-bd px-2 py-1 text-xs font-mono font-semibold tabular-nums price-smooth",
                  !price && "text-mute",
                  priceLive && heldDirection === "up" && "tick-hold-up",
                  priceLive && heldDirection === "down" && "tick-hold-down",
                  priceLive && direction === "up" && "tick-flash-up-fast",
                  priceLive && direction === "down" && "tick-flash-down-fast"
                ),
                children: price ? fmtPrice(value ?? price.mid, signal.symbol) : "--"
              }
            ),
            plan ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsxs(
                MetaChip,
                {
                  tone: plan.source === "backend-blueprint" ? "buy" : pendingBlueprint ? "pending" : watchBlueprint ? "info" : "violet",
                  children: [
                    pendingBlueprint && /* @__PURE__ */ jsx(Lock, { className: "h-3 w-3" }),
                    pendingBlueprint ? "PENDING BLUEPRINT" : watchBlueprint ? "WATCH BLUEPRINT" : plan.source === "backend-blueprint" ? "CONFIRMED" : plan.source
                  ]
                }
              ),
              !signal.backendConfirmed && /* @__PURE__ */ jsx(MetaChip, { tone: "pending", children: "UNCONFIRMED" })
            ] }) : /* @__PURE__ */ jsx(MetaChip, { tone: "neutral", children: "NO BLUEPRINT" })
          ] })
        ] }),
        divergence && /* @__PURE__ */ jsx(DivergenceBanner, { children: "Frontend computed this signal but the backend has not confirmed it. Do not execute until backend confirmation." }),
        watchBlueprint && /* @__PURE__ */ jsx(WarningLine, { level: "watch", children: "Watch blueprint is indicative and read-only. It will be replaced when a higher-quality ARMED/READY or backend-confirmed blueprint is available." }),
        signal.engine?.graceHold && /* @__PURE__ */ jsxs(WarningLine, { level: "warn", children: [
          "Price feed interrupted (",
          signal.engine.graceHoldReason ?? "stale_data",
          "). Signal held within grace window — execution disabled until feed recovers."
        ] }),
        !planComplete && plan && /* @__PURE__ */ jsx(WarningLine, { level: "warn", children: "Backend plan is missing TP2/TP3 or R:R values. Full 3-stage ladder is not confirmed. Execution blocked until the backend publishes a complete plan." }),
        skippedStageLots && plan && /* @__PURE__ */ jsxs(WarningLine, { level: "warn", children: [
          "Some stages are below the ",
          minExecutableLot.toFixed(2),
          " minimum lot for ",
          planSymbol,
          ". The backend will skip those stages and queue any remaining executable legs."
        ] }),
        !executableStageLots && plan && /* @__PURE__ */ jsxs(WarningLine, { level: "warn", children: [
          "No backend stage lots meet the ",
          minExecutableLot.toFixed(2),
          " minimum lot for ",
          planSymbol,
          ". Execution blocked until the backend publishes executable sizing."
        ] }),
        plan ? /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd bg-bg1/50 overflow-hidden", children: [
          /* @__PURE__ */ jsxs("div", { className: "border-b border-bd bg-bg1/70 px-3 py-2", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
              /* @__PURE__ */ jsx("div", { className: "text-[11px] font-mono uppercase tracking-wider text-info/80", children: "Entries" }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                plan.state && /* @__PURE__ */ jsx(MetaPill, { children: plan.state }),
                (plan.executionSource ?? plan.ladder?.e1.family) && /* @__PURE__ */ jsx(MetaPill, { children: plan.executionSource ?? plan.ladder?.e1.family })
              ] })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "mt-2 space-y-1.5", children: entryRows.map((row) => /* @__PURE__ */ jsx(ExecutionStageRow, { ...row }, row.stage)) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "grid gap-px bg-bd/60 md:grid-cols-[1.3fr_1fr]", children: [
            /* @__PURE__ */ jsxs(TicketSummarySection, { title: "Risk", tone: "sell", children: [
              /* @__PURE__ */ jsx(
                InlineMetric,
                {
                  label: "SL",
                  value: fmtPrice(plan.sl, signal.symbol),
                  valueClass: "text-sell"
                }
              ),
              /* @__PURE__ */ jsx(
                InlineMetric,
                {
                  label: "Risk",
                  value: `${fmtCurrency(plan.riskUSC, accountTelemetry?.currency)} / ${fmtLocalCurrency(plan.riskZAR, "ZAR")}`
                }
              ),
              /* @__PURE__ */ jsx(
                InlineMetric,
                {
                  label: "DD",
                  value: fmtPct(plan.drawdownImpactPct),
                  valueClass: "text-warn"
                }
              )
            ] }),
            /* @__PURE__ */ jsx(TicketSummarySection, { title: "Targets", tone: "buy", children: targetRows.map((target) => /* @__PURE__ */ jsx(
              InlineMetric,
              {
                label: target.label,
                value: target.price,
                sub: target.ratio,
                valueClass: "text-buy"
              },
              target.label
            )) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-bd bg-bg1/40 px-3 py-3", children: [
            /* @__PURE__ */ jsxs("div", { className: "text-[11px] text-mute", children: [
              "Queues this ladder to",
              " ",
              /* @__PURE__ */ jsx("span", { className: "font-mono text-dim", children: "/user/execute-signals" }),
              "."
            ] }),
            /* @__PURE__ */ jsxs(
              "button",
              {
                onClick: async () => {
                  try {
                    const response = await apiClient.postExecuteSignals({ signalIds: [signal.id] });
                    toast.success(
                      `Queued ${response.queued} order${response.queued > 1 ? "s" : ""} for execution`
                    );
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Execution failed");
                  }
                },
                disabled: !canExecuteSignal,
                className: cn(
                  "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors w-full sm:w-auto",
                  canExecuteSignal ? "bg-buy/15 border border-buy/50 text-buy hover:bg-buy/25" : "bg-bg2 border border-bd text-mute cursor-not-allowed"
                ),
                children: [
                  /* @__PURE__ */ jsx(Send, { className: "h-4 w-4" }),
                  "Send to execution"
                ]
              }
            )
          ] })
        ] }) : /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd bg-bg1/40 px-4 py-5 space-y-2", children: [
          /* @__PURE__ */ jsx("div", { className: "text-xs font-mono uppercase tracking-wider text-mute", children: "Awaiting blueprint" }),
          /* @__PURE__ */ jsx("div", { className: "text-sm text-dim", children: signal.engineBlocker ? signal.engineBlocker : signal.status === "ARMED" ? "Signal is ARMED — blueprint generated when READY conditions are met" : "Signal is being monitored — no entry conditions met yet" }),
          signal.engine && /* @__PURE__ */ jsxs("div", { className: "flex gap-3 flex-wrap text-[11px] font-mono text-dim pt-1", children: [
            /* @__PURE__ */ jsxs("span", { children: [
              "HTF: ",
              signal.engine.htfBias
            ] }),
            /* @__PURE__ */ jsx("span", { children: "·" }),
            /* @__PURE__ */ jsxs("span", { children: [
              "PD: ",
              signal.engine.pdState
            ] }),
            signal.engineBlocker && signal.engineBlocker !== "OK" && /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("span", { children: "·" }),
              /* @__PURE__ */ jsx("span", { className: "text-warn", children: signal.engineBlocker })
            ] })
          ] })
        ] }),
        !signal.backendConfirmed && /* @__PURE__ */ jsx(WarningLine, { level: "warn", children: "Execution remains disabled until backend confirmation." })
      ]
    }
  );
}
function TicketSummarySection({
  title,
  tone,
  children
}) {
  const accent = tone === "buy" ? "text-buy/80" : "text-sell/80";
  return /* @__PURE__ */ jsxs("div", { className: "bg-bg1/50 px-3 py-2.5", children: [
    /* @__PURE__ */ jsx("div", { className: cn("mb-1.5 text-[11px] font-mono uppercase tracking-wider", accent), children: title }),
    /* @__PURE__ */ jsx("div", { className: "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs", children })
  ] });
}
function DirectionBadge({ direction }) {
  const icon = direction === "LONG" ? /* @__PURE__ */ jsx(ArrowUpRight, { className: "h-4 w-4" }) : /* @__PURE__ */ jsx(ArrowDownRight, { className: "h-4 w-4" });
  return /* @__PURE__ */ jsxs(
    "span",
    {
      className: cn(
        "inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono",
        direction === "LONG" ? "border-buy/40 text-buy bg-buy/10" : "border-sell/40 text-sell bg-sell/10"
      ),
      children: [
        icon,
        direction
      ]
    }
  );
}
function StatusBadge({ status }) {
  return /* @__PURE__ */ jsx(
    "span",
    {
      className: cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono",
        status === "READY" ? "border-buy/40 text-buy bg-buy/10" : status === "ARMED" ? "border-warn/40 text-warn bg-warn/10" : "border-info/40 text-info bg-info/10"
      ),
      children: status
    }
  );
}
function MetaPill({ children, title }) {
  return /* @__PURE__ */ jsx(
    "span",
    {
      title,
      className: "rounded border border-bd bg-bg2 px-2 py-0.5 text-[10px] font-mono text-dim",
      children
    }
  );
}
function shortSignalId(id) {
  const stripped = id.replace(/^sig-/i, "");
  return stripped.slice(-4).toUpperCase();
}
function MetaChip({
  tone,
  children
}) {
  return /* @__PURE__ */ jsx(
    "span",
    {
      className: cn(
        "inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider font-mono",
        tone === "buy" && "border-buy/40 text-buy bg-buy/10",
        tone === "violet" && "border-violet/40 text-violet bg-violet/10",
        tone === "warn" && "border-warn/40 text-warn bg-warn/10",
        tone === "neutral" && "border-bd text-mute bg-bg2",
        tone === "pending" && "border-warn/40 text-warn bg-warn/10",
        tone === "info" && "border-info/40 text-info bg-info/10"
      ),
      children
    }
  );
}
function ExecutionStageRow({
  stage,
  entry,
  lot,
  lotBelowMinimum,
  stop,
  target,
  rr,
  status
}) {
  return /* @__PURE__ */ jsxs("div", { className: "grid gap-2 rounded border border-bd/70 bg-bg2/40 px-2.5 py-2 text-[11px] font-mono sm:grid-cols-[2.25rem_1fr_.9fr_1fr_1fr_.65fr_auto] sm:items-center", children: [
    /* @__PURE__ */ jsx("div", { className: "font-semibold text-dim", children: stage }),
    /* @__PURE__ */ jsx(StageMetric, { label: "Entry", value: entry }),
    /* @__PURE__ */ jsx(StageMetric, { label: "Lot", value: lot, valueClass: lotBelowMinimum ? "text-warn" : "text-tx" }),
    /* @__PURE__ */ jsx(StageMetric, { label: "SL", value: stop, valueClass: "text-sell" }),
    /* @__PURE__ */ jsx(StageMetric, { label: "TP", value: target, valueClass: "text-buy" }),
    /* @__PURE__ */ jsx(StageMetric, { label: "RR", value: rr, valueClass: "text-info" }),
    /* @__PURE__ */ jsx(StageStatusBadge, { status })
  ] });
}
function StageMetric({
  label,
  value,
  valueClass
}) {
  return /* @__PURE__ */ jsxs("div", { className: "flex items-baseline justify-between gap-2 sm:block", children: [
    /* @__PURE__ */ jsx("span", { className: "text-[9px] uppercase tracking-wider text-mute sm:hidden", children: label }),
    /* @__PURE__ */ jsx("span", { className: cn("tabular-nums", valueClass ?? "text-tx"), children: value })
  ] });
}
function InlineMetric({
  label,
  value,
  sub,
  valueClass
}) {
  return /* @__PURE__ */ jsxs("div", { className: "flex items-baseline gap-1.5 font-mono", children: [
    /* @__PURE__ */ jsx("span", { className: "text-[10px] uppercase tracking-wider text-mute", children: label }),
    /* @__PURE__ */ jsx("span", { className: cn("font-semibold tabular-nums", valueClass ?? "text-tx"), children: value }),
    sub && /* @__PURE__ */ jsx("span", { className: "text-[10px] text-info", children: sub })
  ] });
}
function StageStatusBadge({ status }) {
  return /* @__PURE__ */ jsx(
    "span",
    {
      className: cn(
        "inline-flex w-fit items-center justify-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        status.tone === "ready" && "border-buy/40 bg-buy/10 text-buy",
        status.tone === "pending" && "border-info/40 bg-info/10 text-info",
        status.tone === "blocked" && "border-warn/40 bg-warn/10 text-warn",
        status.tone === "filled" && "border-buy/50 bg-buy/20 text-buy"
      ),
      children: status.label
    }
  );
}
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function getStageStatus({
  filled,
  lot,
  minLot,
  planState,
  planSource
}) {
  if (filled) {
    return { label: "Filled", tone: "filled" };
  }
  if (!isFiniteNumber(lot) || lot < minLot) {
    return { label: `Below min ${minLot.toFixed(2)}`, tone: "blocked" };
  }
  if (planState === "INVALID") {
    return { label: "Blocked", tone: "blocked" };
  }
  if (planSource === "pending-blueprint" || planSource === "watch-blueprint") {
    return { label: "Pending", tone: "pending" };
  }
  return { label: "Ready", tone: "ready" };
}
function formatLotSize(value, minExecutableLot) {
  if (!isFiniteNumber(value)) {
    return "--";
  }
  if (value <= 0) {
    return "--";
  }
  if (value < minExecutableLot) {
    return `${formatBelowMinimumLotValue(value)} lot`;
  }
  return `${value.toFixed(2)} lot`;
}
function formatBelowMinimumLotValue(value) {
  const raw = value.toString();
  if (!raw.includes("e")) {
    return raw;
  }
  return value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}
function formatOptionalPrice(value, symbol) {
  return isFiniteNumber(value) ? fmtPrice(value, symbol) : "--";
}
function formatOptionalRatio(value) {
  if (!isFiniteNumber(value)) return "1:--";
  return Number.isInteger(value) ? `1:${value}` : `1:${value.toFixed(2)}`;
}
const QUIRKY_LOADING_MESSAGES = [
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
  "Looking for clean entries..."
];
const ALL_LOADING_MESSAGES = [
  "Lighting candles...",
  "Calibrating Fibonacci wizardry...",
  "Scanning for liquidity voids...",
  "Checking backend readiness...",
  "Building your signal board...",
  "Waiting for backend confirmation...",
  ...QUIRKY_LOADING_MESSAGES
];
function nextRandomIndex(currentIndex, total) {
  if (total <= 1) return 0;
  let next = currentIndex;
  while (next === currentIndex) {
    next = Math.floor(Math.random() * total);
  }
  return next;
}
function PlanBoardSkeleton() {
  const [messageIndex, setMessageIndex] = useState(0);
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setMessageIndex((index) => nextRandomIndex(index, QUIRKY_LOADING_MESSAGES.length));
    }, 2200);
    return () => window.clearInterval(intervalId);
  }, []);
  const message = QUIRKY_LOADING_MESSAGES[messageIndex];
  return /* @__PURE__ */ jsxs("div", { className: "space-y-5", children: [
    /* @__PURE__ */ jsx(WalletOverviewSkeleton, {}),
    /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-accent/20 bg-accent/5 px-4 py-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx("span", { className: "inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse" }),
        /* @__PURE__ */ jsx("span", { className: "text-xs font-mono tracking-wide text-accent/80", children: "Readiness Status" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mt-1.5 space-y-0.5", children: [
        /* @__PURE__ */ jsxs("p", { className: "text-xs text-mute", children: [
          "Loading backend-confirmed plans",
          /* @__PURE__ */ jsx("span", { className: "loading-dots" })
        ] }),
        /* @__PURE__ */ jsx(
          "p",
          {
            className: "text-xs font-mono text-dim",
            style: { animation: "fade-in 0.35s ease-out" },
            children: message
          },
          message
        ),
        /* @__PURE__ */ jsx("p", { className: "text-xs font-mono text-warn/80", children: "Do not execute until confirmation arrives." })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold tracking-tight", children: "Signal Plans" }),
        /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-xs text-mute", children: "Syncing signal blueprints..." })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex items-center gap-2", children: [3, 5, 10].map((size) => /* @__PURE__ */ jsx(
        "div",
        {
          className: "rounded border border-bd px-2 py-1 text-xs font-mono text-mute opacity-40",
          children: size === 10 ? "all" : size
        },
        size
      )) })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "space-y-4", children: [0, 1, 2].map((index) => /* @__PURE__ */ jsx(PlanCardSkeleton, {}, index)) })
  ] });
}
function WalletOverviewSkeleton() {
  return /* @__PURE__ */ jsxs("section", { className: "space-y-2", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx("span", { className: "inline-block h-3 w-1 rounded-sm bg-accent" }),
        /* @__PURE__ */ jsx("h2", { className: "text-[11px] font-mono uppercase tracking-[0.18em] text-dim font-semibold", children: "Account" })
      ] }),
      /* @__PURE__ */ jsx(Skeleton, { className: "h-4 w-16 bg-bg3" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "overflow-hidden rounded-lg border border-bd bg-bg1/60", children: /* @__PURE__ */ jsx("div", { className: "grid grid-cols-2 divide-y divide-bd lg:grid-cols-4 lg:divide-x lg:divide-y-0 [&>*]:border-bd", children: ["EQUITY", "BALANCE", "FLOATING P/L", "MARGIN LEVEL"].map((label) => /* @__PURE__ */ jsxs("div", { className: "space-y-2 px-4 py-3 lg:px-5 lg:py-4", children: [
      /* @__PURE__ */ jsx("div", { className: "text-[10px] font-mono uppercase tracking-[0.16em] text-mute font-semibold", children: label }),
      /* @__PURE__ */ jsx(Skeleton, { className: "h-7 w-24 bg-bg3" }),
      /* @__PURE__ */ jsx(Skeleton, { className: "h-3 w-16 bg-bg3" })
    ] }, label)) }) })
  ] });
}
function PlanCardSkeleton() {
  return /* @__PURE__ */ jsxs("div", { className: "space-y-3 rounded-lg border border-bd bg-bg1/60 p-4", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsx(Skeleton, { className: "h-5 w-20 bg-bg3" }),
        /* @__PURE__ */ jsx(Skeleton, { className: "h-4 w-12 bg-bg3" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "rounded border border-bd px-2 py-0.5 text-[10px] font-mono text-mute animate-pulse", children: "Syncing..." })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "grid grid-cols-3 gap-3", children: ["ENTRY", "STOP LOSS", "TP1"].map((label) => /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
      /* @__PURE__ */ jsx("div", { className: "text-[10px] font-mono uppercase tracking-wider text-mute", children: label }),
      /* @__PURE__ */ jsx(Skeleton, { className: "h-5 w-full bg-bg3" })
    ] }, label)) }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
      /* @__PURE__ */ jsx("div", { className: "text-[10px] font-mono uppercase tracking-wider text-mute", children: "R:R" }),
      /* @__PURE__ */ jsx(Skeleton, { className: "h-3 w-full rounded-full bg-bg3" })
    ] })
  ] });
}
function TradingLoadingScreen({
  backendReady,
  onReady,
  minHoldMs = 3e3
}) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [holdElapsed, setHoldElapsed] = useState(false);
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setMessageIndex((index) => nextRandomIndex(index, ALL_LOADING_MESSAGES.length));
    }, 2500);
    return () => window.clearInterval(intervalId);
  }, []);
  useEffect(() => {
    const timeoutId = window.setTimeout(() => setHoldElapsed(true), minHoldMs);
    return () => window.clearTimeout(timeoutId);
  }, [minHoldMs]);
  useEffect(() => {
    if (backendReady && holdElapsed) {
      onReady();
    }
  }, [backendReady, holdElapsed, onReady]);
  return /* @__PURE__ */ jsxs("div", { className: "flex min-h-[60vh] select-none flex-col items-center justify-center gap-8", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-4", children: [
      /* @__PURE__ */ jsx(BrandPulseLogo, { size: "lg", animated: true }),
      /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
        /* @__PURE__ */ jsx("div", { className: "text-base font-semibold tracking-tight text-tx", children: "SMC SuperFIB" }),
        /* @__PURE__ */ jsx("div", { className: "mt-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-mute", children: "Signal Intelligence Platform" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "h-0.5 w-48 overflow-hidden rounded-full bg-bd", children: /* @__PURE__ */ jsx(
      "div",
      {
        className: "h-full rounded-full bg-accent",
        style: { animation: "loading-sweep 3s ease-in-out infinite" }
      }
    ) }),
    /* @__PURE__ */ jsx(
      "div",
      {
        className: "text-xs font-mono tracking-wide text-mute",
        style: { animation: "fade-in 0.4s ease-out" },
        children: ALL_LOADING_MESSAGES[messageIndex]
      },
      messageIndex
    )
  ] });
}
function rankCandidates(candidates) {
  return [...candidates].sort((a, b) => a.originalIndex - b.originalIndex);
}
function PlanPage() {
  const [boardSize, setBoardSize] = useState(3);
  const [phase1Done, setPhase1Done] = useState(false);
  const handlePhase1Ready = useCallback(() => setPhase1Done(true), []);
  const { data: liveSignals, isLoading: signalsLoading } = useDisplaySignals(boardSize);
  const signals = liveSignals?.signals;
  const totalActiveSignals = liveSignals?.meta?.totalActive ?? signals?.length ?? 0;
  const {
    data: ladders,
    isLoading: laddersLoading,
    isError: laddersIsError,
    error: laddersError
  } = useLadders();
  const { data: snapshot } = useSnapshot();
  const {
    backendReady,
    pendingSettingsLoad,
    missingBackendUrl,
    settingsLoadFailed,
    settingsLoadError,
    retrySettingsLoad
  } = usePollingUiState();
  const { watchlist, watchlistSet } = useCanonicalWatchlist();
  const uniqueSignals = signals ? deduplicateById(signals) : [];
  const laddersBySignalId = new Map((ladders ?? []).map((ladder) => [ladder.signalId, ladder]));
  const candidatePool = uniqueSignals.map((signal, originalIndex) => {
    const candidatePlan = laddersBySignalId.get(signal.id) ?? null;
    return {
      signal,
      plan: candidatePlan,
      hasPlan: candidatePlan !== null,
      planComplete: Boolean(candidatePlan && isTradePlanComplete(candidatePlan)),
      originalIndex
    };
  });
  const watchlistCandidates = candidatePool.filter(
    ({ signal }) => watchlistSet.has(normalizeSymbolForWatchlistComparison(signal.symbol))
  );
  const rankedWatchlistCandidates = rankCandidates(watchlistCandidates);
  const needsGlobalFallback = rankedWatchlistCandidates.length === 0;
  const { data: globalSignalsData, isLoading: globalSignalsLoading } = useDisplaySignals(
    boardSize,
    needsGlobalFallback ? "global" : void 0
  );
  const globalSignals = needsGlobalFallback ? globalSignalsData?.signals ?? [] : [];
  const uniqueGlobalSignals = deduplicateById(globalSignals);
  const globalCandidatePool = uniqueGlobalSignals.map(
    (signal, originalIndex) => {
      const candidatePlan = laddersBySignalId.get(signal.id) ?? null;
      return {
        signal: { ...signal, backendConfirmed: false },
        plan: candidatePlan,
        hasPlan: candidatePlan !== null,
        planComplete: false,
        originalIndex
      };
    }
  );
  const rankedGlobalCandidates = rankCandidates(globalCandidatePool);
  const topCandidates = rankedWatchlistCandidates.length > 0 ? rankedWatchlistCandidates.slice(0, boardSize) : [];
  const isUsingGlobalFallback = rankedWatchlistCandidates.length === 0 && rankedGlobalCandidates.length > 0;
  const divergentCount = topCandidates.filter(
    ({ signal }) => signal.computedBy === "frontend" && !signal.backendConfirmed
  ).length;
  const firstWatchlistCandidate = rankedWatchlistCandidates[0];
  const { data: settings } = useUserSettings();
  const staleThreshold = settings?.staleThresholdSec ?? 60;
  const getFreshnessState = () => {
    if (divergentCount > 0) return "pending-sync";
    if (!snapshot) return "unavailable";
    const hasNonLivePrice = snapshot.prices.some((p) => p.state !== "live");
    if (hasNonLivePrice) return "pending-sync";
    const mostRecentPrice = snapshot.prices.reduce((latest, p) => {
      const pTime = new Date(p.updatedAt).getTime();
      return pTime > latest ? pTime : latest;
    }, 0);
    const ageSec = mostRecentPrice > 0 ? (Date.now() - mostRecentPrice) / 1e3 : Infinity;
    if (ageSec > staleThreshold) return "pending-sync";
    return "live";
  };
  if (settingsLoadFailed) {
    return /* @__PURE__ */ jsx(
      SettingsQueryErrorState,
      {
        resourceLabel: "signal plans",
        errorDetail: settingsLoadError,
        onRetry: retrySettingsLoad
      }
    );
  }
  if (missingBackendUrl) {
    return /* @__PURE__ */ jsx("div", { className: "text-mute text-sm", children: "Configure a backend URL in Account before loading signal plans." });
  }
  if (!phase1Done) {
    return /* @__PURE__ */ jsx(TradingLoadingScreen, { backendReady, onReady: handlePhase1Ready });
  }
  if (pendingSettingsLoad || signalsLoading || laddersLoading || needsGlobalFallback && globalSignalsLoading) {
    return /* @__PURE__ */ jsx(PlanBoardSkeleton, {});
  }
  if (topCandidates.length === 0 && !isUsingGlobalFallback) {
    const watchlistCandidateIds = watchlistCandidates.map(({ signal }) => signal.id);
    ladders?.map((ladder) => ladder.signalId) ?? [];
    const matchedWatchlistBlueprintCount = watchlistCandidateIds.filter(
      (signalId) => laddersBySignalId.has(signalId)
    ).length;
    const diagnostics = {
      signalCount: uniqueSignals.length,
      watchlistCount: watchlist.length,
      watchlistCandidateCount: watchlistCandidates.length,
      blueprintCount: ladders?.length ?? 0,
      matchedWatchlistBlueprintCount
    };
    return /* @__PURE__ */ jsxs("div", { className: "space-y-5", children: [
      /* @__PURE__ */ jsx(WalletOverview, {}),
      laddersIsError && /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-warn/30 bg-warn/5 p-3 text-sm", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-warn", children: [
          /* @__PURE__ */ jsx(AlertTriangle, { className: "mt-0.5 h-4 w-4 shrink-0" }),
          /* @__PURE__ */ jsx("div", { children: "/ladders: backend response missing ladder array" })
        ] }),
        laddersError instanceof Error && /* @__PURE__ */ jsx("div", { className: "text-xs text-mute mt-2", children: laddersError.message })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-3 text-sm", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-mute", children: [
          /* @__PURE__ */ jsx(AlertTriangle, { className: "h-4 w-4 text-warn shrink-0" }),
          watchlist.length === 0 ? "No watchlist symbols configured for signal plans." : firstWatchlistCandidate ? "No matching blueprint for current watchlist candidates." : "No active watchlist candidates found."
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "text-xs text-dim bg-bg1/40 rounded px-3 py-2 max-w-xl space-y-1", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            "Signals loaded: ",
            diagnostics.signalCount
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            "Watchlist symbols: ",
            diagnostics.watchlistCount
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            "Watchlist candidates: ",
            diagnostics.watchlistCandidateCount
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            "Found ",
            diagnostics.blueprintCount,
            " total blueprints"
          ] }),
          diagnostics.blueprintCount === 0 && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 text-warn", children: [
            /* @__PURE__ */ jsx(Search, { className: "h-3.5 w-3.5 shrink-0" }),
            "Ladders endpoint returned no data - check backend connectivity"
          ] }),
          diagnostics.blueprintCount > 0 && diagnostics.watchlistCandidateCount > 0 && diagnostics.matchedWatchlistBlueprintCount === 0 && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 text-warn", children: [
            /* @__PURE__ */ jsx(Search, { className: "h-3.5 w-3.5 shrink-0" }),
            "No ladder signal IDs match current watchlist candidates"
          ] })
        ] }),
        watchlistCandidates.length > 0 && /* @__PURE__ */ jsxs("div", { className: "space-y-1.5 max-w-xl", children: [
          /* @__PURE__ */ jsx("div", { className: "text-xs font-medium text-mute uppercase tracking-wide", children: "Candidate gate status" }),
          watchlistCandidates.map(({ signal }) => {
            const blocker = signal.engineBlocker ?? "UNKNOWN";
            const isReady = signal.status === "READY";
            const isBlocked = !isReady || blocker !== "OK";
            return /* @__PURE__ */ jsxs(
              "div",
              {
                className: "text-xs bg-bg1/40 rounded px-3 py-2 flex items-start gap-2",
                children: [
                  /* @__PURE__ */ jsx(
                    AlertTriangle,
                    {
                      className: `h-3.5 w-3.5 mt-0.5 shrink-0 ${isBlocked ? "text-warn" : "text-ok"}`
                    }
                  ),
                  /* @__PURE__ */ jsxs("div", { className: "space-y-0.5 min-w-0", children: [
                    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [
                      /* @__PURE__ */ jsx("span", { className: "font-mono text-info", children: signal.symbol }),
                      /* @__PURE__ */ jsx("span", { className: "text-mute", children: signal.direction }),
                      /* @__PURE__ */ jsx(
                        "span",
                        {
                          className: `font-mono font-semibold ${isReady ? "text-ok" : "text-warn"}`,
                          children: signal.status
                        }
                      ),
                      signal.backendConfirmed && /* @__PURE__ */ jsx("span", { className: "text-ok", children: "backend-confirmed" })
                    ] }),
                    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 flex-wrap text-dim", children: [
                      /* @__PURE__ */ jsx("span", { children: "blocker:" }),
                      /* @__PURE__ */ jsx("span", { className: `font-mono ${blocker === "OK" ? "text-ok" : "text-warn"}`, children: blocker }),
                      /* @__PURE__ */ jsx("span", { className: "text-dim/50", children: "·" }),
                      /* @__PURE__ */ jsx("span", { className: "font-mono truncate max-w-[18ch]", children: signal.id })
                    ] }),
                    signal.engine && /* @__PURE__ */ jsxs("div", { className: "text-dim flex gap-2 flex-wrap", children: [
                      /* @__PURE__ */ jsxs("span", { children: [
                        "htf: ",
                        signal.engine.htfBias
                      ] }),
                      /* @__PURE__ */ jsx("span", { children: "·" }),
                      /* @__PURE__ */ jsxs("span", { children: [
                        "pd: ",
                        signal.engine.pdState
                      ] })
                    ] })
                  ] })
                ]
              },
              signal.id
            );
          })
        ] })
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: "space-y-5", children: [
    /* @__PURE__ */ jsx(WalletOverview, {}),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold tracking-tight", children: "Signal Plans" }),
        isUsingGlobalFallback ? /* @__PURE__ */ jsx("p", { className: "text-xs text-warn mt-0.5", children: "No watchlist candidates — showing global board fallback (display only, no execution)" }) : /* @__PURE__ */ jsxs("p", { className: "text-xs text-mute mt-0.5", children: [
          "Showing ",
          topCandidates.length,
          " of ",
          totalActiveSignals,
          " backend-arbited active signal",
          totalActiveSignals === 1 ? "" : "s"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 flex-wrap justify-end", children: [
        totalActiveSignals > boardSize && /* @__PURE__ */ jsxs("span", { className: "text-xs text-mute", children: [
          "Showing ",
          boardSize,
          " of ",
          totalActiveSignals
        ] }),
        [3, 5, 10].map((size) => /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => setBoardSize(size),
            className: `rounded border px-2 py-1 text-xs font-mono ${boardSize === size ? "border-info text-info bg-info/10" : "border-bd text-mute"}`,
            children: size === 10 ? "all" : size
          },
          size
        )),
        /* @__PURE__ */ jsx(FreshnessBadge, { state: getFreshnessState() })
      ] })
    ] }),
    divergentCount > 0 && /* @__PURE__ */ jsxs(DivergenceBanner, { children: [
      divergentCount,
      " candidate",
      divergentCount > 1 ? "s are" : " is",
      " frontend computed and waiting on backend confirmation. Do not execute until the backend confirms the blueprint."
    ] }),
    /* @__PURE__ */ jsx("div", { className: "space-y-4", children: (isUsingGlobalFallback ? rankedGlobalCandidates.slice(0, boardSize) : topCandidates).map(
      (candidate) => /* @__PURE__ */ jsx(
        PlanCandidateCard,
        {
          signal: candidate.signal,
          plan: candidate.plan,
          price: snapshot?.prices.find((entry) => entry.symbol === candidate.signal.symbol),
          planComplete: candidate.planComplete
        },
        candidate.signal.id
      )
    ) })
  ] });
}
const SplitComponent = PlanPage;
export {
  SplitComponent as component
};
