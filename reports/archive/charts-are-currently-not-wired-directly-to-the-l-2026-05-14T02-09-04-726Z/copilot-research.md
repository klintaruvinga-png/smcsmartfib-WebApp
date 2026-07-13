# SMC SuperFIB - Issue Research Report

## 1. Issue classification
- Severity: HIGH
- Category: wiring
- Layer(s) affected: Dashboard-JS
- Phase impact: Cross-phase

## 2. Confirmed evidence
- Charts are implemented in `src/routes/charts.tsx` using the `TVChart` component from `src/components/sniper/TVChart.tsx`
- The `TVChart` component receives a `series` prop containing candle data mapped from `chart?.candles` (close prices over time)
- Live price data is polled via `useSnapshot()` hook, which fetches price data every `pollMs` interval (default 2000ms)
- Chart data is polled separately via `useQuery` for `apiClient.getChartSnapshot(activeSymbol)`, also every `pollMs`
- The `TVChart` updates the chart display using `seriesApi.setData(data)` in a `useEffect` when the `series` prop changes
- Price display in charts page shows live data from snapshot: `{fmtPrice(price.mid, price.symbol)}`
- Chart series is calculated as: `const series = (chart?.candles ?? []).map((c) => ({ t: new Date(c.time).getTime(), p: c.close }))`

## 3. Root cause hypothesis
- Most likely root cause: The chart series is only updated when the separate chart polling fetches new candle data, not when live price data updates from the snapshot polling.
- Why that root cause best fits the evidence: Price and chart data use separate polling queries, so chart updates lag behind live price updates despite same polling interval.
- What likely triggered or surfaced the issue: Implementation of separate polling for chart data vs. price data.
- Mark each sub-point as `Confirmed` or `Hypothesis`: Confirmed

## 4. Blast radius
- `src/routes/charts.tsx`: Chart display logic and data fetching
- `src/components/sniper/TVChart.tsx`: Chart rendering component
- Charts page user interface: Real-time price display is live but chart visualization lags
- Any future components using `TVChart` or similar chart data
- Trading dashboard user experience when viewing charts

## 5. Regression surface
- Existing candle data polling must continue working
- Fibonacci level overlays must remain functional
- Price display accuracy must not be affected
- Other dashboard pages (live, plan, etc.) must not be impacted
- Chart polling interval and API calls must not be disrupted

## 6. Resolution path options
- Path A: Modify `src/routes/charts.tsx` to append current live price to the series array, ensuring chart updates in real time with price polling.
- Path B: Integrate chart data polling with snapshot polling by invalidating chart queries when snapshot updates.
- Recommended: Path A - narrower correction surface, directly wires chart to live price data.
- Do not write implementation code or implementation steps

## 7. Risk flags
- High-risk system involved: Yes (chart accuracy critical for trading decisions)
- Requires parity re-validation: No
- Migration-blocking: No
- Human review required before merge: No

## 8. Handoff package
- Epicentre files to inspect first: `src/routes/charts.tsx`, `src/components/sniper/TVChart.tsx`
- Inputs Codex must verify before planning: Whether backend `/charts` API includes current incomplete candle bar in response
- Open unknowns that could invalidate the current hypothesis: Potential duplicate data points if backend provides current bar in candles and frontend appends live price
