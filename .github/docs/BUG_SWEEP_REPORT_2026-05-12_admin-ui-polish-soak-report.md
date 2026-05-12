# Bug Sweep Report: admin UI polish soak report

## Date

- 2026-05-12

## Issue

- `/admin` only surfaced one soak age card, had no print-focused layout guards for the soak workspace export, and allowed soak-report refresh attempts to re-enter without an explicit in-flight guard.

## Confirmed root cause

- `src/routes/admin.tsx` rendered a single `Soak age` card from `baseline_checkpoint.created_at`, so baseline/checkpoint age visibility was compressed into one summary value.
- The print stylesheet isolated `.soak-report-print-section` correctly, but it did not add print-specific block handling for the summary cards, evidence sections, or checkpoint sections.
- `refreshSoakReport()` did not guard against concurrent invocation, and the submit handlers for evidence/checkpoint actions still advanced their success path even when the follow-up soak-report refresh failed.
- `src/types/sniper.ts` does not expose a dedicated checkpoint-age field, so the dashboard cannot truthfully invent a separate backend-owned checkpoint-age source.

## Files reviewed

- `src/routes/admin.tsx`
- `src/routes/-admin.test.tsx`
- `src/types/sniper.ts`
- `src/lib/api/sniperClient.ts`

## Patch applied

- Replaced the single soak-age summary with explicit `Baseline age` and `Checkpoint age` cards in `src/routes/admin.tsx`.
- Kept backend authority intact by deriving both age displays from the existing baseline timestamp and labeling the checkpoint-age fallback explicitly until a backend checkpoint-age field exists.
- Hardened `refreshSoakReport()` with an in-flight guard and retry-loading transition, while preserving non-auth failure promotion into the soak error state.
- Blocked post-submit success messaging when the follow-up soak-report refresh fails.
- Added print-specific block classes and page-break protection for soak summary cards, operator evidence, manual evidence, and checkpoint sections.
- Extended `src/routes/-admin.test.tsx` to cover retry recovery, status-detail rendering, refresh-failure error promotion, concurrent retry blocking, and the new age labels.

## Validation run

- `npx vitest run --environment jsdom src/routes/-admin.test.tsx`
- `npm run build`

## Residual risk

- Browser print preview was not executed in-session because the local browser automation surface required for `/admin` verification was unavailable here.
- `Checkpoint age` still reuses the baseline timestamp by contract because the current backend schema does not expose a distinct checkpoint-age field.
