
# SMC SuperFIB Dashboard — Build Plan

A standalone, mobile-first trading dashboard frontend that mirrors the SMC SuperFIB WordPress plugin. Ships with mock data and a typed REST client ready to point at `/wp-json/sniper/v1/...`.

## Architecture & guardrails

- **Backend is source of truth.** The frontend may compute candidate signals and previews, but every signal/blueprint card shows whether the backend has confirmed it (`computedBy` + `backendConfirmed`). When they disagree, a red ⚠️ divergence banner appears.
- **Freshness is a first-class UI concept.** Every data-bearing surface displays one of: `live`, `stale`, `unavailable`, `blocked`, `offline`, `pending-sync`, `mock`. No silent fallbacks — `mock` always shows a visible "MOCK" badge.
- **Single `MOCK_MODE` flag** flips the whole app between mock data and real REST. A `BACKEND_URL` setting is editable from the Account screen.

## Design system

Dark institutional fintech, mobile-first, dense but legible.

- **Type:** Inter for UI, JetBrains Mono for numbers/IDs/symbols.
- **Tokens** (CSS vars on `:root`): `--bg #07111b`, `--bg1 #102033`, `--bg2 #17293f`, `--bg3 #20344d`, `--bd rgba(164,191,223,0.24)`, `--accent #d8a35d`, `--accent-2 #f3d7ab`, `--buy #46d19a`, `--sell #ff9a92`, `--warn #f1b65c`, `--info #59a8ff`, `--violet #9e8cff`, `--tx #fff`, `--dim #c4d2e4`, `--mute #9cb0c9`.
- **Body background:** layered radial+linear gradient as specified, with a faint 64px grid overlay masked top→bottom.
- **Semantic color rules (strict):**
  - `--buy` long/active/live · `--sell` short/error/blocking · `--warn` non-blocking notice · `--mute` unavailable/ranging/disabled · `--accent` brand only (badges, brand mark, pip dot).
  - Every warning line begins with `⚠️`. Amber for non-blocking; red for blocking/divergence. Never gold for warnings.
- Sticky top header with a 6px live-pulse dot; bottom tab nav on mobile, left rail on desktop.

## Routes (9, route keys mirror the plugin)

Each is a TanStack route file, each declares its own `head()` meta.

| Route       | Label              | Contents |
|-------------|--------------------|----------|
| `/plan`     | Signal Plan        | Selected `SignalCandidate` with verdict (A+/A/B/C), `TradePlan` panel: E1/E2/E3, SL, TP1/2/3 with R:R, lot sizing per stage, USC + ZAR risk, drawdown impact, confluence chips, `backend-blueprint` vs `frontend-preview` source badge, "Send to execution" button. |
| `/live`     | Live Radar         | Per-pair card grid with `PairPrice`, `RegimeState`, `GateState`, chop bar, nearest fib, freshness badge, stale row warnings. |
| `/signals`  | Signal Engine      | Engine readiness checklist (price feed, regime, gate, chop, fib, backend sync, Twelve Data key) + live `SignalCandidate` list with `computedBy`/`backendConfirmed` flags and divergence banner. |
| `/charts`   | Charts             | Per-pair price + fib visualisation (Recharts line + horizontal fib levels). |
| `/book`     | Active Book        | Open positions grouped by symbol, pair-level consolidated warnings at group header. |
| `/orders`   | Pending Orders     | Working/queued orders, same grouping pattern. |
| `/analytics`| Analytics          | Equity curve, current exposure, open risk, drawdown vs cap, win/loss split — each card shows its `FreshnessState`. |
| `/progress` | Progress           | Account pulse, milestones, streaks. |
| `/account`  | Account / Settings | Sub-tabs: Settings (backend URL, API key status, refresh interval, stale threshold, watchlist editor, risk allocation %) and Risk Profile (`/user/risk-profile`). |

`/` redirects to `/plan`.

## Persistent header

Brand mark (gold gradient square) · `SMC SuperFIB` title · rolling watchlist ticker (price + daily % in buy/sell) · backend sync chip (`LIVE/STALE/OFFLINE`) · signal status chip (counts of `READY/ARMED/WATCH`) · manual refresh button.

## Data layer

- **Types** in `src/types/sniper.ts`: `FreshnessState`, `PairPrice`, `RegimeState`, `GateState`, `SignalCandidate`, `TradePlan`, `Position`, `PendingOrder`, `EngineHealth`, `DashboardSettings`, `RiskProfile`, `AccountState` — exactly as specified in the brief.
- **Mock dataset** in `src/mocks/` covering watchlist `GBPUSD, AUDUSD, EURUSD, NZDUSD, USDJPY, AUDJPY, EURJPY` (+ `XAUUSD` stretch), with deliberately mixed freshness states so badges are visible across the UI.
- **Typed `apiClient`** in `src/lib/api/sniperClient.ts` — one function per endpoint, all hitting `${BACKEND_URL}/wp-json/sniper/v1/...`, sending `X-WP-Nonce` and `X-Sniper-Secret` placeholder headers. Each function accepts a `mock` flag and, in mock mode, returns the typed model with `state: 'mock'`.
  - Public: `GET /regimes`, `POST /regime`, `GET /snapshot`, `POST /snapshot`, `GET /live-signals`, `POST /signal`, `GET /ladders`, `GET /session`, `POST /engine-batch`.
  - User: `POST /user/engine-batch`, `POST /user/market-data`, `GET|POST /user/trades`, `GET|POST /user/account`, `GET|POST /user/settings`, `GET|POST /user/risk-profile`, `GET|POST /user/trade-queue`, `POST /user/execute-signals`.
- **State** via TanStack Query — single source for header ticker, sync chip, and signal chip so they update together. Polling interval comes from `DashboardSettings.refreshIntervalSec`; `staleThresholdSec` drives the `live → stale` transition.

## Reusable components

`FreshnessBadge`, `SyncChip`, `SignalStatusChip`, `VerdictBadge`, `PairCard`, `RegimeBar`, `GateBadge`, `ChopMeter`, `WarningLine` (always prefixes `⚠️`), `DivergenceBanner`, `PriceTicker`, `AppShell` (header + left rail desktop / bottom nav mobile).

## Definition of done

- All 9 routes render with mock data and visible freshness badges.
- `apiClient` exposes one typed function per endpoint above.
- `MOCK_MODE` flips entire app between mock and real REST.
- Header ticker, sync chip, signal chip share one store.
- `live`, `stale`, `blocked`, `offline`, `unavailable`, `mock` are visually distinct everywhere they can occur.
- No frontend computation is presented as authoritative — every signal/blueprint shows whether the backend confirmed it, and divergence triggers a red banner.

## Out of scope (this build)

Real WordPress auth handshake (placeholder headers only), live Twelve Data integration, real chart indicators beyond price + fib lines, push notifications.
