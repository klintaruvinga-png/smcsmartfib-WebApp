## Issue summary

`/live-signals` exposed raw engine snapshot signals, allowing transient `WATCH` output and stale/blocker noise to appear as display cards instead of reading a backend-owned durable display board.

## Root cause implemented

Implemented a backend live signal board arbiter backed by `smc_sf_signals`. Engine runs and live-signal polls now reconcile only eligible backend `ARMED`/`READY` signals with `engineBlocker=OK`, hide current stale/blocker symbols, and read `/live-signals` from durable rows instead of raw snapshot signals.

## Exact files changed

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — replaced raw snapshot reads in `get_live_signals()`, added display-board reconciliation/reader helpers, and moved signal persistence behind eligibility checks.
- `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` — updated live-signal contract coverage to seed durable `smc_sf_signals` rows, reject raw `WATCH` snapshot output, preserve stable envelope fields, and reject persisted rows with current blocker diagnostics.
- `reports/codex-implementation.md` — recorded implementation details and verification results.
- `reports/codex-implementation.meta.json` — recorded the implementation metadata and current plan hash required by the pipeline validator.
- `.github/docs/BUG_SWEEP_REPORT_2026-05-31_signal-persistence-arbiter.md` — documented runtime integrity findings and regression coverage.
- `.github/migration/audits/phase-5-backend-live-signal-board-parity-2026-05-31.md` — documented backend/dashboard parity re-validation.

## Tests run

- Red check: `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` failed before production code changes because raw snapshot `WATCH` output was returned.
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` — passed.
- `npm test -- --run src/lib/api/sniperClient.test.ts src/hooks/useSniperData.test.tsx src/routes/-signals.page.test.tsx src/routes/-plan.test.tsx` — failed because the root package has no `test` script.
- `npx vitest run src/lib/api/sniperClient.test.ts src/hooks/useSniperData.test.tsx src/routes/-signals.page.test.tsx src/routes/-plan.test.tsx` — passed, 4 files / 44 tests.
- `npm run typecheck` — failed because the root package has no `typecheck` script.
- `npx tsc --noEmit` — failed on existing `vite.config.ts` typing: `test` is not accepted by `LovableViteTanstackOptions`.
- `npm run build` — passed.
- `npm run validate:impl` — passed.

## Reports generated

- `reports/codex-implementation.md`
- `reports/codex-implementation.meta.json`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-31_signal-persistence-arbiter.md`
- `.github/migration/audits/phase-5-backend-live-signal-board-parity-2026-05-31.md`

## Remaining risks

Manual live API polling and MT5 candidate replay are still pending. Direct TypeScript verification remains blocked by the existing `vite.config.ts` type mismatch, although the production Vite build passed. The patch intentionally does not add a new display-signals table or backend top-N cap.

## Any contract ambiguities resolved during implementation

The contract required stale/blocker diagnostics to remove persisted board rows even when `get_live_signals()` serves a cached snapshot. I used the smallest safe interpretation: `get_live_signals()` still calls `ensure_engine_snapshot()` first, then reconciles only the current snapshot diagnostics into the durable board before reading it. Eligible signal upserts remain engine-run owned, and raw snapshot signals are never returned as a fallback.
