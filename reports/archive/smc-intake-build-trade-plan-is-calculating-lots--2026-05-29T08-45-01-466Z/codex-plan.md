## 1. Issue validation

- `Confirmed`: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` `build_trade_plan()` currently sizes risk from `get_account_state($user_id)` and then forces `$equity = max((float) $account['equityUSC'], 1)`.
- `Confirmed`: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` `get_account_state()` reads the `account_snapshots` blob written by `post_user_account()`, defaults `balanceUSC` and `equityUSC` to `0`, and marks the snapshot `stale` when `account.updatedAt` is older than 300 seconds.
- `Confirmed`: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` `read_account_telemetry()` is a separate backend path backed by `smc_sf_account_telemetry`, and `src/components/sniper/WalletOverview.tsx` reads that live telemetry via `/account-telemetry`.
- `Confirmed`: `src/components/PlanCard.tsx` only formats and displays backend-authored `plan.lotSize.e1/e2/e3`; it is not recomputing lot sizes.
- `Confirmed`: the report correctly identifies the masking behavior of `max(..., 1)`, but it does not fully identify the authority split that makes the mismatch visible in the app.
- `Likely`: the real failure path is backend plan sizing using the wrong account-equity authority source. The stale/empty `/user/account` snapshot is being treated as sizing input while the app-visible wallet values come from live `/account-telemetry`.
- `Likely`: the smallest safe correction is to size from live telemetry equity only, and to invalidate sizing when live positive telemetry equity is unavailable rather than inventing a `1 USC` fallback.
- `Unconfirmed`: the report does not prove that `balanceUSC` should ever replace `equity` for risk sizing. No balance fallback should be added in this patch without stronger evidence.
- `Unconfirmed`: the report does not prove any frontend file needs modification; current evidence shows a downstream display of backend output, not a UI-originated defect.
- `Unconfirmed`: the report does not prove any alternate queue or plan writer bypasses `build_trade_plan()`.
- `Rejected root cause`: "stale or empty snapshot plus `max(..., 1)`" is incomplete as the root cause because it omits the confirmed authority mismatch between `/user/account` and `/account-telemetry`.
- `Corrected root cause`: `build_trade_plan()` is sourcing equity from the wrong backend account store for live sizing, and the `max((float) $account['equityUSC'], 1)` fallback converts that authority failure into fake nonzero risk instead of surfacing invalid sizing.

## 2. Implementation contract

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  Exact target: `build_trade_plan()` and, only if needed to keep the logic isolated, one small private helper adjacent to `read_account_telemetry()` / `get_account_state()` for resolving sizing equity.
  Exact change required: remove the sizing dependency on `get_account_state()['equityUSC']` and stop using `max((float) $account['equityUSC'], 1)` as a fallback. Resolve plan-sizing equity from `read_account_telemetry($user_id)` when telemetry freshness is `live` and `equity > 0`. If live positive telemetry equity is unavailable, keep the plan shape intact but return non-executable sizing: `lotSize.e1/e2/e3 = 0`, `riskUSC = 0`, `riskZAR = 0`, `drawdownImpactPct = 0`, and `state = 'INVALID'`. Keep entry, stop, TP, RR, ladder, `signalId`, `executionSource`, `ladderId`, and `stageFills` structure unchanged.
  Guard rails: do not change fib ratios, stage-risk allocation, stop/TP math, `0.01` lot floor behavior for valid plans, stale-data thresholds, `/account-telemetry` freshness rules, `/user/account` route behavior, or any frontend contract. Do not add a `balance` fallback in this patch.
  Why this file is in scope: it is the only confirmed production authority where the wrong account source and fake-equity fallback are applied.
  Acceptance criterion tied to the failure path: when the account blob is stale or zeroed but live account telemetry reports positive equity, `riskUSC` and `lotSize` must be derived from telemetry equity. When live telemetry is stale, missing, or non-positive, the returned plan must no longer look like a tiny valid plan; it must be structurally intact but explicitly non-executable.

- `wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php`
  Exact target: the `build_trade_plan()` regression scenarios in this file.
  Exact change required: add a case where the `account_snapshots` blob is stale/zeroed while `account_telemetry` is live and positive, and assert that plan sizing follows live telemetry rather than blob equity. Add a second case where telemetry is stale or unavailable and assert that the plan returns `state = 'INVALID'`, zero risk, and zero stage lots instead of the current fake `1 USC` sizing path. Preserve the existing valid-plan progressive lot math checks.
  Guard rails: do not weaken the existing progressive stage assertions, do not convert the expected sizing base from equity to balance, and do not replace backend math assertions with UI-only symptoms.
  Why this file is in scope: it is the existing backend regression surface already covering staged lot sizing and the `0.01` floor.
  Acceptance criterion tied to the failure path: the suite fails if `build_trade_plan()` still reads blob equity for live sizing, still applies the fake `1 USC` floor, or still emits executable-looking risk fields when live telemetry equity is unavailable.

## 3. Patch sequence

1. Update `wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php` first to encode the corrected authority contract before touching production logic.
2. Patch `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` so `build_trade_plan()` resolves sizing equity from live account telemetry and returns an invalid, non-executable plan when live telemetry equity is not available.
3. Re-run the targeted PHP regression suite and confirm the existing progressive valid-plan cases still pass unchanged.
4. Re-run the existing frontend plan-route regression suite to confirm the unchanged UI still mirrors backend lot values and still blocks non-executable ladders.

- Dependencies: the production PHP change depends on the new failing regression proving the corrected authority rule.
- Dependencies: the invalid-plan branch depends on keeping the existing plan shape so downstream consumers do not need a contract rewrite.
- State, cache, migration, or contract sequencing risk: `ensure_engine_snapshot()` caches plans for the existing 2-second refresh window and does not key snapshot validity to account telemetry freshness. Do not widen snapshot invalidation or add schema changes in this patch unless testing proves the existing refresh window is insufficient after the authority fix.

## 4. Regression guards

- Verify `build_trade_plan()` still preserves existing fib entries, per-stage stops, TP mapping, RR calculation, and 20/30/50 stage-risk allocation for valid plans.
- Verify the existing `0.01` minimum lot execution floor and `enforce_progressive_stage_lots()` behavior still hold for valid plans.
- Verify `/ladders` still returns the same plan keys and types; only the sizing authority and invalid-sizing branch may change.
- Verify the frontend still remains a pure consumer of backend `lotSize` values and does not gain any fallback or recomputation logic.
- Verify stale-data protections still hold: stale or missing telemetry must not be promoted into a live sizing source, and stale `/user/account` snapshot data must not silently size risk.
- Verify no new balance-based sizing fallback was introduced.
- Parity re-validations required: backend `riskUSC` must equal `telemetry_equity * perTradePct / 100` for the same user and signal, and dashboard stage lots must still mirror backend `lotSize` exactly.
- Logging or diagnostics after the patch: if any diagnostic is added, keep it scoped to backend sizing authority failure only. Do not add noisy general logging or weaken existing stale-state handling.

## 5. Non-goals

- Do not modify `src/components/PlanCard.tsx`, `src/routes/-plan.test.tsx`, or any frontend rendering logic unless a backend contract break is proven during implementation.
- Do not change `/user/account` route semantics or repurpose the account blob into the live sizing authority.
- Do not add a `balance` fallback when `equity` is unavailable.
- Do not change Pine formulas, signal generation, fib ratios, stop placement logic, or staged risk-allocation percentages.
- Do not redesign engine-snapshot invalidation, telemetry freshness thresholds, or execution-queue behavior in this patch.
- Do not add schema migrations, table changes, or cross-phase cleanup work.
- Avoid attractive but unsafe follow-ons in this patch: merging account stores, redesigning wallet/plan UX, or broad telemetry synchronization refactors.

## 6. Risk assessment

- Worst-case failure mode if patched incorrectly: orders are sized from the wrong account base, producing materially incorrect live exposure or falsely blocking valid execution.
- User-visible failure mode: the wallet panel shows live equity while the plan card shows zero or tiny staged lots, or the inverse after an incorrect fallback.
- Backend authority or stale-state risks: using `/user/account` as a live authority or introducing a balance fallback would bypass the confirmed MT5/account-telemetry authority boundary. Treating stale telemetry as live would directly weaken stale-data protections.
- Whether human approval should be required before merge: `Yes`. This patch changes the authoritative risk-sizing input for live trade plans and must be reviewed before merge.

## 7. Test requirements

- Tests to add or update, with exact target area: update `wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php` with one live-telemetry-overrides-stale-blob scenario and one stale-or-missing-telemetry-invalidates-sizing scenario.
- Existing tests or manual checks that must still pass: the current valid-plan scenarios in `wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php` must still pass unchanged, and the existing `src/routes/-plan.test.tsx` execution-gating assertions must still pass unchanged.
- Existing tests or manual checks that must still pass: re-run `wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php` to ensure the telemetry freshness contract the fix now depends on is still intact.
- Any soak, replay, parity, or live-environment verification needed: capture one live `/account-telemetry` response and one `/ladders` response for the same user and confirm `riskUSC` matches telemetry equity under the configured `perTradePct`. Then simulate stale or unavailable telemetry and confirm `/ladders` returns `state = 'INVALID'`, zero risk, and zero lots without breaking plan structure.
- Any soak, replay, parity, or live-environment verification needed: manually open the plan page after each scenario and confirm the existing UI warnings and execution-disabled behavior still reflect the backend plan without frontend recomputation.

## 8. Implementation handoff

- Branch naming recommendation: `hardening/telemetry-authoritative-plan-sizing`
- Suggested commit grouping:
  - `test(php): pin trade-plan sizing to live account telemetry`
  - `fix(backend): remove fake account-equity fallback from build_trade_plan`
- Required reports or artifacts to generate after implementation:
  - targeted output from `wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php`
  - targeted output from `wordpress/smc-superfib-sniper/tests/php/test-phase2-trade-telemetry.php`
  - targeted output from `src/routes/-plan.test.tsx`
  - one sample `/account-telemetry` payload and the matching `/ladders` payload showing `riskUSC`, `lotSize`, and `state`
- State transition required after plan handoff: `READY_FOR_IMPLEMENTATION` with `editing_locked=false`
