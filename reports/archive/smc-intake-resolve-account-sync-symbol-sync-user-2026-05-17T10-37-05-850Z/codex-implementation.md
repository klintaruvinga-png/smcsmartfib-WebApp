# Issue summary

The current source already preserves the Phase 1 `user_id` contract for `/ea/license-check`, `/ea/account-sync`, `/ea/symbol-sync`, and `/ea/heartbeat`, but it did not emit the route-level diagnostics required to prove that a live MT5 attach is dispatching the same resolved `user_id` the backend authorizes. This patch keeps the existing backend authority and payload contract intact and adds only the missing observability needed for live parity validation.

# Root cause implemented

The remaining implementation gap was not another payload omission in source; it was the absence of direct dispatch/auth success logging around the resolved `user_id`. `mt5/MarketDataEngine.mqh` already serializes `wpUserId` into the relevant requests, and `permission_ea_bridge()` already rejects missing or invalid `user_id`, but neither side logged the resolved identifier at the exact handoff points required for live attach evidence. The implemented fix adds those diagnostics without widening auth behavior or changing any route contract.

# Exact files changed

- `mt5/MarketDataEngine.mqh` — added pre-dispatch journal logs for `SendLicenseCheck()`, `SendHeartbeat()`, `SendAccountSync()`, and `SendSymbolSync()` that include the resolved `user_id` and route context.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — added an auth-success log in `permission_ea_bridge()` after `wp_set_current_user()` so backend logs capture the resolved `user_id` on the accepted path.
- `.github/docs/BUG_SWEEP_REPORT_2026-05-17_account-sync-symbol-sync-user-id-observability.md` — added the required runtime-integrity bug sweep artifact for this issue.
- `.github/migration/audits/phase-1-mt5-ea-post-init-user-id-parity-2026-05-17.md` — updated the Phase 1 parity audit with the observability patch and current validation status.
- `reports/codex-implementation.md` — added the required implementation summary artifact.
- `reports/codex-implementation.meta.json` — added the required implementation metadata artifact bound to the current `reports/codex-plan.md` hash.

# Tests run

- `php wordpress/smc-superfib-sniper/tests/php/test-ea-heartbeat.php` — PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php` — PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php` — PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php` — PASS
- `npm run check:mql` — PASS
- `npm run validate:impl` — PASS
- `MetaEditor64.exe /compile:.../mt5/SMC_MarketDataEA.mq5` — INCONCLUSIVE (`exit=0`, but the local CLI produced no compiler log and no `.ex5` artifact)

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-17_account-sync-symbol-sync-user-id-observability.md`
- `.github/migration/audits/phase-1-mt5-ea-post-init-user-id-parity-2026-05-17.md`
- `reports/codex-implementation.md`

# Remaining risks

- Live MT5 attach validation is still required to prove the deployed EA binary logs and sends the expected `user_id` on the real terminal.
- Real backend log confirmation and DB row verification for `smc_sf_account_snapshots` and `smc_sf_symbol_sync` are not available from this workspace alone.
- Local MetaEditor CLI compilation was inconclusive even though the executable is installed; rebuild confirmation still needs human validation inside the MT5 environment.
- If a live terminal is still running an older compiled EA binary, these source-level diagnostics will not appear until that binary is rebuilt and redeployed.

# Any contract ambiguities resolved during implementation

The contract input said the source omission was the confirmed issue, but repository reality shows that `user_id` emission and init ordering are already fixed in the checked-in code. I resolved that ambiguity with the smallest safe interpretation: keep those working paths unchanged, add only the missing diagnostics explicitly required by the contract, and treat live attach/DB verification as a remaining external validation step rather than guessing at a nonexistent new payload fix.
