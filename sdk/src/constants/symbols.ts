import type { KnownSymbol } from "../types/index.js";

/** All forex pairs supported by the engine. */
export const FOREX_PAIRS: KnownSymbol[] = [
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
  "CADCHF",
];

/** Precious metals. */
export const METALS: KnownSymbol[] = ["XAUUSD", "XAGUSD"];

/** Equity indices. */
export const INDICES: KnownSymbol[] = ["US30", "NAS100"];

/** Crypto assets. */
export const CRYPTO: KnownSymbol[] = ["BTCUSD", "ETHUSD", "XRPUSD", "BNBUSD", "SOLUSD"];

/** All known symbols across all asset classes. */
export const ALL_KNOWN_SYMBOLS: KnownSymbol[] = [
  ...FOREX_PAIRS,
  ...METALS,
  ...INDICES,
  ...CRYPTO,
];

/** Default watchlist used in the dashboard UI and mocks. */
export const DEFAULT_WATCHLIST: KnownSymbol[] = [
  "GBPUSD",
  "AUDUSD",
  "EURUSD",
  "NZDUSD",
  "USDJPY",
  "AUDJPY",
  "EURJPY",
  "XAUUSD",
];

/** True if a string is a known symbol. */
export function isKnownSymbol(value: string): value is KnownSymbol {
  return (ALL_KNOWN_SYMBOLS as string[]).includes(value);
}

/** True if a symbol is a JPY pair (affects decimal precision). */
export function isJpyPair(symbol: string): boolean {
  return symbol.endsWith("JPY");
}

/** True if a symbol is a crypto asset. */
export function isCrypto(symbol: string): boolean {
  return (CRYPTO as string[]).includes(symbol);
}

/** True if a symbol is a precious metal. */
export function isMetal(symbol: string): boolean {
  return (METALS as string[]).includes(symbol);
}
