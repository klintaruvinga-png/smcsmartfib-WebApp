/**
 * SMC-06.1 journal API client.
 * Talks to the Nitro backend /api/journal + /api/risk endpoints.
 * Mirrors sniperClient conventions: typed fns, Basic auth header from @/lib/auth,
 * base URL from VITE_SMC_BACKEND_URL (falls back to localhost dev).
 */
import { getAuthHeader } from "@/lib/auth";

const JOURNAL_BACKEND_URL =
  (import.meta.env.VITE_SMC_BACKEND_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:3000";

export type TradeDirection = "long" | "short";
export type TradeStatus = "open" | "closed" | "cancelled";

export interface Trade {
  id: number;
  userId: string;
  symbol: string;
  direction: TradeDirection;
  entryPrice: string;
  exitPrice: string | null;
  lotSize: string;
  pnl: string | null;
  status: TradeStatus;
  openedAt: string;
  closedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface RiskLimits {
  userId: string;
  dailyLossLimit: string;
  maxOpenPositions: string;
  maxPositionSize: string;
  maxPerSymbolExposure: string;
  updatedAt: string;
}

export interface RiskEvaluation {
  allowed: boolean;
  reasons: string[];
  configured: boolean;
  context: {
    openPositions: number;
    todaysPnl: number;
    projectedDailyPnl: number;
    symbolExposure: number;
  } | null;
}

async function journalFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = getAuthHeader();
  const res = await fetch(`${JOURNAL_BACKEND_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Journal API ${res.status}: ${body.slice(0, 200)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const journalClient = {
  listTrades(status?: TradeStatus): Promise<Trade[]> {
    const q = status ? `?status=${status}` : "";
    return journalFetch<Trade[]>(`/api/journal${q}`);
  },
  addTrade(input: {
    symbol: string;
    direction: TradeDirection;
    entryPrice: number;
    exitPrice?: number;
    lotSize: number;
    pnl?: number;
    notes?: string;
  }): Promise<Trade> {
    return journalFetch<Trade>("/api/journal", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  updateTrade(
    id: number,
    patch: Partial<{
      symbol: string;
      direction: TradeDirection;
      entryPrice: number;
      exitPrice: number;
      lotSize: number;
      pnl: number;
      status: TradeStatus;
      notes: string;
    }>
  ): Promise<Trade> {
    return journalFetch<Trade>(`/api/journal/${id}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    });
  },
  deleteTrade(id: number): Promise<{ deleted: boolean }> {
    return journalFetch<{ deleted: boolean }>(`/api/journal/${id}`, {
      method: "DELETE",
    });
  },
  getRiskLimits(): Promise<RiskLimits | null> {
    return journalFetch<RiskLimits | null>("/api/risk");
  },
  setRiskLimits(input: {
    dailyLossLimit?: number;
    maxOpenPositions?: number;
    maxPositionSize?: number;
    maxPerSymbolExposure?: number;
  }): Promise<RiskLimits> {
    return journalFetch<RiskLimits>("/api/risk", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  evaluateTrade(input: {
    symbol: string;
    direction: TradeDirection;
    lotSize: number;
    estimatedRisk?: number;
  }): Promise<RiskEvaluation> {
    return journalFetch<RiskEvaluation>("/api/risk/evaluate", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};
