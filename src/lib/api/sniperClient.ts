/**
 * SMC SuperFIB API client.
 * One typed function per /wp-json/sniper/v1/* endpoint.
 * In MOCK_MODE every function returns the typed mock model with state: 'mock'.
 */

import { getAuthHeader, clearCredentials, getWordPressNonce } from "@/lib/auth";
import { assertValidSoakEvidencePayload } from "./soakEvidence";

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
  UserProgressState,
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
  mockUserProgress,
} from "@/mocks/sniperData";

const DEFAULT_BACKEND_URL =
  import.meta.env.VITE_SNIPER_BACKEND_URL ?? "https://trader.stokvelsociety.co.za/wp-json";

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

type RawAccountTelemetryResponse = {
  account_id: string;
  terminal_id: string;
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  margin_level: number;
  floating_pl: number;
  currency: string;
  leverage: number;
  ea_version: string;
  last_seen_at: string | null;
  updated_at: string | null;
  freshness: AccountTelemetry["state"];
};

type RawPositionResponse = {
  position_id: string;
  symbol: string;
  direction: Position["direction"];
  entry_price: number;
  current_price: number;
  volume: number;
  profit: number;
  opened_at: string | null;
  freshness: Position["state"];
};

type RawOrderResponse = {
  order_id: string;
  symbol: string;
  direction: PendingOrder["direction"];
  order_type: string;
  entry_price: number;
  volume: number;
  sl: number;
  tp: number;
  placed_at: string | null;
  freshness: PendingOrder["state"];
};

type RawUserProgressResponse = {
  equity_pulse?: {
    equity_usc?: number;
    today_pnl_usc?: number;
    state?: string;
  };
  streak?: {
    current_streak_days?: number;
    last_active_date?: string | null;
    state?: string;
  };
  milestones?: {
    first_heartbeat?: boolean;
    first_market_stream?: boolean;
    first_trade_telemetry?: boolean;
    state?: string;
  };
  generated_at?: string;
};

function normalizeLiveSignalsResponse(
  raw: LiveSignalsResponse | SignalCandidate[],
): SignalCandidate[] {
  return normalizeLiveSignalsEnvelope(raw).signals;
}

function normalizeLiveSignalsEnvelope(
  raw: LiveSignalsResponse | SignalCandidate[],
): LiveSignalsResponse {
  if (Array.isArray(raw)) {
    return { signals: raw, polledAt: new Date().toISOString() };
  }
  if (raw && Array.isArray(raw.signals)) return raw;

  throw new Error("/live-signals: backend response missing signals array");
}

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

function normalizeAccountTelemetry(response: RawAccountTelemetryResponse): AccountTelemetry {
  return {
    accountId: response.account_id ?? "",
    terminalId: response.terminal_id ?? "",
    balance: toFiniteNumber(response.balance),
    equity: toFiniteNumber(response.equity),
    margin: toFiniteNumber(response.margin),
    freeMargin: toFiniteNumber(response.free_margin),
    marginLevel: toFiniteNumber(response.margin_level),
    floatingPl: toFiniteNumber(response.floating_pl),
    currency: response.currency ?? "",
    leverage: toFiniteNumber(response.leverage, Number(response.leverage)),
    eaVersion: response.ea_version ?? "",
    lastSeenAt: response.last_seen_at ?? null,
    updatedAt: response.updated_at ?? null,
    state: response.freshness ?? "unavailable",
  };
}

function normalizeTelemetryPositions(rows: RawPositionResponse[]): Position[] {
  return (rows ?? []).map((row) => {
    const pnlUSC = toFiniteNumber(row.profit);
    const entry = toFiniteNumber(row.entry_price);
    const current = toFiniteNumber(row.current_price, entry);
    const volume = toFiniteNumber(row.volume);
    const notional = Math.abs(entry * volume);
    return {
      id: row.position_id,
      symbol: row.symbol as Symbol,
      direction: row.direction,
      entry,
      current,
      lots: volume,
      pnlUSC,
      pnlPct: notional > 0 ? (pnlUSC / notional) * 100 : 0,
      openedAt: row.opened_at ?? new Date(0).toISOString(),
      state: row.freshness ?? "unavailable",
    };
  });
}

function normalizeTelemetryOrders(rows: RawOrderResponse[]): PendingOrder[] {
  return (rows ?? []).map((row) => {
    const rawType = String(row.order_type ?? "").toUpperCase();
    const type: PendingOrder["type"] = rawType.includes("STOP") ? "STOP" : "LIMIT";
    return {
      id: row.order_id,
      symbol: row.symbol as Symbol,
      direction: row.direction,
      type,
      price: toFiniteNumber(row.entry_price),
      lots: toFiniteNumber(row.volume),
      sl: toFiniteNumber(row.sl),
      tp: toFiniteNumber(row.tp),
      placedAt: row.placed_at ?? new Date(0).toISOString(),
      state: row.freshness ?? "unavailable",
    };
  });
}

function normalizeUserProgressState(value: unknown): UserProgressState {
  return value === "LIVE" || value === "STALE" || value === "UNAVAILABLE" ? value : "UNAVAILABLE";
}

function normalizeUserProgress(response: RawUserProgressResponse): UserProgress {
  return {
    equityPulse: {
      equityUSC: toFiniteNumber(response.equity_pulse?.equity_usc),
      todayPnlUSC: toFiniteNumber(response.equity_pulse?.today_pnl_usc),
      state: normalizeUserProgressState(response.equity_pulse?.state),
    },
    streak: {
      currentStreakDays: toFiniteNumber(response.streak?.current_streak_days),
      lastActiveDate: response.streak?.last_active_date ?? null,
      state: normalizeUserProgressState(response.streak?.state),
    },
    milestones: {
      firstHeartbeat: Boolean(response.milestones?.first_heartbeat),
      firstMarketStream: Boolean(response.milestones?.first_market_stream),
      firstTradeTelemetry: Boolean(response.milestones?.first_trade_telemetry),
      state: normalizeUserProgressState(response.milestones?.state),
    },
    generatedAt: response.generated_at ?? new Date(0).toISOString(),
  };
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeSnapshot(snapshot: {
  prices: PairPrice[];
  regimes: RegimeState[];
  gates: GateState[];
  diagnostics: SymbolDiagnostic[];
}): {
  prices: PairPrice[];
  regimes: RegimeState[];
  gates: GateState[];
  diagnostics: SymbolDiagnostic[];
} {
  return {
    ...snapshot,
    prices: (snapshot.prices ?? []).map((price) => ({
      ...price,
      bid: toFiniteNumber(price.bid),
      ask: toFiniteNumber(price.ask),
      mid: toFiniteNumber(price.mid),
      changePct1d: toFiniteNumber(price.changePct1d),
      age_sec:
        price.age_sec === undefined
          ? undefined
          : toFiniteNumber(price.age_sec, Number(price.age_sec)),
      sourceDetail: typeof price.sourceDetail === 'string' ? price.sourceDetail : undefined,
      feed_key: typeof price.feed_key === 'string' ? price.feed_key : undefined,
      source_count:
        price.source_count === undefined
          ? undefined
          : (() => {
              const converted = Number(price.source_count);
              return Number.isFinite(converted) ? converted : undefined;
            })(),
    })),
    regimes: (snapshot.regimes ?? []).map((regime) => ({
      ...regime,
      chop: toFiniteNumber(regime.chop),
      anchorChop: regime.anchorChop ?? null,
      sfPosition:
        regime.sfPosition === null || regime.sfPosition === undefined
          ? null
          : toFiniteNumber(regime.sfPosition, Number(regime.sfPosition)),
      afPosition:
        regime.afPosition === null || regime.afPosition === undefined
          ? null
          : toFiniteNumber(regime.afPosition, Number(regime.afPosition)),
      nearestFib:
        regime.nearestFib === null || regime.nearestFib === undefined
          ? null
          : toFiniteNumber(regime.nearestFib, Number(regime.nearestFib)),
    })),
    gates: snapshot.gates ?? [],
    diagnostics: snapshot.diagnostics ?? [],
  };
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
    scope?: 'watchlist' | 'global',
  ): Promise<LiveSignalsResponse> {
    if (mock) {
      const wl = new Set(mockSettings.watchlist);
      const signals = scope === 'global'
        ? mockSignals.slice(0, boardSize ?? 3)
        : mockSignals.filter((s) => wl.has(s.symbol)).slice(0, boardSize ?? 3);
      return { signals, polledAt: new Date().toISOString(), meta: { boardSize: boardSize ?? 3, totalActive: signals.length } };
    }
    const params = new URLSearchParams();
    if (boardSize) params.set('board_size', String(boardSize));
    if (scope === 'global') params.set('scope', 'global');
    const qs = params.toString();
    const path = qs ? `/live-signals?${qs}` : '/live-signals';
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
