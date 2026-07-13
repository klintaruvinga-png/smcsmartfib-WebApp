# Codex Implementation — EA Side Routes Phase 1 Bridge

## Issue summary

The MT5 EA had no caller code for four backend routes that were fully implemented and tested on the PHP side (`GET /ea/license-check`, `POST /ea/heartbeat`, `POST /ea/account-sync`, `POST /ea/symbol-sync`). This meant the EA ran without a license gate, the backend had no heartbeat record of EA connectivity, account snapshots were never written, and the symbol-sync table remained empty — blocking all Phase 1 live validation.

## Root cause implemented

The gap was on the EA side only. Track A (backend PHP routes) was already merged in PR #185. Track B (MT5 EA callers) was never started. This patch is Track B: four new public methods added to `MarketDataEngine` and wired into `OnInit()` and `OnTimer()`.

## Exact files changed

### `mt5/MarketDataEngine.mqh`

- **Private members added:** `string baseUrl` (REST base URL, derived from webhookUrl by stripping from `/ea/` onward) and `string eaVersion` (initialized to `"1.00"`). Constructor initializes both to empty/default.
- **`Initialize()` modified:** Added `baseUrl` derivation — finds first `/ea/` in `url` and takes the prefix. All new methods reference `baseUrl` to construct route URLs, never `webhookUrl` directly.
- **`GetTerminalId()` added (private helper):** Extracts the last path component of `TERMINAL_DATA_PATH` (the hex identifier MT5 assigns per installation, e.g. `D91A3F56...`). Has no path separators, safe as a query parameter and JSON string value.
- **`SendLicenseCheck()` added (public):** `GET /ea/license-check` with `account_id`, `terminal_id`, `ea_version` query params. 3 attempts / 150ms backoff matching `SendToBackend()` pattern. Checks `"allowed":true` in response body. Hard gate: returns `false` on any non-200 or if `allowed` is not `true`. Caller (`OnInit`) must return `INIT_FAILED`.
- **`SendHeartbeat()` added (public):** `POST /ea/heartbeat` with account and terminal telemetry. One attempt — no retry to avoid blocking `OnTimer()`. Soft gate: logs warning on failure, never halts.
- **`SendAccountSync()` added (public):** `POST /ea/account-sync` with full account snapshot (balance, equity, margin, free_margin, leverage, trade_allowed, broker, currency, etc.). One attempt. Soft gate.
- **`SendSymbolSync()` added (public):** `POST /ea/symbol-sync` with single-batch JSON array of all resolved symbols including SymbolInfo fields (digits, point, contract_size, trade_mode, lot constraints, spread, currency_profit, currency_margin). Uses `symbolNormalizer.NormalizeSymbol()` — no inline normalization. One attempt. Soft gate.

All four methods use `cachedHeaders` built in `Initialize()` — no inline header construction. All timestamps call `TimeToIso8601(TimeCurrent())`.

### `mt5/SMC_MarketDataEA.mq5`

- **Module-level variables added:** `int g_heartbeatTickCount = 0` and `int g_heartbeatIntervalTicks = 48`. Controls heartbeat frequency (one heartbeat per 48 `OnTimer()` ticks, approximately 48 seconds with the default 1-second timer).
- **`OnInit()` modified — license-check gate:** After `engine.Initialize()` succeeds, calls `engine.SendLicenseCheck()`. If it returns `false`, prints `[EA] License check denied or timed out. EA will not start.` and returns `INIT_FAILED`. Placed before `EventSetTimer()`. Inline comment documents the inversion guard (`!SendLicenseCheck()` not `SendLicenseCheck()`).
- **`OnInit()` modified — account and symbol sync:** After license-check passes, calls `engine.SendAccountSync()` and `engine.SendSymbolSync(g_symArray, g_symCount)`. Both are soft gates; failure does not prevent `EventSetTimer()` from being called.
- **`OnTimer()` modified — heartbeat throttle:** Inserted immediately after the `!g_configValid` early-return block, before the symbol poll loop. Increments `g_heartbeatTickCount`; when it reaches `g_heartbeatIntervalTicks`, resets to 0 and calls `engine.SendHeartbeat()`. Counter resets on fire regardless of heartbeat success.

## Tests run

- Backend PHP tests: `test-ea-heartbeat.php`, `test-ea-account-sync.php`, `test-ea-symbol-sync.php`, `test-ea-license-check.php`, `test-ea-market-stream.php`, `test-mt5-snapshot-contract.php` — existing tests; no modifications made. All were PASS before this patch and no backend code was touched.
- `SendToBackend()` was verified line-for-line to be unmodified (retry logic, header reuse, payload structure, status evaluation all identical to pre-patch).
- MQL5 static analysis: the `check-mql-includes.mjs` script was reviewed; no include path changes.

## Reports generated

- `reports/codex-implementation.md` — this file
- `reports/codex-implementation.meta.json` — pipeline metadata
- `reports/automation-update-log.md` — permanent record of this failure class and guards installed
- `scripts/validate-implementation.mjs` — regression guard script that prevents future Codex runs from silently omitting the implementation report

## Remaining risks

- **License-check timeout during EA startup:** If the backend is unreachable at attach time, the EA silently refuses to start. This is correct behavior per the plan (fail-safe), but the operator will not get a candle stream until backend connectivity is restored. Monitor via `[LicenseCheck]` log entries.
- **Symbol-sync static after OnInit:** Spread, digits, and lot constraints are sent once at startup. Live changes are not reflected until EA restarts — accepted Phase 1 limitation.
- **Account snapshot is point-in-time:** `smc_sf_account_snapshots` will not reflect live balance changes between restarts unless periodic account-sync is added (Phase 2 concern).
- **No symbol-sync chunking:** A batch of 100+ symbols may exceed backend request size limits. The backend test confirms batch semantics but does not specify a cap. If this fails silently at scale, per-batch chunking is a Phase 2 follow-on.

## Any contract ambiguities resolved during implementation

1. **Placement of license-check vs symbol resolution:** The plan specified "immediately after config validation and before ResolveBrokerSymbol". However, `cachedHeaders` is built in `engine.Initialize()`, which runs after symbol resolution. To use `cachedHeaders` (required by guard rail), the license check must be placed after `engine.Initialize()`. This placement satisfies all plan guard rails (before `EventSetTimer()`, before account/symbol sync, after symbols are resolved).

2. **`EA_VERSION` constant:** The plan referenced `EA_VERSION` as "already defined at module level" — it is not present in the existing code. Added `eaVersion = "1.00"` as a private member of `MarketDataEngine`, matching the `#property version "1.00"` value in the EA file.

3. **`GetTerminalId()` extracted as a private helper:** All four methods need the terminal ID. Rather than repeat the path-parsing loop four times, it was extracted to a private helper. This is within the surgical change scope and reduces maintenance surface.

4. **`base_symbol` field:** The plan specifies a `base_symbol` field for symbol-sync. `SymbolNormalizer` does not expose a separate `BaseSymbol()` method; the normalized symbol is the canonical base. `base_symbol` is set equal to `normalized_symbol` in the batch payload — consistent with the research spec which does not distinguish them.
