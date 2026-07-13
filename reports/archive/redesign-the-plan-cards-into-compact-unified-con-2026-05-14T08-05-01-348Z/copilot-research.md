# Research: Plan page compact card redesign with top 3 watchlist candidates

### 1. Issue classification
- Severity: MEDIUM
- Category: Dashboard-JS / UI contract
- Layer(s) affected: `src/routes/plan.tsx`, tests, existing watchlist-aware signal selection
- Phase impact: Phase 0

### 2. Confirmed evidence
- `src/routes/plan.tsx` currently renders a single hero candidate, not the top 3 candidates.
- The page currently sorts deduplicated signals by the existing verdict metric and then resolves one winner through a fallback chain of successive `find(...)` calls.
- `src/routes/signals.tsx` already uses canonical watchlist semantics via `useCanonicalWatchlist()`.
- The new mockup is now available and the design blocker is resolved by the textual contract below.
- The user confirmed ranking is simply by the same letter/verdict metric already used now.

### 3. Root cause hypothesis
- Confirmed: the current plan page was built as a single-candidate hero view and has not been updated for a compact top-3 watchlist layout.
- Confirmed: the previous contract blocker about missing image/mockup is resolved.
- Confirmed: the previous contract blocker about undefined ranking behavior is resolved. Ranking should use the existing letter/verdict metric already present in `plan.tsx`.
- Safe implementation assumption: candidates without an associated ladder/plan should not render as full plan cards on the plan page, because the page is an execution-plan surface and should not fabricate plan values.

### 4. Blast radius
- Primary file: `src/routes/plan.tsx`
- Supporting files likely in scope: `src/routes/-plan.test.tsx`
- Existing watchlist behavior should be mirrored from `signals.tsx`, not reinvented.
- Backend authority, execution CTA behavior, ladder data, and plan math must remain unchanged.

### 5. Regression surface
- Preserve current backend-confirmed vs frontend-computed warnings.
- Preserve incomplete-plan warnings when a candidate has a blueprint but the plan is incomplete.
- Preserve existing execution button wiring and backend execution endpoint behavior.
- Do not change verdict generation, ladder calculations, or API contracts.

### 6. Resolution path
- Convert the current single-winner selection into a stable ranked candidate array.
- Filter candidates to the current canonical watchlist.
- Rank by the existing verdict/letter metric already used on the page.
- Prefer candidates with real plan/blueprint data for rendering.
- Render up to 3 compact stacked plan cards using one unified container design per candidate.

### 7. Risk flags
- Highest risk is UI drift that obscures backend truth or execution status.
- Secondary risk is changing candidate selection semantics beyond the user-confirmed ranking rule.
- Human review before merge is still appropriate because this is a visible plan-page redesign.

### 8. Handoff package
- Exact design contract for the new card:
  - One compact container per candidate, visually matching the uploaded mockup’s dense institutional layout.
  - Header must include verdict badge, symbol, direction badge, status badge, live/freshness badge, signal id, relative time, and small source/family pills.
  - A compact mid-strip must show current price, backend/source chip, and backend-confirmation chip.
  - Entries section must show E1/E2/E3 with Entry, Lot Sizing, SL, and TP columns.
  - Targets section must show TP1/TP2/TP3 with RR values.
  - Stop & Risk section must show SL, risk, and drawdown impact using backend-authoritative values.
  - Ladder Status section must show state and current E1/E2/E3 status chips if supported by existing data.
  - Footer must preserve the current send-to-execution behavior and keep the copy compact.
- Ranking contract:
  - Use the existing letter/verdict metric already used in `plan.tsx` as the primary rank.
  - Convert current single-candidate fallback behavior into a stable full-array ranking, then take the top 3.
  - Safe tie-break order:
    1. higher existing verdict rank
    2. `backendConfirmed=true` over `false`
    3. `status === "READY"` over lower states
    4. candidate with ladder/plan over candidate without one
    5. preserve existing relative order if still tied
- Inclusion contract:
  - Only current canonical watchlist candidates are eligible.
  - Render only candidates that have a ladder/plan object.
  - If fewer than 3 eligible watchlist candidates have plans, render fewer than 3 cards.
  - Do not fabricate placeholder plan values for candidates with no blueprint.
- Tests required:
  - prove watchlist scoping
  - prove top-3 limit
  - prove ranking is full-array and verdict-led
  - prove candidates without plan objects are excluded from rendered cards
  - preserve incomplete-plan warning behavior
