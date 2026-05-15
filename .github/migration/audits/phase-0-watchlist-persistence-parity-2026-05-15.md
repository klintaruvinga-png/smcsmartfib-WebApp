# Parity Audit Report - Phase 0

**Report Date**: 2026-05-15  
**Phase**: Phase 0 - Watchlist persistence and snapshot authority  
**Auditor**: Codex  
**Status**: PASS

---

## Executive Summary

- **Overall Parity**: 100%
- **Threshold Required**: 100%
- **Pass/Fail**: PASS
- **Trend**: Stable

This audit covers a watchlist contract hardening patch only. No Pine formulas, MT5 ingress contracts, fib calculations, regime logic, or signal-generation rules were changed. The parity target for this run was backend/dashboard watchlist authority and engine snapshot invalidation consistency.

---

## Component Parity Metrics

### Fib Engine

| Metric | Before Patch | After Patch | Match | Accuracy |
|---|---|---|---|---|
| Anchor calculation | Unchanged | Unchanged | Yes | 100% |
| Fib level derivation | Unchanged | Unchanged | Yes | 100% |
| Premium/discount classification | Unchanged | Unchanged | Yes | 100% |
| **Fib Parity Score** | - | - | - | **100%** |

**Observations**: No fib logic was touched.

---

### Regime Engine

| Metric | Before Patch | After Patch | Match | Accuracy |
|---|---|---|---|---|
| Bias classification | Unchanged | Unchanged | Yes | 100% |
| Chop gating | Unchanged | Unchanged | Yes | 100% |
| Freshness gating | Unchanged | Unchanged | Yes | 100% |
| **Regime Parity Score** | - | - | - | **100%** |

**Observations**: No regime logic was touched.

---

### Signal Engine

| Metric | Before Patch | After Patch | Match | Accuracy |
|---|---|---|---|---|
| READY confirmation | Unchanged | Unchanged | Yes | 100% |
| Entry / SL / TP derivation | Unchanged | Unchanged | Yes | 100% |
| Backend confirmation discipline | Unchanged | Unchanged | Yes | 100% |
| **Signal Parity Score** | - | - | - | **100%** |

**Observations**: No signal logic was touched.

---

### Watchlist Authority

| Metric | Before Patch | After Patch | Match | Accuracy |
|---|---|---|---|---|
| `post_user_settings()` mutation response | `ok` only | `ok` + canonical `watchlist` | Yes | 100% |
| `post_user_watchlist()` response authority | Canonical array | Canonical post-persist array | Yes | 100% |
| `post_watchlist_add()` response authority | Local mutation array | Canonical post-persist array | Yes | 100% |
| `post_watchlist_remove()` response authority | Local mutation array | Canonical post-persist array | Yes | 100% |
| Dashboard watchlist cache after add/remove | Vulnerable to stale `user-settings` overwrite | Mutation response remains canonical | Yes | 100% |
| Engine snapshot invalidation | Change-based but inconsistent diagnostics | Change-based with explicit no-op warnings | Yes | 100% |
| `AUDCAD` support | Supported | Supported | Yes | 100% |
| **Watchlist Parity Score** | - | - | - | **100%** |

**Observations**: Backend persisted watchlists, mutation response bodies, and the dashboard canonical cache now stay aligned on the audited add/remove/settings paths. `AUDCAD` remained in the supported instrument registry throughout; the defect was contract drift, not symbol normalization.

---

## Critical Issues Found

| Issue | Severity | Count | Resolution | Blocker |
|---|---|---|---|---|
| `post_user_settings()` omitted the canonical watchlist response | HIGH | 1 | Patched and PHP-regression-covered | No |
| Watchlist hooks refetched `user-settings` after canonical mutation success | HIGH | 1 | Patched and Vitest-covered | No |

---

## Acceptable Drift Items

| Item | Difference | Reason | Accepted |
|---|---|---|---|
| Manual staging add/remove verification | Not executed in this run | No live WordPress/dashboard staging environment was exercised from the repo harness | Yes |

---

## Recommendations

1. Run the Account -> Live Radar add/remove `AUDCAD` flow on staging and confirm visibility changes without refresh.
2. Spot-check backend cache state after each watchlist mutation in the live WordPress runtime to confirm the `smc_sf_engine_snapshot` delete path matches the harness result.
3. Keep future watchlist changes inside the existing canonical `user-settings` cache path; do not introduce a frontend-only watchlist source.

---

## Verification Checklist

- [x] PHP watchlist regression harness executed
- [x] Vitest watchlist hook suite executed
- [x] `AUDCAD` support re-validated in backend symbol registry
- [x] Backend mutation response contract re-validated
- [x] Engine snapshot invalidation re-validated for symbol-set changes
- [ ] Manual staging add/remove flow executed

---

## Artifacts

- Bug sweep report: `.github/docs/BUG_SWEEP_REPORT_2026-05-15_watchlist-persistence-mismatch.md`
- PHP regression: `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- Frontend regression: `src/hooks/useSniperData.watchlist.test.tsx`
- Implementation summary: `reports/codex-implementation.md`
