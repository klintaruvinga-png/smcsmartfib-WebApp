# Executive Summary
- Overall health: stable in the touched scope after fixing a confirmed EA-authority regression that allowed stale Twelve Data cooldown and missing-key state to override MT5-owned symbol health.
- Bugs found: 1 confirmed high-severity backend regression in active feed-health/blocker paths, 0 critical blockers after patch.
- Fixes applied: MT5 authority now means symbol ownership by EA/MT5 data, not only "fresh live MT5 tick right now"; health, candle fetch, and engine blocker logic now ignore Twelve Data cooldown/key escalation for EA-owned symbols.
- Remaining risks: live soak evidence is still pending, and MT5 M1 -> 15min aggregation coverage for symbols that still show sparse candle history remains the main open Phase 0 validation task.
- Migration readiness: still Phase 0 stabilization; this patch removes a false `rate-limited`/`blocked` branch but does not complete soak or parity replay gates.

# Confirmed Problem

## Feed Health / Authority Regression
- **HIGH** - EA-authoritative symbols could still present `rate-limited` or `blocked` when MT5 data went stale, because backend authority logic was tied to fresh MT5 liveness instead of source ownership.
  - Root cause: [`wordpress/smc-superfib-sniper/smc-superfib-sniper.php`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\wordpress\smc-superfib-sniper\smc-superfib-sniper.php) treated `is_mt5_authoritative()` as "fresh live MT5 price exists now", so stale Twelve Data cooldown transients and missing-key status could re-enter `get_health()`, `determine_engine_blocker()`, and `fetch_candles()` even after EA became the symbol authority.
  - Impact: watchlist symbols owned by the EA could degrade to the wrong operator-facing state, showing `rate-limited` or `blocked` instead of the truthful MT5 stale path. That also obscured the actual next action during Phase 0 stabilization.

# Surgical Fixes Applied
- [`wordpress/smc-superfib-sniper/smc-superfib-sniper.php`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\wordpress\smc-superfib-sniper\smc-superfib-sniper.php)
  - Rebased MT5 authority on persisted MT5 ownership (`source=mt5` snapshot or MT5 candle presence), not just current live freshness.
  - Prevented `get_health()` from escalating to `rate-limited` or `blocked` for EA-owned symbols when only stale Twelve Data state exists.
  - Prevented `determine_engine_blocker()` from returning `RATE_LIMITED` for EA-owned symbols; stale MT5 now resolves through the MT5 freshness path instead.
  - Prevented `fetch_candles()` from attempting upstream Twelve Data fetches for EA-owned symbols and added focused feed-debug logs for symbol, summary, blocker, and MT5 candle-gap decisions.
- [`wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\wordpress\smc-superfib-sniper\tests\php\test-mt5-snapshot-contract.php)
  - Added regression coverage proving an EA-owned symbol with stale MT5 data plus a stale Twelve Data cooldown transient now reports `stale`/`PRICE_STALE`, not `rate-limited`.
- [`.github/migration-status.md`](C:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\.github\migration-status.md)
  - Updated the Phase 0 snapshot and success criteria to reflect the EA-authority hardening that landed in this pass.

# Verification Results
- `php -l wordpress\smc-superfib-sniper\smc-superfib-sniper.php` passed.
- `php wordpress\smc-superfib-sniper\tests\php\test-mt5-snapshot-contract.php` passed.
- `php wordpress\smc-superfib-sniper\tests\php\test-ea-market-stream.php` passed.

# Remaining Risks
- Live 24h/72h soak is still not complete, so there is not yet production evidence that the new feed-debug logs remain appropriately low-noise under continuous dashboard polling.
- Symbols that still fail the M1 -> 15min aggregation readiness checks can now be diagnosed more cleanly, but the aggregation coverage work itself is still open.
- Full Pine/backend/dashboard replay parity was not recomputed in this focused backend pass.

# Regression Checklist
- [x] MT5 authority no longer reuses stale Twelve Data cooldown as the primary health state
- [x] Missing Twelve Data key no longer blocks an all-MT5 watchlist
- [x] Engine blocker prefers MT5 stale truth over `RATE_LIMITED` for EA-owned symbols
- [x] Same-symbol cooldown clearing from EA ingest remains green
- [ ] 24h/72h live soak completed
- [ ] Multi-symbol market-open verification completed
- [ ] MT5 M1 -> 15min aggregation verification completed for sparse-history symbols

# Next Steps
1. Run a live soak focused on the health endpoint and confirm the new `[smc_feed]` logs show `stale` rather than `rate-limited`/`blocked` when EA symbols age out.
2. Use the new `fetch_candles.mt5_gap` diagnostics to identify which symbols still lack sufficient MT5-derived 15-minute history.
3. Re-run the broader Pine/backend/dashboard parity audit once the live soak and aggregation checks are complete.
