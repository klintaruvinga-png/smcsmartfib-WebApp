import type { Symbol } from "../types/index.js";

/** Format a price to the correct decimal precision for the given symbol. */
export function fmtPrice(value: number, symbol?: Symbol | string): string {
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

/** Format a percentage value, with optional sign prefix. */
export function fmtPct(value: number, signed = true): string {
  const s = value.toFixed(2);
  if (signed && value > 0) return `+${s}%`;
  return `${s}%`;
}

/**
 * Format a monetary value with the correct symbol/prefix for the given
 * account currency string (as streamed by the EA via AccountTelemetry).
 *
 * Supported:
 *   "USD" | "USC" → $ prefix  (USC is the micro-account internal label)
 *   "EUR"         → € prefix
 *   "GBP"         → £ prefix
 *   "JPY"         → ¥ prefix, no decimal places
 *   anything else → currency code prefix (e.g. "CHF 1.23")
 *
 * Falls back to "$" when currency is absent / empty.
 */
export function fmtCurrency(value: number, currency?: string | null, signed = false): string {
  const sign = signed && value > 0 ? "+" : "";
  const cur = (currency ?? "").toUpperCase();

  if (!cur || cur === "USD") {
    return `${sign}$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (cur === "USC") {
    return `${sign}USC ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (cur === "EUR") {
    return `${sign}€${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (cur === "GBP") {
    return `${sign}£${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (cur === "JPY") {
    return `${sign}¥${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  // Generic: prefix with ISO code
  return `${sign}${cur} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format a USC (US Cents / Dollars) amount. Backward-compat wrapper — prefer fmtCurrency. */
export function fmtUSC(value: number, signed = false): string {
  return fmtCurrency(value, "USC", signed);
}

/** Format a ZAR (South African Rand) amount. */
export function fmtZAR(value: number): string {
  return `R${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** Format an ISO timestamp as a human-readable relative time string. */
export function relTime(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "unknown";
  const diff = Date.now() - ts;
  if (diff <= 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Determine the pip decimal precision for a symbol. */
export function pipDecimals(symbol: Symbol | string): number {
  if (!symbol) return 5;
  if (symbol === "XAUUSD") return 2;
  if (symbol === "XAGUSD") return 3;
  if (symbol.endsWith("JPY")) return 3;
  if (symbol === "XRPUSD") return 4;
  if (["BTCUSD", "ETHUSD", "BNBUSD", "SOLUSD", "US30", "NAS100"].includes(symbol)) return 2;
  return 5;
}

/** Return the tick size (minimum price increment) for a symbol. */
export function tickSize(symbol: Symbol | string): number {
  return Math.pow(10, -pipDecimals(symbol));
}
