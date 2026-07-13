/**
 * SMC SuperFIB API client.
 * One typed function per /sniper/v1/* endpoint.
 * In MOCK_MODE every function returns the typed mock model with state: 'mock'.
 */

import { getAuthHeader, clearCredentials } from "@/lib/auth";
import { assertValidSoakEvidencePayload } from "./soakEvidence";
import {
  normalizeAccountTelemetry,
  normalizeLiveSignalsEnvelope,
  normalizeSnapshot,
  normalizeTelemetryOrders,
  normalizeTelemetryPositions,
  normalizeUserProgress,
} from "../../../packages/contracts/src/normalizers";

export class AuthError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthError";
  }
}

import type {
  AccountTelemetry,
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
  LiveSignalsResponse,
  SignalCandidate,
  Symbol,
  SymbolDiagnostic,
  SoakCheckpointRow,
  SoakEvidencePayload,
  SoakEvidenceRow,
  SoakReport,
  TwelveDataKeyStatus,
  TradePlan,
  UserProgress,
  UserSettingsPayload,
  RiskProfilePayload,
  UserAccountPayload,
  TwelveDataKeyPayload,
  ExecuteSignalsPayload,
  EngineBatchPayload,
  WatchlistChangePayload,
} from "@/types/sniper";
import type {
  RawAccountTelemetryResponse,
  RawOrderResponse,
  RawPositionResponse,
  RawUserProgressResponse,
} from "../../../packages/contracts/src/index";

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
  mockUserProgress,
} from "@/mocks/sniperData";
import type {
  DashboardSettings as SharedDashboardSettings,
} from "../../../packages/contracts/src/index";

export function resolveDefaultBackendUrl(
  buildVal: string | null | undefined,
): string {
  const normalized = normalizeBackendUrl(buildVal);
  if (normalized) return normalized;
  throw new Error("VITE_SNIPER_BACKEND_URL must be configured");
}

function normalizeBackendUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return null;
  }
}

const MOCK_MODE = import.meta.env.VITE_SNIPER_MOCK_MODE === "true";

type RequestOpts = {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  skipAuthHeaders?: boolean;
  authenticated?: boolean;
  cacheBust?: boolean;
  allowEmptyResponse?: boolean;
};

const backendUrl = resolveDefaultBackendUrl(
  import.meta.env.VITE_SNIPER_BACKEND_URL,
);

async function call<T>(
  path: string,
  opts: RequestOpts = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body) headers["Content-Type"] = "application/json";

  if (!opts.skipAuthHeaders) {
    const authHeader = getAuthHeader();
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }
  }

  const url = `${backendUrl.replace(/\/$/, "")}/sniper/v1${path}`;
  const cacheBust = opts.cacheBust ? `&_t=${Date.now()}` : "";
  const response = await fetch(`${url}${cacheBust}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "include",
  });

  if (response.status === 401) {
    clearCredentials();
    window.dispatchEvent(new CustomEvent("smc:auth-required"));
    throw new AuthError();
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  if (opts.allowEmptyResponse && response.status === 204) {
    return {} as T;
  }

  return response.json();
}

function requireLaddersResponse(raw: unknown): TradePlan[] {
  if (Array.isArray(raw)) return raw as TradePlan[];
  if (raw && typeof raw === "object" && "ladders" in raw) {
    return (raw as { ladders: TradePlan[] }).ladders;
  }
  throw new Error("Invalid ladders response");
}

function requireWatchlistResponse(endpoint: string, raw: Symbol[] | undefined): Symbol[] {
  if (!raw) throw new Error(`${endpoint} did not return watchlist`);
  return raw;
}

async function fetchAdminHealth(): Promise<AdminHealthResponse> {
  const url = `${backendUrl.replace(/\/$/, "")}/sniper/v1/admin/health`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Admin health check failed: ${response.status}`);
  return response.json();
}

export const apiClient = {
  // Public endpoints
  async getPrices(mock = MOCK_MODE): Promise<PairPrice[]> {
    if (mock) return mockPrices;
    return call<PairPrice[]>("/prices", { cacheBust: true });
  },
  async getRegimes(mock = MOCK_MODE): Promise<RegimeState> {
    if (mock) return mockRegimes;
    return call<RegimeState>("/regimes", { cacheBust: true });
  },
  async getGates(mock = MOCK_MODE): Promise<GateState> {
    if (mock) return mockGates;
    return call<GateState>("/gates", { cacheBust: true });
  },
  async getCharts(
    symbol: Symbol,
    timeframe: string,
    mock = MOCK_MODE,
  ): Promise<ChartSnapshot> {
    if (mock) {
      const candles = mockPriceSeries(symbol).map((p) => ({
        time: p.t,
        open: p.o,
        high: p.h,
        low: p.l,
        close: p.c,
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
      { cacheBust: true },
    );
  },
  async getLiveSignals(mock = MOCK_MODE, boardSize?: 3 | 5 | 10): Promise<SignalCandidate[]> {
    const response = await this.getDisplaySignals(mock, boardSize);
    return response.signals;
  },
  async getDisplaySignals(
    mock = MOCK_MODE,
    boardSize?: 3 | 5 | 10,
    scope?: "watchlist" | "global",
  ): Promise<LiveSignalsResponse> {
    if (mock) {
      const wl = new Set(mockSettings.watchlist);
      const allSignals =
        scope === "global" ? mockSignals : mockSignals.filter((s) => wl.has(s.symbol));
      const totalActive = allSignals.length;
      const signals = allSignals.slice(0, boardSize ?? 3);
      return {
        signals,
        polledAt: new Date().toISOString(),
        meta: { boardSize: boardSize ?? 3, totalActive },
      };
    }
    const params = new URLSearchParams();
    if (boardSize) params.set("board_size", String(boardSize));
    if (scope === "global") params.set("scope", "global");
    const qs = params.toString();
    const path = qs ? `/live-signals?${qs}` : "/live-signals";
    const raw = await call<LiveSignalsResponse | SignalCandidate[]>(path, {
      cacheBust: true,
    });
    return normalizeLiveSignalsEnvelope(raw);
  },
  async getLadders(symbol?: Symbol, mock = MOCK_MODE): Promise<TradePlan[]> {
    if (mock) return [mockPlan];
    const raw = await call<unknown>(`/ladders${symbol ? `?symbol=${symbol}` : ""}`, {
      cacheBust: true,
    });
    return requireLaddersResponse(raw);
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
    return call<EngineHealth>("/health", { cacheBust: true });
  },
  async getAdminHealth(): Promise<AdminHealthResponse> {
    return fetchAdminHealth();
  },
  async getAccountTelemetry(mock = MOCK_MODE): Promise<AccountTelemetry> {
    if (mock) {
      return {
        accountId: "mock-account",
        terminalId: "mock-terminal",
        balance: mockAccount.balanceUSC,
        equity: mockAccount.equityUSC,
        margin: (mockAccount.marginUsedPct / 100) * mockAccount.equityUSC,
        freeMargin:
          mockAccount.equityUSC - (mockAccount.marginUsedPct / 100) * mockAccount.equityUSC,
        marginLevel: mockAccount.marginUsedPct > 0 ? (100 / mockAccount.marginUsedPct) * 100 : 0,
        floatingPl: mockAccount.equityUSC - mockAccount.balanceUSC,
        currency: "USD",
        leverage: 0,
        eaVersion: "mock",
        lastSeenAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        state: mockAccount.state,
      };
    }
    return normalizeAccountTelemetry(
      await call<RawAccountTelemetryResponse>("/account-telemetry", { cacheBust: true }),
    );
  },

  // Authenticated user
  async getUserTrades(
    mock = MOCK_MODE,
  ): Promise<{ positions: Position[]; orders: PendingOrder[] }> {
    if (mock) return { positions: mockPositions, orders: mockOrders };
    const [positions, orders] = await Promise.all([
      call<RawPositionResponse[]>("/positions", { cacheBust: true }),
      call<RawOrderResponse[]>("/orders", { cacheBust: true }),
    ]);
    return {
      positions: normalizeTelemetryPositions(positions),
      orders: normalizeTelemetryOrders(orders),
    };
  },
  async getUserAccount(mock = MOCK_MODE): Promise<AccountState> {
    if (mock) return mockAccount;
    return call("/user/account", { cacheBust: true });
  },
  async postUserAccount(payload: UserAccountPayload, mock = MOCK_MODE): Promise<{ ok: true }> {
    if (mock) return { ok: true };
    return call("/user/account", { method: "POST", body: payload });
  },
  async getUserSettings(mock = MOCK_MODE): Promise<DashboardSettings> {
    if (mock) return mockSettings;
    return call("/user/settings", { cacheBust: true });
  },
  async postUserSettings(
    payload: UserSettingsPayload,
    mock = MOCK_MODE,
  ): Promise<{ ok: true }> {
    if (mock) return { ok: true };
    return call("/user/settings", { method: "POST", body: payload as SharedDashboardSettings });
  },
  async postTwelveDataKey(
    payload: TwelveDataKeyPayload,
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
    return call("/user/risk-profile", { cacheBust: true });
  },
  async getUserProgress(mock = MOCK_MODE): Promise<UserProgress> {
    if (mock) return mockUserProgress;
    return normalizeUserProgress(
      await call<RawUserProgressResponse>("/user/progress", { cacheBust: true }),
    );
  },
  async postUserRiskProfile(
    payload: RiskProfilePayload,
    mock = MOCK_MODE,
  ): Promise<{ ok: true }> {
    if (mock) return { ok: true };
    return call("/user/risk-profile", { method: "POST", body: payload });
  },
  async postExecuteSignals(
    payload: ExecuteSignalsPayload,
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

  // Dedicated watchlist endpoints - changes persist immediately without a full settings save.
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
    const result = await call<{ ok: boolean; watchlist?: Symbol[] }>("/user/watchlist/add", {
      method: "POST",
      body: { symbol } as WatchlistChangePayload,
    });
    return {
      ok: result.ok,
      watchlist: requireWatchlistResponse("/user/watchlist/add", result.watchlist),
    };
  },
  async postWatchlistRemove(
    symbol: string,
    mock = MOCK_MODE,
  ): Promise<{ ok: boolean; watchlist: Symbol[] }> {
    if (mock) {
      mockSettings.watchlist = mockSettings.watchlist.filter((s) => s !== symbol);
      return { ok: true, watchlist: mockSettings.watchlist };
    }
    const result = await call<{ ok: boolean; watchlist?: Symbol[] }>("/user/watchlist/remove", {
      method: "POST",
      body: { symbol } as WatchlistChangePayload,
    });
    return {
      ok: result.ok,
      watchlist: requireWatchlistResponse("/user/watchlist/remove", result.watchlist),
    };
  },
};

type AdminHealthResponse = {
  status: string;
  timestamp: string;
  backend: string;
  database?: string;
};
