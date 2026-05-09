# Bug Sweep Report — 2026-05-10

## Executive Summary

- **Overall health**: Stable. Full 7-stage scan completed across TypeScript frontend, PHP plugin, and MT5 EA. Three confirmed backend issues patched in this run.
- **Bugs found**: 3 confirmed issues in `smc-superfib-sniper.php` — one high (unbounded table growth), two low (dead unreachable methods).
- **Fixes applied**: WP-Cron daily pruning job for `engine_runs` and `audit_events` tables; removal of dead `verify_ea_api_key()` and `send_cors_headers()` instance methods.
- **Remaining risks**: Pre-existing Prettier drift in `useAnimatedNumber.ts`, `useTickFlash.ts`, `plan.tsx` keeps global `npm run lint` noisy. Not caused by this sweep.
- **Migration readiness**: Phase 0 soak continues. DB table growth no longer unbounded; CORS and EA-auth paths are leaner.

---

## Confirmed Problems

### Stage 1 — Runtime & Stability

| Severity | Component | Root Cause | Impact | Blocker Status |
|---|---|---|---|---|
| HIGH | `smc-superfib-sniper.php` — `engine_runs` + `audit_events` | `boot()` registered no WP-Cron pruning job. Every engine tick (heartbeat + completion) inserts a row into `engine_runs`; every audit trace inserts into `audit_events`. No rows were ever deleted. | Tables grow without bound during Phase 0 soak, degrading DB performance over time and eventually impacting all dashboard endpoints that read from these tables. | Patched in this run. |

### Stage 7 — Cleanup Sweep (Dead Code)

| Severity | Component | Root Cause | Impact | Blocker Status |
|---|---|---|---|---|
| LOW | `verify_ea_api_key()` (public instance method, ~8 lines) | Method defined but never registered as a route permission callback. EA auth is performed entirely by `permission_ea_market_stream()` → `get_ea_api_key()`. | Dead surface area; a future developer could mistakenly wire it as a permission callback, bypassing the hardened `permission_ea_market_stream()` which also validates `ea_user_id` and calls `wp_set_current_user()`. | Patched — removed in this run. |
| LOW | `send_cors_headers()` (public instance method, ~26 lines) | Method defined but never registered via `add_filter()`. CORS is handled by the `send_cors_headers_for_origin()` static method wired into `rest_post_dispatch` and `rest_pre_serve_request` filters in `boot()`. | Dead surface area. Contains partial CORS logic that diverges from the live static implementation (e.g., it emits `Vary: Origin` and cache headers but lacks the atomic atomic-origin normalization check in the static version). Risk of divergence growing over time. | Patched — removed in this run. |

---

## Surgical Fixes Applied

| File | Change | Hardening Added |
|---|---|---|
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — `boot()` | Added `add_action('smc_sf_prune_tables', ...)` + `wp_schedule_event(time(), 'daily', 'smc_sf_prune_tables')` with `wp_next_scheduled` guard. | Pruning fires once per day on the standard WP-Cron queue; guard prevents duplicate schedules on repeated `boot()` calls. |
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — new method | Added `public static prune_old_table_rows()`: deletes `engine_runs` rows >7 days, `audit_events` rows >14 days, emits `[PHASE0_SOAK]` log line. | Retention windows are conservative (7d / 14d) to preserve diagnostic history while capping table growth. Uses `gmdate()` + `strtotime()` for UTC-safe date arithmetic; uses `$wpdb->prepare()` to prevent injection. |
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | Removed dead `public function verify_ea_api_key()` (~8 lines). | Eliminates misleading public surface; EA auth exclusively flows through `permission_ea_market_stream()`. |
| `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | Removed dead `public function send_cors_headers()` (~26 lines). | Eliminates a shadow CORS implementation that could diverge from the registered static handler. |

---

## Stages with No New Findings

| Stage | Verdict |
|---|---|
| Stage 2 — Wiring & Hook Audit | PASS. All REST routes, CORS filters, and preflight handlers correctly registered. No orphaned listeners. |
| Stage 3 — Data Contract Verification | PASS. `normalizeSnapshot()` NaN guards intact; watchlist mutation rollback intact; `feedStatus` supersedes `priceFeed` in signals route. |
| Stage 4 — Refresh & Stale-State Audit | PASS. `usePollMs()` null-gate prevents orphaned queries. `cacheBust: true` on snapshot GET. `get_cached_price()` correctly overrides state to 'stale' on age breach. |
| Stage 5 — Signal Engine Integrity | PASS. Chop ≥ 0.7 → BLOCKED gate + ARMED status confirmed. `backendConfirmed = status==='READY' && data_live` gate confirmed. `deduplicateById()` applied in signals route. |
| Stage 6 — Migration Parity Validation | PASS (no changes). Candle ordering via `array_reverse()` (DESC→ASC) confirmed correct. `sequence_state()` guarded by upstream `count($candles) < 30` check. `strtotime()` false-coercion protected by pre-2000 epoch guard. |

---

## Parity Verification Results

| Dimension | Scope | Result | Drift |
|---|---|---|---|
| DB pruning | `engine_runs` / `audit_events` tables | New pruning job aligned with Phase 0 soak retention policy | No parity divergence introduced |
| CORS | All REST endpoints | CORS path unchanged; dead method removed only | No parity divergence |
| EA auth | `permission_ea_market_stream()` | Auth path unchanged; dead helper removed | No parity divergence |
| Fib / regime / signal | PHP engine + TS dashboard | No logic changes in this sweep | Unchanged |

---

## Remaining Risks

- `npm run lint` still fails globally on pre-existing Prettier drift in `useAnimatedNumber.ts`, `useTickFlash.ts`, `plan.tsx`. Needs a dedicated formatting cleanup pass.
- WP-Cron relies on site traffic to trigger; sites with low/no traffic may not run the pruning job on schedule. A `wp_cron` or server-side cron trigger is the correct mitigation if needed in production.
- `engine_runs` heartbeat row cadence should be reviewed if retention window needs narrowing.

---

## Regression Checklist

- [ ] WP-Cron scheduled event `smc_sf_prune_tables` visible in `wp_options` (cron array) after plugin activation.
- [ ] `engine_runs` row count stabilises after 7+ days in production soak.
- [ ] EA auth still functional: `permission_ea_market_stream()` path unchanged.
- [ ] CORS still functional: `send_cors_headers_for_origin()` static path unchanged.
- [ ] No PHP lint/parse errors introduced (both removed methods were syntactically isolated).

---

## Safe Deployment Order

1. Deploy `smc-superfib-sniper.php` patch to the WordPress site.
2. Verify `smc_sf_prune_tables` appears in the WP-Cron schedule (`wp cron event list`).
3. Manually trigger once with `wp cron event run smc_sf_prune_tables` to clear any backlog.
4. Monitor `engine_runs` and `audit_events` row counts over next 24–48h.

---

## Do Not Touch List

- MT5 EA webhook ingestion and candle ordering logic — confirmed correct in this audit.
- `permission_ea_market_stream()` auth path — no change needed.
- `send_cors_headers_for_origin()` static method — this is the live registered handler; do not touch.
- Pine fib/signal formulas — out of scope for this DB/cleanup sweep.

---

## Verification Evidence

- Dead-method grep: `grep -n "verify_ea_api_key\|public function send_cors_headers"` → zero results after patch.
- Prune wiring grep: `grep -n "smc_sf_prune_tables\|prune_old_table_rows"` → lines 84, 85, 86, 118, 130 confirmed present.
- No PHP parse errors introduced (syntactically isolated removals).
