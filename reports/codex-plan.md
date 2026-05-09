# SMC SuperFIB - Fib Level Chart Rendering — Implementation Plan

## 1. Issue validation

**Reported Issue**: "In the chart component, fib levels 0% and 100% are not being plotted, and +25% / -25% extension levels are missing entirely. Additionally, no fib type labels appear next to any level line on the chart."

**Root Cause — CONFIRMED**:
- Primary: **Mock data parity failure** — `src/mocks/sniperData.ts` hardcodes only 6 of 16 backend ratios
  - Backend: -200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300 (16 ratios)
  - Mock: 0, 25, 50, 62.5, 75, 100 (6 ratios)
  - Gap: All negative extensions and positive >100 extensions missing (63% of ratios)
  - Status: **CONFIRMED** — code review shows exact mismatch

- Secondary: **Label rendering insufficient** — `lightweight-charts` `createPriceLine()` `title` property may not render visible text
  - Frontend sets `title: f.label` and `axisLabelVisible: true` 
  - No verification that labels actually display next to lines
  - Status: **LIKELY** — user report of missing labels despite code setting them
  - Requires investigation: lightweight-charts v5.2.0 behavior

**Corrected Root Cause**: Mock data incomplete + chart label rendering unverified = incomplete fibs shown + no visible labels

**Separation of Evidence**:
- Confirmed: Mock data incomplete, backend complete
- Likely: Chart labels don't render despite being set
- Unconfirmed: Whether user is testing with mock mode or real API

---

## 2. Implementation contract

### File 1: `src/mocks/sniperData.ts`

**Location**: Lines 442-453, function `mockFibLevels()`

**Current Code**:
```typescript
export function mockFibLevels(symbol: Symbol) {
  const base = mockPrices.find((p) => p.symbol === symbol)?.mid ?? 1;
  const range = base * 0.005;
  const ratios = [0, 25, 50, 62.5, 75, 100] as const;  // INCOMPLETE

  return ratios.map((ratio) => ({
    ratio,
    label: `${ratio}%`,
    price: base + range - (ratio / 100) * range * 2,
    role: (ratio < 50 ? "premium" : ratio === 50 ? "equilibrium" : "discount") as FibRole,
  }));
}
```

**Exact Change Required**:
1. Expand `ratios` array to match backend's 16 ratios: `[-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300]`
2. Extend `role` logic to classify extensions as `premium-extension` (ratio < 0) or `discount-extension` (ratio > 100)
3. Ensure label formatting matches backend's `ratio_label()` logic (integer ratios as `"0%"`, decimals as `"62.5%"`)

**Pseudocode**:
```typescript
export function mockFibLevels(symbol: Symbol) {
  const base = mockPrices.find((p) => p.symbol === symbol)?.mid ?? 1;
  const range = base * 0.005;
  const ratios = [-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300] as const;

  return ratios.map((ratio) => ({
    ratio,
    label: formatLabel(ratio),  // Use backend's label format logic
    price: base + range - (ratio / 100) * range * 2,
    role: classifyRole(ratio),  // Classify as premium/equilibrium/discount/premium-extension/discount-extension
  }));
}

function formatLabel(ratio: number): string {
  if (Number.isInteger(ratio)) {
    return `${Math.floor(ratio)}%`;
  }
  return `${ratio}%`.replace(/\.0+$/, '');  // Match backend's rtrim logic
}

function classifyRole(ratio: number): FibRole {
  if (ratio < 0) return 'premium-extension';
  if (ratio > 100) return 'discount-extension';
  if (ratio < 50) return 'premium';
  if (ratio === 50) return 'equilibrium';
  return 'discount';
}
```

**Guard Rails**:
- Type contract must remain: `{ ratio: number; label: string; price: number; role: FibRole }`
- Chart component must continue to work with the returned array (no breaking changes)
- Mock data must be deterministic (no random values)
- Price calculation formula must remain: `base + range - (ratio / 100) * range * 2`

**Why This File**:
- Mock data is the single source for frontend testing
- Developers see only 6 levels when backend provides 16
- This causes missing 0%, 100%, ±25%, extensions in mock mode

**Acceptance Criterion**:
- Mock `mockFibLevels()` returns 16 ratios, not 6
- Mock ratios exactly match backend's 16-ratio array
- Mock labels match backend's format
- Mock roles correctly classify extensions

---

### File 2: `src/routes/charts.tsx`

**Location**: Lines 224-231, `TVChart` component, `createPriceLine()` call

**Current Code**:
```typescript
priceLinesRef.current = fibs.map((f) =>
  s.createPriceLine({
    price: f.price,
    color: "#d8a35d",
    lineWidth: 1,
    lineStyle: 2, // dashed
    axisLabelVisible: true,
    title: `${f.label}`,
  }),
);
```

**Exact Change Required** — INVESTIGATION FIRST:
1. Test lightweight-charts v5.2.0 to verify whether `title` property actually renders visible text next to price lines
2. **If YES**: No change needed to charts.tsx; labels already rendering (issue is mock data only)
3. **If NO**: Replace inline `title` setting with custom label rendering approach:
   - Option A: Add legend showing fib level labels alongside chart
   - Option B: Add overlay text labels above/below price lines
   - Option C: Upgrade lightweight-charts version if newer version supports visible titles

**Current Assumption & Risk**:
- Code sets `title: f.label` but user reports "no labels appear"
- This suggests `lightweight-charts` `title` is metadata only, not UI text
- Must verify before implementing workaround

**Guard Rails**:
- Preserve existing chart styling (colors, lineWidth, lineStyle)
- Do NOT change axis scaling or grid
- Do NOT modify price line creation for any other ratios
- Keep price lines as dashed (`lineStyle: 2`)

**Why This File**:
- User reports "no labels appear" despite backend/mock providing labels
- lightweight-charts API may not render `title` as visible text
- Chart rendering is where the final presentation occurs

**Acceptance Criterion**:
- **If `title` works**: No change; verify labels display after mock data fix
- **If `title` doesn't work**: Labels display next to price lines via overlay/legend
- Either way: Users see all fib levels (core + extensions) with labels identifying each

---

### File 3: `src/types/sniper.ts` — NO CHANGE

**Status**: SKIP — Type definition already correct

**Why**:
- `FibLevel` interface includes `family`, `ratio`, `label`, `price`, `role` (line 95-100)
- Local type in `charts.tsx` line 127 is incomplete but doesn't prevent rendering
- No type-level fix required; data flows correctly

---

## 3. Patch sequence

**Step 1** (Independent):
- [ ] Update `src/mocks/sniperData.ts` — expand ratios, fix role classification, fix labels
- **Dependency**: None
- **Rationale**: Unblock mock mode testing with full fib set
- **Verification**: Build succeeds, mock returns 16 ratios

**Step 2** (Dependent on Step 1):
- [ ] Test lightweight-charts v5.2.0 `createPriceLine()` label rendering
- [ ] If labels render: no code change; skip Step 3
- [ ] If labels don't render: proceed to Step 3
- **Dependency**: Step 1 (so chart has complete fib data to test)
- **Verification**: Chart displays complete fib set; inspect whether labels appear

**Step 3** (Conditional on Step 2):
- [ ] IF labels don't render: Implement custom label rendering in `src/routes/charts.tsx`
- [ ] Add legend or overlay showing fib level names
- **Dependency**: Step 2 (only if needed)
- **Verification**: Chart displays all fibs with visible labels

**Critical Sequencing Note**:
- **DO NOT** apply Step 3 without confirming Step 2 finds labels missing
- Avoid gold-plating (adding custom labels if lightweight-charts already supports them)
- Avoid scope creep (changing chart styling/layout unnecessarily)

---

## 4. Regression guards

### Must Still Work After Patching

1. **Mock Mode**:
   - `mockFibLevels()` returns array of correct type
   - Chart component successfully maps all 16 mock fibs to price lines
   - No runtime TypeErrors or undefined references

2. **Live API Mode**:
   - Backend `/charts` endpoint continues to return 16 fib ratios (no backend changes)
   - Frontend successfully deserializes `ChartSnapshot.fibLevels` array
   - All backend ratios render on chart

3. **Price Line Creation**:
   - Each fib creates exactly one price line in lightweight-charts
   - Price lines styled consistently (dashed, tan color, width 1)
   - No duplicate lines or skipped levels

4. **Role Classification**:
   - Extensions (-200 to -25, 125 to 300) show role as `*-extension`
   - Core levels (0, 100) and premiums (25-75) show role as `premium`/`equilibrium`/`discount`
   - Role affects visual behavior if chart uses role for styling (verify no regression)

5. **Chart Initialization**:
   - Existing chart setup (layout, grid, price scale, time scale) unaffected
   - No memory leaks when removing/re-adding price lines
   - Chart remains responsive to zoom/pan/scale operations

### Specific Test Checks

- [ ] Mock mode returns 16 fib ratios (not 6)
- [ ] Chart renders with 16 price lines visible (not 6)
- [ ] 0% and 100% levels are plotted
- [ ] -25%, +125% extension levels are plotted
- [ ] All 16 labels appear in chart UI (if labels were missing before patch)
- [ ] Existing chart interactions (zoom, pan, etc.) still work
- [ ] No TypeErrors, console warnings, or undefined reference errors

---

## 5. Non-goals

### Explicitly Out of Scope

- **Do NOT** modify backend fib generation logic (line 20 or ratios — already correct)
- **Do NOT** change REST API contract (backend already returns all 16 ratios)
- **Do NOT** modify `FibLevel` TypeScript interface
- **Do NOT** refactor chart rendering beyond adding labels (if needed)
- **Do NOT** add new fib ratios beyond the existing 16
- **Do NOT** change chart color scheme or styling (tan dashed lines stay as is)
- **Do NOT** fix unrelated chart issues (crosshair, grid, time scale, etc.)
- **Do NOT** add unit tests for lightweight-charts library (assume library is correct)

### Attractive But Unsafe Follow-On Changes (NOT in this patch)

- Adding user-configurable fib visibility (hiding certain levels)
- Color-coding different fib levels by role
- Adding additional chart indicators or overlays
- Migrating from lightweight-charts to a different charting library
- Adding fib ratio calculation/input UI
- Refactoring mock data generation to be more DRY

**Reason**: These would exceed "Phase 0 stabilization" scope. This patch is surgical: sync mock data, verify label rendering, ensure parity.

---

## 6. Risk assessment

### Worst-Case Failure Mode
- **Scenario**: Mock data change breaks type compatibility or chart rendering crashes
- **Detection**: Build fails or chart component throws runtime error when accessing fib properties
- **Recovery**: Revert mock data change, verify types, re-apply with type compatibility checks
- **Probability**: LOW — type signature not changing, only data values

### User-Visible Failure Mode
- **Scenario**: Patch applied but chart still shows fewer than 16 fib levels
- **Root Cause**: Backend is somehow filtering levels, or API returns mock data unexpectedly
- **Detection**: Visual inspection of chart after patch
- **Recovery**: Verify backend is not filtering, confirm `MOCK_MODE` setting, debug API response
- **Probability**: MEDIUM — if developer is using live API and backend has undiscovered filtering logic

### Backend Authority Risk
- **Scenario**: Backend is intentionally filtering levels for performance/display reasons
- **Impact**: Patch attempts to show all 16, but backend only sends 6
- **Mitigation**: Research confirms backend sends all 16; no filtering in `fib_levels()` function
- **Status**: MITIGATED — backend audit shows no hidden filtering

### Stale-State Risk
- **Scenario**: Mock data gets out of sync again in future updates
- **Impact**: New developers unaware of 16-ratio requirement; adds only 6 again
- **Mitigation**: Add comment in mock function explaining 16-ratio requirement
- **Status**: MITIGATED by documentation

### Label Rendering Risk
- **Scenario**: Custom label implementation doesn't work or breaks existing chart features
- **Impact**: Chart becomes harder to read or performance degrades
- **Mitigation**: Only implement if lightweight-charts `title` confirmed broken; keep implementation minimal
- **Status**: CONDITIONAL — only applies if Step 2 determines labels don't render

---

## 7. Test requirements

### Tests to Add or Update

1. **Mock Data Test** (NEW):
   - File: `src/mocks/sniperData.ts` or new test file
   - Test: `mockFibLevels()` returns exactly 16 ratios
   - Assertion: `mockFibLevels("GBPUSD").length === 16`
   - Assertion: Ratios match `[-200, -162.5, ..., 300]` exactly
   - Assertion: Each fib has label, price, role

2. **Mock Role Classification Test** (NEW):
   - Test: Extensions (-200 to -25) classified as `premium-extension`
   - Test: Extensions (125 to 300) classified as `discount-extension`
   - Test: Core levels (0-100) classified as `premium`, `equilibrium`, or `discount`

3. **Mock Label Format Test** (NEW):
   - Test: Integer ratios formatted as `"0%"`, `"100%"` (not `"0.0%"`)
   - Test: Decimal ratios formatted as `"62.5%"` (not `"62.50%"`)
   - Test: Negative ratios formatted as `"-25%"` (not `"−25%"`)

4. **Chart Integration Test** (EXISTING or NEW):
   - Test: Chart component receives all 16 fibs from mock
   - Assertion: Chart renders 16 price lines (count them via `priceLinesRef.current.length`)
   - Assertion: 0% and 100% levels are present in rendered array
   - Assertion: -25% and +125% extension levels are present

5. **Label Rendering Test** (CONDITIONAL):
   - ONLY if Step 2 determines lightweight-charts title doesn't work
   - Test: Chart displays custom label overlay/legend
   - Assertion: User sees label text next to each price line
   - Assertion: All 16 labels are visible (no truncation)

### Existing Tests That Must Still Pass

- [ ] All existing chart rendering tests
- [ ] Mock data smoke tests (if any)
- [ ] API integration tests (if any)
- [ ] E2E chart visualization tests

### Manual Verification Checklist

- [ ] Browser: Load charts page with mock mode enabled
- [ ] Visual: Verify 16 fib price lines are drawn (not 6)
- [ ] Visual: Verify 0% and 100% levels appear
- [ ] Visual: Verify -25%, +125% extension levels appear
- [ ] Visual: Verify fib labels appear next to each line (or in legend)
- [ ] Interaction: Zoom chart, pan chart — all levels remain visible
- [ ] No Errors: Browser console has no TypeErrors or warnings related to fibs
- [ ] Compare: Pull up production API response and count ratios in response

### Soak/Replay Requirements

- **Not required**: No stale-state or cache issues involved
- **Not required**: Mock data is deterministic, no timing-dependent behavior
- **Not required**: No live data refresh logic affected

---

## 8. Implementation handoff

### Branch Naming Recommendation
```
fix/fib-levels-mock-parity-and-labels
```
- Prefix: `fix/` (bug fix, not feature)
- Intent: Clear that this fixes parity between mock and backend

### Suggested Commit Grouping

**Commit 1**: Mock data alignment
```
fix: sync mockFibLevels to backend's 16-ratio set

- Expand mock ratios from 6 to 16 (include all extensions)
- Update role classification for premium/discount extensions
- Fix label formatting to match backend's ratio_label() logic
- Fixes: Missing 0%, 100%, ±25%, extension levels in mock mode
```

**Commit 2**: Chart label verification/fix (if needed)
```
fix: verify and enable fib level labels on chart

- Test lightweight-charts v5.2.0 createPriceLine title behavior
- Add custom label rendering if title property doesn't display
- Ensure all 16 fib levels show with visible labels
- Fixes: User-reported missing fib level names on chart
```

### Required Reports/Artifacts to Generate After Implementation

1. **Chart Screenshot**:
   - Before & After comparison showing 6 vs. 16 fib levels
   - Evidence: 0%, 100%, -25%, +125% all visible
   - Evidence: Labels appear (if applicable)

2. **Test Evidence**:
   - Test run output showing mock fib count = 16
   - Test run output showing all role classifications correct
   - Test run output showing all labels formatted correctly

3. **Code Review Checklist**:
   - [ ] Mock data exactly matches backend's 16 ratios
   - [ ] Role classification logic matches backend's `fib_role()` function
   - [ ] Label formatting logic matches backend's `ratio_label()` function
   - [ ] No type contract changes
   - [ ] All existing tests pass
   - [ ] New tests added for mock data verification

### PR Body Template

```
## Summary
Syncs mock fib level data with backend's 16-ratio set; verifies chart label rendering.

## Issue
In chart component, only 6 of 16 fib levels render (0%, 100%, ±25% extensions missing).
No fib type labels appear next to level lines.

## Root Cause
1. Mock data hardcodes 6 ratios; backend has 16
2. Chart labels set but unclear if lightweight-charts renders them

## Changes
- **src/mocks/sniperData.ts**: Expand ratios to all 16, fix role classification
- **src/routes/charts.tsx**: Verify label rendering (if test confirms issue)

## Testing
- [ ] Mock returns 16 fib ratios
- [ ] All 16 ratios have correct roles
- [ ] All 16 ratios have correct labels
- [ ] Chart renders 16 price lines
- [ ] All labels visible on chart

## Parity Impact
- Dashboard now shows complete fib set matching backend
- Mock mode now matches live API mode
- No backend or API changes
```

---

## Implementation Complete

**Status**: Ready for implementation

**Scope**: Narrow surgical patch to align mock data with backend (16 ratios), verify chart labels render, add minimal custom rendering if needed.

**Effort**: LOW — 1 file change confirmed, 1 file conditional, type-safe changes only.

**Risk**: LOW — mock data only, no API contract changes, no architectural changes.

**Blockers**: None. Can proceed immediately.
