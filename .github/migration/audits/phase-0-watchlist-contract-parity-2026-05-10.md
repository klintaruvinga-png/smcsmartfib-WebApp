# Parity Audit Report - Phase 0

**Report Date**: 2026-05-10  
**Phase**: Phase 0 - Stabilization (Watchlist Contract + PHP Harness Stability)  
**Auditor**: Codex automated sweep  
**Status**: PASS

---

## Executive Summary

- **Overall Parity**: 100%
- **Threshold Required**: 100%
- **Pass/Fail**: PASS
- **Trend**: Stable

This audit covers a contract-only hardening patch. No Pine formulas, MT5 engines, fib math, regime classification, or signal derivation were modified. The parity change is limited to making watchlist symbol validation consistent across backend settings read/write paths and restoring PHP regression harness execution.

---

## Component Parity Metrics

### Fib Engine

| Metric | Before Patch | After Patch | Match | Accuracy |
|---|---|---|---|---|
| Fib anchors | Unchanged | Unchanged | Yes | 100% |
| Fib levels | Unchanged | Unchanged | Yes | 100% |
| LTF/HTA family mapping | Unchanged | Unchanged | Yes | 100% |
| **Fib Parity Score** | - | - | - | **100%** |

**Observations**: No fib logic touched.

---

### Regime Engine

| Metric | Before Patch | After Patch | Match | Accuracy |
|---|---|---|---|---|
| Bias classification | Unchanged | Unchanged | Yes | 100% |
| Chop gating | Unchanged | Unchanged | Yes | 100% |
| Freshness gating | Unchanged | Unchanged | Yes | 100% |
| **Regime Parity Score** | - | - | - | **100%** |

**Observations**: No regime logic touched.

---

### Signal Engine

| Metric | Before Patch | After Patch | Match | Accuracy |
|---|---|---|---|---|
| READY confirmation rules | Unchanged | Unchanged | Yes | 100% |
| Entry / SL / TP derivation | Unchanged | Unchanged | Yes | 100% |
| Backend confirmation discipline | Unchanged | Unchanged | Yes | 100% |
| **Signal Parity Score** | - | - | - | **100%** |

**Observations**: No signal-generation logic touched.

---

### Watchlist Contract

| Metric | Previous Behavior | Current Behavior | Match | Accuracy |
|---|---|---|---|---|
| `/user/watchlist/*` persistence | Supported symbols only | Supported symbols only | Yes | 100% |
| `post_user_settings()` persistence | Sanitized but unsupported symbols could persist | Supported symbols only | Yes | 100% |
| `save_watchlist()` helper | Sanitized but unsupported symbols could persist | Supported symbols only | Yes | 100% |
| `get_settings()` reload path | Corrupt unsupported symbols could rehydrate | Unsupported symbols dropped on read | Yes | 100% |
| **Watchlist Contract Score** | - | - | - | **100%** |

**Observations**: Backend symbol support is now a single-source contract across settings and watchlist routes. Alias normalization remains intact (`XAU/USD` -> `XAUUSD`).

---

## Critical Issues Found

| Issue | Severity | Count | Resolution | Blocker |
|---|---|---|---|---|
| Unsupported watchlist symbols could persist through settings paths | HIGH | 1 | Patched in plugin + regression test | No |
| PHP harnesses missing deactivation-hook stubs | MEDIUM | 6 files | Patched in tests | No |
| CORS regression expectation drift | LOW | 1 | Patched in test | No |

---

## Acceptable Drift Items

| Item | Difference | Reason | Accepted |
|---|---|---|---|
| Existing user rows containing unsupported symbols | Symbols disappear after next settings read | This is the intended correction to restore backend contract truth | Yes |
| Global frontend lint drift | Unrelated formatting failures remain | Outside this PHP-focused patch scope | Yes |

---

## Recommendations

1. Re-run the PHP regression bundle after deployment in the real WordPress runtime.
2. Spot-check a legacy account whose watchlist may contain unsupported symbols and confirm the cleaned persisted result is acceptable.
3. Schedule a separate frontend transport audit for `cacheBust` consistency across all polled GET endpoints.

---

## Verification Checklist

- [x] Watchlist read/write parity validated
- [x] MT5 contract harness executed
- [x] PHP settings/risk harness executed
- [x] CORS regression harness executed
- [x] EA market stream harness executed
- [x] TypeScript compile completed
- [ ] Historical Pine/MT5 replay expanded in this run

---

## Artifacts

- Bug sweep report: `.github/docs/BUG_SWEEP_REPORT_2026-05-10.md`
- Regression test: `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- Patched plugin: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
