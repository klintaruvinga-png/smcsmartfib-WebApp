import type { Symbol } from "@/types/sniper";

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

  if (!cur || cur === "USD" || cur === "USC") {
    return `${sign}$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

/** Thin backward-compat wrapper — callers that already know the account
 *  currency is USC/USD can continue using fmtUSC without change. */
export function fmtUSC(value: number, signed = false): string {
  return fmtCurrency(value, "USD", signed);
}

export function fmtZAR(value: number): string {
  return `R${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function fmtLocalCurrency(
  value: number | null | undefined,
  currencyCode?: string | null,
  locale?: string,
): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return "--";
  const resolvedLocale =
    locale ?? (typeof navigator !== "undefined" ? navigator.language : "en-ZA");

  return new Intl.NumberFormat(resolvedLocale, {
    style: "currency",
    currency: currencyCode || "ZAR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return "unknown";
  const diff = Date.now() - timestamp;
  if (diff <= 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
