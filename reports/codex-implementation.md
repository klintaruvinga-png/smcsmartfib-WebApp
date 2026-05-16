## Issue summary

Replaced the deprecated MQL5 account info constant `ACCOUNT_FREEMARGIN` with `ACCOUNT_MARGIN_FREE` in `SendAccountSync()` so the EA no longer depends on a deprecated enum while preserving the existing `free_margin` payload contract.

## Root cause implemented

`mt5/MarketDataEngine.mqh` was still reading free margin with the deprecated `ACCOUNT_FREEMARGIN` constant from an older MT5 SDK convention. The current installed MetaTrader `MQL5\\Include\\Trade\\AccountInfo.mqh` and `Trade.mqh` use `ACCOUNT_MARGIN_FREE`, confirming the supported replacement in the local toolchain.

## Exact files changed

- `mt5/MarketDataEngine.mqh`
- `reports/codex-implementation.md`

## Tests run

- Pre-patch verification: searched `mt5/` for `ACCOUNT_FREEMARGIN` and confirmed a single occurrence at `mt5/MarketDataEngine.mqh:518`
- Toolchain verification: searched local MetaTrader MQL5 includes/examples and confirmed `ACCOUNT_MARGIN_FREE` is present and used with `AccountInfoDouble(...)`
- Post-patch verification: `git diff -- mt5/MarketDataEngine.mqh` shows exactly one token substitution on one line
- Post-patch verification: searched `mt5/` for `ACCOUNT_FREEMARGIN` and confirmed zero remaining occurrences
- Post-patch verification: searched `mt5/` for `ACCOUNT_MARGIN_FREE` and confirmed exactly one occurrence at `mt5/MarketDataEngine.mqh:518`
- Backend regression test: `php wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php` passed
- MT5 compile check: attempted headless compile via local `MetaEditor64.exe`, but this environment did not emit a compiler log or compile artifact; compile cleanliness therefore remains unverified from automation here

## Reports generated

- `reports/codex-implementation.md`
- No bug sweep report generated; issue is a deprecation-only MT5 constant replacement and does not alter runtime integrity, stale-data handling, wiring, or backend/dashboard truth
- No parity audit generated; no parity surface was changed

## Remaining risks

- Automated MT5 compile-time verification could not be conclusively observed from the local `MetaEditor64.exe` CLI because it returned without a log or artifact.
- The repository appears to have pre-existing unstaged changes in `reports/` metadata files; those were left untouched.

## Any contract ambiguities resolved during implementation

- The contract required confirming availability in MT5 build `4150+` before patching. I resolved this by verifying the replacement constant in the locally installed MetaTrader MQL5 include files and examples rather than widening scope to broader SDK or documentation changes.
