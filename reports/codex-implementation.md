# Issue summary

The PHP backend chart fib path was still deriving `LTF_SF` from a raw candle-window high/low pair, which no longer matched the Pine indicator’s completed-session anchor model, recency weighting, compression guard, or next-higher-timeframe authority fib rule.

# Root cause implemented

The backend lacked session grouping and authority anchor resolution entirely. I added completed-session F1/F2/F3 resolution in `SMC_MarketData_Service`, replaced raw-window anchoring with Pine-compatible weighted composite logic in `SMC_SuperFib_Sniper_REST`, enforced the Pine compression guard, and emitted additive `HTF_AF` levels plus request-level anchor logging.

# Exact files changed

- `wordpress/smc-superfib-sniper/class-market-data-service.php`
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `wordpress/smc-superfib-sniper/tests/php/fib-test-helpers.php`
- `wordpress/smc-superfib-sniper/tests/php/test-session-anchors.php`
- `wordpress/smc-superfib-sniper/tests/php/test-htf-authority-anchor.php`
- `wordpress/smc-superfib-sniper/tests/php/test-superfib-weighting.php`
- `wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php`

# Tests run

- `php -l wordpress/smc-superfib-sniper/class-market-data-service.php`
- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `Get-ChildItem wordpress/smc-superfib-sniper/tests/php -Filter test-*.php | ForEach-Object { php $_.FullName }`

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-14_pine-fib-parity.md`
- `.github/migration/audits/phase-0-pine-backend-parity-2026-05-14.md`
- `reports/fib-parity-validation.md`

# Remaining risks

- Live Pine-vs-backend parity on real symbols/timeframes was not runnable from this workspace and still needs manual sign-off.
- The backend does not expose Pine compression inputs as runtime settings; this patch uses the Pine v13.1.3 source defaults (`20` non-JPY pips, `40` JPY pips).
- Session grouping uses stored candle open timestamps in UTC, which matches current backend aggregation, but live parity should still confirm no exchange-calendar drift at real session boundaries.

# Any contract ambiguities resolved during implementation

- The `/charts` response previously exposed only `fibLevels` as a flat array. To preserve the existing response contract, `fibLevels` remains the backward-compatible `LTF_SF` array while additive top-level `LTF_SF` and `HTF_AF` arrays were added.
- No dedicated fib cache layer exists in the current repo, so there was no fib-specific cache key to invalidate. Existing candle/quote transient hygiene remains unchanged.
