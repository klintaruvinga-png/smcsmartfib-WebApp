# Copilot Research: SMC Intake - Watch blueprint · PATCH

## Issue summary

The backend currently blocks all WATCH signals from generating backend blueprint plans by returning `null` in `build_pending_or_confirmed_plan()` whenever `($signal['status'] ?? null) === 'WATCH'`. The frontend ranking logic already allows WATCH-grade candidates to appear if they have a plan, but the backend never emits one.

## Root cause

- In `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`, `build_pending_or_confirmed_plan()` uses a single gate that rejects WATCH signals before any plan can be built.
- The gate also bundles unconfirmed ARMED/READY plan requirements with WATCH handling, meaning WATCH signals cannot receive a separate low-confidence but visible blueprint.
- The frontend code currently expects only `frontend-preview`, `backend-blueprint`, or `pending-blueprint` plan sources in `src/types/sniper.ts`.
- `src/components/PlanCard.tsx` renders pending blueprints specially, but has no dedicated UI state for a watch-specific plan source.
- `src/routes/-plan.page.tsx` sorts candidates by verdict, backend confirmation, READY status, and plan existence; it does not distinguish watch-blueprints from other unconfirmed plans. This is a risk for top-N watchlist visibility if a watch plan is included.

## Affected files and behaviors

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `build_pending_or_confirmed_plan()` needs a split in logic so WATCH signals can return a plan with `source = 'watch-blueprint'` when backend-confirmation prerequisites are met, while ARMED/READY pending blueprints still require sweep + structural confirmation.
- `src/types/sniper.ts`
  - `TradePlan.source` should include `watch-blueprint` as a valid source value.
- `src/components/sniper/Warnings.tsx`
  - Add support for a watch-specific warning line tone and icon so watch-only blueprints are visually distinct from normal warnings or execution-blocking states.
- `src/components/PlanCard.tsx`
  - Detect `plan.source === 'watch-blueprint'` and render a dedicated `WATCH BLUEPRINT` MetaChip.
  - Display a non-executable informational warning explaining that watch blueprints are indicative only and will be replaced when a higher-quality ARMED/READY blueprint is available.
- `src/routes/-plan.page.tsx`
  - Add a plan-quality ranking helper so WATCH blueprints rank below `pending-blueprint` and confirmed/confirmed backend plans, but still persist in the top-N watchlist ordering when appropriate.

## Proposed fix summary

1. Backend: relax the WATCH guard in `build_pending_or_confirmed_plan()` so:
   - if `backend_confirmed === true`, return a confirmed plan as before.
   - if `signal.status === 'WATCH'`, return a watch blueprint when `data_live === true` and `engine_blocker === 'OK'`.
   - otherwise, for ARMED/READY unconfirmed paths, keep the existing sweep + MSS/displacement requirement and set `source = 'pending-blueprint'`.
2. Types: extend `TradePlan.source` in `src/types/sniper.ts`.
3. UI: add `watch` warning tone in `src/components/sniper/Warnings.tsx` and show a dedicated watch blueprint chip/warning in `src/components/PlanCard.tsx`.
4. Sorting: update `src/routes/-plan.page.tsx` so same-verdict candidates rank as `confirmed > backend-blueprint > pending-blueprint > watch-blueprint > no plan`.

## Important invariants

- Execution must remain blocked for watch blueprints. The current execution guard already depends on `backendConfirmed`, so a watch blueprint should not enable execution.
- The watch blueprint is intended as a read-only intelligence card for weekends / low-activity sessions and should be replaced automatically by higher-quality ARMED/READY or confirmed blueprints.
- The fix must not change the `backendConfirmed` semantics or make unconfirmed plans appear executable.

## Verification notes

- No existing `reports/copilot-research.md` file was present before this intake.
- Workflow state is now locked in `RESEARCHING` for issue `SMC Intake - Watch blueprint · PATCH`.
