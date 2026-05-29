# Executive Summary

- Overall health: improved for the targeted trade-plan sizing path.
- Bugs found: 1 confirmed HIGH backend authority defect.
- Fixes applied: `build_trade_plan()` now sizes from live account telemetry only and marks the plan `INVALID` when live positive telemetry equity is unavailable.
- Remaining risks: no live WordPress environment verification was run from this workspace; the proof here is regression-based plus local harness payload sampling.
- Migration readiness: PASS for the targeted backend/dashboard sizing authority path.

# Confirmed Problems

## Backend sizing authority

| Severity | Component | Root cause | Impact | Status |
| --- | --- | --- | --- | --- |
| HIGH | Trade-plan sizing | `build_trade_plan()` sized risk from `/user/account` blob `equityUSC` and then masked empty/stale data with `max(..., 1)`, even though live wallet truth comes from `/account-telemetry`. | Backend could emit tiny executable-looking plans or `Below 0.01 lot` ladders while the app showed a healthy live balance, creating backend/dashboard truth drift and order-viability risk. | Patched |

# Surgical Fixes Applied

- [`wordpress/smc-superfib-sniper/smc-superfib-sniper.php`](/C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/wordpress/smc-superfib-sniper/smc-superfib-sniper.php:5331)
  - Removed plan sizing dependence on `get_account_state()['equityUSC']`.
  - Sized risk from `read_account_telemetry()` only when telemetry freshness is `live` and `equity > 0`.
  - Preserved the existing plan shape but returned `riskUSC = 0`, `riskZAR = 0`, `drawdownImpactPct = 0`, zero stage lots, and `state = 'INVALID'` when live telemetry equity was unavailable.
- [`wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php`](/C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php:1)
  - Added regression coverage for live telemetry overriding a stale/zeroed account blob.
  - Added regression coverage for stale telemetry forcing a structurally intact but non-executable invalid plan.
- [`wordpress/smc-superfib-sniper/tests/php/fib-test-helpers.php`](/C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/wordpress/smc-superfib-sniper/tests/php/fib-test-helpers.php:130)
  - Added lightweight `dbDelta()` and `get_charset_collate()` test stubs so the progressive sizing suite can exercise the real telemetry table bootstrap used by production code.

# Verification Results

| Check | Result | Notes |
| --- | --- | --- |
| `php wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php` | PASS | New telemetry-authority and invalid-plan regressions passed. |
| `php wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php` | PASS | Telemetry freshness contract remained intact. |
| `npx vitest run src/routes/-plan.test.tsx` | PASS | Existing dashboard execution-gating and `Below 0.01 lot` UI behavior stayed unchanged. |
| Local payload sample: `/account-telemetry` vs `/ladders` | PASS | Sampled `riskUSC = 500` for `equity = 50000` and `perTradePct = 1.0`; sampled stale telemetry plan returned `state = INVALID` with zero lots. |

# Remaining Risks

- `ensure_engine_snapshot()` still uses its existing cache window; this patch intentionally did not widen snapshot invalidation around telemetry freshness.
- No live browser or WordPress staging verification was executed from this workspace.
- No balance-based fallback exists by design; if telemetry is stale or absent, plans will now be intentionally blocked instead of guessed.

# Regression Checklist

- [x] Valid plans still preserve fib entries, stop placement, TP mapping, RR math, and 20/30/50 stage allocation.
- [x] Valid plans still preserve the `0.01` minimum lot floor behavior.
- [x] Backend plan shape and frontend lot-display contract remained unchanged.
- [x] Stale telemetry is not promoted to a live sizing source.
- [x] No `balance` fallback was introduced.

# Do Not Touch List

- `/user/account` snapshot semantics.
- `/account-telemetry` freshness thresholds and authority rules.
- Fib ratios, stop formulas, TP formulas, and staged risk allocation.
- Frontend `PlanCard` lot rendering and execution gating unless a backend contract break is proven separately.
