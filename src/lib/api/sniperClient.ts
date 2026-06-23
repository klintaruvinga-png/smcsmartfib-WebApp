/**
 * SMC SuperFIB API client.
 * One typed function per /wp-json/sniper/v1/* endpoint.
 * In MOCK_MODE every function returns the typed mock model with state: 'mock'.
 */

import { getAuthHeader, clearCredentials, getWordPressNonce } from "@/lib/auth";
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
} from "@/types/sniper";
import type {
  RawAccountTelemetryResponse,
  RawOrderResponse,
  RawPositionResponse,
  RawUserProgressResponse,
} from "../../../packages/contracts/src/normalizers";

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

const WORDPRESS_BACKEND_URL = "https://trader.stokvelsociety.co.za/wp-json";

export function resolveDefaultBackendUrl(
  buildVal: string | null | undefined,
  runtimeOrigin?: string,
): string {
  const normalizedBuildVal = normalizeBackendUrl(buildVal);
  if (normalizedBuildVal) return normalizedBuildVal;

  if (runtimeOrigin) {
    try {
      const { hostname, origin } = new URL(runtimeOrigin);
      if (hostname === "trader.stokvelsociety.co.za") {
        return `${origin}/wp-json`;
      }
    } catch {
      // Fall through to the canonical WordPress REST host.
    }
  }

  return WORDPRESS_BACKEND_URL;
}

const DEFAULT_BACKEND_URL = resolveDefaultBackendUrl(
  import.meta.env.VITE_SNIPER_BACKEND_URL,
  typeof window !== "undefined" ? window.location.origin : undefined,
);

// Default to LIVE backend. Only use mock data when explicitly opted in via
// VITE_SNIPER_MOCK_MODE=true. Previously this defaulted to mock in dev, which
// made the UI look frozen because every poll returned the same static objects.
export const MOCK_MODE =
  String(import.meta.env.VITE_SNIPER_MOCK_MODE ?? "false").toLowerCase() === "true";

let backendUrl = DEFAULT_BACKEND_URL;
export function normalizeBackendUrl(url: string | null | undefined): string {
  return typeof url === "string" ? url.trim() : "";
}
export function setBackendUrl(url: string | null | undefined) {
  backendUrl = normalizeBackendUrl(url) || DEFAULT_BACKEND_URL;
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
  /** Add a cache-busting query param and bypass browser cache for time-sensitive GETs. */
  cacheBust?: boolean;
}

export type AdminHealthResponse = EngineHealth;

function requireLaddersResponse(raw: unknown): TradePlan[] {
  if (Array.isArray(raw)) return raw as TradePlan[];

  throw new Error("/ladders: backend response missing ladder array");
}

function requireWatchlistResponse(path: string, watchlist: Symbol[] | undefined): Symbol[] {
  if (!Array.isArray(watchlist)) {
    const message = `${path}: backend response missing watchlist array`;
    console.error(message);
    throw new Error(message);
  }

  return watchlist;
}

async function call<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body) headers["Content-Type"] = "application/json";

  if (!opts.skipAuthHeaders) {
    const authHeader = getAuthHeader();
    if (authHeader) {
      headers["Authorization"] = authHeader;
    } else {
      // Fall back to the WordPress REST nonce when served from WordPress.
      const nonce = getWordPressNonce();
      if (nonce) headers["X-WP-Nonce"] = nonce;
    }
  }

  let url = `${backendUrl.replace(/\/$/, "")}/sniper/v1${path}`;
  if ((opts.method ?? "GET") === "GET" && opts.cacheBust) {
    url += `${url.includes("?") ? "&" : "?"}_=${Date.now()}`;
  }

  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      cache: opts.cacheBust ? "no-store" : "default",
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

export async function fetchAdminHealth(): Promise<AdminHealthResponse> {
  return call<AdminHealthResponse>("/admin/health", { cacheBust: true });
}

export async function fetchSoakReport(): Promise<SoakReport> {
  return call<SoakReport>("/admin/soak-report", { cacheBust: true });
}

export async function upsertSoakEvidence(payload: SoakEvidencePayload): Promise<SoakEvidenceRow> {
  assertValidSoakEvidencePayload(payload);

  return call<SoakEvidenceRow>("/admin/soak-evidence", {
    method: "POST",
    body: payload,
  });
}

export async function createSoakCheckpoint(opts?: {
  operatorNotes?: string;
  checkpointType?: "baseline" | "checkpoint";
}): Promise<SoakCheckpointRow> {
  return call<SoakCheckpointRow>("/admin/soak-checkpoint", {
    method: "POST",
    body: {
      operator_notes: opts?.operatorNotes ?? "",
      checkpoint_type: opts?.checkpointType ?? "checkpoint",
    },
  });
}

export async function resetSoak(): Promise<{
  reset: boolean;
  deleted_checkpoints: number;
  deleted_evidence: number;
}> {
  return call("/admin/soak-reset", { method: "DELETE" });
}

// Public / shared
export const apiClient = {
  async getUnifiedSnapshot(mock = MOCK_MODE) {
    if (mock) {
      const wl = new Set(mockSettings.watchlist);
      return {
        prices: mockPrices.filter((p) => wl.has(p.symbol)),
        regimes: mockRegimes.filter((r) => wl.has(r.symbol)),
        gates: mockGates.filter((g) => wl.has(g.symbol)),
        diagnostics: [] as SymbolDiagnostic[],
      };
    }
    const snapshot = await call<{
      prices: PairPrice[];
      regimes: RegimeState[];
      gates: GateState[];
      diagnostics: SymbolDiagnostic[];
    }>("/snapshot/unified", { cacheBust: true });
    return normalizeSnapshot(snapshot);
  },
  /** Compatibility alias — delegates to getUnifiedSnapshot. */
  async getSnapshot(mock = MOCK_MODE) {
    return this.getUnifiedSnapshot(mock);
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
        scope === "global"
          ? mockSignals
          : mockSignals.filter((s) => wl.has(s.symbol));
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
  async postUserAccount(payload: Partial<AccountState>, mock = MOCK_MODE): Promise<{ ok: true }> {
    if (mock) return { ok: true };
    return call("/user/account", { method: "POST", body: payload });
  },
  async getUserSettings(mock = MOCK_MODE): Promise<DashboardSettings> {
    if (mock) return mockSettings;
    return call("/user/settings", { cacheBust: true });
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
    return call("/user/risk-profile", { cacheBust: true });
  },
  async getUserProgress(mock = MOCK_MODE): Promise<UserProgress> {
    if (mock) return mockUserProgress;
    return normalizeUserProgress(
      await call<RawUserProgressResponse>("/user/progress", { cacheBust: true }),
    );
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
      body: { symbol },
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
      body: { symbol },
    });
    return {
      ok: result.ok,
      watchlist: requireWatchlistResponse("/user/watchlist/remove", result.watchlist),
    };
  },
};
