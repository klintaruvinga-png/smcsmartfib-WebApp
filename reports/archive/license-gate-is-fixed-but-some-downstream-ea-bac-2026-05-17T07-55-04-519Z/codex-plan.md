# SMC SuperFIB — EA→Backend Bridge: Missing user_id Post-License-Gate

## 1. Issue validation

### Confirmed

- **Root cause confirmed:** `SendAccountSync`, `SendHeartbeat`, and `SendSymbolSync` in `mt5/MarketDataEngine.mqh` omit `user_id` from their JSON POST bodies. The PHP backend's `permission_ea_bridge()` gate (line 601 of `smc-superfib-sniper.php`) requires `user_id > 0` extracted from the request body or query string. Requests without it receive HTTP 400 `smc_sf_user_required` before any route handler executes.

- **Trigger confirmed:** The license gate fix (`SendLicenseCheck` now correctly includes `user_id` as a query param and succeeds) unblocked the first post-init bridge calls. `SendAccountSync` and `SendSymbolSync` are now reached for the first time in the live environment, immediately exposing the missing field.

- **Live error confirmed:** Log entry `SMC SuperFIB EA bridge auth failed: missing user_id.` captured 2026-05-16 maps exactly to line 601 in `permission_ea_bridge()`.

### Likely

- `SendHeartbeat` is also missing `user_id` by the same pattern. It is not yet separately confirmed in live logs, but the code audit (lines 469–485 of `MarketDataEngine.mqh`) shows no `user_id` field in its JSON body, and the same auth gate applies to all EA bridge routes.

### Unconfirmed

- Whether the MQL5 JSON library in use supports inserting an integer field into an existing JSON body object without side effects. The research report assesses this as high-confidence yes but flags it as unverified. Implementation agent must confirm before patching.

- Whether `ea_request_value()` (line 676 of `smc-superfib-sniper.php`) checks JSON body before query params or the reverse. The research report assumes body-first. Implementation agent must confirm extraction order before relying on JSON body injection being sufficient.

**Corrected root cause:** None required. Research report root cause is confirmed accurate and fully supported by code audit and live log evidence.

---

## 2. Implementation contract

### File 1: `mt5/MarketDataEngine.mqh`

**Scope:** Three POST methods — `SendHeartbeat` (~line 469), `SendAccountSync` (~line 506), `SendSymbolSync` (~line 565).

**Change required:**  
In each method's JSON body construction block, add exactly one additional field:

```
"user_id": <wpUserId>
```

where `wpUserId` is the member variable already initialized at lines 74–76 during engine construction. The field must be inserted as an integer (not a string). Placement should mirror the style of the existing JSON body fields in each method — do not restructure the object, insert the field alongside existing top-level keys.

**Guard rails:**
- Do not alter `SendLicenseCheck` (line 419–460). It sends `user_id` as a query param and is working. Leave it unchanged.
- Do not change the URL construction for any method.
- Do not change the HTTP verb for any method.
- Do not change any other fields in the JSON body.
- Do not change the `wpUserId` member variable name, type, or initialization path.
- Do not add `user_id` to the query string of POST methods — JSON body injection is the correct surface per Path A.

**Why in scope:** These are the only three EA bridge methods that construct a POST JSON body and omit the required auth field. They are the exact failure surface identified in logs.

**Acceptance criterion:** After patch, HTTP calls to `/ea/account-sync`, `/ea/heartbeat`, and `/ea/symbol-sync` must pass `permission_ea_bridge()` at line 596–606 without returning 400 `smc_sf_user_required`. Backend route handlers must execute and return 200 for valid payloads.

---

### File 2: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`

**Scope:** `permission_ea_bridge()` — lines 587–628. `ea_request_value()` — line 676.

**Change required:** No code change. This file is in scope only for **verification**. Implementation agent must:

1. Confirm `ea_request_value()` at line 676 extracts from JSON body before falling back to query params (or that it extracts from both and either is sufficient).
2. Confirm the `user_id` range check at line 606 (`> 0`) will pass for the integer values `wpUserId` can hold (range >= 1, default 1).
3. Confirm no additional field or header is expected by any of the three route handlers beyond what is already in the current payloads plus `user_id`.

**Guard rails:** Do not modify auth order, do not remove user validation, do not weaken the `> 0` check, do not change extraction logic.

**Why in scope:** The backend is the enforcement point. Verification is required before implementation to confirm JSON body injection is sufficient and no backend-side change is needed.

**Acceptance criterion:** Verification produces explicit confirmation that no PHP change is required. If verification reveals `ea_request_value()` does not read the JSON body, the plan must be re-escalated before implementation proceeds.

---

### File 3: `mt5/SMC_MarketDataEA.mq5`

**Scope:** Lines 177–201 — initialization sequence post-license-gate.

**Change required:** No code change. In scope for **verification only**. Implementation agent must confirm:

1. `wpUserId` is correctly passed from `SMC_MarketDataEA.mq5` input parameter `UserId` (line 28) into the `MarketDataEngine` constructor and stored as the `wpUserId` member variable.
2. `wpUserId` is accessible within `SendAccountSync`, `SendHeartbeat`, and `SendSymbolSync` without any additional argument passing.

**Guard rails:** Do not change init sequence. Do not change the call order: `SendAccountSync` → `SendSymbolSync` → `EventSetTimer`.

**Acceptance criterion:** Verification confirms `wpUserId` is a class-level member variable accessible to all three POST methods without modification to the calling layer.

---

## 3. Patch sequence

1. **Verify `ea_request_value()` extraction order** (`smc-superfib-sniper.php` line 676) — must confirm body-first before proceeding. If body-not-read, stop and re-escalate.

2. **Verify `wpUserId` member variable accessibility** (`MarketDataEngine.mqh` line 33) — confirm it is available inside `SendHeartbeat`, `SendAccountSync`, `SendSymbolSync` without argument change.

3. **Verify MQL5 JSON library supports integer field insertion** into existing body objects in all three methods.

4. **Patch `SendHeartbeat`** — add `"user_id": wpUserId` to JSON body.

5. **Patch `SendAccountSync`** — add `"user_id": wpUserId` to JSON body.

6. **Patch `SendSymbolSync`** — add `"user_id": wpUserId` to JSON body.

Steps 4–6 are independent of each other and may be applied in a single commit, but must not be applied before steps 1–3 complete successfully.

**Sequencing risk:** No database migration, no cache invalidation, no contract version bump required. The backend already accepts `user_id` in the body — this is a payload gap fix, not a contract change. No state sequencing risk beyond the verification gate at step 1.

---

## 4. Regression guards

**Checks implementation agent must run after patching:**

- Confirm `SendLicenseCheck` still includes `user_id` as a query param and has not been altered.
- Confirm no other JSON body fields were removed or reordered in the three patched methods.
- Confirm HTTP verb for each method is still POST (not changed to GET or any other method).
- Confirm `wpUserId` integer value in the payload matches the input parameter `UserId` configured for the EA — not hardcoded, not zero.
- Confirm `permission_ea_bridge()` auth gate returns HTTP 200 (not 400) for each of the three patched routes with a valid test `user_id`.

**Existing protections that must still hold:**

- API key header validation at line 596 must still execute before `user_id` check — auth order must not be inverted.
- `user_id > 0` check at line 606 must still reject zero or negative values.
- `UserId >= 1` range constraint in `SMC_MarketDataEA.mq5` input param must remain.

**Parity re-validations required:**

- After patch, confirm `smc_sf_account_snapshots` table receives a row from the first `SendAccountSync` call in a live test environment.
- After patch, confirm `smc_sf_symbol_sync` table receives rows from the first `SendSymbolSync` call.
- After patch, confirm dashboard reads non-empty account telemetry (equity, balance, margin) from the backend.
- After patch, confirm heartbeat polling does not trigger EA liveness failure alerts.

**Logging that must exist after patch:**

- Successful `SendAccountSync` must produce a backend log entry (or HTTP 200 response log) distinguishable from the previous `smc_sf_user_required` error.
- Absence of `SMC SuperFIB EA bridge auth failed: missing user_id.` in logs following a clean EA init is the primary pass signal.

---

## 5. Non-goals

**Out of scope for this patch:**

- Refactoring `permission_ea_bridge()` or `ea_request_value()` — backend is not the bug, do not touch it.
- Changing `SendLicenseCheck` — it is working and must not be modified.
- Adding `user_id` to query strings of POST methods (Path B) — not the chosen resolution path.
- Refactoring auth to derive user_id from API key header alone (Path C) — rejected as high-risk.
- Any change to Pine trading formulas or signal logic.
- Any change to dashboard frontend data layers or selectors.
- Heartbeat frequency or timer interval tuning.
- Multi-user or impersonation hardening — flagged as an edge case, not part of this bug.
- Adding new API fields or expanding the account-sync or symbol-sync payload beyond `user_id`.
- Changing the initialization call order in `SMC_MarketDataEA.mq5`.

**Attractive but unsafe follow-ons to avoid:**

- Do not consolidate `SendLicenseCheck`'s query-param `user_id` into the JSON body to "normalize" the pattern. It is working; touching it creates regression risk.
- Do not add `user_id` validation inside the MQL5 layer (beyond what already exists). Backend is the authority for user validation.
- Do not add retry logic to the three patched methods in this patch — that is a separate resilience concern.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly:**

If `user_id` is serialized as a string instead of an integer, or the JSON field name does not exactly match the key expected by `ea_request_value()`, backend extraction will fail silently and return 400. All three calls will remain broken with a different error pattern, making regression harder to diagnose. If `wpUserId` is read before it is initialized (e.g., if the patch is placed above the constructor assignment), calls will send `user_id = 0` and fail the `> 0` check.

**User-visible failure mode:**

Dashboard displays blank or stale account telemetry (equity, balance, margin). Symbol selector shows empty or stale symbol list. EA appears connected at the license level but no live account state is available. Heartbeat failure may eventually trigger an EA disconnection alert even when the EA is running.

**Backend authority or stale-state risks:**

`smc_sf_account_snapshots` and `smc_sf_symbol_sync` tables remain empty or stale. Any downstream calculation that reads from these tables (signal parity, Fib calculations, equity-based position sizing) operates on uninitialized baseline data. This is the most significant stale-state risk — Phase 2 readiness gates depend on live account state being present in the backend.

**Whether human approval should be required before merge:**

**Yes.** This patch touches the EA bridge auth contract. Requires line-by-line review of `wpUserId` injection in all three methods, integration test confirming HTTP 200 for each route, and parity validation confirming dashboard receives account and symbol data. Do not merge without explicit human sign-off on integration test results.

---

## 7. Test requirements

**Tests to add or update:**

- **Integration test — SendAccountSync:** Simulate EA init with valid `UserId`, call `SendAccountSync`, assert HTTP 200 from backend and a corresponding row in `smc_sf_account_snapshots`.
- **Integration test — SendSymbolSync:** Same pattern; assert HTTP 200 and row in `smc_sf_symbol_sync`.
- **Integration test — SendHeartbeat:** Assert HTTP 200; confirm no `smc_sf_user_required` error in response.
- **Negative test — user_id omitted:** Confirm that if `user_id` is removed from payload (simulating pre-patch state), backend still returns 400 `smc_sf_user_required`. This confirms the guard remains active.
- **Negative test — user_id = 0:** Confirm backend rejects payload with `user_id = 0`.

**Existing tests or manual checks that must still pass:**

- License gate test: `SendLicenseCheck` with valid `user_id` query param still returns license allowed.
- API key rejection test: request without valid API key header must still be rejected before reaching user_id check.
- EA initialization sequence: `SendAccountSync` → `SendSymbolSync` → `EventSetTimer` order must complete without fatal error in MT5 journal.

**Soak, replay, and live-environment verification:**

- After patch deployment, run EA in live test environment for a minimum of one full heartbeat cycle. Confirm heartbeat polling completes without auth error.
- Replay the Phase 1 EA bridge implementation report baseline: confirm all previously-failing calls now succeed and previously-passing calls remain passing.
- Confirm dashboard account telemetry panel populates from fresh account sync data (not cached or stale values).

---

## 8. Implementation handoff

**Branch naming recommendation:**

`fix/ea-bridge-missing-user-id-post-init`

**Suggested commit grouping:**

- Commit 1: Verification notes only (no code change) — document confirmed `ea_request_value()` extraction order and `wpUserId` member variable accessibility. Place in `reports/` or inline in commit message.
- Commit 2: `mt5/MarketDataEngine.mqh` — add `user_id` to `SendHeartbeat`, `SendAccountSync`, `SendSymbolSync` JSON bodies. Single commit for all three methods; they are tightly coupled by the same root cause and the same fix pattern.

**Required reports or artifacts after implementation:**

- Updated `reports/phase-1-ea-bridge-implementation-report.md` — add section documenting post-license-gate user_id fix: methods patched, before/after HTTP response codes, account snapshot row counts, symbol sync row counts.
- Log capture showing absence of `SMC SuperFIB EA bridge auth failed: missing user_id.` after a clean EA init cycle.
- Parity confirmation note: dashboard account and symbol data populated from fresh sync.

**State transition:**

`READY_FOR_IMPLEMENTATION` — `editing_locked=false`
