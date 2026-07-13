# SMC SuperFIB Issue Research

## 1. Issue classification
- Severity: HIGH
- Category: data-contract / wiring
- Layer(s) affected: PHP-backend / REST-API / Dashboard-JS / workflow
- Phase impact: Phase 2 / Cross-phase

## 2. Confirmed evidence
- `.github/migration-status.md` documents that `/progress` route and `/user/progress` backend contract are implemented, while streak remains intentionally conservative until active-day rule approval.
- `.github/docs/BUG_SWEEP_REPORT_2026-05-20_progress-page-progress-contract.md` confirms the backend added `GET /user/progress`, returned equity pulse and milestone state, and kept streak degraded to `UNAVAILABLE` until the active-day definition is approved.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` defines `const ACTIVE_DAY_DEFINITION = 'UNRESOLVED_REQUIRES_SIGNOFF'` and `read_progress_streak()` returns `current_streak_days: 0` with `state: 'UNAVAILABLE'`.
- `src/routes/progress.tsx` explicitly renders the message: "Streak remains unavailable until the backend active-day definition is approved."
- Backend route tests in `wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php` assert `GET /user/progress` registers, uses authenticated permission callback, and keeps streak degraded while the active-day definition is unresolved.
- Frontend tests in `src/routes/-progress.page.test.tsx` verify the unavailable streak state and messaging instead of crashing.

## 3. Root cause hypothesis
- Confirmed: The backend active-day business rule is unresolved, so the progress contract intentionally degrades streak truth rather than calculating non-zero streak values.
- Confirmed: The codebase encodes this as a contract-level guard via `ACTIVE_DAY_DEFINITION = 'UNRESOLVED_REQUIRES_SIGNOFF'` and a static `read_progress_streak()` fallback.
- Hypothesis: This was introduced as a Phase 2 safety gate to avoid speculative streak values until the business rule is explicitly approved.
- Hypothesis: The issue is not a technical backend route failure, but a pending governance/signoff decision about the active-day definition.

## 4. Blast radius
- Exact files likely affected:
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php`
  - `src/routes/progress.tsx`
  - `src/lib/api/sniperClient.ts`
  - `src/hooks/useSniperData.ts`
  - `src/routes/-progress.page.test.tsx`
  - `.github/docs/BUG_SWEEP_REPORT_2026-05-20_progress-page-progress-contract.md`
  - `.github/migration-status.md`
  - `PHASE2_IMPLEMENTATION.md`
- Systems that read/write the broken component: WordPress REST backend, dashboard progress page, account telemetry persistence, engine run ingestion, and live staging validation.
- Parity surfaces at risk: Backend progress contract <-> Dashboard progress page, specifically `streak.current_streak_days`, `streak.state`, and `last_active_date`.
- Risks: stale-state and contract drift if the backend enables streak truth without a stable active-day definition; dashboard could display speculative progress that is not backed by persisted business logic.

## 5. Regression surface
- Must not change the existing equity pulse and drawdown sources on `/progress`; those still come from account telemetry contracts and `useUserAccount()` / `useUserRiskProfile()`.
- Must keep `streak.state=UNAVAILABLE` as the safe default until signoff, to avoid exposing erroneous streak data.
- Must retain `/user/progress` auth behind `permission_user` and preserve the current stale/live/unavailable freshness mapping.
- Existing guards: `PROGRESS_NOT_IMPLEMENTED` was removed from the frontend, and the current contract intentionally models unavailable streak state with a visible message.
- Covered by tests: `test-phase2-trade-telemetry.php`, `src/routes/-progress.page.test.tsx`, `src/lib/api/sniperClient.test.ts`, and migration audit reports.

## 6. Resolution path options
- Path A: Narrow correction — approve the backend active-day definition and update `read_progress_streak()` to compute `current_streak_days` from persisted engine activity only when the signoff condition is satisfied.
- Path B: Broader risk area — if the active-day rule requires more than signoff, add an explicit backend `active_day_rule_status` field and preserve the current unavailable state until full rule validation is complete.
- Recommended: Path A, because the current implementation is a deliberate contract safety gate and the issue appears to be governance signoff rather than missing endpoint wiring.

## 7. Risk flags
- High-risk system involved: Yes. This touches backend user-visible progress contract and streak truth.
- Requires parity re-validation: Yes. Backend `/user/progress` contract and Dashboard-JS progress page behavior both need re-validation.
- Migration-blocking: No. Phase 2 progress wiring is already implemented; live streak enablement is gated by rule approval.
- Human review required before merge: Yes. The active-day business rule must be signed off explicitly before enabling non-zero streak calculations.

## 8. Handoff package
- Epicentre files to inspect first:
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php`
  - `src/routes/progress.tsx`
  - `src/lib/api/sniperClient.ts`
  - `src/routes/-progress.page.test.tsx`
  - `.github/docs/BUG_SWEEP_REPORT_2026-05-20_progress-page-progress-contract.md`
- Inputs Codex must verify before planning:
  - The exact active-day definition and signoff condition.
  - Whether backend `streak.current_streak_days` should remain forced to `0` until approval.
  - Whether UI copy and unavailable-state handling should remain unchanged.
- Open unknowns:
  - Is the active-day definition a simple signoff toggle or a larger business rule requiring daily P/L and activity threshold logic?
  - Does live staging validation on `/health`, `/market-data-authority`, and `/user/progress` need to happen after signoff?
