import type {
  AccountTelemetry,
  GateState,
  LiveSignalsResponse,
  MarketSnapshot,
  PairPrice,
  PendingOrder,
  Position,
  RegimeState,
  SignalCandidate,
  Symbol,
  SymbolDiagnostic,
  UserProgress,
  UserProgressState,
} from "./index";

export type RawAccountTelemetryResponse = {
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

export type RawPositionResponse = {
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

export type RawOrderResponse = {
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

export type RawUserProgressResponse = {
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

export function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return typeof fallback === "number" && Number.isFinite(fallback) ? fallback : 0;
}

export function normalizeAccountTelemetry(response: RawAccountTelemetryResponse): AccountTelemetry {
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
    leverage: toFiniteNumber(response.leverage),
    eaVersion: response.ea_version ?? "",
    lastSeenAt: response.last_seen_at ?? null,
    updatedAt: response.updated_at ?? null,
    state: response.freshness ?? "unavailable",
  };
}

export function normalizeTelemetryPositions(rows: RawPositionResponse[]): Position[] {
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

export function normalizeTelemetryOrders(rows: RawOrderResponse[]): PendingOrder[] {
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

export function normalizeUserProgressState(value: unknown): UserProgressState {
  return value === "LIVE" || value === "STALE" || value === "UNAVAILABLE" ? value : "UNAVAILABLE";
}

export function normalizeUserProgress(response: RawUserProgressResponse): UserProgress {
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

export function normalizeLiveSignalsEnvelope(
  raw: LiveSignalsResponse | SignalCandidate[],
): LiveSignalsResponse {
  if (Array.isArray(raw)) {
    return { signals: raw, polledAt: new Date().toISOString() };
  }
  if (raw && Array.isArray(raw.signals)) return raw;

  throw new Error("/live-signals: backend response missing signals array");
}

export function normalizeLiveSignalsResponse(
  raw: LiveSignalsResponse | SignalCandidate[],
): SignalCandidate[] {
  return normalizeLiveSignalsEnvelope(raw).signals;
}

export function normalizeSnapshot(snapshot: {
  prices?: PairPrice[];
  regimes?: RegimeState[];
  gates?: GateState[];
  diagnostics?: SymbolDiagnostic[];
  [key: string]: unknown;
}): MarketSnapshot {
  return {
    ...snapshot,
    prices: (snapshot.prices ?? []).map((price) => ({
      ...price,
      bid: toFiniteNumber(price.bid),
      ask: toFiniteNumber(price.ask),
      mid: toFiniteNumber(price.mid),
      changePct1d: toFiniteNumber(price.changePct1d),
      age_sec: price.age_sec === undefined ? undefined : toFiniteNumber(price.age_sec),
      sourceDetail: typeof price.sourceDetail === "string" ? price.sourceDetail : undefined,
      feed_key: typeof price.feed_key === "string" ? price.feed_key : undefined,
      source_count:
        price.source_count == null
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
          : toFiniteNumber(regime.sfPosition),
      afPosition:
        regime.afPosition === null || regime.afPosition === undefined
          ? null
          : toFiniteNumber(regime.afPosition),
      nearestFib:
        regime.nearestFib === null || regime.nearestFib === undefined
          ? null
          : toFiniteNumber(regime.nearestFib),
    })),
    gates: snapshot.gates ?? [],
    diagnostics: snapshot.diagnostics ?? [],
  };
}
