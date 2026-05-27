# US30 / NAS100 SymbolSelect Fix Evidence

Date: 2026-05-27
Branch: `codex/smc-intake-us30-and-nas100-keep-going-offline-ho`

## Scope

This artifact records the permanent code-side fix for the recurring US30 / NAS100 offline pattern identified in the implementation contract: explicit `SymbolSelect()` subscription and startup diagnostics in `mt5/SMC_MarketDataEA.mq5` `OnInit()` after `g_symArray[]` population and before `engine.Initialize()`.

## Code evidence

- File: `mt5/SMC_MarketDataEA.mq5`
- Added loop:
  - iterates `g_symArray[0..g_symCount-1]`
  - calls `SymbolSelect(g_symArray[i], true)`
  - logs `[SymbolSelect] <symbol>: OK` on success
  - logs `[SymbolSelect] <symbol>: WARN broker unavailable | error=<code>` on failure
  - does not fail `OnInit()` on select failure

## Local validation evidence

- `npm run check:mql` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/phase3_mt5_simulation_test.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php` -> PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php` -> PASS
- `npm run build` -> PASS

## MetaEditor rebuild status

- `MetaEditor64.exe` is installed on this machine.
- CLI compile was attempted against `mt5/SMC_MarketDataEA.mq5`.
- Result: inconclusive from workspace automation. The process exited without emitting a compiler log or a newly timestamped `.ex5` artifact inside the workspace-accessible paths.

## Live deployment evidence

Not captured in this workspace.

The following required production checks remain pending and must be completed by the MT5 operator after redeploy:

- EA startup Journal excerpt showing `[SymbolSelect] US30: OK`
- EA startup Journal excerpt showing `[SymbolSelect] NAS100: OK`
- full `[SymbolSelect]` line coverage for every symbol in the runtime `Symbols` override
- backend snapshot query confirming US30 / NAS100 rows with `status='live'` during an active US equity session
- dashboard screenshot showing live badges for US30 / NAS100 during the same session
- confirmation that pre-market/off-session still renders `offline`

## Pre-market protection

Unchanged by this patch. No session windows, freshness thresholds, backend `CLOSED` / `DISCONNECTED` mapping, or dashboard state interpretation were modified.
