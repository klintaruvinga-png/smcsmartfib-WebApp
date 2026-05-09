# Parity Audit Report — Phase 0

**Report Date**: 2026-05-10  
**Phase**: Phase 0 — Stabilization (DB Hygiene + Dead-Code Removal)  
**Auditor**: Claude Code automated sweep  
**Status**: PASS

---

## Executive Summary

- **Overall Parity**: 100%
- **Threshold Required**: 100% (no logic changes; parity maintained by construction)
- **Pass/Fail**: ✓ PASS
- **Trend**: ↔ Stable

This audit covers the three patches applied on 2026-05-10:
1. WP-Cron daily pruning job for `engine_runs` and `audit_events` tables.
2. Removal of dead `verify_ea_api_key()` instance method.
3. Removal of dead `send_cors_headers()` instance method.

No engine logic, fib calculation, regime classification, signal generation, or MT5 authority paths were modified. All parity dimensions are unchanged.

---

## Component Parity Metrics

### Fib Engine

| Metric | Before Patch | After Patch | Match | Accuracy |
|--------|-------------|-------------|-------|----------|
| Fib ratio set (16 ratios) | Unchanged | Unchanged | ✓ | 100% |
| LTF_SF / HTA_SF / F3 families | Unchanged | Unchanged | ✓ | 100% |
| Anchor computation | Unchanged | Unchanged | ✓ | 100% |
| Level prices | Unchanged | Unchanged | ✓ | 100% |
| **Fib Parity Score** | — | — | — | **100%** |

**Observations**: No fib logic touched. `build_symbol_state()` and `fetch_candles()` paths untouched.

---

### Regime Engine

| Metric | Before Patch | After Patch | Match | Accuracy |
|--------|-------------|-------------|-------|----------|
| Chop gate threshold (≥0.7) | Unchanged | Unchanged | ✓ | 100% |
| Bias classification (BULL/BEAR/RANGING) | Unchanged | Unchanged | ✓ | 100% |
| `run_engine_for_symbols()` gate | Unchanged | Unchanged | ✓ | 100% |
| MT5 freshness gate (source=mt5 && state=live) | Unchanged | Unchanged | ✓ | 100% |
| **Regime Parity Score** | — | — | — | **100%** |

**Observations**: No regime logic touched.

---

### Signal Engine

| Metric | Before Patch | After Patch | Match | Accuracy |
|--------|-------------|-------------|-------|----------|
| `backendConfirmed` = READY && data_live | Unchanged | Unchanged | ✓ | 100% |
| ARMED status when chop-gated | Unchanged | Unchanged | ✓ | 100% |
| Confluence detection | Unchanged | Unchanged | ✓ | 100% |
| Entry / SL / TP ladder computation | Unchanged | Unchanged | ✓ | 100% |
| **Signal Parity Score** | — | — | — | **100%** |

**Observations**: No signal logic touched.

---

### EA Auth & CORS

| Metric | Before Patch | After Patch | Match | Notes |
|--------|-------------|-------------|-------|-------|
| `permission_ea_market_stream()` path | Active, registered | Active, registered | ✓ | Dead `verify_ea_api_key()` removed; live path untouched |
| `send_cors_headers_for_origin()` static | Active, registered via filters | Active, registered via filters | ✓ | Dead `send_cors_headers()` instance removed; live path untouched |
| CORS headers emitted | Correct | Correct | ✓ | Only the live static method emits headers |

---

### DB Pruning (New)

| Metric | Before Patch | After Patch | Notes |
|--------|-------------|-------------|-------|
| `engine_runs` table pruning | None | Daily, rows >7 days deleted | New capability — no parity dimension; retention policy chosen conservatively |
| `audit_events` table pruning | None | Daily, rows >14 days deleted | New capability — longer retention to preserve diagnostic traces |
| WP-Cron event | Not scheduled | `smc_sf_prune_tables` scheduled daily | Guard on `wp_next_scheduled()` prevents duplicate scheduling |
| Log output | None | `[PHASE0_SOAK]` tag on each prune run | Observable via `error_log` / WP debug log |

---

## Critical Issues Found

| Issue | Severity | Resolution | Blocker |
|-------|----------|-----------|---------|
| `engine_runs` + `audit_events` unbounded growth | HIGH | WP-Cron pruning job added | No (patched) |
| Dead `verify_ea_api_key()` — misleading public surface | LOW | Removed | No (patched) |
| Dead `send_cors_headers()` — shadow CORS implementation | LOW | Removed | No (patched) |

---

## Acceptable Drift Items

| Item | Difference | Reason | Accepted |
|------|-----------|--------|----------|
| Session killzone windows (07-11 / 12-16) vs MT5 full sessions (07-15 / 12-20) | Display-only | Killzones are for signal-entry display timing only; MT5 SessionManager uses full sessions for freshness state | ✓ Known/pre-existing |
| `post_snapshot` checks `candle_m1` key but EA sends `candle` | Very low risk | Legacy endpoint; EA uses `post_ea_market_stream()` not `post_snapshot` for live data | ✓ Pre-existing, tracked |

---

## Recommendations

1. Run `wp cron event run smc_sf_prune_tables` once manually after deploy to prune any existing backlog rows.
2. Monitor `engine_runs` and `audit_events` row counts during Phase 0 soak to validate retention windows are appropriate.
3. If production traffic is low, configure a server-side cron (`* * * * * wp-cron.php`) to ensure WP-Cron fires reliably.

---

## Verification Checklist

- [x] All 7 scan stages completed (Runtime, Wiring, Data Contracts, Freshness, Signal Engine, Migration Parity, Cleanup)
- [x] No engine logic modified — parity maintained by construction
- [x] Dead method removal verified via grep (zero post-patch references)
- [x] WP-Cron wiring verified via grep (lines 84-86, 118-130 in plugin file)
- [x] `$wpdb->prepare()` used for all SQL in pruning method — injection-safe
- [x] `gmdate()` used for UTC-safe date arithmetic in pruning method
- [x] Drift items documented and accepted
- [ ] WP-Cron event visible in production `wp_options` after deploy (pending)
- [ ] `engine_runs` row stabilisation observed in production soak (pending)

---

## Artifacts

- Bug sweep report: `.github/docs/BUG_SWEEP_REPORT_2026-05-10.md`
- Plugin file patched: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- Prior parity audit (phase-0, 2026-05-09): `.github/migration/audits/phase-0-chart-backend-authority-parity-2026-05-09.md`
