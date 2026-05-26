# Bug Sweep Report: Chart Poll Flash Countdown

Date: 2026-05-14
Issue slug: `chart-poll-flash-countdown`

## Scope

- Route wiring: `src/routes/charts.tsx`
- Chart leaf render: `src/components/sniper/TVChart.tsx`
- Countdown/flash helpers: `src/lib/chartCountdown.ts`
- Styles: `src/styles.css`

## Runtime integrity sweep

- Confirmed the chart route still derives its live series through `buildLiveChartSeries` without mutating the append/replace contract.
- Confirmed the new flash path remains backend-authoritative: `tickFlash` only becomes active when `backendReady` is true and the quote freshness state is `live` or `mock`.
- Confirmed the countdown is display-only and does not trigger refetches, backend calls, or any signal-state mutation.
- Confirmed the countdown timer is cleared on unmount through `useChartCountdownMs`, preventing interval accumulation on repeated route visits.

## Stale-data safeguards

- Stale quotes do not animate the chart pulse because `isChartTickFlashActive()` hard-gates on freshness state.
- Unsupported or non-intraday timeframes return `undefined` countdowns and render no countdown span.
- No frontend-only signal truth was added; the pulse and countdown are cosmetic overlays driven from existing snapshot/quote data.

## Validation run

- `npx vitest run "src/routes/-charts.test.ts" "src/lib/chartCountdown.test.tsx" "src/components/sniper/TVChart.test.tsx"`
- `npx eslint "src/routes/charts.tsx" "src/components/sniper/TVChart.tsx" "src/lib/chartCountdown.ts" "src/lib/chartCountdown.test.tsx" "src/routes/-charts.test.ts" "src/components/sniper/TVChart.test.tsx"`
- `npm run build`

## Findings

- No new runtime-integrity regressions were found in the patched chart path.
- Repository-wide `vitest` execution is currently noisy because legacy test files with no suites are included in discovery.
- Repository-wide `npm run lint` is currently blocked by unrelated pre-existing prettier/CRLF issues outside this patch.

## Remaining live-session checks

- Verify the chart pulse fires on the same fresh poll event as the header ticker during a live session.
- Spot-check one live 1-minute candle rollover and confirm the countdown reaches zero within roughly two seconds.
- Confirm no countdown renders if the route is ever switched to daily or weekly chart snapshots.
