# Phase 0 MT5 Parity Audit - 2026-05-27

Date: 2026-05-27
Engine: MT5 multi-symbol startup subscription path
Scope: `SMC_MarketDataEA.mq5` `OnInit()` `SymbolSelect()` hardening for US30 / NAS100 recurring offline prevention

## Authority parity

- MT5 remains the source of truth for symbol freshness and market-open classification.
- No PHP freshness mapping, dashboard state rendering, session windows, or Pine formulas were changed.
- This patch only hardens symbol subscription before the first timer cycle and adds startup observability.

## Root cause under audit

The contract identified a deployment-gap failure path where `SymbolInfoTick()` can return `false` for non-chart symbols that are not subscribed in Market Watch. That causes `engine.OnTick()` not to fire for those symbols, freshness ages to `DISCONNECTED`, backend persists `offline`, and the dashboard mirrors the offline state.

## Patch under audit

- Added explicit `SymbolSelect(g_symArray[i], true)` loop in `SMC_MarketDataEA.mq5` `OnInit()`
- Placement: after `g_symArray[]` population is complete and before `engine.Initialize()`
- Added one diagnostic line per symbol:
  - success: `[SymbolSelect] <symbol>: OK`
  - failure: `[SymbolSelect] <symbol>: WARN broker unavailable | error=<code>`
- Failure to select does not return `INIT_FAILED`

## Validation results

- `npm run check:mql`: PASS
- `php wordpress/smc-superfib-sniper/tests/php/phase3_mt5_simulation_test.php`: PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`: PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php`: PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`: PASS
- `npm run build`: PASS
- `MetaEditor64.exe /compile ... mt5/SMC_MarketDataEA.mq5`: INCONCLUSIVE
  - `MetaEditor64.exe` is installed locally.
  - The automated CLI attempt exited without producing a compiler log or a newly timestamped workspace-visible `.ex5` artifact.

## Acceptance criteria status

- [x] `g_symArray[]` / `g_symCount` finalized before the explicit subscription pass
- [x] `SymbolSelect()` now runs in `OnInit()` on every resolved symbol
- [x] `OnTimer()` polling loop remains unchanged
- [x] Backend `CLOSED` / `DISCONNECTED -> offline` contract remains unchanged
- [ ] Live MT5 Journal confirms `[SymbolSelect] US30: OK` during EA startup
- [ ] Live MT5 Journal confirms `[SymbolSelect] NAS100: OK` during EA startup
- [ ] Backend snapshot rows show US30 and NAS100 `status='live'` during an active US equity session
- [ ] Dashboard shows live badges for US30 and NAS100 during the same session
- [ ] Pre-market/off-session still shows `offline` for US30 and NAS100 after redeploy

## Parity status

**Conditional PASS**

Code parity is now in place for the startup subscription path, and local backend-contract regressions remain green. Full MT5 -> backend -> dashboard live-session parity for US30/NAS100 still requires operator-run redeploy and observation.

## Known limits

- This workspace cannot produce authoritative MT5 Journal, backend SQL, or dashboard screenshot evidence from the live terminal.
- Repository reality already included `SymbolSelect()` inside `ResolveBrokerSymbol()` and `MarketDataEngine.Initialize()`. The contract-required `OnInit()` loop is therefore treated as an explicit guard and observability fix at the resolved-symbol boundary, not an architectural rewrite.
