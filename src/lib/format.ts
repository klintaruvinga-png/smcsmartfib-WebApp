import type { Symbol } from "@/types/sniper";

export function fmtPrice(value: number, symbol?: Symbol): string {
  if (symbol === "XAUUSD") return value.toFixed(2);
  if (symbol && symbol.endsWith("JPY")) return value.toFixed(3);
  if (symbol === "US30" || symbol === "NAS100") return value.toFixed(1);
  if (symbol === "BTCUSD") return value.toFixed(2);
  if (symbol === "ETHUSD") return value.toFixed(2);
  return value.toFixed(5);
}

export function fmtPct(value: number, signed = true): string {
  const s = value.toFixed(2);
  if (signed && value > 0) return `+${s}%`;
  return `${s}%`;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  ZAR: "R",
  AUD: "A$",
  CAD: "C$",
  CHF: "Fr",
  JPY: "¥",
  NZD: "NZ$",
};

/**
 * Format a monetary value in any ISO 4217 currency.
 * Falls back to the 3-letter code prefix for unknown currencies.
 */
export function fmtCurrency(
  value: number,
  currencyCode = "USD",
  opts: { signed?: boolean; decimals?: number } = {},
): string {
  const { signed = false, decimals = 2 } = opts;
  const sign = signed && value > 0 ? "+" : "";
  const sym = CURRENCY_SYMBOLS[currencyCode.toUpperCase()] ?? `${currencyCode} `;
  return `${sign}${sym}${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
