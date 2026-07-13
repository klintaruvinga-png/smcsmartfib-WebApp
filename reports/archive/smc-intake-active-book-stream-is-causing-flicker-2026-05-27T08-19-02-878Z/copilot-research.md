# SMC Intake — Active Book stream flicker research

**Date:** 2026-05-27

### 1. Issue classification
- Severity: HIGH
- Category: stale-data / wiring
- Layer(s) affected: Dashboard-JS / REST-API / PHP-backend
- Phase impact: Phase 0

### 2. Confirmed evidence
- `src/hooks/useSniperData.ts` — separate queries: `useSnapshot()` (calls `apiClient.getSnapshot()`) and `useUserTrades()` (calls `apiClient.getUserTrades()`). Code contains explicit comments and logic that attempt to prevent flicker (e.g. `alignWatchlist`, `invalidateWatchlistQueries`) and a noted comment: "Account chip to flicker off and back on." (see watchlist mutation/invalidation logic).
- `src/lib/api/sniperClient.ts` and `sdk/src/client/SniperClient.ts` — backend surface shows distinct endpoints: `/snapshot` and `/user/trades` (internally `/positions` + `/orders`). Both use `cacheBust: true` on GETs; responses are normalized independently.
- `src/hooks/useStreamingTicks.ts` — UI-level mitigation that desynchronizes polled numeric values into sub-ticks (intended to reduce poll strobe), indicating the UI already compensates for coarse polling cadence.
- `src/routes/-book.page.tsx` — rendering of the Active Book derives `positions` from `useUserTrades()` while also consulting `snap?.prices.find(...)` and marking groups `stale` when snapshot data is stale; the page will show/hide pieces based on these two sources.
- Tests: `src/hooks/useSniperData.test.tsx` contains polling tests and explicit expectations about refresh cadence and canonical settings behaviour.

### 3. Root cause hypothesis
- Most likely root cause: UI and backend use separate, independently-updated endpoints (`/snapshot` vs `/user/trades`), and the UI logic mixes them as joint signals for rendering the Active Book. When one endpoint's response set (prices/snapshot) does not include a symbol immediately while the trades endpoint does (or vice versa), components briefly treat the symbol as missing/stale and re-render, producing visible flicker or transient disappearance.
  - Confirmed: endpoints are distinct and normalized separately in the client code (`Confirmed`).
  - Hypothesis: backend responses are sparse or returned in different sequences/timings for different symbols (e.g. snapshot may omit a recently-updated symbol while positions endpoint includes it), creating a small race window where UI will hide then show the symbol (`Hypothesis`).
  - Hypothesis: UI invalidation/refetch ordering (cancel -> setQueryData -> invalidate -> refetch) introduces short states where canonical data is replaced or missing, especially around watchlist mutations and rapid poll cycles (`Hypothesis`).

### 4. Blast radius
- Frontend files: `src/hooks/useSniperData.ts`, `src/hooks/useStreamingTicks.ts`, `src/routes/-book.page.tsx`, `src/components/sniper/*` (FreshnessBadge, Warnings, Account chip UI).
- API client surfaces: `src/lib/api/sniperClient.ts`, `sdk/src/client/SniperClient.ts` and server endpoints `/snapshot`, `/positions` (or `/user/trades`).
- Systems: Dashboard UI, Backend REST API (trade telemetry & market snapshot producers), any reconciliation jobs that assemble snapshots.
- Parity surfaces at risk: Dashboard <-> Backend signal integrity (stale/live state propagation). Any downstream features that depend on snapshot presence for UI visibility (watchlist, chips, charts).

### 5. Regression surface
- Changing the canonical source-of-truth (e.g. making snapshot authoritative) could hide legitimate positions if backend snapshots intentionally omit symbols under load.
- Weakening the existing watchlist mutation guards (which deliberately avoid immediately refetching `user-settings`) risks overwriting freshly-updated watchlist state and making UI flip symbols.
- Streaming/animation code (`useStreamingTicks`) and motion-related UI rely on sampled values; altering their timing could harm perceived responsiveness.
- Existing tests in `src/hooks/useSniperData.test.tsx` assert poll behaviour; they may fail if polling semantics change.

### 6. Resolution path options
- Path A (narrow): Treat `user-trades` (positions) as the canonical source for the Active Book UI. Render positions directly from `useUserTrades()` without gating visibility on `snapshot` membership; keep `snapshot` only for price/freshness decoration and stale warnings. This preserves numeric thresholds and is minimal frontend change surface.
- Path B (broader): Unify backend contract so `/snapshot` includes every symbol currently present in `/positions` (or provide a merged `/market-stream` that guarantees per-symbol coherence), or introduce a single server-driven stream (WebSocket/SSE) that merges trades + snapshot with per-symbol timestamps. This is larger but more robust.
- Recommended: Path A — minimal, low-risk frontend change (render positions independent of snapshot presence) while asking backend to consider Path B for longer-term stream coherence.

### 7. Risk flags
- High-risk system involved: Yes — dashboard/telemetry freshness affects user decisioning and perceived system health.
- Requires parity re-validation: Yes — ensure dashboard visuals still match backend authority after change (validate engine snapshots and trades alignment).
- Migration-blocking: No — this is a frontend/contract stability issue, not a migration gate.
- Human review required before merge: Yes — reviewer should confirm which endpoint must be canonical and verify backend semantics for omitted symbols.

### 8. Handoff package
- Epicentre files to inspect first:
  - `src/hooks/useSniperData.ts`
  - `src/routes/-book.page.tsx`
  - `src/lib/api/sniperClient.ts`
  - `sdk/src/client/SniperClient.ts`
  - `src/hooks/useStreamingTicks.ts`
- Inputs Codex must verify before planning:
  1. Backend behaviour for `/snapshot` and `/user/trades` — can `/snapshot` intentionally omit symbols and under what conditions?
  2. Timestamps/freshness semantics returned by both endpoints (per-symbol `updated_at` / `freshness` fields).
  3. Any server-side aggregation that could cause `/positions` to lag `/snapshot` or vice versa.
  4. Reproduction logs showing a poll timeline (ordered request/response times) for `/snapshot` and `/user/trades` during a flicker event.
- Open unknowns that could invalidate the hypothesis:
  - Whether the backend deliberately prunes snapshot symbol lists under load (if so, Path A might be required).
  - Whether client-side cache or query cancellation timing produces the visible gaps independent of backend content.
  - Whether there are other UI components mutating the watchlist or query cache concurrently (race conditions).
