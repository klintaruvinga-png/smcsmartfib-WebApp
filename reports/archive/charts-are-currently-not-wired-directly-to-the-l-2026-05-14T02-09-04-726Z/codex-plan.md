# SMC SuperFIB - Claude Plan Hardening Request

---

## 1. Issue validation

**Reported root cause:** Chart series is only rebuilt when the `getChartSnapshot` query resolves, not when the live price snapshot polling fires. Because both polls run at the same interval (`pollMs`), the chart typically trails by one full poll cycle and never reflects the in-progress (incomplete) candle.

**Verdict:** `Confirmed` with one structural refinement.

| Sub-claim | Status | Reasoning |
|---|---|---|
| Charts use `TVChart` fed by `chart?.candles` mapped to close prices | `Confirmed` | Directly visible in research evidence |
| Live price is polled separately via `useSnapshot()` | `Confirmed` | Documented in evidence section 2 |
| Chart series updates only when `getChartSnapshot` query resolves | `Confirmed` | `seriesApi.setData(data)` fires on `series` prop change only |
| Chart lags by approximately one poll cycle | `Likely` | Dependent on network timing; could vary |
| Backend `/charts` API includes an incomplete current bar in the candle array | `Unconfirmed` | Explicitly flagged as open unknown in research report; must be verified before patching |

**Corrected root cause (precision refinement):** The `series` array passed to `TVChart` is derived solely from `chart?.candles`, which only updates when the `getChartSnapshot` query completes. The live `useSnapshot()` price value — which updates on its own cadence — is never merged into the `series` array. The result is that the rendered chart does not reflect the current mid-price until the next candle-data fetch resolves. The incomplete-bar risk (duplicate final point) is the primary guard-rail this plan must enforce.

---

## 2. Implementation contract

### File 1: `src/routes/charts.tsx`

**Why in scope:** This is where `series` is constructed from `chart?.candles` and where both `useSnapshot()` and `useQuery(getChartSnapshot)` are co-located. The merge of live price into the series must happen here, not inside `TVChart`, to preserve the component's dumb-renderer contract.

**Exact location:** The `series` derivation block — currently:
```
const series = (chart?.candles ?? []).map((c) => ({ t: new Date(c.time).getTime(), p: c.close }))
```
This is the only line that must change.

**Exact change required:**
1. After the existing `series` mapping expression, derive the timestamp of the last candle in the array (`lastCandleTime`).
2. Obtain the current mid-price from the `useSnapshot()` result (`price.mid`).
3. Construct a `livePoint` using the current wall-clock time and `price.mid`, **only if** a valid `price.mid` exists and `price.mid` is a finite number.
4. Check whether the backend already includes the incomplete current bar: if `lastCandleTime` is within the current poll interval window (i.e., `Date.now() - lastCandleTime < pollMs * 1.5`), the backend is providing a live/incomplete bar — **replace** the last element of the series with `livePoint` rather than appending. If `lastCandleTime` is older than that threshold, **append** `livePoint`.
5. The final `series` passed to `TVChart` is this augmented array.

**Guard rails — must not change:**
- The `useQuery` call for `getChartSnapshot` must not be removed or have its interval altered.
- The `useSnapshot()` hook signature and poll interval must not be altered.
- Fibonacci overlay data must not be touched in this file.
- `TVChart` props other than `series` must not be changed.
- No new API calls may be introduced.

**Acceptance criterion:** After patch, moving the live price by any amount causes the chart's rightmost data point to update within `pollMs` milliseconds, before the next `getChartSnapshot` query resolves.

---

### File 2: `src/components/sniper/TVChart.tsx`

**Why in scope:** Conditional — only if the `series` prop change does not reliably trigger a re-render due to referential equality. Investigation required before touch.

**Exact location:** The `useEffect` that calls `seriesApi.setData(data)`, watching the `series` prop.

**Exact change required (conditional):** If the `useEffect` dependency array uses reference equality on `series` (i.e., `[series]`) and the augmented array from `charts.tsx` is always a new reference on every render, no change is needed — React will trigger the effect. If the effect is memoised or guarded in a way that suppresses updates when only the last element changes, add a secondary dependency on `series.length` or the value of the last element's `p` field to force re-evaluation.

**Guard rails — must not change:**
- `seriesApi.setData` call signature must not be altered.
- Fibonacci overlay rendering logic must not be altered.
- No new props may be added to `TVChart`.
- Lightweight-charts library version or initialization must not be changed.

**Acceptance criterion:** `seriesApi.setData` is called every time `charts.tsx` passes a new augmented series, with no skipped renders.

---

## 3. Patch sequence

1. **Read `src/routes/charts.tsx` in full** — confirm exact shape of `series` derivation, confirm `pollMs` value is accessible in scope, confirm `price` from `useSnapshot()` is in scope at the point of series construction.
2. **Read `src/components/sniper/TVChart.tsx` in full** — confirm `useEffect` dependency array structure; determine whether conditional File 2 change is required.
3. **Determine backend incomplete-bar behavior** — inspect `apiClient.getChartSnapshot` response shape or existing test fixtures to confirm whether the final candle in the array represents the in-progress bar or only completed bars. This gates the replace-vs-append decision in step 4.
4. **Patch `src/routes/charts.tsx`** — augment series derivation with the live point, using replace-or-append logic determined in step 3.
5. **Patch `src/components/sniper/TVChart.tsx` (conditional)** — only if step 2 reveals a memoisation guard that would suppress the update.
6. **Verify TypeScript types compile cleanly** — the augmented series element must match the type accepted by `TVChart`'s `series` prop.

**Sequencing risks:**
- Step 3 (backend behavior) is a hard dependency for step 4. If the backend does include the current bar, appending instead of replacing will produce a duplicate timestamp, which lightweight-charts may render as a visual artifact or silently drop.
- Steps 4 and 5 are independent of each other once step 3 is resolved.
- No cache invalidation, migration, or API contract change is required.

---

## 4. Regression guards

**Checks implementation agent must run after patching:**

1. **TypeScript compilation** — `tsc --noEmit` must pass with zero errors on the patched files.
2. **Chart still renders candle history** — the full historical candle series must appear unchanged; only the rightmost point should be affected by the patch.
3. **Fibonacci overlays render correctly** — overlay layers must not shift, disappear, or overlap incorrectly after the series length changes by ±1.
4. **No duplicate timestamps** — log `series.map(s => s.t)` and verify the last two timestamps are distinct after a live price update.
5. **Other dashboard pages unaffected** — navigate to `/live`, `/plan`, and any other route; confirm no runtime errors, no missing data, no regressions in price display.
6. **Poll interval unchanged** — confirm `getChartSnapshot` query is still firing at `pollMs` by checking network tab; no extra requests introduced.

**Existing protections that must still hold:**
- Stale-data guards on `useSnapshot()` (if any staleness TTL is enforced) must not be bypassed.
- Backend remains the authoritative source for all historical candles; the frontend appends only the current live point and must not fabricate historical data.

**Parity re-validation:** Not required (research report section 7 confirms no parity impact).

**Diagnostics that should exist after patch:** A `console.debug` (development-only, behind `import.meta.env.DEV` guard) logging `[LiveChart] live point appended/replaced: { t, p }` on each augmentation is acceptable for soak verification, but must be removed before merge if it would appear in production builds.

---

## 5. Non-goals

**Out of scope for this patch:**
- Changing polling intervals for `useSnapshot()` or `getChartSnapshot`.
- Modifying the backend `/charts` API endpoint or its response schema.
- Adding WebSocket or push-based chart updates.
- Refactoring `TVChart` to manage its own data fetching.
- Adding candlestick (OHLC) rendering — the existing close-price line series is the correct target.
- Modifying any route other than `src/routes/charts.tsx`.
- Touching MT5 bridge, Pine indicator, or backend Python services.
- Changing `useQuery` cache keys, stale times, or invalidation logic globally.

**Attractive but unsafe follow-on changes to avoid in this patch:**
- Path B from research (invalidating chart queries when snapshot updates) — this would couple two independent polling loops and risk query stampede on every price tick; not safe without broader architectural review.
- Switching `seriesApi.setData` to `seriesApi.update` for incremental updates — the lightweight-charts API difference has implications for how historical data is retained; this is a separate, larger change.
- Memoising the augmented series with `useMemo` to avoid re-renders — premature optimisation; introduce only if profiling shows a problem.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:** If the backend already includes the in-progress bar and the patch appends rather than replaces, the chart will display a duplicate final candle at a slightly different timestamp. In lightweight-charts, this may render as a visual glitch or the library may silently drop one point — either way, the displayed price at the rightmost bar would be unreliable, which is a trading-critical failure.

**User-visible failure mode:** Chart's rightmost price point flickers between two values, or the live-price point appears slightly to the right of the last historical candle with a gap, making the chart appear broken.

**Backend authority risk:** None — the patch does not alter what the backend returns. Historical candles remain backend-authoritative. The live point is clearly ephemeral (derived from `price.mid` which itself comes from `useSnapshot()`, which is already displayed live on the page).

**Stale-state risk:** If `price.mid` is `null` or `undefined` (e.g., snapshot fetch has not yet resolved on first load), the guard in the patch must prevent appending a `NaN` or `undefined` price point. The patch must validate `price?.mid` before constructing `livePoint`.

**Human approval required before merge:** No (research report section 7 confirms). Standard PR review is sufficient.

---

## 7. Test requirements

**Tests to add:**

| Test | Location | Target |
|---|---|---|
| Unit: series augmentation appends live point when last candle is old | `src/routes/charts.test.tsx` or equivalent | The series derivation logic in `charts.tsx` |
| Unit: series augmentation replaces last point when backend provides current bar | Same file | Replace-vs-append branch |
| Unit: no augmentation when `price.mid` is null/undefined | Same file | Null-guard branch |
| Unit: augmented series has no duplicate timestamps | Same file | Timestamp uniqueness assertion |

**Existing tests or manual checks that must still pass:**
- All existing `TVChart` snapshot or render tests (if any) — component must accept the augmented series without prop-type errors.
- Any existing chart polling integration tests must pass unchanged.
- Manual: open charts page in browser, observe rightmost candle moves with live price display — these two values should converge within one `pollMs` cycle.

**Soak / live-environment verification:**
- Run the dashboard against a live market session for at least 5 minutes; confirm the chart's rightmost point tracks the price display without freezing or flickering.
- Confirm chart history is intact after a symbol switch (re-fetch clears the live point and reloads from backend).

---

## 8. Implementation handoff

**Branch naming recommendation:**
```
codex/wire-charts-live-price-polling
```

**Suggested commit grouping:**
1. `fix(charts): augment series with live price point on each snapshot poll` — `src/routes/charts.tsx` change only.
2. `fix(TVChart): ensure useEffect re-fires on live series update` — `src/components/sniper/TVChart.tsx` change, **only if required** by investigation in patch sequence step 2. If not required, this commit is omitted.

**Required artifacts after implementation:**
- TypeScript compile output confirming zero errors.
- Screenshot or screen-recording of chart rightmost point tracking live price display.
- Network tab confirmation that `getChartSnapshot` poll frequency is unchanged.

**State transition:**

```
READY_FOR_IMPLEMENTATION
editing_locked=false
```
