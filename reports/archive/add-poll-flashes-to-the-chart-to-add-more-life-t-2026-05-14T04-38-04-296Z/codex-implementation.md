# Issue summary

The chart route already had live quote input and live-series replacement, but it never surfaced the existing poll-flash system on the chart itself and it had no candle-close countdown. The patch adds a chart-local live pulse and an intraday candle countdown without changing backend authority, chart data fetch behavior, or Pine/backend math.

# Root cause implemented

The chart path was missing the last-mile bridge from existing quote freshness/tick-flash primitives into `TVChart`. I wired the chart route to derive a backend-authoritative `tickFlash` signal from the existing `useTickFlash` hook and added a display-only countdown hook driven from confirmed chart snapshot candle timestamps and confirmed timeframe keys.

# Exact files changed

- `src/routes/charts.tsx`
- `src/components/sniper/TVChart.tsx`
- `src/lib/chartCountdown.ts`
- `src/styles.css`
- `src/routes/-charts.test.ts`
- `src/lib/chartCountdown.test.tsx`
- `src/components/sniper/TVChart.test.tsx`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-14_chart-poll-flash-countdown.md`
- `.github/migration/audits/phase-0-dashboard-parity-2026-05-14.md`
- `reports/codex-implementation.md`

# Tests run

- `npx vitest run "src/routes/-charts.test.ts" "src/lib/chartCountdown.test.tsx" "src/components/sniper/TVChart.test.tsx"`
- `npx eslint "src/routes/charts.tsx" "src/components/sniper/TVChart.tsx" "src/lib/chartCountdown.ts" "src/lib/chartCountdown.test.tsx" "src/routes/-charts.test.ts" "src/components/sniper/TVChart.test.tsx"`
- `npm run build`

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-14_chart-poll-flash-countdown.md`
- `.github/migration/audits/phase-0-dashboard-parity-2026-05-14.md`
- `reports/codex-implementation.md`

# Remaining risks

- Live-session verification is still required for exact pulse-event alignment with the header ticker and for countdown-to-rollover tolerance.
- Repository-wide `npm run lint` still fails on unrelated pre-existing prettier/CRLF issues outside this patch.
- Repository-wide `npx vitest run` still picks up unrelated legacy/no-suite files outside this patch.

# Any contract ambiguities resolved during implementation

- The contract listed `1m/15m/1d` style keys, but the current repo/backend contract uses `1min/15min/1day`; the implementation used the confirmed repo values only.
- The contract mentioned optional `nextCandleAt`, but the current chart snapshot response does not expose that field, so `ChartSnapshot` was left unchanged.
- The contract also conflicted on daily countdown support versus daily/weekly countdown absence checks. I chose the smallest safe interpretation: countdown support is limited to confirmed intraday timeframes up to `4h`, and daily/weekly frames remain unsupported.
