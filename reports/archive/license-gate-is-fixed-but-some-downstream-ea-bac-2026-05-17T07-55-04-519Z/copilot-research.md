# SMC SuperFIB EA→Backend Bridge: Missing user_id Post-License-Gate Research Report

**Issue:** License gate is fixed, but some downstream EA→backend bridge calls are still missing user_id. Immediately after the successful license allow, logs show: SMC SuperFIB EA bridge auth failed: missing user_id. Migration is no longer blocked at the license gate. The next bug is now isolated to the bridge request payload after init.

---

## 1. Issue classification

- **Severity:** CRITICAL
- **Category:** runtime-bug, wiring, data-contract
- **Layer(s) affected:** MT5 EA, PHP-backend, REST-API, workflow
- **Phase impact:** Phase 1 (EA bridge implementation), blocks Phase 2+ migration progression

---

## 2. Confirmed evidence

### Bridge Initialization Sequence
**Source:** [mt5/SMC_MarketDataEA.mq5](mt5/SMC_MarketDataEA.mq5#L177-L201)

After license gate passes (line 180), initialization sequence calls:
- Line 197: `SendAccountSync()` — first call after license success
- Line 199: `SendSymbolSync()` — second call after license success
- Line 201: `EventSetTimer()` — timer starts

### Authorization Requirement
**Source:** [wordpress/smc-superfib-sniper/smc-superfib-sniper.php](wordpress/smc-superfib-sniper/smc-superfib-sniper.php#L587-L628)

All EA bridge routes require `permission_ea_bridge()` callback validation:
- Line 601: **user_id REQUIRED and MUST be > 0** — HTTP 400 error if missing
- Line 600: user_id extracted via [ea_request_value()](wordpress/smc-superfib-sniper/smc-superfib-sniper.php#L676) from JSON body OR query params
- Line 606: user_id must reference valid WordPress user

### Bridge Call Audit
**Source:** [mt5/MarketDataEngine.mqh](mt5/MarketDataEngine.mqh) transport methods

| Route | Line | Method | user_id in Payload | Error in Logs? |
|-------|------|--------|-------------------|---|
| `/ea/license-check` | 419-460 | GET | YES (query: `?user_id=<wpUserId>`) | No |
| `/ea/heartbeat` | 461-505 | POST | **NO** | Likely |
| `/ea/account-sync` | 506-564 | POST | **NO** | **YES** |
| `/ea/symbol-sync` | 565-636 | POST | **NO** | **YES** |

SendLicenseCheck (line 430) correctly includes: `"?user_id=" + IntegerToString(wpUserId)`

SendHeartbeat (lines 469-485), SendAccountSync (lines 517-539), SendSymbolSync (lines 572-626) omit user_id entirely from JSON body.

### Live Error Evidence
**Source:** [reports/phase-1-ea-bridge-implementation-report.md](reports/phase-1-ea-bridge-implementation-report.md#L46)

Live logs documented 2026-05-16:
```
SMC SuperFIB EA bridge auth failed: missing user_id.
```

Error location: [permission_ea_bridge() line 601](wordpress/smc-superfib-sniper/smc-superfib-sniper.php#L601) returns HTTP 400 with error code `smc_sf_user_required`.

Failure occurs AFTER license gate passes but BEFORE downstream route handlers execute.

### User ID Source in EA
**Source:** [mt5/SMC_MarketDataEA.mq5](mt5/SMC_MarketDataEA.mq5#L28)

Input parameter `UserId` (line 28) defaults to 1, range >= 1.  
Passed to engine during initialization: [MarketDataEngine.mqh](mt5/MarketDataEngine.mqh#L74-L76) stores as `wpUserId` member variable.

---

## 3. Root cause hypothesis

### Most Likely Root Cause
**SendAccountSync, SendHeartbeat, and SendSymbolSync methods do not include user_id in their JSON request bodies.**

**Why this hypothesis fits the evidence:**
- Confirmed: SendLicenseCheck includes user_id as query param (line 430 in MarketDataEngine.mqh) → succeeds
- Confirmed: SendAccountSync, SendHeartbeat, SendSymbolSync omit user_id from JSON body (lines 469-626) → fail auth gate
- Confirmed: Backend permission_ea_bridge() requires user_id in request payload (body OR query), not from auth header alone (line 600)
- Confirmed: Live logs show "missing user_id" error, meaning the auth gate rejects the request before route handler executes

### Trigger
License gate fix (SendLicenseCheck now working) unblocked the first bridge call, exposing the missing user_id in downstream calls that were previously never reached due to license failure.

**Root cause confidence:** Confirmed via code audit.  
**Trigger confidence:** Hypothesis (license gate now passing allows downstream calls to run).

---

## 4. Blast radius

### Files Directly Affected
- [mt5/MarketDataEngine.mqh](mt5/MarketDataEngine.mqh) — SendHeartbeat (line 461), SendAccountSync (line 506), SendSymbolSync (line 565)
- [wordpress/smc-superfib-sniper/smc-superfib-sniper.php](wordpress/smc-superfib-sniper/smc-superfib-sniper.php#L587-L628) — permission_ea_bridge() validation

### Systems Reading/Writing Broken Component
- **mt5/SMC_MarketDataEA.mq5** — calls SendAccountSync, SendHeartbeat, SendSymbolSync after init; relies on successful response
- **WordPress DB** — [smc_sf_account_snapshots](wordpress/smc-superfib-sniper/smc-superfib-sniper.php#L2334) expects POST /ea/account-sync to succeed and persist account telemetry
- **WordPress DB** — [smc_sf_symbol_sync](wordpress/smc-superfib-sniper/smc-superfib-sniper.php#L2401) expects POST /ea/symbol-sync to succeed and persist symbol configuration

### Parity Surfaces at Risk
- **MT5 <-> Backend:** Account sync blocked; backend never receives live account state (equity, balance, margin)
- **MT5 <-> Backend:** Symbol sync blocked; backend never receives live symbol list for the terminal
- **MT5 <-> Backend:** Heartbeat blocked; backend never receives EA liveness/status updates
- **Dashboard <-> Backend:** Dashboard relies on smc_sf_account_snapshots for account telemetry; table remains empty if account-sync fails
- **Dashboard <-> Backend:** Dashboard relies on smc_sf_symbol_sync for symbol mapping; table remains empty if symbol-sync fails

### Stale-State Risks
- Backend account context remains uninitialized; no baseline for equity/balance validation
- Dashboard displays stale or empty account data; user sees blank UI or defaults
- Symbol mapping missing; dashboard cannot correlate Pine symbols to MT5 symbols
- Heartbeat missing; EA crash detection fails; MT5 appears healthy even if disconnected

---

## 5. Regression surface

### Currently Working Behavior That Could Break
- **SendLicenseCheck** currently working with user_id as query param — must remain as query param to avoid regression
- **Auth header validation** — API key checking via header works; must not be removed or weakened
- **User validation** — backend verifies user_id references real WordPress user; must not be skipped

### Existing Guards/Protections
- [permission_ea_bridge() line 596](wordpress/smc-superfib-sniper/smc-superfib-sniper.php#L596) validates API key before checking user_id → maintains auth order
- [permission_ea_bridge() line 606](wordpress/smc-superfib-sniper/smc-superfib-sniper.php#L606) validates user_id after extraction → ensures valid user_id range
- [MarketDataEngine.mqh initialization](mt5/MarketDataEngine.mqh#L74-L76) validates UserId >= 1 before storing → ensures non-zero default

### Tests/Audits Covering This Area
- [PHASE1_EA_BRIDGE_IMPLEMENTATION_REPORT](reports/phase-1-ea-bridge-implementation-report.md) — documents license gate fix; provides baseline for testing downstream calls
- License gate logs (captured 2026-05-16) — baseline for comparing before/after fix

---

## 6. Resolution path options

### Path A: Add user_id to JSON body for SendAccountSync, SendHeartbeat, SendSymbolSync (RECOMMENDED)
- Narrow surface: three method changes in [MarketDataEngine.mqh](mt5/MarketDataEngine.mqh)
- Add `"user_id": wpUserId` to JSON body in SendHeartbeat (line ~480), SendAccountSync (line ~530), SendSymbolSync (line ~620)
- Mirrors SendLicenseCheck approach: always include user_id in request payload
- Backend permission_ea_bridge() already expects user_id in JSON body or query; no backend change needed
- Risk: Minimal; does not weaken any existing guards; adds explicit required field

**Why recommended:** Narrowest change surface, preserves existing validation order, follows SendLicenseCheck pattern already proven working, minimal backend re-validation risk.

### Path B: Add user_id to query string for all POST methods
- Alternative transport: append `?user_id=<wpUserId>` to all POST URLs instead of JSON body
- Requires URL rewrite in three methods
- Backend can extract from query param via ea_request_value() (line 676) — already supports both body and query
- Risk: Inconsistent with POST convention; query params for POST are unusual
- Not recommended: Path A is more idiomatic and requires fewer transport changes

### Path C: Refactor auth to extract user_id from auth header only
- Remove user_id requirement from request payload; rely on API key → auth header logic
- Backend change: modify permission_ea_bridge() to derive user_id from API key mapping
- High risk: requires backend logic refactor; increases coupling between auth key and user_id; violates principle of explicit request context
- Not recommended: increases complexity and data-contract fragility

---

## 7. Risk flags

### High-Risk System Involved
**Yes.** EA bridge is critical path for MT5 authority initialization and ongoing sync. Missing account/symbol data blocks dashboard and prevents proper signal validation.

### Requires Parity Re-validation
**Yes.** Signal engine parity depends on account telemetry (equity, balance) and symbol mapping. Both are blocked if account-sync and symbol-sync fail. Must re-validate:
- Dashboard receives account snapshots after fix
- Dashboard receives symbol sync data after fix
- Fib parity calculation uses fresh account state

### Migration-Blocking
**Yes.** Phase 1 (EA bridge) must reach 100% signal fidelity before Phase 2 (MT5 native) can proceed. Missing account/symbol sync blocks Phase 2 readiness gate.

### Human Review Required Before Merge
**Yes.** This is a critical post-license-gate wiring bug. Changes affect auth contract. Requires:
1. Code review of JSON body additions (Line-by-line audit of wpUserId injection)
2. Integration test: SendAccountSync, SendHeartbeat, SendSymbolSync with user_id payload
3. Parity validation: dashboard receives updated account and symbol data
4. End-to-end test: license check → account sync → symbol sync → heartbeat polling chain succeeds

---

## 8. Handoff package

### Epicentre Files to Inspect First
1. [mt5/MarketDataEngine.mqh](mt5/MarketDataEngine.mqh) — SendAccountSync (506), SendHeartbeat (461), SendSymbolSync (565)
2. [wordpress/smc-superfib-sniper/smc-superfib-sniper.php](wordpress/smc-superfib-sniper/smc-superfib-sniper.php#L587-L628) — permission_ea_bridge() auth contract
3. [mt5/SMC_MarketDataEA.mq5](mt5/SMC_MarketDataEA.mq5#L177-L201) — initialization sequence after license gate

### Inputs Codex Must Verify Before Planning
- Confirm wpUserId is correctly passed to MarketDataEngine during initialization (line 197 in SMC_MarketDataEA.mq5)
- Confirm MarketDataEngine.mqh stores wpUserId as accessible member variable (line 33 in MarketDataEngine.mqh)
- Confirm JSON serialization method supports nested object insertion (verify MQL5 JSON library capabilities)
- Confirm backend still expects user_id in JSON body (verify ea_request_value extraction order: body first, then query)

### Open Unknowns That Could Invalidate Hypothesis
1. **MQL5 JSON library:** Can wpUserId be serialized into existing JSON body objects without breaking JSON formatting? (High confidence yes, but verify before implementation)
2. **Backend extraction order:** Does ea_request_value() truly check JSON body BEFORE query params, or is order reversed? (Assumed body-first per code line 676, but critical to confirm)
3. **User ID validation:** After user_id is injected into POST payload, does backend validation (line 606) still work for cross-origin or different user contexts? (Likely yes, but edge case for multi-user or impersonation scenarios)
4. **Heartbeat frequency:** If heartbeat is called frequently (timer-based), does adding user_id to every heartbeat increase payload size significantly? (Likely no; user_id is integer, minimal overhead)

