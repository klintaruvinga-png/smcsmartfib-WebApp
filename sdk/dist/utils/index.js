function c(n, t) {
  return t ? t === "XAUUSD" ? n.toFixed(2) : t === "XAGUSD" || t.endsWith("JPY") ? n.toFixed(3) : t === "XRPUSD" ? n.toFixed(4) : t === "BTCUSD" || t === "ETHUSD" || t === "BNBUSD" || t === "SOLUSD" || t === "US30" || t === "NAS100" ? n.toFixed(2) : n.toFixed(5) : n.toFixed(5);
}
function a(n, t = !0) {
  const e = n.toFixed(2);
  return t && n > 0 ? `+${e}%` : `${e}%`;
}
function s(n, t = !1) {
  return `${t && n > 0 ? "+" : ""}$${n.toLocaleString(void 0, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}
function d(n) {
  return `R${n.toLocaleString(void 0, { maximumFractionDigits: 0 })}`;
}
function l(n) {
  if (!n) return "unknown";
  const t = new Date(n).getTime();
  if (!Number.isFinite(t)) return "unknown";
  const e = Date.now() - t;
  if (e <= 0) return "just now";
  const i = Math.floor(e / 1e3);
  if (i < 60) return `${i}s ago`;
  const r = Math.floor(i / 60);
  if (r < 60) return `${r}m ago`;
  const u = Math.floor(r / 60);
  return u < 24 ? `${u}h ago` : `${Math.floor(u / 24)}d ago`;
}
function f(n) {
  return n ? n === "XAUUSD" ? 2 : n === "XAGUSD" || n.endsWith("JPY") ? 3 : n === "XRPUSD" ? 4 : ["BTCUSD", "ETHUSD", "BNBUSD", "SOLUSD", "US30", "NAS100"].includes(n) ? 2 : 5 : 5;
}
function S(n) {
  return Math.pow(10, -f(n));
}
function D(n) {
  return n === "live";
}
function E(n) {
  return n === "stale";
}
function U(n) {
  return n === "unavailable" || n === "offline";
}
function A(n) {
  return n === "blocked";
}
function I(n) {
  return n === "mock";
}
function g(n) {
  return n === "pending-sync";
}
function T(n) {
  return n === "live" || n === "stale" || n === "mock";
}
function L(n) {
  return {
    live: "Live",
    stale: "Stale",
    unavailable: "Unavailable",
    blocked: "Blocked",
    offline: "Offline",
    "pending-sync": "Syncing",
    mock: "Mock"
  }[n] ?? n;
}
function M(n) {
  switch (n) {
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
function N(n) {
  return n.status === "READY" && n.backendConfirmed;
}
function _(n) {
  return n !== void 0 && n !== "OK";
}
function h(n) {
  return {
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
    OK: "OK"
  }[n] ?? n;
}
const R = [
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
function C(n) {
  return n < 0 ? "premium-extension" : n > 100 ? "discount-extension" : n < 50 ? "premium" : n === 50 ? "equilibrium" : "discount";
}
function F(n) {
  return `${n}%`;
}
function b(n, t, e) {
  const i = n - t;
  return n - e / 100 * i;
}
function k(n, t) {
  if (!t.length) return null;
  let e = t[0], i = Math.abs(n - e.price);
  for (let r = 1; r < t.length; r++) {
    const u = Math.abs(n - t[r].price);
    u < i && (i = u, e = t[r]);
  }
  return e;
}
function m(n, t, e) {
  return t.filter((i) => Math.abs(i.price - n) <= e);
}
function p(n, t) {
  const e = t.find((o) => o.ratio === 50), i = t.find((o) => o.ratio === 0), r = t.find((o) => o.ratio === 100);
  if (!e || !i || !r) return null;
  const u = Math.abs(i.price - r.price) * 0.03;
  return Math.abs(n - e.price) <= u ? "EQUILIBRIUM" : n > i.price ? "EXTENDED_PREMIUM" : n < r.price ? "EXTENDED_DISCOUNT" : n > e.price ? "PREMIUM" : "DISCOUNT";
}
export {
  R as FIB_RATIOS,
  h as blockerLabel,
  F as fibLabel,
  m as fibLevelsNear,
  b as fibPriceAtRatio,
  C as fibRole,
  a as fmtPct,
  c as fmtPrice,
  s as fmtUSC,
  d as fmtZAR,
  M as freshnessColor,
  L as freshnessLabel,
  A as isBlocked,
  _ as isEngineBlocked,
  D as isLive,
  I as isMock,
  g as isPendingSync,
  N as isSignalActionable,
  E as isStale,
  U as isUnavailable,
  T as isUsable,
  k as nearestFibLevel,
  p as pdZone,
  f as pipDecimals,
  l as relTime,
  S as tickSize
};
//# sourceMappingURL=index.js.map
