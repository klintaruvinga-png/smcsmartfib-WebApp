import { NetworkError as d, AuthError as h, ApiError as c } from "./errors.js";
import { encodeBasicCredentials as l } from "../auth/index.js";
function n(t, e = 0) {
  if (typeof t == "number" && Number.isFinite(t)) return t;
  if (typeof t == "string") {
    const s = Number(t);
    if (Number.isFinite(s)) return s;
  }
  return e;
}
function m(t) {
  return {
    accountId: t.account_id ?? "",
    terminalId: t.terminal_id ?? "",
    balance: n(t.balance),
    equity: n(t.equity),
    margin: n(t.margin),
    freeMargin: n(t.free_margin),
    marginLevel: n(t.margin_level),
    floatingPl: n(t.floating_pl),
    currency: t.currency ?? "",
    leverage: n(t.leverage),
    eaVersion: t.ea_version ?? "",
    lastSeenAt: t.last_seen_at ?? null,
    updatedAt: t.updated_at ?? null,
    state: t.freshness ?? "unavailable"
  };
}
function y(t) {
  const e = n(t.profit), s = n(t.entry_price), o = n(t.current_price, s), a = n(t.volume), r = Math.abs(s * a);
  return {
    id: t.position_id,
    symbol: t.symbol,
    direction: t.direction,
    entry: s,
    current: o,
    lots: a,
    pnlUSC: e,
    pnlPct: r > 0 ? e / r * 100 : 0,
    openedAt: t.opened_at ?? (/* @__PURE__ */ new Date(0)).toISOString(),
    state: t.freshness ?? "unavailable"
  };
}
function p(t) {
  const e = String(t.order_type ?? "").toUpperCase();
  return {
    id: t.order_id,
    symbol: t.symbol,
    direction: t.direction,
    type: e.includes("STOP") ? "STOP" : "LIMIT",
    price: n(t.entry_price),
    lots: n(t.volume),
    sl: n(t.sl),
    tp: n(t.tp),
    placedAt: t.placed_at ?? (/* @__PURE__ */ new Date(0)).toISOString(),
    state: t.freshness ?? "unavailable"
  };
}
function g(t) {
  return {
    prices: (t.prices ?? []).map((e) => ({
      ...e,
      bid: n(e.bid),
      ask: n(e.ask),
      mid: n(e.mid),
      changePct1d: n(e.changePct1d),
      age_sec: e.age_sec === void 0 ? void 0 : n(e.age_sec)
    })),
    regimes: (t.regimes ?? []).map((e) => ({
      ...e,
      chop: n(e.chop),
      nearestFib: e.nearestFib == null ? null : n(e.nearestFib)
    })),
    gates: t.gates ?? [],
    diagnostics: t.diagnostics ?? []
  };
}
class f {
  constructor(e) {
    this.authHeader = null, this.nonce = null, this.baseUrl = e.baseUrl.replace(/\/$/, "").replace(/\/wp-json$/, ""), this.mock = e.mock ?? !1, this.nonce = e.nonce ?? null, this.onAuthRequired = e.onAuthRequired, e.username && e.appPassword && this.setCredentials(e.username, e.appPassword);
  }
  /** Update Basic auth credentials at runtime (e.g. after login). */
  setCredentials(e, s) {
    this.authHeader = `Basic ${l(e, s)}`;
  }
  clearCredentials() {
    this.authHeader = null;
  }
  /** Override the WP nonce (useful when the page refreshes its nonce). */
  setNonce(e) {
    this.nonce = e;
  }
  buildHeaders(e) {
    const s = {};
    return e !== void 0 && (s["Content-Type"] = "application/json"), this.authHeader ? s.Authorization = this.authHeader : this.nonce && (s["X-WP-Nonce"] = this.nonce), s;
  }
  async request(e, s = {}) {
    const o = this.buildHeaders(s.body);
    let a = `${this.baseUrl}/wp-json/sniper/v1${e}`;
    (s.method ?? "GET") === "GET" && s.cacheBust && (a += `${a.includes("?") ? "&" : "?"}_=${Date.now()}`);
    let r;
    try {
      r = await fetch(a, {
        method: s.method ?? "GET",
        headers: o,
        cache: s.cacheBust ? "no-store" : "default",
        credentials: s.authenticated === !1 ? "omit" : "include",
        body: s.body !== void 0 ? JSON.stringify(s.body) : void 0
      });
    } catch (i) {
      throw new d(e, i instanceof Error ? i : void 0);
    }
    if (r.status === 401)
      throw this.clearCredentials(), this.onAuthRequired?.(), typeof window < "u" && window.dispatchEvent(new CustomEvent("smc:auth-required")), new h();
    if (!r.ok) {
      const i = await r.text().catch(() => {
      });
      throw new c(e, r.status, i);
    }
    if (r.status === 204) {
      if (s.allowEmptyResponse) return {};
      throw new c(e, 204, "expected response body but got 204 No Content");
    }
    const u = await r.text();
    if (!u.trim()) {
      if (s.allowEmptyResponse) return {};
      throw new c(e, r.status, "expected response body but got empty response");
    }
    return JSON.parse(u);
  }
  // ─── Market data ───────────────────────────────────────────────────────────
  async getSnapshot() {
    const e = await this.request("/snapshot", { cacheBust: !0 });
    return g(e);
  }
  async getChartSnapshot(e, s = "15min") {
    return this.request(
      `/charts?symbol=${encodeURIComponent(e)}&timeframe=${encodeURIComponent(s)}`
    );
  }
  async getLiveSignals() {
    return this.request("/live-signals");
  }
  async getLadders(e) {
    return this.request(`/ladders${e ? `?symbol=${encodeURIComponent(e)}` : ""}`);
  }
  async getSession() {
    return this.request("/session", { authenticated: !1 });
  }
  async getEngineHealth() {
    return this.request("/health");
  }
  async getAdminHealth() {
    return this.request("/admin/health", { cacheBust: !0 });
  }
  // ─── Account ───────────────────────────────────────────────────────────────
  async getAccountTelemetry() {
    const e = await this.request("/account-telemetry", {
      cacheBust: !0
    });
    return m(e);
  }
  async getUserAccount() {
    return this.request("/user/account");
  }
  async postUserAccount(e) {
    return this.request("/user/account", { method: "POST", body: e });
  }
  // ─── Settings ──────────────────────────────────────────────────────────────
  async getUserSettings() {
    return this.request("/user/settings");
  }
  async postUserSettings(e) {
    return this.request("/user/settings", { method: "POST", body: e });
  }
  // ─── API key ───────────────────────────────────────────────────────────────
  async postTwelveDataKey(e) {
    return this.request("/user/twelve-data-key", { method: "POST", body: e });
  }
  async deleteTwelveDataKey() {
    return this.request("/user/twelve-data-key", {
      method: "DELETE",
      allowEmptyResponse: !0
    });
  }
  // ─── Risk profile ──────────────────────────────────────────────────────────
  async getUserRiskProfile() {
    return this.request("/user/risk-profile");
  }
  async postUserRiskProfile(e) {
    return this.request("/user/risk-profile", { method: "POST", body: e });
  }
  // ─── Progress ──────────────────────────────────────────────────────────────
  async getUserProgress() {
    return this.request("/user/progress", { cacheBust: !0 });
  }
  // ─── Positions & orders ────────────────────────────────────────────────────
  async getPositions() {
    return (await this.request("/positions", { cacheBust: !0 }) ?? []).map(y);
  }
  async getOrders() {
    return (await this.request("/orders", { cacheBust: !0 }) ?? []).map(p);
  }
  // ─── Execution ─────────────────────────────────────────────────────────────
  async postExecuteSignals(e) {
    return this.request("/user/execute-signals", { method: "POST", body: e });
  }
  // ─── Engine ────────────────────────────────────────────────────────────────
  async postEngineBatch(e) {
    return this.request("/user/engine-batch", {
      method: "POST",
      body: e ? { symbols: e } : {}
    });
  }
  // ─── Watchlist ─────────────────────────────────────────────────────────────
  async postWatchlistAdd(e) {
    return this.request("/user/watchlist/add", { method: "POST", body: { symbol: e } });
  }
  async postWatchlistRemove(e) {
    return this.request("/user/watchlist/remove", { method: "POST", body: { symbol: e } });
  }
  // ─── Soak testing ──────────────────────────────────────────────────────────
  async getSoakReport() {
    return this.request("/admin/soak-report", { cacheBust: !0 });
  }
  async upsertSoakEvidence(e) {
    return this.request("/admin/soak-evidence", { method: "POST", body: e });
  }
  async createSoakCheckpoint(e) {
    return this.request("/admin/soak-checkpoint", {
      method: "POST",
      body: {
        operator_notes: e?.operatorNotes ?? "",
        checkpoint_type: e?.checkpointType ?? "checkpoint"
      }
    });
  }
}
export {
  f as SniperClient
};
//# sourceMappingURL=SniperClient.js.map
