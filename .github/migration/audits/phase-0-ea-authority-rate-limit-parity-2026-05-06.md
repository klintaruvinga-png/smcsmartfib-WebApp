# Parity Audit Report - Phase 0

**Report Date**: 2026-05-06  
**Phase**: 0 - EA authority vs Twelve Data cooldown/key-state parity  
**Auditor**: Codex stabilization pass  
**Status**: PASS

---

## Executive Summary

- **Overall Parity**: 100%
- **Threshold Required**: 95%
- **Pass/Fail**: PASS
- **Trend**: Improving

This audit covered the backend truth path that decides whether a symbol is `live`, `stale`, `blocked`, or `rate-limited` after the EA became the market-data authority. The patch aligns backend behavior with the intended MT5-first contract: EA-owned symbols now surface MT5 freshness truth rather than stale Twelve Data cooldown or missing-key state.

---

## Component Parity Metrics

### Freshness / Authority (Phase 0)

| Metric | Expected Truth | Backend After Patch | Match | Accuracy |
|--------|----------------|---------------------|-------|----------|
| EA-owned symbol with stale MT5 quote + stale TD cooldown | `stale` | `stale` | YES | 100% |
| EA-owned symbol engine blocker with stale MT5 quote + stale TD cooldown | `PRICE_STALE` | `PRICE_STALE` | YES | 100% |
| All-MT5 watchlist with missing Twelve Data key | Not `blocked` | Not `blocked` | YES | 100% |
| Non-MT5 symbol with real Twelve Data cooldown | `rate-limited` | `rate-limited` | YES | 100% |
| **Freshness / Authority Score** | - | - | - | **100%** |

**Observations**: The core correction is semantic. MT5 authority is now treated as source ownership, not just momentary live tick presence, which prevents stale Twelve Data state from leaking back into EA-owned symbols.

---

### Signal / Blocker Truth (Phase 6 dependency)

| Metric | Expected Truth | Backend After Patch | Match | Accuracy |
|--------|----------------|---------------------|-------|----------|
| EA-owned stale quote blocker | MT5 stale path | MT5 stale path | YES | 100% |
| EA-owned stale quote should not emit `RATE_LIMITED` | `RATE_LIMITED` absent | `RATE_LIMITED` absent | YES | 100% |
| Non-MT5 guard on Twelve Data snapshot | `PRICE_NOT_MT5_FRESH` | `PRICE_NOT_MT5_FRESH` | YES | 100% |
| **Signal / Blocker Score** | - | - | - | **100%** |

**Observations**: No signal math changed. The parity improvement is exclusively in blocker truth and operator diagnostics.

---

## Critical Issues Found

| Issue | Severity | Count | Resolution | Blocker |
|-------|----------|-------|-----------|---------|
| EA authority mis-modeled as live-only freshness | HIGH | 1 | Fixed in health, quote, candle, and blocker paths | No |

---

## Acceptable Drift Items

| Item | Difference | Reason | Accepted |
|------|-----------|--------|----------|
| 24h/72h live soak | Not completed | Focused patch pass | YES |
| M1 -> 15min sparse-history validation | Not completed | Separate Phase 0 verification track | YES |
| Full Pine/backend/dashboard replay parity | Not recomputed | No signal math changed | YES |

---

## Recommendations

1. Keep all health-state escalation logic keyed on authority ownership first, then freshness.
2. Use the new `[smc_feed]` diagnostics to separate MT5 stale truth from Twelve Data transient issues during live soak.
3. Prioritize symbols that emit `fetch_candles.mt5_gap` in the next Phase 0 verification pass.

---

## Verification Checklist

- [x] Backend authority branch inspected and patched
- [x] Health regression covered in PHP tests
- [x] Engine blocker regression covered in PHP tests
- [x] EA ingest regression re-run successfully
- [ ] 24h/72h live soak validated
- [ ] Market-open multi-symbol validation completed
- [ ] Sparse-history aggregation verification completed

---

## Artifacts

- Bug sweep: `.github/docs/BUG_SWEEP_REPORT_2026-05-06-v2.md`
- Status board: `.github/migration-status.md`
- Backend patch: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- Regression test: `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
