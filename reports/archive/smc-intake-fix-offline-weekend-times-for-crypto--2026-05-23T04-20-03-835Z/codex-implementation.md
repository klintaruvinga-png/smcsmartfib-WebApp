# Issue summary

Crypto symbols were being classified as weekend-closed by the MT5 `SessionManager`, which caused weekend crypto payloads to propagate `CLOSED` freshness and land in the dashboard as `offline` even while candles continued streaming.

# Root cause implemented

Added an explicit crypto symbol classifier in `mt5/SessionManager.mqh` and used it as an early-return guard in `IsMarketOpenForSymbol()` so normalized crypto symbols stay market-open during weekend gating. Added a narrow MT5 regression script for Saturday UTC classification checks and one PHP regression assertion confirming a crypto `LIVE` snapshot persists as non-offline state. Validation details are pending and will be appended after step 6.

# Exact files changed

- `mt5/SessionManager.mqh`
- `mt5/SessionManagerWeekendClassificationTest.mq5`
- `wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php`

# Tests run

- `node mt5/check-mql-includes.mjs` — passed
- `php wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php` — passed
- `php wordpress/smc-superfib-sniper/tests/php/phase3_mt5_simulation_test.php` — passed
- `MetaEditor64.exe /compile:.../mt5/SessionManagerWeekendClassificationTest.mq5` — inconclusive; CLI returned without a repo-local compiler log or `.ex5` artifact
- `MetaEditor64.exe /compile:.../mt5/SMC_MarketDataEA.mq5` — inconclusive; CLI returned without a repo-local compiler log or `.ex5` artifact

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-23_crypto-weekend-offline-state.md`
- `.github/migration/audits/phase-3-mt5-parity-2026-05-23.md`

# Remaining risks

- Live weekend parity remains unverified until the patched EA is recompiled, reloaded, and observed on Saturday/Sunday UTC with crypto live and FX closed in the same session.
- MetaEditor CLI compilation remains inconclusive from this workspace because no compiler artifact or log was emitted locally even though the process returned successfully.
- The contract kept session-label logic out of scope, so weekend crypto may still surface a closed/weekend session label while freshness gating remains live.

# Any contract ambiguities resolved during implementation

- The contract asked for a backend test using `freshness=FRESH`, but the repository’s canonical MT5 freshness contract is `LIVE|DELAYED|STALE|CLOSED|DISCONNECTED`. Safest grounded interpretation: use `LIVE` in the new backend regression assertion instead of silently widening the PHP freshness API.
- The contract’s suggested two-commit grouping conflicts with the mandatory requirement that `reports/codex-implementation.md` exist before validation and be staged with the code changes. Safest implementation path: keep the summary file in the same final patch set and record this ambiguity here.
