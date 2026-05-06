/**
 * SMC SuperFIB API client.
 * One typed function per /wp-json/sniper/v1/* endpoint.
 * In MOCK_MODE every function returns the typed mock model with state: 'mock'.
 */

import { getAuthHeader, clearCredentials } from "@/lib/auth";

export class AuthError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthError";
  }
}

import type {
  AccountState,
  ChartSnapshot,
  DashboardSettings,
  EngineHealth,
  GateState,
  PairPrice,
  PendingOrder,
  Position,
  RegimeState,
  RiskProfile,
  SignalCandidate,
  Symbol,
  SymbolDiagnostic,
  TwelveDataKeyStatus,
  TradePlan,
} from "@/types/sniper";

import {
  mockAccount,
  mockEngineHealth,
  mockGates,
  mockOrders,
  mockPlan,
  mockPositions,
  mockPrices,
  mockRegimes,
  mockRiskProfile,
  mockSettings,
  mockFibLevels,
  mockPriceSeries,
  mockSignals,
} from "@/mocks/sniperData";

const DEFAULT_BACKEND_URL =
  import.meta.env.VITE_SNIPER_BACKEND_URL ?? "https://trader.stokvelsociety.co.za/wp-json";

// Default to LIVE backend. Only use mock data when explicitly opted in via
// VITE_SNIPER_MOCK_MODE=true. Previously this defaulted to mock in dev, which
// made the UI look frozen because every poll returned the same static objects.
export const MOCK_MODE =
  String(import.meta.env.VITE_SNIPER_MOCK_MODE ?? "false").toLowerCase() === "true";

let backendUrl = DEFAULT_BACKEND_URL;
export function setBackendUrl(url: string) {
  backendUrl = url || DEFAULT_BACKEND_URL;
}
export function getBackendUrl() {
  return backendUrl;
}

interface RequestOpts {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  skipAuthHeaders?: boolean;
  /** When false, omit cookies/credentials from the fetch (e.g. public endpoints). Defaults to include. */
  authenticated?: boolean;
  /** Allow successful responses with no payload body (e.g. known 204 endpoints). */
  allowEmptyResponse?: boolean;
}

async function call<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body) headers["Content-Type"] = "application/json";

  if (!opts.skipAuthHeaders) {
    const authHeader = getAuthHeader();
    if (authHeader) {
      headers["Authorization"] = authHeader;
    } else {
      // Fall back to nonce when served directly from WordPress (window.SNIPER injected)
      const win =
        typeof window !== "undefined"
          ? (window as unknown as { SNIPER?: { nonce?: string } })
          : undefined;
      if (win?.SNIPER?.nonce) headers["X-WP-Nonce"] = win.SNIPER.nonce;
    }
  }

  const url = `${backendUrl.replace(/\/$/, "")}/sniper/v1${path}`;

  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      credentials: opts.authenticated === false ? "omit" : "include",
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    if (res.status === 401) {
      clearCredentials();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("smc:auth-required"));
      }
      throw new AuthError();
    }

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`API ${path} failed: ${res.status}${errorBody ? ` - ${errorBody}` : ""}`);
    }

    // Only allow empty successful bodies for known no-content endpoints.
    if (res.status === 204) {
      if (opts.allowEmptyResponse) return {} as T;
      throw new Error(`API ${path} failed: expected response body but got 204 No Content`);
    }

    const text = await res.text();
    if (!text.trim()) {
      if (opts.allowEmptyResponse) return {} as T;
      throw new Error(`API ${path} failed: expected response body but got empty 2xx response`);
    }

    return JSON.parse(text) as T;
  } catch (error) {
    // CRITICAL: Never swallow errors. Log and rethrow so consumers can handle properly.
    if (error instanceof AuthError) throw error;
    if (error instanceof Error) throw error;
    throw new Error(`API ${path} failed: ${String(error)}`);
  }
}

// ──────────────── Public / shared ────────────────
export const apiClient = {
  async getSnapshot(mock = MOCK_MODE) {
    if (mock) {
      const wl = new Set(mockSettings.watchlist);
      return {
        prices: mockPrices.filter((p) => wl.has(p.symbol)),
        regimes: mockRegimes.filter((r) => wl.has(r.symbol)),
        gates: mockGates.filter((g) => wl.has(g.symbol)),
        diagnostics: [] as SymbolDiagnostic[],
      };
    }
    return call<{
      prices: PairPrice[];
      regimes: RegimeState[];
      gates: GateState[];
      diagnostics: SymbolDiagnostic[];
    }>("/snapshot");
  },
  async getChartSnapshot(
    symbol: Symbol,
    timeframe = "15min",
    mock = MOCK_MODE,
  ): Promise<ChartSnapshot> {
    if (mock) {
      const candles = mockPriceSeries(symbol).map((p) => ({
        time: new Date(p.t).toISOString(),
        open: p.p,
        high: p.p,
        low: p.p,
        close: p.p,
      }));
      return {
        symbol,
        timeframe,
        candles,
        fibLevels: mockFibLevels(symbol).map((f) => ({
          family: "LTF_SF" as const,
          ratio: f.ratio,
          label: f.label,
          price: f.price,
          role: f.role,
        })),
        updatedAt: new Date().toISOString(),
        state: "mock",
      };
    }
    return call<ChartSnapshot>(
      `/charts?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
    );
  },
  async getLiveSignals(mock = MOCK_MODE): Promise<SignalCandidate[]> {
    if (mock) {
      const wl = new Set(mockSettings.watchlist);
      return mockSignals.filter((s) => wl.has(s.symbol));
    }
    return call<SignalCandidate[]>("/live-signals");
  },
  async getLadders(symbol?: Symbol, mock = MOCK_MODE): Promise<TradePlan[]> {
    if (mock) return [mockPlan];
    return call<TradePlan[]>(`/ladders${symbol ? `?symbol=${symbol}` : ""}`);
  },
  async getSession(mock = MOCK_MODE) {
    if (mock)
      return { name: "London-AM", openUtc: "07:00", closeUtc: "11:00", state: "mock" as const };
    return call<{ name: string; openUtc: string; closeUtc: string; state: string }>("/session", {
      skipAuthHeaders: true,
      authenticated: false,
    });
  },
  async getEngineHealth(mock = MOCK_MODE): Promise<EngineHealth> {
    if (mock) return mockEngineHealth;
    return call<EngineHealth>("/health");
  },

  // Authenticated user
  async getUserTrades(
    mock = MOCK_MODE,
  ): Promise<{ positions: Position[]; orders: PendingOrder[] }> {
    if (mock) return { positions: mockPositions, orders: mockOrders };
    return call("/user/trades");
  },
  async getUserAccount(mock = MOCK_MODE): Promise<AccountState> {
    if (mock) return mockAccount;
    return call("/user/account");
  },
  async postUserAccount(payload: Partial<AccountState>, mock = MOCK_MODE): Promise<{ ok: true }> {
    if (mock) return { ok: true };
    return call("/user/account", { method: "POST", body: payload });
  },
  async getUserSettings(mock = MOCK_MODE): Promise<DashboardSettings> {
    if (mock) return mockSettings;
    return call("/user/settings");
  },
  async postUserSettings(
    payload: Partial<DashboardSettings>,
    mock = MOCK_MODE,
  ): Promise<{ ok: true }> {
    if (mock) return { ok: true };
    return call("/user/settings", { method: "POST", body: payload });
  },
  async postTwelveDataKey(
    payload: { apiKey: string; testOnly?: boolean },
    mock = MOCK_MODE,
  ): Promise<{ ok: boolean; status: TwelveDataKeyStatus; message?: string }> {
    if (mock) return { ok: Boolean(payload.apiKey), status: payload.apiKey ? "ok" : "missing" };
    return call("/user/twelve-data-key", { method: "POST", body: payload });
  },
  async deleteTwelveDataKey(mock = MOCK_MODE): Promise<{ ok: true; status: TwelveDataKeyStatus }> {
    if (mock) return { ok: true, status: "missing" };
    return call("/user/twelve-data-key", { method: "DELETE", allowEmptyResponse: true });
  },
  async getUserRiskProfile(mock = MOCK_MODE): Promise<RiskProfile> {
    if (mock) return mockRiskProfile;
    return call("/user/risk-profile");
  },
  async postUserRiskProfile(
    payload: Partial<RiskProfile>,
    mock = MOCK_MODE,
  ): Promise<{ ok: true }> {
    if (mock) return { ok: true };
    return call("/user/risk-profile", { method: "POST", body: payload });
  },
  async postExecuteSignals(
    payload: { signalIds: string[] },
    mock = MOCK_MODE,
  ): Promise<{ ok: true; queued: number }> {
    if (mock) return { ok: true, queued: payload.signalIds.length };
    return call("/user/execute-signals", { method: "POST", body: payload });
  },

  /** Force a backend market-data refresh + engine run for the given symbols (or full watchlist). */
  async postEngineBatch(
    symbols?: Symbol[],
    mock = MOCK_MODE,
  ): Promise<{ ok: boolean; diagnostics: SymbolDiagnostic[] }> {
    if (mock) return { ok: true, diagnostics: [] };
    return call("/user/engine-batch", { method: "POST", body: symbols ? { symbols } : {} });
  },

  // Dedicated watchlist endpoints — changes persist immediately without a full settings save.
  async postWatchlistAdd(
    symbol: string,
    mock = MOCK_MODE,
  ): Promise<{ ok: boolean; watchlist: Symbol[] }> {
    if (mock) {
      const sym = symbol as Symbol;
      if (!mockSettings.watchlist.includes(sym)) {
        mockSettings.watchlist = [...mockSettings.watchlist, sym];
      }
      return { ok: true, watchlist: mockSettings.watchlist };
    }
    return call("/user/watchlist/add", { method: "POST", body: { symbol } });
  },
  async postWatchlistRemove(
    symbol: string,
    mock = MOCK_MODE,
  ): Promise<{ ok: boolean; watchlist: Symbol[] }> {
    if (mock) {
      mockSettings.watchlist = mockSettings.watchlist.filter((s) => s !== symbol);
      return { ok: true, watchlist: mockSettings.watchlist };
    }
    return call("/user/watchlist/remove", { method: "POST", body: { symbol } });
  },
};
