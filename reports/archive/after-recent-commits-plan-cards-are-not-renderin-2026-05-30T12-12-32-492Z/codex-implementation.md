# Issue summary

Plan cards were not rendering because the plan page only renders `PlanCandidateCard` entries when current watchlist signals have matching backend ladder plans by `signal.id` to `TradePlan.signalId`. When `/ladders` was empty or returned non-matching IDs, the UI fell into plain diagnostic text without clearly separating an empty ladder response from a signal-ID contract mismatch.

# Root cause implemented

The implementation preserves backend ladder authority and hardens the frontend contract around it:

- `src/routes/-plan.page.tsx` now exposes mismatch diagnostics when ladders exist but none match the current watchlist candidate signal IDs.
- `src/lib/api/sniperClient.ts` now rejects malformed live `/ladders` payloads that are not arrays instead of returning an unusable non-array value.
- `src/hooks/useSniperData.ts` now applies the existing dev-only polling re-enable diagnostic to the ladders query, matching the live polling pattern.

# Exact files changed

- `src/routes/-plan.page.tsx`: added watchlist candidate ID diagnostics, matched ladder count, and the explicit `No ladder signal IDs match current watchlist candidates` warning.
- `src/routes/-plan.test.tsx`: added regression coverage for ladders that exist but do not match the current watchlist candidate IDs.
- `src/lib/api/sniperClient.ts`: added `/ladders` array response validation.
- `src/lib/api/sniperClient.test.ts`: added malformed `/ladders` response contract coverage.
- `src/hooks/useSniperData.ts`: added `LADDERS_POLL` dev diagnostic through the existing polling diagnostic helper.
- `reports/codex-implementation.md`: implementation handoff artifact.
- `reports/codex-implementation.meta.json`: implementation metadata artifact.

# Tests run

- `npx vitest run src/routes/-plan.test.tsx`
  - Result: passed, 21 tests.
- `npx vitest run src/lib/api/sniperClient.test.ts`
  - Result: passed, 8 tests.
- `npm run build`
  - Result: passed.
  - Note: Vite reported the existing chunk-size warning for large bundles.

# Reports generated

- `reports/codex-implementation.md`
- `reports/codex-implementation.meta.json`

# Remaining risks

- Live backend verification was not executed in this local run. The required operational check remains comparing authenticated `/wp-json/sniper/v1/live-signals` signal IDs against `/wp-json/sniper/v1/ladders` `signalId` values for at least one active watchlist symbol.
- The patch does not create frontend fallback plans. If the backend produces no ladders, the page correctly remains diagnostic-only.

# Any contract ambiguities resolved during implementation

- A valid `/ladders` live response is an array of backend `TradePlan` objects. Non-array responses are contract failures and now throw `/ladders: backend response missing ladder array`.
- Plan cards remain gated by exact `SignalCandidate.id` to `TradePlan.signalId` matching. Symbol-only matching is intentionally not used because it could render a stale or unrelated backend plan.
