# Issue summary

SMC Intake plan cards could flicker or lose pending blueprint continuity when live signal and ladder query observers entered pending-without-data states during polling.

# Root cause implemented

Added TanStack Query v5 observer-level previous-data continuity for the backend-owned live signal and ladder queries using `keepPreviousData`, preserving existing query keys, polling cadence, stale-time behavior, diagnostics, and backend authority.

# Exact files changed

- `src/hooks/useSniperData.ts` - imported `keepPreviousData` and added `placeholderData: keepPreviousData` to `useLiveSignals()` and `useLadders()`.
- `src/hooks/useSniperData.test.tsx` - exposed `keepPreviousData` through the React Query mock, added the `useLiveSignals()` continuity assertion, and added `useLadders()` query option coverage.
- `reports/codex-implementation.md` - recorded implementation scope and verification status.
- `reports/codex-implementation.meta.json` - added validator-required implementation metadata tied to the current plan hash.
- `.github/docs/BUG_SWEEP_REPORT_2026-05-31_smc-intake-query-continuity.md` - recorded runtime-integrity sweep results for the query continuity patch.

# Tests run

- `npx vitest run src/hooks/useSniperData.test.tsx` - RED before implementation: failed because `placeholderData` was absent from `useLiveSignals()` and `useLadders()`.
- `npx vitest run src/hooks/useSniperData.test.tsx` - passed, 10 tests.
- `npx vitest run src/routes/-plan.test.tsx` - passed, 22 tests.
- `npm run validate:impl` - first run failed because `reports/codex-implementation.meta.json` was missing.
- `npm run validate:impl` - passed after adding the required metadata file.

# Reports generated

- `reports/codex-implementation.md`
- `reports/codex-implementation.meta.json`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-31_smc-intake-query-continuity.md`
- Parity audit not required by contract.

# Remaining risks

Manual slow-network, dashboard soak, and candle-boundary observation require a real or staging backend and have not been performed in this local implementation pass. Legitimate backend signal ID changes at candle boundaries may still cause a pending or no-blueprint state until matching backend ladders arrive.

# Any contract ambiguities resolved during implementation

The research report cited `src/routes/-plan.page.test.tsx`, while the hardening contract confirmed the actual test path is `src/routes/-plan.test.tsx`; no route file or route test edits were made because the implementation contract scoped this patch to hook options and hook tests.
