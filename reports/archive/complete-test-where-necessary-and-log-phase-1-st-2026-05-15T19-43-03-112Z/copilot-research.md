# Phase 1 Live Bridge Validation - Research Report

**Generated**: 2026-05-15  
**Issue**: Complete, test(where necessary) and log Phase 1 step below  
**Environment**: Broker Deriv.com, Demo account, MT5 build 5836  
**Status**: RESEARCH PHASE - ready for field execution  

---

## 1. Issue Classification

- **Severity**: HIGH
- **Category**: migration-governance, wiring, signal-integrity
- **Layer(s) affected**: MT5 / PHP-backend / REST-API / Dashboard-JS
- **Phase impact**: Phase 1 gate progression

---

## 2. Confirmed Evidence

### Phase 0 Status
- **Source**: `reports/phase-1-ea-bridge-implementation-report.md`, `.github/migration/phase-updates/phase0-soak-closeout-final-2026-05-15.md`
- **Finding**: Phase 0 stabilization complete and PASSED as of 2026-05-15 16:37 UTC
- **Evidence**:
  - 72-hour restart soak window closed successfully
  - NAS100/US30 equity-session freshness resolved (alias fix in `SymbolNormalizer.mqh`)
  - XAUUSD candle-history readiness confirmed
  - Feed status frontend defect (BUG-001) resolved
  - Watchlist persistence parity audit at 100%
  - Backend health metrics: 259,464 engine runs / 0 errors over 24h

### Phase 1 Backend Implementation Status
- **Source**: `reports/phase-1-ea-bridge-implementation-report.md`
- **Finding**: Four additive EA bridge routes fully implemented and PHP-regression-covered
- **Routes implemented**:
  - `POST /wp-json/sniper/v1/ea/heartbeat` (explicit heartbeat with engine run tracking)
  - `POST /wp-json/sniper/v1/ea/account-sync` (reuses `smc_sf_account_snapshots`, stores under `data.eaBridge.accounts[account_id|terminal_id]`)
  - `POST /wp-json/sniper/v1/ea/symbol-sync` (new dedicated `smc_sf_symbol_sync` table with broker metadata)
  - `GET /wp-json/sniper/v1/ea/license-check` (soft operational gate, API-key + user_id auth)
- **Existing route preserved**: `POST /wp-json/sniper/v1/ea/market-stream` (Phase 0 EA route, no changes)
- **Database schema**: New `smc_sf_symbol_sync` table with fields: id, user_id, account_id, terminal_id, broker, broker_server, broker_symbol, normalized_symbol, base_symbol, visible, selected, digits, point, contract_size, trade_mode, min_lot, max_lot, lot_step, spread, currency_profit, currency_margin, last_seen_at, created_at, updated_at, raw_json
- **Test suite**: All PHP tests PASS (heartbeat, account-sync, symbol-sync, license-check, market-stream, MT5 snapshot contract, REST bootstrap, watchlist snapshot regression)
- **File**: `mt5/SMC_MarketDataEA.mq5` confirmed present and ready for deployment

### Phase 1 Gate Status
- **Source**: `.github/migration/PHASE1_TRACKER.md`, `.github/migration/PHASE1_BRIDGE_ROADMAP.md`
- **Current Completion**: 20%
- **Blocker**: Live MT5 terminal verification pending for heartbeat, account-sync, symbol-sync, and market-stream
- **Target Gate Date**: 2026-06-01
- **Phase 1 PASSED requirement**: All six tracked scenarios (terminal restart, VPS restart, internet interruption, duplicate heartbeat protection, invalid license rejection, 48h heartbeat continuity) must record PASS

### Environment Readiness (Provided Context)
- **Broker**: Deriv.com
- **Server**: Deriv-Demo
- **Account type**: Demo
- **MT5 terminal build**: Version 5, build 5836
- **EA deployment**: SMC_MarketDataEA.mq5 attached to terminal
- **WebRequest enabled**: Yes (for backend domain)
- **Bridge configuration**: WebhookURL, ApiKey, UserId all configured for validation environment
- **Status**: Ready for field execution

### Phase 1 Checklist Status
- **Pre-Validation Prerequisites**: All 8 items completed per user context
  - [x] EA code complete and validation build identified (build 5836)
  - [x] Backend APIs available in validation environment (PHP routes implemented)
  - [x] Broker test account available (Deriv.com Demo)
  - [x] MT5 terminal access confirmed (EA deployed)
  - [x] Broker name and server recorded (Deriv.com / Deriv-Demo)
  - [x] Account type recorded (Demo)
  - [x] MT5 build recorded (build 5836)
  - [x] WebhookURL, ApiKey, UserId configured (confirmed)
- **Track A - MT5 EA**: 0/12 items complete - pending live field execution
- **Track B - Backend**: 0/7 items complete - pending live field execution
- **Track C - Dashboard**: DEFERRED to Phase 2

---

## 3. Root Cause Hypothesis

### Phase 1 Blocker Analysis
- **Primary blocker**: No live-terminal evidence yet recorded for Phase 1 acceptance criteria
- **Why**: Phase 0 was a 72-hour soak stabilization cycle focused on backend stability, candle aggregation, and feed status accuracy. Phase 0 did not exercise the new EA bridge routes (heartbeat, account-sync, symbol-sync) under live terminal conditions because those routes did not exist until after Phase 0 closeout (2026-05-15)
- **Root cause**: Sequential phase architecture requires Phase 1 to begin only after Phase 0 stabilization is confirmed. Phase 1 cannot produce gate evidence until the EA is attached to the validation terminal and the 10 Phase 1 acceptance scenarios are executed against live backend infrastructure
- **What triggered**: User request to "Complete, test(where necessary) and log Phase 1 step below" with environment readiness facts provided; environment is now READY per the roadmap prerequisites

### Classification
- **Confirmed**: Backend routes implemented and PHP-covered (Confirmed)
- **Confirmed**: Phase 0 closeout is complete and PASSED (Confirmed)
- **Confirmed**: Environment prerequisites are recorded (Confirmed)
- **Hypothesis**: Live terminal bridge validation has not begun because previous phase blocker (Phase 0 stabilization) has only now been cleared

---

## 4. Blast Radius

### Direct scope
- **Files under live test**:
  - `mt5/SMC_MarketDataEA.mq5` (EA bridge caller)
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` (backend route handlers)
  - `wordpress/smc-superfib-sniper/tests/php/test-ea-*.php` (backend regression suite)
  
### Systems reading/writing to bridge components
- **MT5 terminal** → **Backend REST API** → **WordPress database** (`smc_sf_account_snapshots`, `smc_sf_symbol_sync`, `engine_runs`)
- **Dashboard frontend** reads from `GET /ea/license-check` indirectly via admin UI for operational status (Phase 2)
- **PHP backend** logs all bridge traffic in server logs and persists account/symbol metadata for cross-phase consumption

### Parity surfaces at risk
- **MT5 bridge state** ↔ **Backend bridge persistence** (new contract, untested live)
- **EA-reported account metadata** ↔ **Backend persisted account snapshot** (account-sync correctness)
- **EA-reported broker symbols** ↔ **Backend normalized symbol table** (symbol-sync correctness)
- **Heartbeat fire rate** ↔ **Backend session state** (heartbeat continuity and duplicate protection)
- **Existing market-stream path** ↔ **New bridge auth gate** (regression risk on unchanged route)

### Stale-state and authority-boundary risks
- **False LIVE state**: If heartbeat gaps are not caught before 48h validation window closes, LIVE state could persist for symbols that are actually stale
- **Duplicate session truth**: If duplicate heartbeat protection fails, backend could create multiple live-session records and corrupt account/symbol state
- **Out-of-sequence symbol-sync**: If symbol-sync arrives out of order or before account-sync, backend persistence order matters for downstream dashboard consumption (Phase 2)
- **License-check bypass**: If operational gate fails to reject invalid keys, unauthorized EA instances could post to the backend and corrupt audit trails

---

## 5. Regression Surface

### Existing guards that must not be weakened
- **Auth gate on market-stream**: Existing `/ea/market-stream` path uses API-key + user_id validation; new bridge routes must not bypass or weaken this gate
- **Engine snapshot invalidation**: Watchlist changes must still properly invalidate `smc_sf_engine_snapshot` rows; Phase 1 bridge adds new symbol metadata but must not trigger premature invalidation
- **Stale-loop protection**: Existing logic that rejects stale price pushes from the EA must remain intact; new heartbeat and account-sync must not cause false LIVE state escalation
- **Feed status accuracy**: Frontend feed-status chip (Phase 0 BUG-001 fixed) must remain responsive and show STALE correctly when EA pushes indicate off-session; new bridge metadata must not corrupt this

### Tests and audits covering this area
- **PHP regression suite**: `test-ea-heartbeat.php`, `test-ea-account-sync.php`, `test-ea-symbol-sync.php`, `test-ea-license-check.php`, `test-ea-bridge-bootstrap.php` — all PASS (local environment)
- **Market-stream regression**: `test-ea-market-stream.php` — PASS (local environment)
- **Watchlist persistence parity audit**: `phase-0-watchlist-persistence-parity-2026-05-15.md` — 100% parity, both PHP and Vitest regression harnesses green
- **Live validation checkpoint**: Phase 0 soak evidence (72-hour run) demonstrates system stability without bridge routes; Phase 1 must show same stability with bridge routes added

---

## 6. Resolution Path Options

### Path A: Minimal Live Validation (Narrow Surface)
- Deploy `mt5/SMC_MarketDataEA.mq5` to Deriv.com Demo terminal (build 5836) with bridge configuration
- Execute Phase 1 checklist Track A items sequentially: license-check → heartbeat → account-sync → symbol-sync → market-stream
- Execute Phase 1 scenarios: terminal restart, VPS restart, internet interruption, duplicate heartbeat, invalid license rejection
- Capture 48h heartbeat continuity window with zero gaps
- Record all evidence in `.github/migration/PHASE1_TRACKER.md` and `.github/migration/PHASE1_CHECKLIST.md`
- **Risk**: If any scenario fails (e.g., duplicate heartbeat not protected, heartbeat gaps observed), the narrow path requires patching and re-running the full 48h window
- **Regression coverage**: All existing PHP tests remain green; live evidence validates against 10 binary acceptance criteria

### Path B: Extended Validation with Staging Checkpoint (Broader Surface)
- Run Path A as described above
- Add intermediate staging validation checkpoint: after first 12h of heartbeat continuity, pause and inspect backend logs for any anomalies (gaps, duplicates, out-of-order syncs) before resuming 48h window
- If staging checkpoint reveals issues, apply targeted fixes and re-baseline
- **Risk**: Staging checkpoint delays Phase 1 gate decision by 12h but reduces chance of full 48h re-run if defects are caught early
- **Regression coverage**: Same as Path A, plus intermediate log inspection adds confidence in backend state consistency

### Recommended: Path A
**Rationale**: 
1. Backend routes already PHP-tested and regression-covered; confidence high that implementation is sound
2. Environment is ready (prerequisites recorded); no blocker to field execution
3. Phase 0 soak evidence (259,464 engine runs, 0 errors) demonstrates system stability; Phase 1 adds bridge routes but reuses proven persistence layer
4. Phase 1 gate date is 2026-06-01; narrow path allows start of 48h window immediately, staging checkpoint would consume 12h and risk missing gate date
5. If defects are found during Phase 1 execution, they can be fixed and 48h window re-run; binary gate criteria and complete audit trail ensure no silent failures

**Implementation responsibility**: 
- Track A (MT5 EA field team) executes terminal deployment and scenario capture
- Track B (Backend team) validates route logs, persistence outcomes, and auth gate behavior for each scenario
- Both tracks sign off evidence against Phase 1 checklist before Phase 1 PASSED declaration

---

## 7. Risk Flags

- **High-risk system involved**: Yes
  - Reason: Phase 1 introduces persistent bridge state (account-sync, symbol-sync) for the first time; any persistence error could corrupt downstream Phase 2 telemetry consumption or Phase 3 trade execution validation
  
- **Requires parity re-validation**: Yes
  - Which engines: Account metadata parity (MT5 account state ↔ backend snapshot), Symbol metadata parity (broker symbol list ↔ normalized symbol table), Heartbeat parity (EA heartbeat rate ↔ backend session continuity)
  - Evidence: Must capture both MT5 EA logs and backend REST logs for each Phase 1 scenario to confirm parity
  
- **Migration-blocking**: Yes
  - Which phase gate: Phase 1 PASSED is a hard gate for Phase 2 start; no Phase 2 dashboard telemetry can begin until Phase 1 evidence is complete and signed off
  
- **Human review required before merge**: Yes
  - Reason: Phase 1 gate requires Track A and Track B sign-off with date fields in `.github/migration/PHASE1_CHECKLIST.md` before Phase 1 PASSED declaration. No automated merge gate exists; human sign-off is contractually required per roadmap section 6

---

## 8. Handoff Package

### Epicentre Files to Inspect First
1. `mt5/SMC_MarketDataEA.mq5` — EA deployment target; confirm bridge routes are called with correct auth
2. `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — backend route handlers; confirm all four routes accept auth and persist correctly
3. `.github/migration/PHASE1_CHECKLIST.md` — field execution checklist; must be completed and signed by Track A and Track B
4. `.github/migration/PHASE1_TRACKER.md` — gate evidence log; must be updated with binary PASS/FAIL for all six scenarios

### Inputs Codex Must Verify Before Planning
1. Environment readiness facts are recorded in `.github/migration/PHASE1_TRACKER.md` (broker, account type, MT5 build, EA deployment, WebRequest enabled, bridge config completed)
2. Backend routes are deployed and accessible from the Deriv.com Demo environment
3. PHP regression test suite passes in local workspace (confirms no backend regressions)
4. MT5 EA file (`SMC_MarketDataEA.mq5`) is syntactically correct and compiles in MT5 build 5836 (MQL5 compiler check)
5. Bridge authentication (WebhookURL, ApiKey, UserId) is correctly injected into the EA before deployment

### Open Unknowns That Could Invalidate Current Hypothesis
1. **EA compilation**: MQL5 syntax and include-file dependencies for `SMC_MarketDataEA.mq5` have not been validated against MT5 build 5836 in this workspace (local MQL5 compiler not available)
   - **Impact**: If EA fails to compile, deployment is blocked
   - **Resolution**: Compile in MT5 IDE with build 5836 before field deployment
   
2. **Backend route accessibility**: PHP routes are implemented but have not been tested from outside the local WordPress environment (i.e., from MT5 terminal across network boundary)
   - **Impact**: If backend routes are not accessible from Deriv.com network, Phase 1 cannot execute
   - **Resolution**: Confirm backend domain is accessible from Deriv.com Demo terminal (WebRequest test or cURL from terminal VPS)
   
3. **Duplicate heartbeat protection implementation**: Backend code for duplicate heartbeat detection exists (referenced in tracker and roadmap) but implementation details are not shown in this research report
   - **Impact**: If duplicate detection logic is flawed, duplicate heartbeat scenario could pass incorrectly
   - **Resolution**: Code review of duplicate heartbeat handler before Phase 1 execution, or capture duplicate scenario evidence from Phase 1 run and inspect logs for false-positive
   
4. **Heartbeat continuity measurement**: "48h with zero observed gaps" is the acceptance criterion, but measurement method (EA log timestamps vs. backend request timestamps) is not specified
   - **Impact**: If measurement method is ambiguous, Track A and Track B could disagree on whether 48h window is valid
   - **Resolution**: Before first live run, Track A and Track B must agree on heartbeat-gap detection method and tolerance threshold (e.g., ≤1s gaps acceptable, >1s gap is failure)
   
5. **Out-of-sequence symbol-sync behavior**: Roadmap states "out-of-sequence symbol-sync behavior is understood and recorded during validation" but current implementation behavior is not documented
   - **Impact**: If symbol-sync packets arrive out of order (e.g., symbol B before symbol A), backend persistence order could affect downstream Phase 2 consumption
   - **Resolution**: Run Phase 1 scenario with symbol-sync captures and inspect backend logs for arrival order; document in Phase 1 evidence package

---

## 9. Phase 1 Execution Summary

### Current State
- Phase 0 stabilization: **COMPLETE and PASSED** (2026-05-15 16:37 UTC)
- Backend bridge implementation: **DONE** (4 routes, PHP regression covered, all tests PASS)
- Environment readiness: **READY** (broker, account, MT5 build, auth config all recorded)
- Phase 1 field execution: **BLOCKED on live terminal validation start**

### Immediate Next Step
1. Record environment readiness facts in `PHASE1_TRACKER.md` (already provided by user: Deriv.com, Demo, build 5836)
2. Deploy `mt5/SMC_MarketDataEA.mq5` to Deriv.com Demo terminal
3. Execute Phase 1 checklist Track A items and record evidence in `PHASE1_CHECKLIST.md`
4. Execute Phase 1 scenarios and update `PHASE1_TRACKER.md` gate progress
5. Capture 48h heartbeat continuity window
6. Phase 1 PASSED declaration target: 2026-06-01

### Gate Criteria Summary
All 10 criteria must record PASS with dated evidence from Track A (terminal) and Track B (backend logs):
1. Heartbeat continuity: 48h+ with zero gaps
2. Session stability: dropped sessions = 0
3. Terminal restart reconnect: automatic without false LIVE state
4. VPS restart reconnect: automatic without false LIVE state
5. Internet interruption reconnect: automatic without false LIVE state
6. Duplicate heartbeat protection: no duplicate live session truth
7. Invalid license rejection: unauthorized access rejected
8. Account-sync verification: backend receives and persists payload
9. Symbol-sync verification: backend receives and persists payload
10. Market-stream verification: existing path remains consistent with bridge auth/state

---

## References

- `.github/migration/PHASE1_TRACKER.md`
- `.github/migration/PHASE1_CHECKLIST.md`
- `.github/migration/PHASE1_BRIDGE_ROADMAP.md`
- `reports/phase-1-ea-bridge-implementation-report.md`
- `.github/migration/phase-updates/phase0-soak-closeout-final-2026-05-15.md`
- `mt5/SMC_MarketDataEA.mq5`
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
