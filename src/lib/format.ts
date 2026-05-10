import type { Symbol } from "@/types/sniper";

export function fmtPrice(value: number, symbol?: Symbol | string): string {
  if (!symbol) return value.toFixed(5);
  if (symbol === "XAUUSD") return value.toFixed(2);
  if (symbol === "XAGUSD") return value.toFixed(3);
  if (symbol.endsWith("JPY")) return value.toFixed(3);
  if (symbol === "XRPUSD") return value.toFixed(4);
  if (symbol === "BTCUSD" || symbol === "ETHUSD" || symbol === "BNBUSD" || symbol === "SOLUSD") return value.toFixed(2);
  if (symbol === "US30" || symbol === "NAS100") return value.toFixed(2);
  return value.toFixed(5);
}

export function fmtPct(value: number, signed = true): string {
  const s = value.toFixed(2);
  if (signed && value > 0) return `+${s}%`;
  return `${s}%`;
}

export function fmtUSC(value: number, signed = false): string {
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtZAR(value: number): string {
  return `R${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
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
