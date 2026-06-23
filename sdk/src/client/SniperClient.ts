import { AuthError, ApiError, NetworkError } from "./errors.js";
import { encodeBasicCredentials } from "../auth/index.js";
import {
  normalizeAccountTelemetry,
  normalizeLiveSignalsEnvelope as normalizeSharedLiveSignalsEnvelope,
  normalizeSnapshot,
  normalizeTelemetryOrders,
  normalizeTelemetryPositions,
} from "../normalizers/index.js";
import type {
  AccountState,
  AccountTelemetry,
  ChartSnapshot,
  DashboardSettings,
  EngineHealth,
  LiveSignalsResponse,
  MarketSnapshot,
  PendingOrder,
  Position,
  RiskProfile,
  SessionInfo,
  SignalCandidate,
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
import type {
  RawAccountTelemetryResponse,
  RawOrderResponse,
  RawPositionResponse,
} from "../normalizers/index.js";

export interface SniperClientConfig {
  baseUrl: string;
  mock?: boolean;
  username?: string;
  appPassword?: string;
  nonce?: string;
  onAuthRequired?: () => void;
}

function normalizeLiveSignalsEnvelope(
  raw: LiveSignalsResponse | SignalCandidate[],
): LiveSignalsResponse {
  try {
    return normalizeSharedLiveSignalsEnvelope(raw);
  } catch {
    throw new ApiError("/live-signals", 200, "backend response missing signals array");
  }
}

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

  setCredentials(username: string, appPassword: string): void {
    this.authHeader = `Basic ${encodeBasicCredentials(username, appPassword)}`;
  }

  clearCredentials(): void {
    this.authHeader = null;
  }

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

  async getSnapshot(): Promise<MarketSnapshot> {
    const raw = await this.request<unknown>("/snapshot", { cacheBust: true });
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

  async getAccountTelemetry(): Promise<AccountTelemetry> {
    const raw = await this.request<RawAccountTelemetryResponse>("/account-telemetry", {
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

  async getUserSettings(): Promise<DashboardSettings> {
    return this.request("/user/settings");
  }

  async postUserSettings(payload: Partial<DashboardSettings>): Promise<{ ok: true }> {
    return this.request("/user/settings", { method: "POST", body: payload });
  }

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

  async getUserRiskProfile(): Promise<RiskProfile> {
    return this.request("/user/risk-profile");
  }

  async postUserRiskProfile(payload: Partial<RiskProfile>): Promise<{ ok: true }> {
    return this.request("/user/risk-profile", { method: "POST", body: payload });
  }

  async getUserProgress(): Promise<UserProgress> {
    return this.request("/user/progress", { cacheBust: true });
  }

  async getPositions(): Promise<Position[]> {
    const raw = await this.request<RawPositionResponse[]>("/positions", { cacheBust: true });
    return normalizeTelemetryPositions(raw);
  }

  async getOrders(): Promise<PendingOrder[]> {
    const raw = await this.request<RawOrderResponse[]>("/orders", { cacheBust: true });
    return normalizeTelemetryOrders(raw);
  }

  async postExecuteSignals(payload: {
    signalIds: string[];
  }): Promise<{ ok: true; queued: number }> {
    return this.request("/user/execute-signals", { method: "POST", body: payload });
  }

  async postEngineBatch(
    symbols?: Symbol[],
  ): Promise<{ ok: boolean; diagnostics: SymbolDiagnostic[] }> {
    return this.request("/user/engine-batch", {
      method: "POST",
      body: symbols ? { symbols } : {},
    });
  }

  async postWatchlistAdd(symbol: string): Promise<{ ok: boolean; watchlist: Symbol[] }> {
    return this.request("/user/watchlist/add", { method: "POST", body: { symbol } });
  }

  async postWatchlistRemove(symbol: string): Promise<{ ok: boolean; watchlist: Symbol[] }> {
    return this.request("/user/watchlist/remove", { method: "POST", body: { symbol } });
  }

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
