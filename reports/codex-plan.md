# Gemini Implementation Plan: PR #395 Frontend Cleanup & Compatibility Patch

### 1. Issue validation


- **Confirmed**: Backend provenance metadata (`sourceDetail`, `feed_key`, `source_count`) was being exposed in the `Live Radar` UI.
- **Confirmed**: Users should see a stable, unified frontend without broker-specific or source-specific labels.
- **Confirmed**: Compatibility with the SDK and other internal tools must be maintained by keeping the fields in the types.

### 2. Implementation contract


#### File: `src/types/sniper.ts` & `sdk/src/types/index.ts`

- **Change (Option B)**: Keep `sourceDetail`, `feed_key`, and `source_count` in the `PairPrice` interface for compatibility.
- **Change**: Mark these fields with "BACKEND INTERNAL" comments to indicate they are not for UI rendering.

#### File: `src/routes/-live.page.tsx`

- **Change**: Remove the rendering logic that displayed "Shared market quote" and "N sources".

#### File: `src/lib/api/sniperClient.ts` & `sdk/src/client/SniperClient.ts`

- **Change**: Ensure normalization logic preserves these fields for internal use while marking them as internal.

#### File: `src/routes/-live.page.test.tsx`

- **Change**: Add a regression test to ensure that backend/internal provenance metadata is NOT rendered on public live radar cards.

### 3. Patch sequence

1. **Type Hardening**: Update types with internal markers (Option B).
2. **UI Cleanup**: Remove provenance rendering from `LivePage`.
3. **API Normalization**: Ensure client-side normalization preserves fields but respects internal status.
4. **Regression Testing**: Add/Update tests to assert non-rendering of metadata.

### 4. Regression guards

- Verify that `npm run build` still passes (no breaking type changes).
- Ensure `source_count` and other fields are still available in the `PairPrice` object for potential (future) non-UI logic.
- Run grep scans to confirm no matches in user-facing render paths.

### 5. Non-goals

- Implementing full backend NY-normalized authority (this is a follow-up).
- Changing any backend logic in this PR.
- Removing fields from the SDK (transparency for power users/SDK consumers is preserved).

### 6. Risk assessment

- **Risk**: Removing fields from types might break other consumers.
- **Mitigation**: Chose Option B (keep fields, mark internal) to ensure maximum compatibility.

### 7. Test requirements

- **New Test**: `src/routes/-live.page.test.tsx` -> "does not render backend/internal provenance metadata on public live radar cards"
- **Grep Scan**: Confirm no rendering of `Shared market quote` or `sources` in `src/routes` and `src/components`.

### 8. Implementation handoff

- **Branch naming**: `fix/price-feed-stability` (current)
- **Commit grouping**: 
  - `fix(ui): remove backend provenance metadata from live radar`
  - `chore(types): mark metadata fields as internal for compatibility`
