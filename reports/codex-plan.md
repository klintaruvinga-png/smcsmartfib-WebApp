# SMC SuperFIB - Claude Plan Hardening Request

---

## 1. Issue validation

**Confirmed**

- EA post-init payloads (`SendAccountSync`, `SendSymbolSync`) omitted `user_id` during a payload construction regression, causing `permission_ea_bridge()` to reject ingest requests with a 400/401/403 response due to the `user_id <= 0` guard.
- Backend auth gate (`smc-superfib-sniper.php` → `permission_ea_bridge()`) is the correct authority. It validates API key then enforces a positive `user_id` before any route handler runs. This model is sound and must not be relaxed.
- Phase 1 parity audit (`.github/migration/audits/phase-1-mt5-ea-post-init-user-id-parity-2026-05-17.md`) confirms code parity is now in place: EA emits `user_id` and backend consumes it. The fix code is present.

**Likely**

- The omission was introduced by a refactor of the post-init chain ordering (`license-check → account-sync → symbol-sync → heartbeat`). `wpUserId` was initialized after the first outbound call in some code paths, meaning early calls fired before `Initialize()` completed its `wpUserId` assignment.

**Unconfirmed**

- Whether any EA builds currently in circulation (compiled `.ex5` binaries distributed to live terminals) still pre-date the fix. Live attach evidence has not yet been collected.
- Whether an intermittent race condition on specific platforms can still cause `wpUserId` to be zero at the moment of payload construction even with the current source.

**Rejected hypotheses**

- Backend-side relaxation (Path B): rejected. Allowing missing `user_id` through a fallback widens the auth model and creates write-ownership ambiguity. Not in scope.
- Frontend involvement: no frontend signal authority is relevant here. Rejected entirely.

---

## 2. Implementation contract

> **Note:** Code parity is confirmed as present in the current source by the Phase 1 audit. The implementation contract below addresses the outstanding verification and any residual gap the live attach may expose. It does not pre-authorize rewriting already-correct code.

---

### File 1 — `mt5/MarketDataEngine.mqh`

- **Section to inspect:** `SendAccountSync()`, `SendSymbolSync()`, `SendLicenseCheck()`, `BuildWebhookPayload()`
- **Exact change required:** Verify that every outbound payload construction site reads `wpUserId` after `Initialize()` has assigned it and that the JSON key `user_id` is present in the serialised body (POST) or query string (GET). If any site reads `wpUserId` before assignment, move the read to after `Initialize()` completes.
- **Guard rails:** Do not alter the JSON key names `user_id`, `api_key`, or any existing field names. Do not alter the `BuildWebhookPayload()` signature or its return type. Do not remove the `wpUserId` class member.
- **Why in scope:** This file owns all payload construction. It is the confirmed origin of the omission.
- **Acceptance criterion:** Every call to `SendAccountSync()`, `SendSymbolSync()`, `SendLicenseCheck()`, and the heartbeat equivalent reads a non-zero `wpUserId` and serialises it into the outbound payload before the HTTP call is dispatched.

---

### File 2 — `mt5/SMC_MarketDataEA.mq5`

- **Section to inspect:** `OnInit()` — specifically the call to `Initialize(..., userId)` and the ordering of the post-init chain.
- **Exact change required:** Confirm that `Initialize()` is called and returns success before any post-init payload dispatch (license-check, account-sync, symbol-sync, heartbeat) is triggered. If any dispatch is scheduled or invoked before `Initialize()` completes, move it to after the success return.
- **Guard rails:** Do not alter the `UserId` EA input declaration or its variable name. Do not alter `OnTick()` or `OnTimer()` logic beyond what sequencing requires. Do not introduce new EA inputs.
- **Why in scope:** The EA owns the post-init chain ordering. An ordering defect here is the confirmed trigger hypothesis.
- **Acceptance criterion:** The post-init sequence executes strictly as `license-check → account-sync → symbol-sync → heartbeat`, each call preceded by a confirmed non-zero `UserId`.

---

### File 3 — `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`

- **Section to inspect:** `permission_ea_bridge()` — the `user_id <= 0` guard and `ea_request_value()` precedence.
- **Exact change required:** No code change expected or authorised. Verify only that the guard is intact: API key validated first, then `ea_request_value()` extracts `user_id` from JSON body before query params, then `user_id <= 0` rejects, then `wp_set_current_user()` binds.
- **Guard rails:** Do not soften the `user_id <= 0` rejection. Do not alter `ea_request_value()` precedence rules. Do not add a fallback admin resolution.
- **Why in scope:** This is the rejection site. Confirming it is unchanged and operating correctly closes the backend side of the contract.
- **Acceptance criterion:** A POST to `/ea/account-sync` with a valid API key and `user_id > 0` returns 200. A POST with `user_id` absent or zero returns a non-200 error with no DB write.

---

### File 4 — `wordpress/smc-superfib-sniper/tests/php/test-ea-*.php`

- **Section to inspect:** Tests covering `account-sync`, `symbol-sync`, and `heartbeat` routes.
- **Exact change required:** Confirm existing tests assert the `user_id` field is present in the request fixture and that the route returns 200 with a valid `user_id`. If any test fixture omits `user_id` or uses `user_id = 0`, update the fixture to use a valid positive integer. Do not relax any assertion.
- **Guard rails:** Do not remove existing assertions. Do not mock `permission_ea_bridge()` in a way that bypasses the `user_id` gate.
- **Why in scope:** These are the regression guards for the confirmed failure path.
- **Acceptance criterion:** All `test-ea-*.php` tests pass with `user_id` present and positive in every fixture.

---

## 3. Patch sequence

1. **Inspect `mt5/MarketDataEngine.mqh`** — audit all four payload construction sites against the confirmed fix. If a gap exists, apply the minimal correction (move read after assignment). No change if already correct.
2. **Inspect `mt5/SMC_MarketDataEA.mq5`** — confirm post-init chain ordering. If a sequencing defect exists, correct it. No change if already correct.
3. **Re-run PHP tests** (`test-ea-*.php`) — must pass before any live attach is attempted.
4. **Inspect `smc-superfib-sniper.php`** — read-only verification. Confirm no drift from the expected guard structure.
5. **Rebuild EA binary** — compile the current source into a fresh `.ex5`. This is required before live attach can validate the fix.
6. **Live attach validation** — attach the rebuilt EA to a live MT5 terminal, trigger the post-init chain, and collect logs and DB evidence.

**Sequencing risks:**

- Steps 1–2 must complete before step 5. Compiling a stale source invalidates the live attach evidence.
- Step 3 must pass before step 6. A failing PHP test means the backend is not in a known-good state.
- DB writes in step 6 depend on a valid `user_id` being present end-to-end. Any missing link in the chain will cause silent ingest failure, not a hard crash.

---

## 4. Regression guards

**Checks the implementation agent must run after patching:**

1. `php ./vendor/bin/phpunit wordpress/smc-superfib-sniper/tests/php/test-ea-*.php` — all tests green.
2. Compile EA source to `.ex5` with zero compiler warnings on the `user_id` payload sites.
3. Live attach: inspect MT5 journal for `user_id` in each of `account-sync`, `symbol-sync`, `license-check`, and heartbeat log lines.
4. Backend log: confirm 200 responses for all four routes with `user_id > 0`.
5. DB confirmation: verify rows written to `smc_sf_account_snapshots` and `smc_sf_symbol_sync` with the correct `user_id` foreign key.

**Existing protections that must still hold:**

- API key validation (`X-EA-API-Key`) must fire before `user_id` extraction.
- `ea_request_value()` JSON-before-query-params precedence must remain unchanged.
- `wp_set_current_user()` must only be called after a confirmed positive `user_id`.
- All existing PHP route tests must pass without fixture modification beyond `user_id` correctness.

**Parity re-validations required:**

- MT5 EA → Backend ingest parity: confirmed via live attach logs and DB row verification.
- Phase 1 gate re-validation: the pending live attach evidence from the existing audit must be completed and appended to `.github/migration/audits/phase-1-mt5-ea-post-init-user-id-parity-2026-05-17.md`.

**Logging and diagnostics:**

- MT5 journal must emit a log line containing `user_id` and the resolved value at the point each payload is dispatched.
- Backend must log the resolved `user_id` at the `permission_ea_bridge()` success path (if not already present).

---

## 5. Non-goals

**Out of scope for this patch:**

- Dashboard frontend changes of any kind.
- Pine script or TradingView formula changes.
- Backend fallback resolution for missing `user_id` (Path B is rejected).
- Changes to any DB schema, migration, or table structure.
- Changes to the `X-EA-API-Key` validation logic.
- Modifying or extending `ea_request_value()` beyond current behaviour.
- Audit of EA builds older than the current source — old binaries are a deployment concern, not a code patch concern.
- Any changes to heartbeat logic beyond confirming `user_id` is present.

**Attractive but unsafe follow-on changes to avoid in this patch:**

- Adding a permissive `user_id` fallback to unblock transient EA attaches — this would compromise write ownership and must not be introduced here or as a follow-on without explicit human approval and a dedicated migration gate.
- Refactoring `BuildWebhookPayload()` for generalisation — premature abstraction; the current contract is stable.
- Adding retry logic to the post-init chain — out of scope; sequencing correctness is the fix, not retry semantics.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**

- If `user_id` is hardcoded to a fixed value or resolved from the wrong scope, ingest writes will be attributed to the wrong WordPress user. Account snapshots and symbol sync rows will carry incorrect ownership, corrupting all downstream dashboard queries that filter by `user_id`. This is a silent data-integrity failure with no immediate visible error.

**User-visible failure mode:**

- Dashboard shows no account data or stale account data for the affected user. Symbol sync indicators are absent or frozen. The user has no feedback that the EA is rejected — the MT5 terminal may show no error if the EA continues running after a failed post-init ingest.

**Backend authority and stale-state risks:**

- If the PHP guard is weakened (not authorised in this patch), any EA with a valid API key can write ingest data without identity binding. This breaks the backend-as-authority model entirely.
- If the EA is not rebuilt before live attach, the live evidence is invalid and the Phase 1 gate cannot be closed.

**Human approval required before merge:** Yes.

- Live attach evidence must be reviewed by a human before this PR is merged. The audit must be updated with actual log lines and DB confirmation, not only code inspection. No automated gate can substitute for this step given the Phase 1 migration dependency.

---

## 7. Test requirements

**Tests to add or update:**

- `wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php` — add or confirm a test case that sends a POST with `user_id` present and positive and asserts a 200 response and a DB row written.
- `wordpress/smc-superfib-sniper/tests/php/test-ea-symbol-sync.php` — same as above for the symbol-sync route.
- `wordpress/smc-superfib-sniper/tests/php/test-ea-account-sync.php` — add or confirm a negative test case that sends `user_id = 0` or omits `user_id` and asserts a non-200 response and no DB write.

**Existing tests that must still pass:**

- All `test-ea-*.php` files in their current form, covering heartbeat, account-sync, symbol-sync, and license-check routes.
- No existing assertion may be relaxed or removed.

**Live and soak verification required:**

- Live attach: MT5 terminal attached to a real MetaTrader 5 instance, EA initialised with a valid `UserId` EA input, post-init chain triggered, journal and backend logs captured.
- DB soak: confirm rows in `smc_sf_account_snapshots` and `smc_sf_symbol_sync` appear within the expected window after EA attach.
- Parity replay: re-run the Phase 1 parity checklist from `.github/migration/audits/phase-1-mt5-ea-post-init-user-id-parity-2026-05-17.md` and append live evidence.

---

## 8. Implementation handoff

**Branch naming recommendation:**

```
fix/mt5-post-init-user-id-live-validation
```

**Suggested commit grouping:**

1. `fix(mt5): verify user_id emission in all post-init payloads` — any residual source correction in `MarketDataEngine.mqh` or `SMC_MarketDataEA.mq5`.
2. `test(php): harden user_id fixture coverage in ea bridge tests` — test fixture updates only.
3. `audit(phase-1): append live attach evidence to parity audit` — audit document update with log lines and DB confirmation.

**Required reports or artifacts after implementation:**

- Updated `.github/migration/audits/phase-1-mt5-ea-post-init-user-id-parity-2026-05-17.md` with live attach log lines and DB row confirmation.
- MT5 journal excerpt showing `user_id` in each of the four post-init dispatch log lines.
- Backend access log excerpt showing 200 responses for `/ea/account-sync` and `/ea/symbol-sync` with confirmed `user_id`.

**State transition:**

`READY_FOR_IMPLEMENTATION` — `editing_locked=false`
