# 1. Issue classification
- Severity: HIGH
- Category: data-contract
- Layer(s) affected: PHP-backend / REST-API / Dashboard-JS
- Phase impact: Phase 0

# 2. Confirmed evidence
- `src/routes/charts.tsx`: `TVChart` uses `const fibs = chart?.fibLevels ?? []` and maps every `f` to `s.createPriceLine(...)` without any filter. (lines 56, 243-256)
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


