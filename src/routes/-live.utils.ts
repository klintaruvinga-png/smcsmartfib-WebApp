import type { PairPrice } from "@/types/sniper";

export function shouldRenderPendingCard(
  price: PairPrice | undefined | null,
  mockMode: boolean,
): boolean {
  if (!price) return true;
  if (mockMode) {
    return price.source !== "mock" && price.source !== "mt5";
  }
  // Preserve backend freshness truth for MT5-backed symbols. Only hide cards when
  // the backend has not produced an MT5 snapshot yet; stale/offline snapshots must
  // remain visible so the operator sees the actual state instead of a fake "awaiting" placeholder.
  return price.source !== "mt5";
}
