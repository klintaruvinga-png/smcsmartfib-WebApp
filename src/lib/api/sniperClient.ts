/**
 * SMC SuperFIB API client.
 * One typed function per /wp-json/sniper/v1/* endpoint.
 * In MOCK_MODE every function returns the typed mock model with state: 'mock'.
 */

import type {
  AccountState,
  DashboardSettings,
  GateState,
  PairPrice,
  PendingOrder,
  Position,
  RegimeState,
  RiskProfile,
  SignalCandidate,
  Symbol,
  TradePlan,
} from "@/types/sniper";

import {
  mockAccount,
  mockGates,
  mockOrders,
  mockPlan,
  mockPositions,
  mockPrices,
  mockRegimes,
  mockRiskProfile,
  mockSettings,
  mockSignals,
} from "@/mocks/sniperData";

export const MOCK_MODE = true;

let backendUrl = mockSettings.backendUrl;
export function setBackendUrl(url: string) {
  backendUrl = url;
}
export function getBackendUrl() {
  return backendUrl;
}

interface RequestOpts {
  method?: "GET" | "POST";
  body?: unknown;
  secret?: boolean;
}

async function call<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Placeholder auth headers — wired to wp_localize_script in production
  const win = typeof window !== "undefined" ? (window as unknown as { SNIPER?: { nonce?: string; secret?: string } }) : undefined;
  if (win?.SNIPER?.nonce) headers["X-WP-Nonce"] = win.SNIPER.nonce;
  if (opts.secret && win?.SNIPER?.secret) headers["X-Sniper-Secret"] = win.SNIPER.secret;

  const base = backendUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/sniper/v1${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

// ──────────────── Public / shared ────────────────
export const apiClient = {
  // Public
  async getRegimes(mock = MOCK_MODE): Promise<RegimeState[]> {
    if (mock) return mockRegimes;
    return call<RegimeState[]>("/regimes");
  },
  async postRegime(payload: Partial<RegimeState>, mock = MOCK_MODE): Promise<{ ok: true }> {
    if (mock) return { ok: true };
    return call("/regime", { method: "POST", body: payload });
  },
  async getSnapshot(mock = MOCK_MODE) {
    if (mock) return { prices: mockPrices, regimes: mockRegimes, gates: mockGates };
    return call<{ prices: PairPrice[]; regimes: RegimeState[]; gates: GateState[] }>("/snapshot");
  },
  async postSnapshot(payload: unknown, mock = MOCK_MODE): Promise<{ ok: true }> {
    if (mock) return { ok: true };
    return call("/snapshot", { method: "POST", body: payload });
  },
  async getLiveSignals(mock = MOCK_MODE): Promise<SignalCandidate[]> {
    if (mock) return mockSignals;
    return call<SignalCandidate[]>("/live-signals");
  },
  async postSignal(payload: Partial<SignalCandidate>, mock = MOCK_MODE): Promise<{ ok: true }> {
    if (mock) return { ok: true };
    return call("/signal", { method: "POST", body: payload });
  },
  async getLadders(symbol?: Symbol, mock = MOCK_MODE): Promise<TradePlan[]> {
    if (mock) return [mockPlan];
    return call<TradePlan[]>(`/ladders${symbol ? `?symbol=${symbol}` : ""}`);
  },
  async getSession(mock = MOCK_MODE) {
    if (mock) return { name: "London-AM", openUtc: "07:00", closeUtc: "11:00", state: "mock" as const };
    return call<{ name: string; openUtc: string; closeUtc: string; state: string }>("/session");
  },
  async postEngineBatch(payload: unknown, mock = MOCK_MODE): Promise<{ ok: true }> {
    if (mock) return { ok: true };
    return call("/engine-batch", { method: "POST", body: payload, secret: true });
  },

  // Authenticated user
  async postUserEngineBatch(payload: unknown, mock = MOCK_MODE): Promise<{ ok: true }> {
    if (mock) return { ok: true };
    return call("/user/engine-batch", { method: "POST", body: payload });
  },
  async postUserMarketData(payload: { symbols: Symbol[] }, mock = MOCK_MODE): Promise<PairPrice[]> {
    if (mock) return mockPrices.filter((p) => payload.symbols.includes(p.symbol));
    return call("/user/market-data", { method: "POST", body: payload });
  },
  async getUserTrades(mock = MOCK_MODE): Promise<{ positions: Position[]; orders: PendingOrder[] }> {
    if (mock) return { positions: mockPositions, orders: mockOrders };
    return call("/user/trades");
  },
  async postUserTrades(payload: unknown, mock = MOCK_MODE): Promise<{ ok: true }> {
    if (mock) return { ok: true };
    return call("/user/trades", { method: "POST", body: payload });
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
  async postUserSettings(payload: Partial<DashboardSettings>, mock = MOCK_MODE): Promise<{ ok: true }> {
    if (mock) return { ok: true };
    return call("/user/settings", { method: "POST", body: payload });
  },
  async getUserRiskProfile(mock = MOCK_MODE): Promise<RiskProfile> {
    if (mock) return mockRiskProfile;
    return call("/user/risk-profile");
  },
  async postUserRiskProfile(payload: Partial<RiskProfile>, mock = MOCK_MODE): Promise<{ ok: true }> {
    if (mock) return { ok: true };
    return call("/user/risk-profile", { method: "POST", body: payload });
  },
  async getUserTradeQueue(mock = MOCK_MODE): Promise<PendingOrder[]> {
    if (mock) return mockOrders;
    return call("/user/trade-queue");
  },
  async postUserTradeQueue(payload: unknown, mock = MOCK_MODE): Promise<{ ok: true }> {
    if (mock) return { ok: true };
    return call("/user/trade-queue", { method: "POST", body: payload });
  },
  async postExecuteSignals(payload: { signalIds: string[] }, mock = MOCK_MODE): Promise<{ ok: true; queued: number }> {
    if (mock) return { ok: true, queued: payload.signalIds.length };
    return call("/user/execute-signals", { method: "POST", body: payload });
  },
};
