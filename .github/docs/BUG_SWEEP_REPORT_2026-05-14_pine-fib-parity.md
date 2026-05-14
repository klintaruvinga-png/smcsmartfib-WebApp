# Bug Sweep Report: Pine Fib Parity

Date: 2026-05-14
Issue: PHP backend fib levels were derived from raw candle-window max/min instead of Pine session anchors and weighted SuperFib rules.

## Runtime integrity sweep

- Confirmed the only backend chart fib entry point is `SMC_SuperFib_Sniper_REST::fib_levels_from_candles()` in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`.
- Confirmed `/wp-json/sniper/v1/charts` was the only caller of that method in the current repo state.
- Confirmed `SMC_MarketData_Service` had no existing completed-session grouping helpers before this patch.
- Confirmed the MT5 ingest path and stale-data guards were left unchanged.

## Defects addressed

1. Session-anchor truth drift
- Old behavior used raw-window `max(high)` / `min(low)`.
- New behavior resolves completed-session F1/F2/F3 anchors from candle open timestamps using the Pine ladder:
  - `<= 1800s -> Daily`
  - `<= 3600s -> Weekly`
  - `<= 14400s -> Monthly`
  - `<= 86400s -> Quarterly`
  - `else -> Yearly`

2. Missing SuperFib weighting
- Old behavior had no recency weighting.
- New behavior applies Pine recency weights:
  - `0.40 / 0.35 / 0.25` for three valid anchors
  - `0.55 / 0.45` for two valid anchors with recency dominance
  - `1.00` for a single valid anchor

3. Missing HTF authority output
- Old behavior returned only LTF levels.
- New behavior adds additive `HTF_AF` output sourced from the third most recent completed higher-session anchor.

4. Compression guard omission
- Old behavior served levels for compressed ranges.
- New behavior invalidates compressed anchors before weighting and suppresses LTF output if the composite range is below the Pine compression threshold.

## Stale-data and authority checks

- Backend remains the source of truth. No frontend fib calculation was introduced.
- Current open session is excluded by construction: the most recent grouped session is treated as incomplete until a new session key appears.
- MT5 and Twelve Data candle fetch logic was not widened beyond a larger read window for fib calculations.
- No validation bypasses were added to force LIVE state or override backend freshness rules.

## Cache and state sweep

- No dedicated fib cache or persisted fib snapshot store was found in the backend search surface.
- Existing transient usage is limited to quote, candle, rate-limit, freshness, session, and engine snapshot concerns.
- Deployment note: there is no fib-specific cache key to flush. Existing chart candle/quote transients still remain part of normal operational cache hygiene.

## Regression coverage added

- `test-session-anchors.php`
- `test-htf-authority-anchor.php`
- `test-superfib-weighting.php`
- `test-fib-parity.php`

## Verification completed

- `php -l wordpress/smc-superfib-sniper/class-market-data-service.php`
- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `Get-ChildItem wordpress/smc-superfib-sniper/tests/php -Filter test-*.php | ForEach-Object { php $_.FullName }`

## Remaining runtime risks

- Live TradingView parity against production symbols/timeframes was not executable from this workspace.
- Session boundaries are derived from stored candle timestamps in UTC, matching the backend’s existing aggregation behavior. If the upstream candle feed’s session calendar differs from Pine’s exchange calendar, a follow-up live parity check is still required.
