# SMC SuperFIB - Active Book Stream Flicker Issue Research

**Date:** 2026-05-27  
**Issue:** Active Book stream is causing flickers and position/book persistance issues in between polls/refreshes

---

### 1. Issue classification

- Severity: HIGH
- Category: runtime-bug
- Layer(s) affected: Dashboard-JS / PHP-backend
- Phase impact: Phase 0 / Cross-phase

### 2. Confirmed evidence

- Runtime error reported (console): `TypeError: Cannot read properties of undefined (reading 'feedStatus')` from compiled client bundle `index-HU_NwOvP.js` (user-provided stack trace).
- Frontend: `src/routes/admin.tsx` reads `health.feedStatus` and `aggregate.health.feedStatus` without guarding that `health` (or `aggregate.health`) exists (examples: lines where `value={health.feedStatus ?? health.priceFeed}` and `Feed: {aggregate.health.feedStatus ?? aggregate.health.priceFeed}`).
- API client: `src/lib/api/sniperClient.ts` exposes `getAdminHealth()` / `fetchAdminHealth()` and expects backend `/admin/health` payload shape including `feedStatus`.
- Backend: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` provides `build_health_payload($user_id)` which returns `feedStatus` and is used by `/admin/health` and by the soak report payload (`get_soak_report()` includes `health => build_health_payload(...)`).
- Persisted snapshots / soak checkpoints: `src/routes/admin.tsx` renders checkpoint `snapshot_data` (`checkpoint.snapshot_data`) as `aggregate` and accesses `aggregate.health.*` without defensive checks — if a saved checkpoint row lacks `health`, the UI will throw.
- Repository evidence of `feedStatus` being backend-authoritative and heavily referenced in migration audits and soak reports (`.github/migration/...`, `.github/migration/audits/*`, reports mentioning `feedStatus`), indicating frontend assumes backend-provided health shape.

### 3. Root cause hypothesis

- Most likely root cause: The Admin/Soak UI assumes the saved checkpoint snapshot includes a `health` object; when `checkpoint.snapshot_data` or its `health` field is missing (e.g., a persisted snapshot row without `health` or a transient backend response), the UI attempts to read `feedStatus` from `undefined` and throws a TypeError (Confirmed: unguarded property access in `admin.tsx`).

- Why it fits: The stacktrace references compiled client code accessing `.feedStatus`; source shows multiple unguarded accesses (`health.feedStatus`, `aggregate.health.feedStatus`). Backend and snapshot persistence paths can produce objects lacking `health` (e.g., older snapshots or partial snapshot writes), which would make `aggregate.health` undefined at render time.

- Trigger/hypothesis: A saved checkpoint or a soaked snapshot in the DB missing the `health` key (either due to an earlier persistence bug, a partial save, or schema change during migration) surfaced when `AdminPage` attempted to render the soak checkpoints.

### 4. Blast radius

- Files likely affected:
  - src/routes/admin.tsx (HealthCard render and CheckpointCard render)
  - src/hooks/useSniperData.ts and other places that render `health.*` or use `engine-health` query
  - src/lib/api/sniperClient.ts (AdminHealthResponse contract)
  - wordpress/smc-superfib-sniper/smc-superfib-sniper.php (build_health_payload and snapshot persistence)
  - wordpress/class-market-data-service.php (snapshot insertion and shape)

- Systems at risk:
  - Dashboard Admin Health page (runtime crash / Engine Fault overlay)
  - Soak report export and checkpoint viewing
  - Any UI component that reads `health.*` without optional chaining

- Parity surfaces at risk: Pine <-> Backend <-> Dashboard health contract, soak-report snapshots, checkpoint persistence

- Stale-state / caching risks: If backend sometimes saves incomplete snapshot blobs, any replay of those blobs in UI may crash pages that render snapshot fields unguarded.

### 5. Regression surface

- What to preserve:
  - Backend remains the source-of-truth for `feedStatus` and related fields
  - Soak/checkpoint snapshots should include consistent, discoverable health payloads
  - UI must not crash on malformed or partial persisted snapshot data

- Existing guards to respect:
  - The backend `build_health_payload()` is the canonical payload generator (do not weaken server-side validation without replacing UI guards)
  - Tests and migration audits assume health contract exists — add tests for missing/partial snapshot_data handling rather than removing contract checks

### 6. Resolution path options

- Path A (narrow, recommended): Add defensive checks in the Dashboard UI where `health` or `aggregate.health` is read. Replace direct property access with safe access and fallbacks, e.g. `health?.feedStatus ?? health?.priceFeed ?? 'unknown'` and in checkpoint render `aggregate?.health?.feedStatus ?? aggregate?.health?.priceFeed ?? 'unknown'`. Low-risk, immediate fix that prevents runtime crash.

- Path B (broader): Harden server-side persistence to guarantee that `snapshot_data` and checkpoint blobs always include a `health` object when a checkpoint is saved. Add validation on save and a migration to repair existing DB rows that lack `health`. Medium risk (DB migration + runtime coordination).

- Path C (comprehensive): Do both: deploy UI defensive checks (Path A) immediately, then deploy a backend migration and validation (Path B) to restore contract integrity and prevent future occurrences.

### 7. Risk flags

- High-risk system involved: Yes — health/feed status touches engine and market-data surfaces used across admin and signal surfaces.
- Requires parity re-validation: Yes — validate feedStatus / engine health parity across backend, soak-reports, and frontend after fixes.
- Migration-blocking: No — this is a stabilization/runtime hardening issue (Phase 0) rather than a migration gate stop.
- Human review required before merge: Yes — backend DB changes or contract changes require review; UI defensive changes should be reviewed for UX clarity.

### 8. Handoff package

- Epicentre files to inspect first:
  - src/routes/admin.tsx (CheckpointCard + HealthCard usages)
  - src/hooks/useSniperData.ts (engine-health / admin health queries)
  - src/lib/api/sniperClient.ts (AdminHealthResponse contract)
  - wordpress/smc-superfib-sniper/smc-superfib-sniper.php (build_health_payload, get_soak_report, checkpoint persistence)
  - wordpress/class-market-data-service.php (snapshot insertion and shape)

- Inputs Codex must verify before planning:
  1. Provide one or more failing checkpoint rows (DB snapshot blob) that caused the UI crash (raw JSON from `wp_smc_sf_snapshots` or `soak_checkpoints` table).
  2. Confirm whether missing `health` is transient (a backend call returned partial object) or permanent (persisted without `health`).
  3. Confirm whether the frontend bundle version that threw is the latest source (stack trace references `index-HU_NwOvP.js`).
  4. Verify any recent changes to snapshot persistence or soak checkpoint writing that could have removed `health` from persisted blobs.

- Open unknowns that could invalidate the hypothesis:
  - Are there checkpoint rows that intentionally omit `health` for size or privacy reasons?
  - Did a recent migration alter the snapshot shape stored in the DB?
  - Is the client rendering an aggregated/rolled-up checkpoint blob that changed schema unexpectedly?

  - Phase 0 soak test harness includes position persistence checks (implied in `build_health_payload()` at smc-superfib-sniper.php)
  - No explicit regression test for position list identity across polls (currently absent)

---

## 6. Resolution path options

### Path A: Narrow fix — Implement Structural Sharing in React Query
**Scope:** Add `structuralSharing: true` to all polling queries in `useSniperData.ts`.

**Changes:**
- Line ~110: Add `structuralSharing: true` to `useSnapshot()` query config
- Line ~120: Add `structuralSharing: true` to `useUserTrades()` query config
- Line ~130+: Apply to `useLiveSignals()`, `useUserAccount()`, `useUserProgress()`, etc.

**Effect:**
- TanStack React Query will compare old vs new response structures
- If positions array content is identical, returns the old array reference
- React components will not re-render; no position flicker
- Minimal change; zero behavioral modification

**Risk:** Low. Structural sharing is a TanStack best practice and transparent to business logic.

### Path B: Medium fix — Add Client-Side Position Diffing
**Scope:** Implement custom diff logic in `useSniperData.ts` to track position changes between polls.

**Changes:**
- Add a `useRef()` to cache the previous positions array
- In `useUserTrades()` query `select()` callback, compute diff (added/removed/modified)
- Return only changed positions; preserve old reference for unchanged data
- Optionally emit a custom event or hook for animation on add/remove

**Effect:**
- Position list maintains referential stability when data is unchanged
- Newly added/removed positions can trigger targeted animations
- More control over position lifecycle (fade-in/fade-out, etc.)
- Enables tracking which positions actually changed for audit/diagnostics

**Risk:** Medium. Requires new state management; could introduce subtle diff bugs.

### Path C: Broader fix — Implement Optimistic Position Caching
**Scope:** Add a local cache layer that persists position data across polls and deduplicates based on `deterministic_key`.

**Changes:**
- Add a custom hook `usePositionCache()` that maintains a Map<deterministic_key, Position>
- On each poll, merge new positions into the cache (upsert by key)
- Return de-duped list; re-use position objects when data is unchanged
- Add a cleanup routine to remove positions that disappeared (closed/swept)

**Effect:**
- Position list reference stability even across backend cache invalidation
- Positions retain visual state across rapid re-renders
- Can implement fade-out animation for positions marked "closed"
- Positions that flicker between visible/invisible can be tracked and logged

**Risk:** Higher. Requires careful state management to avoid cache getting out of sync with backend.

### Recommended
**Path A.** The narrow fix is the highest-impact-to-effort ratio. Structural sharing in React Query is designed exactly for this use case: preventing re-renders when underlying data is unchanged. This requires only 3-4 lines added to query configs and is a known best practice. It directly addresses the volatility of array references between polls.

**If Path A does not fully resolve:** escalate to Path B to add explicit diffing for additional control over position lifecycle.

---

## 7. Risk flags

- **High-risk system involved:** Yes. Position data is the core of the Active Book feature; flickers erode user trust in data accuracy
- **Requires parity re-validation:** Yes. Position list changes should be validated against backend state; ensure no valid positions are hidden by cache bugs
- **Migration-blocking:** No. This is a Phase 0 stabilization issue, not a migration gate
- **Human review required before merge:** Yes. A reviewer should verify:
  1. Structural sharing is enabled on all polling queries (no queries missed)
  2. Test harness includes a flicker-detection check (position list should not unmount/remount on data-unchanged polls)
  3. Stale position visibility is preserved (stale positions still render, not hidden)

---

## 8. Handoff package

### Epicentre files to inspect first
- `src/hooks/useSniperData.ts` — polling query config
- `src/routes/-book.page.tsx` — book page rendering and position grouping logic
- `src/lib/api/sniperClient.ts` — position normalization and response handling
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — backend position telemetry flow

### Inputs Codex must verify before planning
1. Does TanStack React Query version support `structuralSharing`? (v5+ yes; v4 partial)
2. Are there other polling queries in the dashboard that exhibit similar flicker? (search for `refetchInterval`)
3. Is position `id` field stable across backend updates, or can it change? (check backend deterministic_key logic)
4. What is the current behavior when positions transition between `live` → `stale` → `live`? (trace state changes in test runs)
5. Is there a test harness that validates position list identity across polls?

### Open unknowns
1. Does the backend sometimes return duplicate positions in the same poll response?
2. Are there race conditions where a position is added and then immediately removed across consecutive polls?
3. Does the market authority switching (MT5 → Twelve Data) cause query cache invalidation?
4. How long does it typically take for a position state to transition from LIVE → STALE in production?
5. Are there existing bug reports or telemetry data about position flicker frequency and triggers?
