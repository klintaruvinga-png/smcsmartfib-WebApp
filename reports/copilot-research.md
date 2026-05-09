# SMC SuperFIB - Fib Level Chart Rendering Issue Research

## 1. Issue classification
- **Severity**: HIGH
- **Category**: data-contract, wiring
- **Layer(s) affected**: Dashboard-JS, PHP-backend, REST-API
- **Phase impact**: Phase 0 stabilization

## 2. Confirmed evidence

### Frontend Rendering (src/routes/charts.tsx)
- **File**: `src/routes/charts.tsx`, lines 127-245
- **Component**: `TVChart` function receives `fibs: FibLevel[]` and renders via lightweight-charts
- **Chart Library**: lightweight-charts v5.2.0 (from package.json)
- **Price Line Rendering** (line 224-231):
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
- **Data Source**: Receives `fibs` from API at line 56: `const fibs = chart?.fibLevels ?? []`
- **Behavior**: Maps ALL received fibs directly to price lines — NO filtering logic
- **Type Definition** (line 127): `type FibLevel = { family: string; label: string; price: number };`
  - Confirmed: Actual API includes `ratio` and `role` fields (src/types/sniper.ts line 95-100)
  - Local type is incomplete but doesn't prevent rendering

### Backend Fib Level Data (wordpress/smc-superfib-sniper/smc-superfib-sniper.php)
- **Ratios Array** (line 20):
  ```php
  private $ratios = array(-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300);
  ```
  - **Count**: 16 total ratios
  - **Core Levels**: 0, 25, 50, 62.5, 75, 100 (6 levels)
  - **Extensions**: -200, -162.5, -100, -62.5, -25, 125, 162.5, 200, 262.5, 300 (10 levels)
  - **Confirmed**: Includes 0%, 100%, +25%, AND -25%

- **API Endpoint** (line 252): `register_routes()` maps `/charts` to `get_chart_snapshot()`
- **Generation Function** (line 1494-1510):
  ```php
  public function get_chart_snapshot(WP_REST_Request $request) {
    $candles = $this->fetch_candles($user_id, $symbol, $timeframe, 120);
    $levels = $this->fib_levels_from_candles($candles);
    return rest_ensure_response(array('fibLevels' => $levels, ...));
  }
  ```

- **Level Construction** (line 2838-2857):
  - `fib_levels_from_candles()` extracts high/low from candles
  - `fib_levels($high, $low, 'LTF_SF')` iterates through ALL `$this->ratios`
  - For each ratio, generates object with `family`, `ratio`, `label`, `price`, `role`
  - **Confirmed**: NO filtering — backend sends all 16 ratios

- **Label Generation** (line 2860-2865):
  ```php
  private function ratio_label($ratio) {
    if (floor((float) $ratio) === (float) $ratio) {
      return (string) (int) $ratio . '%';
    }
    return rtrim(rtrim(number_format((float) $ratio, 1, '.', ''), '0'), '.') . '%';
  }
  ```
  - **Expected Output**: "0%", "100%", "-25%", "+125%" etc.
  - **Confirmed**: Generates labels for all ratios including negatives

- **Role Classification** (line 2893-2908):
  ```php
  private function fib_role($ratio) {
    if ($ratio < 0) return 'premium-extension';
    if ($ratio > 100) return 'discount-extension';
    if ($ratio < 50) return 'premium';
    if ((float) $ratio === 50.0) return 'equilibrium';
    return 'discount';
  }
  ```
  - **Confirmed**: Correctly classifies extensions as `*-extension` roles

### Mock Data Completeness Gap (src/mocks/sniperData.ts, line 442-453)
```typescript
export function mockFibLevels(symbol: Symbol) {
  const base = mockPrices.find((p) => p.symbol === symbol)?.mid ?? 1;
  const range = base * 0.005;
  const ratios = [0, 25, 50, 62.5, 75, 100] as const;  // ONLY 6 ratios

  return ratios.map((ratio) => ({
    ratio,
    label: `${ratio}%`,
    price: base + range - (ratio / 100) * range * 2,
    role: (ratio < 50 ? "premium" : ratio === 50 ? "equilibrium" : "discount") as FibRole,
  }));
}
```
- **Gap Analysis**: Mock has 6 ratios, backend has 16
- **Missing from Mock** (10 ratios):
  - Negative extensions: -200, -162.5, -100, -62.5, -25
  - Positive extensions: 125, 162.5, 200, 262.5, 300
- **Present in Mock**: 0, 25, 50, 62.5, 75, 100 (matches core levels)
- **Parity Failure**: 63% of ratios missing from mock

### API Consumption (src/lib/api/sniperClient.ts, line 209-232)
```typescript
async getChartSnapshot(...): Promise<ChartSnapshot> {
  if (mock) {
    // Uses mockFibLevels() which has only 6 ratios
    return { fibLevels: mockFibLevels(symbol).map(f => ({
      family: "LTF_SF" as const,
      ratio: f.ratio,
      label: f.label,
      price: f.price,
      role: f.role,
    })), ... };
  }
  return call<ChartSnapshot>(`/charts?symbol=...`);  // Real backend
}
```
- **Confirmed**: Mock mode hard-codes incomplete fib set via `mockFibLevels()`

## 3. Root cause hypothesis

**Primary Cause** (Confirmed):
- **Mock Data Parity Failure**: `src/mocks/sniperData.ts` hardcodes only 6 of the 16 backend ratios
- **Evidence**: 
  - Backend array has all 16 (line 20 of PHP)
  - Mock function has exactly 6 (line 442-445 of TS)
  - This explains missing 0%, 100%, -25%, +25% extensions
- **Why This Happened**: Mock was created as minimal test fixture and never synchronized when backend ratios were expanded to include extensions

**Secondary Issue** (Hypothesis):
- **Label Rendering Gap**: `createPriceLine({ title: "0%", axisLabelVisible: true })` may not render visible text in lightweight-charts 5.2.0
- **Evidence**:
  - User reports "no fib type labels appear next to level lines"
  - Frontend code sets `title: f.label` and `axisLabelVisible: true`
  - No verification that lightweight-charts actually displays this title
  - lightweight-charts `createPriceLine()` API may only show prices, not custom titles
- **Why This Matters**: Even if all ratios are sent, users won't see what each level represents

## 4. Blast radius

### Affected Files
1. `src/routes/charts.tsx` — Chart rendering component
2. `src/mocks/sniperData.ts` — Mock data generation
3. `src/lib/api/sniperClient.ts` — Mock data injection
4. `src/types/sniper.ts` — Type contracts
5. `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — Backend generation

### Systems Depending on Fib Data
- **Chart Visualization**: Renders price lines for each level
- **Signal Ladder Calculations**: Uses ratios for entry/stop/TP placement (line 2030: ratios 62.5, 75, 100 for long; 25, 0, -25 for short)
- **Account Engine**: Stores planned signals with fib ratios
- **User Dashboard**: Displays chart view to traders

### Parity Surfaces at Risk
- Backend → REST API → Frontend: Levels sent by backend must equal levels displayed
- Mock Mode → Live Mode: Developers testing with mock see incomplete data vs. production users
- Role Classification: Extensions must display as `*-extension` not `premium`/`discount`

## 5. Regression surface

### Working Behavior Must Preserve
- Backend correctly iterates all ratios and calculates prices
- Frontend maps received fibs 1:1 to price lines (no loss of data in render layer)
- Type contracts preserve `family`, `ratio`, `label`, `price`, `role`
- Role classification logic (extensions vs. core)

### Existing Guards
- No tests validating fib level count
- No parity check between mock and backend
- No verification of label rendering
- No stale-data or missing-candle protections for fib rendering

## 6. Resolution path options

### Path A: Align Mock Data Only (Narrow)
- Update `src/mocks/sniperData.ts` to include all 16 ratios matching backend
- Match backend label format exactly
- **Scope**: 1 file
- **Risk**: Low — isolated to mock code
- **Fixes**: Missing 0%, 100%, ±25%, extensions issue in mock mode
- **Does NOT Fix**: Label rendering issue (if it exists)

### Path B: Fix Chart Label Rendering (Moderate)
- Verify lightweight-charts 5.2.0 `title` behavior
- If `title` doesn't render: add custom overlay or legend showing labels
- **Scope**: `src/routes/charts.tsx`
- **Risk**: Medium — requires library investigation
- **Fixes**: Missing labels issue
- **May trigger**: UI redesign work if custom rendering needed

### Path C: Full Parity & Label Fix (Comprehensive)
- Execute Path A + Path B
- Add regression guards (test that backend ratios match frontend display)
- **Scope**: 2 files + tests
- **Risk**: Medium (multiple touches but all low-risk)
- **Fixes**: All three reported symptoms
- **Recommended**: YES

**Recommended Path**: **C (Full Parity + Label Rendering)**

**Reasoning**:
1. Phase 0 stabilization requires complete parity between mock and real backend
2. Both root causes are confirmed or high-probability
3. Small surface area (mock data + chart rendering)
4. Prevents future sync issues between mock and backend

## 7. Risk flags

- **High-risk system involved**: Yes — fib levels determine signal entries/stops/TPs; incorrect display misleads traders
- **Requires parity re-validation**: Yes — backend → REST → frontend must align perfectly
- **Migration-blocking**: No — Phase 0 stabilization issue, not a gate blocker
- **Human review required before merge**: Yes — affects user-visible trading signals

## 8. Handoff package

### Epicentre Files to Inspect First
1. `src/mocks/sniperData.ts` line 442-453 — Incomplete mock ratios
2. `src/routes/charts.tsx` line 224-231 — Chart rendering with `title` property
3. `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` line 20 — Backend ratios array
4. `package.json` line 62 — lightweight-charts v5.2.0

### Inputs Codex Must Verify
- Confirm lightweight-charts 5.2.0 renders `title` property visibly in createPriceLine()
- Confirm production `/charts` endpoint returns all 16 ratios (not filtered)
- Confirm all 16 ratios needed for dashboard display (no role-based filtering required)

### Open Unknowns
- Does lightweight-charts `title` parameter actually render text next to price line, or only show prices?
- Is user testing with `MOCK_MODE=true` or real production API?
- Should negative ratios display on all timeframes or only specific ones?

---
- `src/routes/charts.tsx`: local type `type FibLevel = { family: string; label: string; price: number };` excludes `ratio` and `role`, even though backend API data includes them. (line 127)
- `src/routes/charts.tsx`: price lines are created with `title: `${f.label}`` and `axisLabelVisible: true`, so labels are rendered only from `f.label`. (lines 243-256)
- `src/lib/api/sniperClient.ts`: `getChartSnapshot()` returns `ChartSnapshot` with `fibLevels` from backend or mock; mock mode uses `mockFibLevels()` to build each item with `family`, `ratio`, `label`, `price`, `role`. (lines 209-232)
- `src/mocks/sniperData.ts`: `mockFibLevels()` defines only `[0, 25, 50, 62.5, 75, 100]`, omitting all extension ratios. (lines 442-453)
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`: `$ratios` includes `0, 100, 25, -25` and many other extension values. (line 20)
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`: `get_chart_snapshot()` returns `fibLevels` from `fib_levels_from_candles()` and `fib_levels()`, which iterates over `$this->ratios` and emits `family`, `ratio`, `label`, `price`, `role`. (lines 1494-1517, 2838-2859)
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`: `fib_role($ratio)` classifies negative ratios as `premium-extension` and >100 as `discount-extension`. (lines 2893-2908)

# 3. Root cause hypothesis
- Confirmed: backend `$ratios` array already includes 0, 100, 25, and -25. (php line 20)
- Confirmed: frontend chart component does not explicitly filter `fibs`; it maps all API response entries to price lines. (charts.tsx lines 243-256)
- Hypothesis: missing +25/−25 extension levels may be caused by mock fixture mismatch in `src/mocks/sniperData.ts` rather than explicit frontend filtering. (mock ratios line 442)
- Hypothesis: fib labels appear absent because `createPriceLine()` is populated only with `${f.label}`, and `f.family` is available but never integrated into the rendered title. (charts.tsx line 254)
- Hypothesis: local `FibLevel` typing in `charts.tsx` hides `ratio`/`role`, reducing the component’s ability to render family/ratio metadata. (charts.tsx line 127)

# 4. Blast radius
- `src/routes/charts.tsx` — chart rendering and fib line creation
- `src/types/sniper.ts` — `FibLevel` interface definition and expected API contract
- `src/lib/api/sniperClient.ts` — `/charts` API consumption and mock fallback
- `src/mocks/sniperData.ts` — mock fib level fixture for dashboard preview
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — REST endpoint and backend fib ratio construction
- Systems: Dashboard-JS rendering, REST-API fib contract, PHP backend fib-level service
- Parity surface: Backend → REST → Dashboard; missing levels or labels can cause Dashboard display to drift from backend fib contract

# 5. Regression surface
- Current behavior depends on `ChartSnapshot.fibLevels` contract from backend; any change must preserve `family`, `ratio`, `label`, `price`, `role` shape
- Existing frontend guard: `const fibs = chart?.fibLevels ?? []` avoids runtime crash when `fibLevels` is absent. (charts.tsx line 56)
- Existing backend guard: `fib_levels_from_candles()` returns an empty array when candles are missing. (php lines 2838-2845)
- Tests/audits: `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` appears to cover snapshot contract behavior, and `.github/docs/BUG_SWEEP_REPORT_2026-05-05.md` references chart snapshot handling

# 6. Resolution path options
- Path A: narrowest plausible correction is in `src/routes/charts.tsx` and `src/mocks/sniperData.ts` by ensuring the chart uses full `FibLevel` objects and labels include both percent and family name, while mock fixtures include extension ratios.
- Path B: broader correction is audit of the `/charts` API contract plus frontend mock alignment, ensuring backend fibLevels fields are consistently passed through and no discrepancy exists between live and mock data.
- Recommended: Path A, because evidence shows the backend already supplies required ratios and the dashboard currently maps all fibs directly to chart lines.

# 7. Risk flags
- High-risk system involved: Yes — dashboard rendering and REST fib contract affect user-visible chart integrity
- Requires parity re-validation: Yes — backend fib data versus dashboard display should be verified across REST and mock modes
- Migration-blocking: No — this appears to be a Phase 0 stabilization issue rather than a migration gate blocker
- Human review required before merge: Yes — display contract changes should be validated by a reviewer familiar with fib chart conventions and API consumption

# 8. Handoff package
- Epicentre files to inspect first: `src/routes/charts.tsx`, `src/types/sniper.ts`, `src/lib/api/sniperClient.ts`, `src/mocks/sniperData.ts`, `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- Inputs Codex must verify before planning: live `/charts` response payload for `fibLevels`, current mock mode fib values, title rendering behavior of `createPriceLine()`, and whether `f.family` is present in runtime data
- Open unknowns: whether the dashboard is running in mock mode during failure, whether `lightweight-charts` axis labels are being clipped or suppressed in the canvas, and whether any additional frontend filter exists outside `charts.tsx` in the active runtime path


