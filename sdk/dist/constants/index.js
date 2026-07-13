const e = [
  "GBPUSD",
  "AUDUSD",
  "EURUSD",
  "NZDUSD",
  "USDJPY",
  "AUDJPY",
  "EURJPY",
  "GBPJPY",
  "NZDJPY",
  "CADJPY",
  "CHFJPY",
  "USDCAD",
  "USDCHF",
  "EURGBP",
  "EURAUD",
  "EURNZD",
  "EURCHF",
  "EURCAD",
  "GBPAUD",
  "GBPNZD",
  "GBPCAD",
  "GBPCHF",
  "AUDNZD",
  "AUDCAD",
  "AUDCHF",
  "NZDCAD",
  "NZDCHF",
  "CADCHF"
], t = ["XAUUSD", "XAGUSD"], D = ["US30", "NAS100"], c = ["BTCUSD", "ETHUSD", "XRPUSD", "BNBUSD", "SOLUSD"], r = [
  ...e,
  ...t,
  ...D,
  ...c
], S = [
  "GBPUSD",
  "AUDUSD",
  "EURUSD",
  "NZDUSD",
  "USDJPY",
  "AUDJPY",
  "EURJPY",
  "XAUUSD"
];
function s(n) {
  return r.includes(n);
}
function N(n) {
  return n.endsWith("JPY");
}
function u(n) {
  return c.includes(n);
}
function E(n) {
  return t.includes(n);
}
const U = {
  SYDNEY: {
    name: "Sydney",
    openHourUtc: 21,
    closeHourUtc: 6,
    openUtc: "21:00",
    closeUtc: "06:00"
  },
  TOKYO: {
    name: "Tokyo",
    openHourUtc: 0,
    closeHourUtc: 9,
    openUtc: "00:00",
    closeUtc: "09:00"
  },
  LONDON: {
    name: "London",
    openHourUtc: 7,
    closeHourUtc: 16,
    openUtc: "07:00",
    closeUtc: "16:00"
  },
  LONDON_AM: {
    name: "London-AM",
    openHourUtc: 7,
    closeHourUtc: 11,
    openUtc: "07:00",
    closeUtc: "11:00"
  },
  NEW_YORK: {
    name: "New York",
    openHourUtc: 12,
    closeHourUtc: 21,
    openUtc: "12:00",
    closeUtc: "21:00"
  },
  LONDON_NEW_YORK_OVERLAP: {
    name: "London-NY Overlap",
    openHourUtc: 12,
    closeHourUtc: 16,
    openUtc: "12:00",
    closeUtc: "16:00"
  }
};
function A(n) {
  const o = (n % 24 + 24) % 24;
  return o >= 12 && o < 16 ? U.LONDON_NEW_YORK_OVERLAP : o >= 7 && o < 11 ? U.LONDON_AM : o >= 11 && o < 16 ? U.LONDON : o >= 16 && o < 21 ? U.NEW_YORK : o >= 0 && o < 9 ? U.TOKYO : o >= 21 || o < 6 ? U.SYDNEY : null;
}
function O() {
  const n = (/* @__PURE__ */ new Date()).getUTCHours();
  return A(n)?.name ?? "Off-hours";
}
const R = "/wp-json/sniper/v1", C = "https://trader.stokvelsociety.co.za/wp-json", H = 2, P = 10, _ = {
  "A+": 3,
  A: 2,
  B: 1,
  C: 0
}, i = {
  WATCH: 0,
  ARMED: 1,
  READY: 2
};
export {
  r as ALL_KNOWN_SYMBOLS,
  R as API_NAMESPACE,
  c as CRYPTO,
  C as DEFAULT_BACKEND_URL,
  H as DEFAULT_REFRESH_INTERVAL_SEC,
  P as DEFAULT_STALE_THRESHOLD_SEC,
  S as DEFAULT_WATCHLIST,
  e as FOREX_PAIRS,
  D as INDICES,
  t as METALS,
  i as SIGNAL_STATUS_RANK,
  U as TRADING_SESSIONS,
  _ as VERDICT_RANK,
  A as activeSession,
  O as currentSessionName,
  u as isCrypto,
  N as isJpyPair,
  s as isKnownSymbol,
  E as isMetal
};
//# sourceMappingURL=index.js.map
