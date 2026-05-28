# Phase 4 Timeframe Contract Correction

**Date**: 2026-05-28  
**Phase**: 4 - Fib Engine Migration  
**Status**: Active correction addendum for the current Phase 4 gate

---

## Correction Summary

- Superseded runtime contract: `M15/H1/D1`
- Corrected runtime contract: `M15/H1/H4/D1`
- Reason: `H4` is part of the `SMC_SuperFib_v13.1.3.pine` source-of-truth Phase 4 fib matrix and must be present at MT5 emission, backend ingestion, validator coverage, test coverage, and operator gate review.

## Count Changes

- Fib rows per symbol: `96 -> 128`
- Required validator tuples: `288 -> 384`
- PHP parity fixture cases: `9 -> 12`
- Required `(symbol,timeframe,family)` groups: `18 -> 24`

## Operator Acceptance Criteria

- Export coverage must include `EURUSD`, `USDJPY`, and `XAUUSD`.
- Each export must include `M15`, `H1`, `H4`, and `D1`.
- Each `(symbol, timeframe, family)` group must contain the canonical 16 ratios.
- Gate-closeout evidence now requires `384` rows across `24` `(symbol,timeframe,family)` groups.

## Historical Artifact Handling

- The 2026-05-25 and 2026-05-27 logs remain valid as pre-correction evidence for what was deployed and observed at that time.
- Historical artifacts that captured `levels_written=96`, `288/288`, or `M15/H1/D1` are not rewritten as if `H4` had already been present.
- Active trackers and current operator logs must link to this addendum when they reference the superseded contract.

## Active Artifacts Superseded By This Note

- `PHASE4_IMPLEMENTATION.md`
- `PHASE4_TESTING_GUIDE.md`
- `reports/fib-parity-validation.md`
- `.github/migration-status.md`
- `.github/migration/phase-updates/phase4-next-actions-checklist-2026-05-27.md`
- `.github/migration/phase-updates/phase4-live-soak-started-2026-05-27.md`
- `.github/migration/phase-updates/phase-4-30-day-2026-05-27.md`
- `.github/migration/phase-updates/phase4-implementation-started-2026-05-25.md`

## Implementation Notes

- This correction does not authorize Pine formula changes.
- This correction does not weaken backend authority, stale-data protections, or validator thresholds.
- New live gate evidence must be collected after the corrected MT5 build emits `H4` and the backend confirms `levels_written=128`.
