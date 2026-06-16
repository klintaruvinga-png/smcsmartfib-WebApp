import { AuthError, ApiError, NetworkError } from "./errors.js";
import { encodeBasicCredentials } from "../auth/index.js";
import type {
  AccountState,
  AccountTelemetry,
  ChartSnapshot,
  DashboardSettings,
  EngineHealth,
  GateState,
  MarketSnapshot,
  PairPrice,
  PendingOrder,
  Position,
  RegimeState,
  RiskProfile,
  SessionInfo,
  SignalCandidate,
  LiveSignalsResponse,
  SoakCheckpointRow,
  SoakEvidencePayload,
  SoakEvidenceRow,
  SoakReport,
  Symbol,
  SymbolDiagnostic,
  TradePlan,
  TwelveDataKeyStatus,
  UserProgress,
} from "../types/index.js";

// ─── Config ───────────────────────────────────────────────────────────────────

export interface SniperClientConfig {
  /** WordPress REST root, e.g. https://trader.example.com/wp-json */
  baseUrl: string;
  /**
   * When true, every method must be called on a MockSniperClient instead.
   * Set on the config for informational use; the base client never returns mocks.
   */
  mock?: boolean;
  /** WordPress application-password credentials for Basic auth. */
  username?: string;
  appPassword?: string;
  /** WordPress REST nonce injected server-side (alternative to Basic auth). */
  nonce?: string;
  /** Called when the server returns 401. Use to redirect to login. */
  onAuthRequired?: () => void;
}

// ─── Raw wire formats ─────────────────────────────────────────────────────────

interface RawAccountTelemetry {
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
}

interface RawPosition {
  position_id: string;
  symbol: string;
  direction: Position["direction"];
  entry_price: number;
  current_price: number;
  volume: number;
  profit: number;
  opened_at: string | null;
  freshness: Position["state"];
}

interface RawOrder {
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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toFinite(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function normalizeAccountTelemetry(r: RawAccountTelemetry): AccountTelemetry {
  return {
    accountId: r.account_id ?? "",
    terminalId: r.terminal_id ?? "",
    balance: toFinite(r.balance),
    equity: toFinite(r.equity),
    margin: toFinite(r.margin),
    freeMargin: toFinite(r.free_margin),
    marginLevel: toFinite(r.margin_level),
    floatingPl: toFinite(r.floating_pl),
    currency: r.currency ?? "",
    leverage: toFinite(r.leverage),
    eaVersion: r.ea_version ?? "",
    lastSeenAt: r.last_seen_at ?? null,
    updatedAt: r.updated_at ?? null,
    state: r.freshness ?? "unavailable",
  };
}

function normalizePosition(r: RawPosition): Position {
  const pnlUSC = toFinite(r.profit);
  const entry = toFinite(r.entry_price);
  const current = toFinite(r.current_price, entry);
  const volume = toFinite(r.volume);
  const notional = Math.abs(entry * volume);
  return {
    id: r.position_id,
    symbol: r.symbol as Symbol,
    direction: r.direction,
    entry,
    current,
    lots: volume,
    pnlUSC,
    pnlPct: notional > 0 ? (pnlUSC / notional) * 100 : 0,
    openedAt: r.opened_at ?? new Date(0).toISOString(),
    state: r.freshness ?? "unavailable",
  };
}

function normalizeOrder(r: RawOrder): PendingOrder {
  const rawType = String(r.order_type ?? "").toUpperCase();
  return {
    id: r.order_id,
    symbol: r.symbol as Symbol,
    direction: r.direction,
    type: rawType.includes("STOP") ? "STOP" : "LIMIT",
    price: toFinite(r.entry_price),
    lots: toFinite(r.volume),
    sl: toFinite(r.sl),
    tp: toFinite(r.tp),
    placedAt: r.placed_at ?? new Date(0).toISOString(),
    state: r.freshness ?? "unavailable",
  };
}

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

  throw new ApiError("/live-signals", 200, "backend response missing signals array");
}

function normalizeSnapshot(raw: {
  prices: PairPrice[];
  regimes: RegimeState[];
  gates: GateState[];
  diagnostics: SymbolDiagnostic[];
}): MarketSnapshot {
  return {
    prices: (raw.prices ?? []).map((p) => ({
      ...p,
      bid: toFinite(p.bid),
      ask: toFinite(p.ask),
      mid: toFinite(p.mid),
      changePct1d: toFinite(p.changePct1d),
      age_sec: p.age_sec === undefined ? undefined : toFinite(p.age_sec),
      // BACKEND INTERNAL: preserve aggregation metadata for compatibility; do not render or use for UI logic.
      sourceDetail: typeof p.sourceDetail === 'string' ? p.sourceDetail : undefined,
      feed_key: typeof p.feed_key === 'string' ? p.feed_key : undefined,
      source_count: p.source_count === undefined ? undefined : (() => {
        const converted = Number(p.source_count);
        return Number.isFinite(converted) ? converted : undefined;
      })(),
    })),
    regimes: (raw.regimes ?? []).map((r) => ({
      ...r,
      chop: toFinite(r.chop),
      nearestFib: r.nearestFib == null ? null : toFinite(r.nearestFib),
    })),
    gates: raw.gates ?? [],
    diagnostics: raw.diagnostics ?? [],
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class SniperClient {
  protected baseUrl: string;
  readonly mock: boolean;
  private authHeader: string | null = null;
  private nonce: string | null = null;
  private onAuthRequired?: () => void;

  constructor(config: SniperClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "").replace(/\/wp-json$/, "");
    this.mock = config.mock ?? false;
    this.nonce = config.nonce ?? null;
    this.onAuthRequired = config.onAuthRequired;

    if (config.username && config.appPassword) {
      this.setCredentials(config.username, config.appPassword);
    }
  }

  /** Update Basic auth credentials at runtime (e.g. after login). */
  setCredentials(username: string, appPassword: string): void {
    this.authHeader = `Basic ${encodeBasicCredentials(username, appPassword)}`;
  }

  clearCredentials(): void {
    this.authHeader = null;
  }

  /** Override the WP nonce (useful when the page refreshes its nonce). */
  setNonce(nonce: string): void {
    this.nonce = nonce;
  }

  private buildHeaders(body?: unknown): Record<string, string> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.authHeader) {
      headers["Authorization"] = this.authHeader;
    } else if (this.nonce) {
      headers["X-WP-Nonce"] = this.nonce;
    }
    return headers;
  }

  protected async request<T>(
    path: string,
    opts: {
      method?: "GET" | "POST" | "DELETE";
      body?: unknown;
      authenticated?: boolean;
      allowEmptyResponse?: boolean;
      cacheBust?: boolean;
    } = {},
  ): Promise<T> {
    const headers = this.buildHeaders(opts.body);
    let url = `${this.baseUrl}/wp-json/sniper/v1${path}`;

    if ((opts.method ?? "GET") === "GET" && opts.cacheBust) {
      url += `${url.includes("?") ? "&" : "?"}_=${Date.now()}`;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method ?? "GET",
        headers,
        cache: opts.cacheBust ? "no-store" : "default",
        credentials: opts.authenticated === false ? "omit" : "include",
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (err) {
      throw new NetworkError(path, err instanceof Error ? err : undefined);
    }

    if (res.status === 401) {
      this.clearCredentials();
      this.onAuthRequired?.();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("smc:auth-required"));
      }
      throw new AuthError();
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => undefined);
      throw new ApiError(path, res.status, detail);
    }

    if (res.status === 204) {
      if (opts.allowEmptyResponse) return {} as T;
      throw new ApiError(path, 204, "expected response body but got 204 No Content");
    }

    const text = await res.text();
    if (!text.trim()) {
      if (opts.allowEmptyResponse) return {} as T;
      throw new ApiError(path, res.status, "expected response body but got empty response");
    }

    return JSON.parse(text) as T;
  }

  // ─── Market data ───────────────────────────────────────────────────────────

  async getSnapshot(): Promise<MarketSnapshot> {
    const raw = await this.request<{
      prices: PairPrice[];
      regimes: RegimeState[];
      gates: GateState[];
      diagnostics: SymbolDiagnostic[];
    }>("/snapshot", { cacheBust: true });
    return normalizeSnapshot(raw);
  }

  async getChartSnapshot(symbol: Symbol, timeframe = "15min"): Promise<ChartSnapshot> {
    return this.request(
      `/charts?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
    );
  }

  async getLiveSignals(boardSize?: 3 | 5 | 10): Promise<SignalCandidate[]> {
    const response = await this.getDisplaySignals(boardSize);
    return response.signals;
  }

  async getDisplaySignals(boardSize?: 3 | 5 | 10): Promise<LiveSignalsResponse> {
    const path = boardSize ? `/live-signals?board_size=${boardSize}` : "/live-signals";
    const raw = await this.request<LiveSignalsResponse | SignalCandidate[]>(path);
    return normalizeLiveSignalsEnvelope(raw);
  }

  async getLadders(symbol?: Symbol): Promise<TradePlan[]> {
    return this.request(`/ladders${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ""}`);
  }

  async getSession(): Promise<SessionInfo> {
    return this.request("/session", { authenticated: false });
  }

  async getEngineHealth(): Promise<EngineHealth> {
    return this.request("/health");
  }

  async getAdminHealth(): Promise<EngineHealth> {
    return this.request("/admin/health", { cacheBust: true });
  }

  // ─── Account ───────────────────────────────────────────────────────────────

  async getAccountTelemetry(): Promise<AccountTelemetry> {
    const raw = await this.request<RawAccountTelemetry>("/account-telemetry", {
      cacheBust: true,
    });
    return normalizeAccountTelemetry(raw);
  }

  async getUserAccount(): Promise<AccountState> {
    return this.request("/user/account");
  }

  async postUserAccount(payload: Partial<AccountState>): Promise<{ ok: true }> {
    return this.request("/user/account", { method: "POST", body: payload });
  }

  // ─── Settings ──────────────────────────────────────────────────────────────

  async getUserSettings(): Promise<DashboardSettings> {
    return this.request("/user/settings");
  }

  async postUserSettings(payload: Partial<DashboardSettings>): Promise<{ ok: true }> {
    return this.request("/user/settings", { method: "POST", body: payload });
  }

  // ─── API key ───────────────────────────────────────────────────────────────

  async postTwelveDataKey(payload: {
    apiKey: string;
    testOnly?: boolean;
  }): Promise<{ ok: boolean; status: TwelveDataKeyStatus; message?: string }> {
    return this.request("/user/twelve-data-key", { method: "POST", body: payload });
  }

  async deleteTwelveDataKey(): Promise<{ ok: true; status: TwelveDataKeyStatus }> {
    return this.request("/user/twelve-data-key", {
      method: "DELETE",
      allowEmptyResponse: true,
    });
  }

  // ─── Risk profile ──────────────────────────────────────────────────────────

  async getUserRiskProfile(): Promise<RiskProfile> {
    return this.request("/user/risk-profile");
  }

  async postUserRiskProfile(payload: Partial<RiskProfile>): Promise<{ ok: true }> {
    return this.request("/user/risk-profile", { method: "POST", body: payload });
  }

  // ─── Progress ──────────────────────────────────────────────────────────────

  async getUserProgress(): Promise<UserProgress> {
    return this.request("/user/progress", { cacheBust: true });
  }

  // ─── Positions & orders ────────────────────────────────────────────────────

  async getPositions(): Promise<Position[]> {
    const raw = await this.request<RawPosition[]>("/positions", { cacheBust: true });
    return (raw ?? []).map(normalizePosition);
  }

  async getOrders(): Promise<PendingOrder[]> {
    const raw = await this.request<RawOrder[]>("/orders", { cacheBust: true });
    return (raw ?? []).map(normalizeOrder);
  }

  // ─── Execution ─────────────────────────────────────────────────────────────

  async postExecuteSignals(payload: {
    signalIds: string[];
  }): Promise<{ ok: true; queued: number }> {
    return this.request("/user/execute-signals", { method: "POST", body: payload });
  }

  // ─── Engine ────────────────────────────────────────────────────────────────

  async postEngineBatch(
    symbols?: Symbol[],
  ): Promise<{ ok: boolean; diagnostics: SymbolDiagnostic[] }> {
    return this.request("/user/engine-batch", {
      method: "POST",
      body: symbols ? { symbols } : {},
    });
  }

  // ─── Watchlist ─────────────────────────────────────────────────────────────

  async postWatchlistAdd(symbol: string): Promise<{ ok: boolean; watchlist: Symbol[] }> {
    return this.request("/user/watchlist/add", { method: "POST", body: { symbol } });
  }

  async postWatchlistRemove(symbol: string): Promise<{ ok: boolean; watchlist: Symbol[] }> {
    return this.request("/user/watchlist/remove", { method: "POST", body: { symbol } });
  }

  // ─── Soak testing ──────────────────────────────────────────────────────────

  async getSoakReport(): Promise<SoakReport> {
    return this.request("/admin/soak-report", { cacheBust: true });
  }

  async upsertSoakEvidence(payload: SoakEvidencePayload): Promise<SoakEvidenceRow> {
    return this.request("/admin/soak-evidence", { method: "POST", body: payload });
  }

  async createSoakCheckpoint(opts?: {
    operatorNotes?: string;
    checkpointType?: "baseline" | "checkpoint";
  }): Promise<SoakCheckpointRow> {
    return this.request("/admin/soak-checkpoint", {
      method: "POST",
      body: {
        operator_notes: opts?.operatorNotes ?? "",
        checkpoint_type: opts?.checkpointType ?? "checkpoint",
      },
    });
  }
}
