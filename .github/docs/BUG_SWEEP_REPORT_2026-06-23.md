# Bug Scan Report - Phase 4

**Report Date**: 2026-06-23  
**Phase**: Phase 4 Fib Parity  
**Scanner**: npm run bug-scan  
**Scan Duration**: Pre-fix run timed out after 124s; post-fix run completed in 64s

---

## Summary

- **Total Issues Found**: 2
- **Critical Issues**: 1
- **High Priority Issues**: 1
- **Medium Priority Issues**: 0
- **Low Priority Issues**: 0
- **Test Coverage**: Focused automation contract test added for bug-scan/parity dry-run script behavior

---

## Critical Issues (Blocks Phase Transition)

| Issue | Component | Root Cause | Impact | Blocker | Corrective Action |
|-------|-----------|-----------|--------|---------|-----------------|
| Phase 4 dry-run parity blocked by stale candle inputs | `data/*_M15.json`, `scripts/generate-pine-levels-v13.cjs` | Existing MT5 levels are timestamped 2026-06-18, but M15 candle files close on 2026-06-04 | Pine reference generator fails freshness guard before parity comparison | Yes | Refresh/export current M15 candles and rerun `npm run parity:dry` |

---

## High Priority Issues (Slows Progress)

| Issue | Component | Root Cause | Impact | Blocker | Corrective Action |
|-------|-----------|-----------|--------|---------|-----------------|
| Fragile symbol-normalization regex pattern still present | `wordpress/smc-superfib-sniper.php` | `preg_replace('/[^A-Z0-9]/', ...)` pattern is still used in multiple locations | May normalize symbols too broadly and hide symbol-specific lot/parity behavior | No | Replace with the repo-approved symbol normalization helper in a dedicated WordPress backend slice |

---

## Parity Drift Alerts

| Engine | Previous % | Current % | Trend | Status | Action |
|--------|-----------|----------|-------|--------|--------|
| Fib (Phase 4) | Unknown | Not computed | Flat | FAIL | Refresh stale candle files, then rerun `npm run parity:dry` |
| Regime (Phase 5) | N/A | N/A | N/A | N/A | Not in scope for this scan |
| Signal (Phase 6) | N/A | N/A | N/A | N/A | Not in scope for this scan |

---

## Test Failure Summary

| Test | Phase | Status | Error | Frequency |
|------|-------|--------|-------|-----------|
| `npm run parity:dry` inside bug scan | 4 | FAIL | `FAIL: stale candles in EURUSD_M15.json` | Consistent with current local data |
| Fragile pattern scan | 0/4 | FAIL | `preg_replace('/[^A-Z0-9]/', ...)` found in `wordpress/smc-superfib-sniper.php` | Consistent |

---

## Blocker Assessment

**Blocks Current Phase**: Yes  
**Blocks Phase N+1 Transition**: Yes  
**Timeline Impact**: Data refresh required before parity can be measured  
**Risk Level**: CRITICAL

---

## Recommended Priority Order

1. Refresh/export current M15 candle files for EURUSD, USDJPY, and XAUUSD, then rerun `npm run parity:dry`.
2. Replace fragile WordPress symbol normalization patterns with the approved helper in a focused backend patch.
3. Keep `scripts/bug-scan.ps1` bounded to source roots so scheduled scans continue to finish.

---

## Verification Criteria for Fix

For each issue above:
- [x] Bug-scan script code change deployed locally
- [x] Focused regression test passed: `node ./node_modules/vitest/vitest.mjs run --config vitest.config.mts scripts/bug-scan.test.mjs`
- [x] No recurrence of the parity dry-run `Argument types do not match` crash
- [ ] Parity re-validated after candle data refresh
- [x] Artifacts stored in `reports/`

---

## Attachments

- Pre-fix output: `reports/bug-scan-pre-fix-2026-06-23.txt`
- Post-fix bug scan output: `reports/bug-scan-post-fix-2026-06-23.txt`
- Post-fix parity dry-run output: `reports/parity-dry-post-fix-2026-06-23.txt`
