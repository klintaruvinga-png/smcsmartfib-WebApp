## Issue summary

Admin Health crashed when the route rendered a checkpoint snapshot or helper path that assumed a `health` container existed and then dereferenced `feedStatus`/related fields from `undefined`.

## Root cause implemented

Added a private display resolver in `src/routes/admin.tsx` so backend-health cards, baseline hydration/defaults, checkpoint summaries, and soak markdown/export all read optional or partial health payloads through one conservative fallback policy instead of directly dereferencing nested fields.

## Exact files changed

- `src/routes/admin.tsx`
- `src/routes/-admin.test.tsx`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-27_admin-health-feedstatus-typeerror.md`
- `reports/codex-implementation.md`
- `reports/codex-implementation.meta.json`

## Tests run

- `npx vitest run src/routes/-admin.test.tsx src/lib/api/sniperClient.test.ts`
- `npm run validate:impl`

## Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-27_admin-health-feedstatus-typeerror.md`
- No parity audit required by this contract.

## Remaining risks

Manual browser verification against a known malformed checkpoint row is still pending, and the patch intentionally does not backfill historical snapshot rows or change backend payload contracts.

## Any contract ambiguities resolved during implementation

Used the smallest safe interpretation that the production crash is caused by a missing parent `health` container, not by a missing `feedStatus` field alone, so the patch stays limited to frontend null guards in `src/routes/admin.tsx` plus targeted route regressions.
