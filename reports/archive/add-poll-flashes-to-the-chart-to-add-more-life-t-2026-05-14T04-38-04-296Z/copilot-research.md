# SMC SuperFIB Copilot Research

## 1. Issue classification
- Severity: MEDIUM
- Category: dashboard / wiring / migration-governance
- Layer(s) affected: Dashboard-JS / CSS / Pine
- Phase impact: Phase 0 / Cross-phase

## 2. Confirmed evidence
- `src/routes/charts.tsx` builds a live chart series with `liveMid` and `quoteState`, injecting the current live price as a point into the Lightweight Charts series.
- `src/components/sniper/TVChart.tsx` renders the chart and price line but does not currently render any explicit live price marker, pulse dot, or countdown clock UI element.
- `src/styles.css` already contains animation styles for `tick-flash-*`, `header-tick-dot-*`, and a `.live-dot` pulse animation, indicating an existing visual design system for live update flashes.
- `src/routes/live.tsx` and `src/components/sniper/AppShell.tsx` already implement live poll flashes using `useStreamingTicks`, `useTickFlash`, and tick animation classes on current price fields.
- `src/types/sniper.ts` defines `ChartSnapshot.timeframe`, `ChartSnapshot.candles`, and `ChartCandle.time`, giving a contract that can support a candle-close countdown if the UI computes the interval from chart timeframe or adjacent candle timestamps.

## 3. Root cause hypothesis
- Confirmed: The chart page already receives live price data and has a signal for fresh quotes, but it does not map that live update state into a chart-level flash UI or countdown timer.
- Hypothesis: There is a missing bridge between the existing poll/flash animation infrastructure used elsewhere in the dashboard and the chart page, causing the chart to feel static despite live price refreshes.
- Hypothesis: The countdown clock is not implemented because the chart snapshot data may not currently expose explicit candle duration metadata to the UI, requiring inference from `timeframe` or candle timestamps.
- Hypothesis: The existing `.live-dot` CSS is unused in the chart path, suggesting the design intended a live-dot pulse for current price but it was only wired on other dashboard cards.

## 4. Blast radius
- Files likely affected:
  - `src/routes/charts.tsx`
  - `src/components/sniper/TVChart.tsx`
  - `src/styles.css`
  - `src/types/sniper.ts`
  - potentially `src/lib/api/sniperClient.ts` if chart snapshot contract needs broader data support
- Systems at risk:
  - Dashboard chart rendering
  - Live price polling and freshness UI
  - Chart time-series state refresh logic
- Parity surfaces at risk:
  - Dashboard <-> Backend: chart snapshot freshness and live price update contract
  - Dashboard <-> Pine: if chart annotations or ratio visualization depend on Pine-derived bars
- Risks:
  - stale-state: countdown must reflect real backend candle timing, not browser clock drift
  - authority: live poll flash should not imply backend-confirmed trade state changes

## 5. Regression surface
- Existing live price flash behavior in `Live Radar` and header ticker must not be weakened.
- Current chart view uses `buildLiveChartSeries` to replace the latest candle with live price when quote is fresh; any patch must preserve this live-point replacement logic.
- The chart must continue to honor `quoteState` freshness and `backendReady` before showing live updates.
- Existing CSS tick-flash and live-dot animations already exist; reuse these rather than inventing a separate flash system.
- There are no direct tests for chart pulse/countdown in the repo, so regression may be surfaced only via UI behavior.

## 6. Resolution path options
- Path A: Narrow correction surface
  - Wire the chart page to existing live-flash primitives and pulse styles.
  - Add a visible live-price marker or overlay for the current price and attach `.live-dot` or tick-flash classes when `quoteState` is fresh.
  - Compute a candle close countdown from `ChartSnapshot.timeframe` or adjacent candle timestamps and show it in the chart header.
- Path B: Broader structural risk area
  - If `ChartSnapshot` lacks sufficiently reliable timeframe metadata or backend time alignment, add explicit `candleIntervalMs`/`nextCandleAt` fields to the API contract and update backend snapshot production.
  - Ensure the chart path still preserves live price series replacement and does not falsely animate stale data.
- Recommended: Path A, because the dashboard already has a working poll flash system and the chart snapshot includes `timeframe` plus candle times. This is likely the smallest change that brings the chart to parity with the rest of the UI.

## 7. Risk flags
- High-risk system involved: No. The change is UI-level and does not appear to alter trading logic or backend engine state.
- Requires parity re-validation: Yes, dashboard display should be validated against backend live quote freshness and chart snapshot state.
- Migration-blocking: No.
- Human review required before merge: Yes, because live chart polish can easily create misleading timing/flash behavior if it misrepresents quote freshness or candle close states.

## 8. Handoff package
- Epicentre files to inspect first:
  - `src/routes/charts.tsx`
  - `src/components/sniper/TVChart.tsx`
  - `src/styles.css`
  - `src/types/sniper.ts`
- Inputs Codex must verify before planning:
  - Whether `ChartSnapshot.timeframe` can be reliably used to compute candle close countdowns.
  - Whether there is an existing API or backend field for live candle end time.
  - Whether `.live-dot` is intentionally reserved for the chart path or is currently dead CSS.
  - Whether `buildLiveChartSeries` is expected to keep the last candle point live-synced instead of appending a separate marker.
- Open unknowns:
  - Is the chart snapshot `timeframe` string always parseable into a standard duration?
  - Does the backend snapshot provide the exact rollover boundary for the current candle?
  - Is there a preferred position for a current-price pulse indicator within the Lightweight Charts overlay versus above the chart header?
