# Bug Sweep Report: Live Chart Polling Wiring

## Issue

Charts on `/charts` were rendering from `getChartSnapshot()` candle history only. The live `useSnapshot()` poll updated the displayed price, but did not update the chart's rightmost point until the separate chart poll resolved.

## Confirmed Root Cause

- `src/routes/charts.tsx` built `series` exclusively from `chart?.candles`.
- `src/components/sniper/TVChart.tsx` already replays `seriesApi.setData()` when `series` changes, so the missed update was upstream, not in the renderer.
- Backend `get_chart_snapshot()` returns `updatedAt` equal to the last candle time, not response time. There is no explicit incomplete-bar marker in the chart payload, so the frontend must infer replace-vs-append safely.

## Patch Applied

- Added `buildLiveChartSeries()` in `src/routes/charts.tsx`.
- Merged the live `price.mid` into the rendered series on each snapshot poll.
- Replaced the last series point when the backend's last candle time is within `pollMs * 1.5` of `Date.now()`.
- Appended a new live point when the last candle is older than that window.
- Preserved backend authority by refusing to emit a live-only point when no backend candles exist yet.

## Runtime Integrity Checks

- No query intervals changed.
- No new API calls introduced.
- No changes made to Fibonacci overlays or `TVChart` prop shape.
- Historical candles remain backend-authoritative; only the transient rightmost point is augmented.

## Validation Run

- `npx vitest run src/routes/-charts.test.ts`
- `npx tsc --noEmit`
- `npm run build`

## Findings After Patch

- The chart augmentation logic now covers append, replace, null-guard, and timestamp uniqueness branches.
- `TVChart` required no change because its `[series]` effect already replays `setData()` for each augmented array.
- A pre-existing type mismatch in `src/routes/-admin.test.tsx` blocked `tsc --noEmit`; it was corrected without changing runtime code.

## Remaining Risks

- Live browser verification of `/charts`, `/live`, and `/plan` could not be executed in-session because the Browser toolchain was unavailable.
- Network-tab confirmation that `getChartSnapshot` polling frequency is unchanged still needs manual verification in a running app.
- The replace-vs-append decision is inferred from time recency because the backend does not expose an explicit incomplete-bar flag.
