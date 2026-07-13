# SMC SuperFIB - Hardened Implementation Contract

## 1. Issue validation

**Confirmed:**
- The chart view (`src/routes/charts.tsx` + `src/components/sniper/TVChart.tsx`) receives live price data via `liveMid` and `quoteState` and correctly calls `buildLiveChartSeries`, but no poll-flash visual or countdown element is rendered. The omission is structural, not a bug.
- `src/styles.css` contains `.live-dot`, `tick-flash-*`, and `header-tick-dot-*` animation rules. These exist and are actively used in the Live Radar and header paths. They are confirmed absent from the chart render path.
- `src/routes/live.tsx` and `src/components/sniper/AppShell.tsx` already consume `useStreamingTicks` and `useTickFlash` for dashboard-wide flash. This is confirmed working infrastructure that the chart route does not connect to.
- `ChartSnapshot.timeframe` and `ChartCandle.time` exist in `src/types/sniper.ts`. These are confirmed sufficient for computing a candle-close countdown on supported standard timeframes.

**Likely:**
- `.live-dot` CSS was designed to apply to a chart-level current-price marker but was never wired. The structural evidence (unused class, present CSS, missing wiring in `TVChart.tsx`) supports this but cannot be confirmed without direct inspection of `TVChart.tsx` layout and the class application history.
- `ChartCandle.time` is a UNIX seconds integer per Lightweight Charts contract. This is likely correct but must be confirmed by the implementer before computing `nextCandleAt`.

**Unconfirmed:**
- Whether the backend snapshot response currently returns a `nextCandleAt` field. If it does, that value must be preferred over browser-computed rollover. This must be verified in `sniperClient.ts` and the live API response before implementation begins.
- Whether `ChartSnapshot.timeframe` always parses to a standard duration string. Non-standard values (e.g., `"D"`, `"W"`, `"M"`) must be accounted for with a defined fallback.
- The exact DOM attachment point for the flash element and countdown within `TVChart.tsx` (chart header overlay vs. price-scale area). The implementer must inspect the component layout before placing the element.

**Root cause:** Confirmed as stated. The dashboard's poll-flash infrastructure was built as reusable primitives (`useTickFlash`, `.live-dot`) and deployed on Live Radar and header cards. The chart route was never wired to those primitives despite having the live data required to drive them. There is no backend deficiency and no data contract gap for the base path.

---

## 2. Implementation contract

### File 1: `src/routes/charts.tsx` — tickFlash derivation

- **Exact section:** Component body, in the block that derives props for `TVChart`, alongside existing `quoteState` and `liveMid` derivations.
- **Exact change:** Consume `useTickFlash` (the same hook used in `src/routes/live.tsx`) or derive an equivalent `tickFlash: boolean` from `quoteState` freshness. Pass `tickFlash` as a new prop to `TVChart`. Do not duplicate the hook if it already exists in the component's import scope.
- **Guard rails:** Do not alter `buildLiveChartSeries` call. Do not alter `backendReady` or `quoteState` guards. Do not add a new API call or new data-fetch hook. `tickFlash` must be `false` when `quoteState` is stale or `backendReady` is false.
- **Why in scope:** This file owns the live quote signal. It is the correct boundary to derive display state before passing to the chart leaf component.
- **Acceptance criterion:** After a confirmed fresh poll cycle, `TVChart` receives `tickFlash=true` for the flash duration, then `tickFlash=false`. When the quote is stale, `tickFlash` is always `false`.

---

### File 2: `src/routes/charts.tsx` — countdown computation

- **Exact section:** Component body, after the chart snapshot data is available (post-query resolution). A separate logical block from the tickFlash derivation.
- **Exact change:**
  - Define a local `TIMEFRAME_MS` lookup map: `{ "1m": 60000, "3m": 180000, "5m": 300000, "15m": 900000, "30m": 1800000, "1h": 3600000, "4h": 14400000, "1d": 86400000 }`. Keys must match the exact strings the API returns, confirmed by pre-patch inspection.
  - If `ChartSnapshot.timeframe` is not in the map, set `candleCountdownMs` to `undefined`.
  - If the backend snapshot returns `nextCandleAt` (confirmed by pre-patch inspection), compute: `candleCountdownMs = Math.max(0, snapshot.nextCandleAt - Date.now())`.
  - If `nextCandleAt` is absent, compute: `nextCandleAt = lastCandle.time * 1000 + intervalMs`, then `candleCountdownMs = Math.max(0, nextCandleAt - Date.now())`.
  - Drive a `useState<number | undefined>` updated by a `setInterval` ticking every 1000ms. Clear the interval in the `useEffect` cleanup function.
  - Reset the countdown (recompute baseline) when the snapshot's last candle `time` changes.
  - Pass `candleCountdownMs` as a prop to `TVChart`.
- **Guard rails:** The countdown is display-only. It must not trigger any data re-fetch, backend call, or state mutation beyond its own display state. The interval must be cleared on unmount. `Date.now()` drift must not be used to infer backend state or gate any action.
- **Why in scope:** Countdown computation belongs in the route, not the chart component, to keep `TVChart` a pure display leaf.
- **Acceptance criterion:** `candleCountdownMs` decrements by approximately 1000ms per second, resets when the snapshot delivers a new last-candle `time`, is `undefined` for unsupported timeframes, and the interval does not accumulate on repeated route visits.

---

### File 3: `src/components/sniper/TVChart.tsx` — prop consumption and rendering

- **Exact section:** Component props interface and the top-level render return, at the chart header or price-display area (the exact DOM element to be determined by pre-patch layout inspection).
- **Exact change:**
  1. Add two new optional props to the component interface: `tickFlash?: boolean` and `candleCountdownMs?: number`.
  2. When `tickFlash` is `true`, apply the existing `.live-dot` CSS class (or the appropriate `tick-flash-*` class as confirmed by inspection of how it is applied elsewhere) to the current-price display element in the chart header area. The class must be removed when `tickFlash` is `false`.
  3. When `candleCountdownMs` is a defined non-negative number, render `<span className="candle-countdown">{formatCountdown(candleCountdownMs)}</span>` adjacent to the price display. `formatCountdown` is a local pure function: `Math.floor(ms / 60000)` minutes and `String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")` seconds, formatted as `"M:SS"`. When `candleCountdownMs` is `undefined`, render nothing.
- **Guard rails:** Do not read `quoteState`, `liveMid`, or any data source directly inside this component. Consume only what is passed as props. Do not modify the Lightweight Charts series, price line, or crosshair configuration. Do not introduce a new animation keyframe; apply only existing CSS classes from `src/styles.css`. The flash class must apply to a DOM element outside the canvas, not to the canvas itself.
- **Why in scope:** `TVChart` is the chart render boundary. All visual output for the chart viewport must be produced here.
- **Acceptance criterion:** The pulse class is present on the price element when `tickFlash=true` and absent when `false`. A correctly formatted `"M:SS"` string is rendered in `.candle-countdown` when `candleCountdownMs` is defined, and the span is absent from the DOM when it is `undefined`.

---

### File 4: `src/styles.css` — countdown rule

- **Exact section:** After the existing `.live-dot` and `tick-flash-*` rule blocks, within the same visual-flash rule group.
- **Exact change:** Add a `.candle-countdown` CSS rule. Font size, color, and opacity must be consistent with existing chart overlay typography. Position must not overlap chart price labels or candlestick bodies (use absolute or flex positioning relative to the chart header container, confirmed by pre-patch layout inspection). Optionally add a single `@keyframes candle-countdown-reset` that animates `opacity: 0 → 1` over 200ms, applied only when the countdown resets (class toggled in the component).
- **Guard rails:** Do not modify any existing rule. Do not add rules that apply outside the chart container scope. The new rule is additive only.
- **Why in scope:** A new DOM element requires a CSS rule. No existing rule covers `.candle-countdown`.
- **Acceptance criterion:** `.candle-countdown` renders without visual overlap with chart data. Existing `.live-dot` and `tick-flash-*` animations are visually unaffected.

---

### File 5: `src/types/sniper.ts` — conditional field addition

- **Exact section:** `ChartSnapshot` type definition.
- **Exact change:** If and only if the backend API response is confirmed to return a `nextCandleAt` field, add `nextCandleAt?: number` (UNIX ms integer) to `ChartSnapshot`. If the field is not confirmed present in the API, this file is out of scope entirely.
- **Guard rails:** Do not alter `ChartCandle`, `timeframe`, or `candles` field shapes. Do not add speculative fields. Do not add fields the backend does not already produce.
- **Why in scope:** Type safety for the conditional `nextCandleAt` consumption path in `charts.tsx`.
- **Acceptance criterion:** TypeScript compiles without error; no `any` casts introduced for this field.

---

## 3. Patch sequence

**Pre-patch verification (no code changes — must complete before any implementation step):**
- Inspect the live API response for `ChartSnapshot` and record the exact `timeframe` string values returned. Confirm whether `nextCandleAt` is present.
- Inspect `TVChart.tsx` layout to confirm the DOM attachment point for the flash class and countdown span.
- Confirm `ChartCandle.time` unit (UNIX seconds vs. ms) against the Lightweight Charts contract and actual API values.
- Update the `TIMEFRAME_MS` lookup map to match confirmed API strings before coding begins.

**Step 1 — `src/styles.css`:** Add `.candle-countdown` rule. Independent of all JS changes. Verify visually in isolation before proceeding.

**Step 2 — `src/types/sniper.ts` (conditional):** Add `nextCandleAt?: number` if confirmed present. Must precede Step 3 to keep TypeScript clean.

**Step 3 — `src/routes/charts.tsx` (tickFlash derivation):** Wire `useTickFlash` or equivalent. Pass `tickFlash` prop to `TVChart`. No visible change until Step 5.

**Step 4 — `src/routes/charts.tsx` (countdown computation):** Add `candleCountdownMs` state and interval. Pass as prop to `TVChart`. No visible change until Step 5.

**Step 5 — `src/components/sniper/TVChart.tsx`:** Accept `tickFlash` and `candleCountdownMs` props. Apply flash class conditionally. Render countdown span.

**Dependencies:**
- Step 5 depends on Steps 3 and 4 (props must be defined before consumed).
- Step 2 must precede Step 4 if `nextCandleAt` is used.
- Step 1 is independent.
- Steps 3 and 4 can be applied in the same commit within `charts.tsx` but are logically distinct changes.

**Sequencing risks:**
- If the `setInterval` cleanup in Step 4 is omitted or incorrect, repeated navigation to the chart route will accumulate intervals. This is a direct, high-probability risk that must be tested explicitly before the patch is considered complete.
- If the `TIMEFRAME_MS` lookup map does not match actual API strings (confirmed in pre-patch verification), the countdown will always be `undefined`. Confirm first.

---

## 4. Regression guards

**Checks the implementation agent must run after patching:**
- Navigate to the Live Radar card and header ticker. Verify tick flash classes still apply on price updates. Visually identical behavior to pre-patch must be confirmed.
- Log `series.data()` before and after a poll cycle in the patched chart view. Confirm the series point count is unchanged (live-point replacement, not append).
- Force a stale `quoteState` (disconnect or wait for staleness). Confirm `tickFlash` is `false` and the pulse dot is not animating.
- Navigate to a daily (`"D"`) or weekly (`"W"`) chart. Confirm the `.candle-countdown` span is absent from the DOM.
- Navigate away from the chart route and back three times in sequence. Confirm the countdown rate is not doubling and no interval-accumulation artifacts appear in console.
- Confirm `backendReady=false` suppresses `tickFlash`. The `backendReady` gate must remain the authority.

**Existing protections that must still hold:**
- `backendReady` gate before any live chart update.
- `quoteState` staleness check preventing stale price rendering as live.
- `buildLiveChartSeries` live-point replacement contract (last candle replaced, not appended).
- Live Radar and header ticker flash behavior unchanged.

**Parity re-validations:**
- Header ticker flash and chart pulse dot must fire on the same poll event. If the header flashes but the chart does not, or vice versa, the `tickFlash` prop derivation is misaligned.
- Spot-check one 1-minute candle close on a live feed. Countdown must reach zero within ±2 seconds of actual market candle close.

**Logging and diagnostics after the patch:**
- If the codebase uses a debug logger, add one `debug` entry when `tickFlash` transitions `false → true`, including the `quoteState` timestamp. Do not add this if no debug logging pattern exists in the codebase.
- No persistent `console.log` or `console.warn` statements should remain in production code after the patch.

---

## 5. Non-goals

**Out of scope for this patch:**
- Adding a new backend API endpoint or modifying the snapshot production pipeline.
- Modifying the `useStreamingTicks` or `useTickFlash` hook implementations — consume them as-is.
- Adding Pine indicators, overlays, ratio annotations, or any chart series changes.
- Changing any trading execution logic, TP/RR calculation, or ladder state management.
- Adding sound, browser notification, or alert behavior tied to the poll flash.
- Historical replay or backtest candle countdown simulation.
- Adding a "market closed" or "extended hours" countdown state.
- Modifying the Lightweight Charts price scale, crosshair, series, or canvas rendering.
- Generalizing the countdown to a reusable dashboard-wide hook for other cards.

**Attractive but unsafe follow-on changes to avoid in this patch:**
- Speculatively adding `nextCandleAt` or other fields to `ChartSnapshot` that the backend does not currently return. Type additions without confirmed API backing introduce silent `undefined` runtime paths.
- Applying tick flash to the Lightweight Charts price line directly via the charting library's internal API — canvas-level mutations outside the library's documented overlay mechanisms introduce rendering instability and version-coupling risk.
- Using `Date.now()` drift or countdown-reaching-zero as a trigger to force a data re-fetch. The countdown is display-only and must not become a data-fetch signal.
- Refactoring `charts.tsx` to use a new live-data abstraction layer. The patch touches the existing live-data wiring only at the prop-derivation and prop-passing level.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**
- A leaked `setInterval` from the countdown computation accumulates on each chart route visit, causing increasing CPU load, flickering countdown values, and eventual browser performance degradation in a long dashboard session.
- `tickFlash` prop defaulted or miscalculated as always `true` causes the pulse animation to run permanently regardless of quote freshness, creating a misleading signal that prices are continuously live-updating when they are not.

**User-visible failure mode:**
- Countdown displays wrong time or counts below zero, misleading the user about the timing of the next candle close.
- Flash animation appears on stale data, implying a live update that has not occurred and potentially inducing premature trading decisions.
- Countdown span overlaps chart price labels or candlestick bodies, obstructing the primary chart display.

**Backend authority or stale-state risks:**
- Low for this patch. No data fetch, backend call, or execution logic is altered.
- The one cosmetic authority risk: if the countdown reaches zero but the backend snapshot has not yet refreshed (poll lag), the old candle `time` will be used to compute the next cycle, causing a brief display anomaly (countdown showing negative or a restart). This is acceptable. The countdown must not force a re-fetch to compensate.

**Whether human approval should be required before merge:**
- Yes. As confirmed by the research report, live chart polish that misrepresents quote freshness or candle timing can mislead users. A human reviewer must visually verify on a live-data session that: (a) the flash fires only on genuine fresh poll events, (b) the countdown aligns with observed candle closes within ±2 seconds, and (c) the pulse is absent when the quote is stale.

---

## 7. Test requirements

**Tests to add:**
- `src/routes/charts.tsx` — unit tests:
  - `candleCountdownMs` is `undefined` when `timeframe` is not in `TIMEFRAME_MS` lookup.
  - `candleCountdownMs` is a positive integer computed correctly for `"1m"` given a fixed `lastCandle.time` and a mocked `Date.now()`.
  - `candleCountdownMs` is `0` (not negative) when `Date.now()` is past the computed `nextCandleAt`.
  - `tickFlash` prop passed to `TVChart` is `false` when `quoteState` is stale.
  - The `setInterval` is registered on mount and cleared on unmount (use fake timers).

- `src/components/sniper/TVChart.tsx` — rendering tests:
  - The `.candle-countdown` span is absent from the DOM when `candleCountdownMs` is `undefined`.
  - The `.candle-countdown` span is present and contains a correctly formatted `"M:SS"` string when `candleCountdownMs` is a positive integer.
  - The flash class is applied to the price element when `tickFlash=true`.
  - The flash class is absent when `tickFlash=false`.

**Existing tests that must still pass:**
- All existing chart rendering tests.
- All existing Live Radar and header ticker tests, if present.

**Manual checks that must still pass:**
- Live Radar card tick flash behavior is visually unchanged after patching.
- Chart series data (candle count, last candle value) is unchanged after a poll cycle.

**Live-environment verification required:**
- Soak: Leave the chart open for 10+ minutes on a live market session. Confirm no timer leak (no growing countdown rate, no console errors, no browser performance degradation).
- Parity: Verify the chart pulse fires on the same poll event that updates the price line.
- Candle-close spot-check: Observe one 1-minute candle close on a live feed. Confirm countdown reaches zero within ±2 seconds of actual rollover.

---

## 8. Implementation handoff

**Branch naming recommendation:**
`feature/chart-poll-flash-countdown`

**Suggested commit grouping:**
1. `feat(styles): add .candle-countdown CSS rule`
2. `feat(types): add optional nextCandleAt to ChartSnapshot` *(conditional — only if API field confirmed)*
3. `feat(charts): derive tickFlash and candleCountdownMs from quoteState and snapshot`
4. `feat(TVChart): render live-dot flash and candle-close countdown from props`

**Required reports or artifacts after implementation:**
- Screen recording or annotated screenshots showing: pulse dot animating on a confirmed fresh poll, countdown decrementing, countdown resetting at candle close, and Live Radar flash behavior unchanged.
- Confirmation that no flash or countdown appears when `quoteState` is stale.
- Confirmation that the countdown span is absent on a daily-timeframe chart.

**State transition:** `READY_FOR_IMPLEMENTATION` | `editing_locked=false`
