# Issue summary

Charts on `/charts` were lagging the live price poll because the rendered line series was rebuilt only from `getChartSnapshot()` candle data. The live snapshot poll updated the price label, but not the chart's rightmost point.

# Root cause implemented

I added a route-local series augmentation helper that merges the current `price.mid` into the chart series on every snapshot poll. When the backend's last candle is recent enough to represent the in-progress bar, the helper replaces that last point; otherwise it appends a new transient point. I kept `TVChart` unchanged because its existing `[series]` effect already replays `setData()` for each new series reference.

# Exact files changed

- `src/routes/charts.tsx`
- `src/routes/-charts.test.ts`
- `src/routes/-admin.test.tsx`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-14_live-chart-polling.md`
- `reports/codex-implementation.md`

# Tests run

- `npx vitest run src/routes/-charts.test.ts`
- `npx tsc --noEmit`
- `npm run build`

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-14_live-chart-polling.md`
- No parity audit required by contract.
- `reports/codex-implementation.md`

# Remaining risks

- I could not run the in-app browser or inspect the network tab in this session, so route-level manual checks for `/charts`, `/live`, `/plan`, Fibonacci overlay positioning, and unchanged poll cadence remain manual follow-up items.
- The backend does not expose an explicit incomplete-bar flag, so the replace-vs-append branch relies on the contract-approved recency window.

# Any contract ambiguities resolved during implementation

- Backend incomplete-bar detection was not explicit in the payload, so I used the contract's smallest safe interpretation: treat a last candle within `pollMs * 1.5` of `Date.now()` as the current bar and replace it with the live point.
- The contract did not define behavior when live price exists but candle history is empty. I chose not to emit a live-only chart point so the frontend does not fabricate chart history without backend candle authority.
