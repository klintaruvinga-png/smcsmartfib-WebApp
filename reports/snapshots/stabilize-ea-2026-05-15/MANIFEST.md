# Snapshot Archive for stabilize-ea-2026-05-15

**Workflow**: stabilize-ea-2026-05-15  
**Branch**: claude/nice-fermat-WxJFl  
**Run Date**: 2026-05-15  
**Stack Version**: v13.0.3

---

## Initial State

- **File**: INITIAL-20260515T040000Z.json
- **Timestamp**: 2026-05-15T04:00:00Z
- **Branch**: claude/nice-fermat-WxJFl
- **Commit**: a237db766c30b8fe6102cc22267d2921717e3f2e
- **Uncommitted changes**: 0

## Findings

- **File**: FINDINGS-20260515T041000Z.json
- **Issues found**: 3 confirmed (1 medium BUG-001, 2 low BUG-002/003), 5 informational PASS, 3 migration blockers
- **Key finding**: `quote_time` alias and `candles[]` array not supported; canonical REST contract diverged from handler

## Pre-Patch

- **File**: PRE-PATCH-20260515T042000Z.json
- **Rollback tag**: `rollback/stabilize-ea-2026-05-15-before-patches`
- **Rollback command**: `git reset --hard a237db766c30b8fe6102cc22267d2921717e3f2e`

## Patch Snapshots

- **File**: AFTER-PATCH-1-20260515T043000Z.json
- **Commit**: 696d9a7b0fb2968f50ff42bfcdca50fe96633b67
- **Tag**: `rollback/stabilize-ea-2026-05-15-after-patch-1`
- **Patches**: PATCH-1 (quote_time alias + candles[] shim + audit fix + docblock), PATCH-2 (docblock), PATCH-3 (regression tests 12–14)

## Final State

- **File**: FINAL-20260515T044000Z.json
- **Commit**: 696d9a7b0fb2968f50ff42bfcdca50fe96633b67
- **Ready for deployment**: YES (pending merge + EA restart + live validation soaks)

---

## Rollback Points

| Name | Tag | Commit |
|------|-----|--------|
| Initial state | `snapshot/stabilize-ea-2026-05-15-start-20260515T040000Z` | a237db7 |
| Before patches | `rollback/stabilize-ea-2026-05-15-before-patches` | a237db7 |
| After Patch 1 | `rollback/stabilize-ea-2026-05-15-after-patch-1` | 696d9a7 |

---

## Reports Generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-15.md`
- `.github/migration/audits/phase-0-mt5-ea-market-stream-parity-2026-05-15.md`
- `reports/snapshots/stabilize-ea-2026-05-15/MANIFEST.md` (this file)
