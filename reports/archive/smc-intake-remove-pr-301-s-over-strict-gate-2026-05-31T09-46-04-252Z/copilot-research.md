### 1. Issue classification
- Severity: HIGH
- Category: signal-integrity / workflow
- Layer(s) affected: PHP-backend
- Phase impact: Phase 0 / Cross-phase

### 2. Confirmed evidence
- Patch under review: [wordpress/smc-superfib-sniper/smc-superfib-sniper.php](wordpress/smc-superfib-sniper/smc-superfib-sniper.php)
- The diff removes a compound gate that required `lifecycle_diagnostic` array membership, `pre_lifecycle_status === 'READY'`, and `status === 'ARMED'`, and replaces it with a stricter set of structural signal checks (sweep, MSS/displacement) and explicit WATCH guard.
- Exact changed behaviours visible in the supplied patch: early-return when `$data_live !== true || $engine_blocker !== 'OK'`; new `$has_sweep`, `$has_mss`, `$has_displacement` checks; explicit `WATCH` status guard; `is_array($plan)` null-safety prior to tagging.

### 3. Root cause hypothesis
- Most likely root cause: A prior change (PR 301) tightened the pending-blueprint gate by requiring lifecycle lookup results and `pre_lifecycle_status === 'READY'`, which caused _every_ structurally ARMED signal to be blocked when lifecycle diagnostics were not present or not yet computed. (Confirmed)
- Why this fits: the removed/altered condition set in the diff directly references `lifecycle_diagnostic`, `pre_lifecycle_status`, and `status === 'ARMED'` as part of the gate. When the lifecycle lookup is asynchronous or delayed, those checks become a blocker. (Confirmed)
- Trigger: asynchronous lifecycle diagnostic resolution and a code-path that assumed lifecycle data exists synchronously. (Hypothesis)

### 4. Blast radius
- Primary file: [wordpress/smc-superfib-sniper/smc-superfib-sniper.php](wordpress/smc-superfib-sniper/smc-superfib-sniper.php)
- Related code paths: any callers that expect `build_trade_plan()` to be suppressed by lifecycle gating; consumers of pending-blueprint plans (dashboard, REST API endpoints, MT5 bridge).
- Parity surfaces at risk: Backend ↔ Dashboard ↔ MT5 signaller handoff where pending blueprint decisions decide whether a plan is emitted.
- Potential stale-state risks: lifecycle diagnostic caching, delayed lifecycle lookup, and signal staging queues that expect lifecycle gating.

### 5. Regression surface
- Risk of allowing spurious plans: relaxing lifecycle gating may emit plans during transient sweeps (liquidity grabs) if structural confirmations are insufficient.
- Tests to avoid weakening: any audits that assert lifecycle-driven readiness, and parity validators that compare Pine blueprint decisions to backend-produced plans.
- Existing guards seen in repo: parity-validator scripts in `scripts/` and `reports/` smoke tests; the pipeline enforces phase gating via workflow scripts.

### 6. Resolution path options
- Path A (narrow): Apply the attached patch concept — remove the blocking lifecycle presumption and instead require `data_live` + `engine_blocker === 'OK'` and require structural confirmations (`has_sweep` AND (`has_mss` OR `has_displacement`)), plus an explicit `WATCH` guard and null-safety on plan. This preserves filtering while avoiding a dependency on lifecycle lookup timing. (Recommended)
- Path B (broader): Rework lifecycle gating so lifecycle diagnostics are produced synchronously (or signalled reliably) before pending-blueprint evaluation, or move lifecycle checks into a separate post-processing stage that can veto plans instead of blocking plan creation. This is more invasive but reduces false-positive plan emission risk if structural checks are insufficient.
- Recommended: Path A, because it is surgically small, aligns with the peer-reviewed threshold additions in the patch, and avoids a large architectural change to lifecycle generation. Include follow-up work to validate lifecycle semantics and consider Path B if intermittent false positives occur in production.

### 7. Risk flags
- High-risk system involved: Yes — backend signal engine and plan emission affect live trade signals.
- Requires parity re-validation: Yes — run parity checks against Pine and MT5 surfaces after change (parity-validator scripts). Engines: SignalEngine / FreshnessEngine.
- Migration-blocking: No (not a migration gate), but Phase 0 stability is impacted.
- Human review required before merge: Yes — reviewer must confirm engine field semantics (`sweep`, `mss`, `displacement`) and confirm no callers expect `pre_lifecycle_status === 'READY'` to be the sole readiness signal.

### 8. Handoff package
- Epicentre files to inspect first:
  - [wordpress/smc-superfib-sniper/smc-superfib-sniper.php](wordpress/smc-superfib-sniper/smc-superfib-sniper.php)
  - `scripts/parity-validator.php` and `reports/fib-parity-validation.md` for parity implications
- Inputs Codex must verify before planning:
  - Engine payload contract: possible values for `engine.sweep`, `engine.mss`, and `engine.displacement`.
  - Downstream consumers of `build_trade_plan()` and whether they rely on lifecycle gating elsewhere.
  - Existing tests that assert lifecycle-driven suppression.
- Open unknowns that could invalidate hypothesis:
  - Whether lifecycle diagnostics are guaranteed to exist in all production code paths (if they are, the original gate might be safe).
  - Exact enumeration of `displacement` string values beyond `clean`/`strong`.
  - Any monitoring/telemetry that would surface an increase in false-positive plans after change.

SMC_ISSUE: SMC Intake - Remove PR 301's over-strict gate
### 1. Issue classification
- Severity: HIGH
- Category: data-contract / signal-integrity
- Layer(s) affected: PHP-backend / Dashboard-JS / types
- Phase impact: Phase 0 / Cross-phase

### 2. Confirmed evidence
- The user-provided patch indicates changes to:
  - `src/types/sniper.ts` (TradePlan.source union extended to include `pending-blueprint`).
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` (new `build_pending_or_confirmed_plan()` wrapper called from `build_symbol_state`).
  - `src/components/PlanCard.tsx` (rendering and UI treatment for `pending-blueprint`, import `Lock`, `MetaChip` tone update).
- Repository contains `scripts/workflow-state.js` and pipeline artifacts in `reports/` used by local pipeline.
- Reports and snapshots in `reports/` reference gating and parity validation artifacts (e.g., `phase4-gate.json`, `fib-parity-validation.md`) which show active pipeline and gating concerns.

### 3. Root cause hypothesis
- Most likely root cause: gating logic tightened to prevent swarming now suppresses building or exposing trade plan objects when signals are `WATCH`/`ARMED`, leaving front-end with `plan: null` even though structural candle data exists. (Hypothesis)
  - Evidence: user description and patch intent indicate `build_trade_plan()` is currently conditional on `backendConfirmed` or similar gate; proposed fix always builds plan when candles exist and tags as `pending-blueprint` when not confirmed. (Confirmed)
- Trigger: recent gating/throttling changes to the backend that restrict plan construction to `backendConfirmed` signals, introduced to prevent execution swarms.

### 4. Blast radius
- Files likely affected:
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` (plan construction and JSON response shape)
  - `src/types/sniper.ts` (type union for `TradePlan.source`)
  - `src/components/PlanCard.tsx` (UI rendering of plan states)
  - Any consumers of plan JSON (other dashboard components, API clients)
- Systems at risk: Dashboard rendering, plan persistence (DB row `trade_plans` JSON `source`), any downstream automation that expects `plan` to be executable only when `backendConfirmed`.
- Parity surfaces: Backend <-> Dashboard; MT5 authority remains unaffected if `backendConfirmed` remains the execution gate.

### 5. Regression surface
- Risk if patched incorrectly:
  - Accidentally enabling execution for pending plans (must ensure `backendConfirmed` remains authoritative).
  - Changing DB write paths or `source` semantics could confuse historical plan audits.
- Existing guards to preserve: `backendConfirmed` execution check, lifecycle gating, and any server-side checks before writing plan rows marked as executable.

### 6. Resolution path options
- Path A (narrow): Build and expose `pending-blueprint` plan objects in API responses when sufficient candle data exists; tag `source` accordingly; do not change execution gates. (Recommended)
- Path B (broader): Introduce explicit plan lifecycle state machine persisted server-side (pending -> confirmed -> executed) and add migration/DB changes. (Higher risk, more effort)
- Recommended: Path A for rapid visibility fix; Path B only if audits require persisted lifecycle management.

### 7. Risk flags
- High-risk system involved: No (execution authority unchanged), but caution required around execution gating.
- Requires parity re-validation: Yes — verify Pine ↔ Backend ↔ Dashboard parity for plan semantics.
- Migration-blocking: No
- Human review required before merge: Yes — confirm that `backendConfirmed` still vetoes execution and that any persisted `source` semantics are acceptable to ops.

### 8. Handoff package
- Epicentre files to inspect first:
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` (near `build_symbol_state` / plan construction)
  - `src/components/PlanCard.tsx` (render path for `plan` and `MetaChip` usage)
  - `src/types/sniper.ts` (type union update)
- Inputs Codex must verify before planning:
  - Exact `build_symbol_state` JSON shape and where `plan` is returned in the API response
  - Confirm that `build_trade_plan()` is deterministic given candle/sequence inputs and safe to call for unconfirmed signals
  - Any DB-side constraints for `trade_plans` writes or downstream consumers that assume `source === backend-blueprint` means executable
- Open unknowns:
  - Whether any other endpoints or consumers assume `plan: null` means no plan exists (not just non-executable)
  - Whether `build_trade_plan()` has side-effects (telemetry, logging, DB writes) when called for unconfirmed signals

---

researcher: Copilot intake
issue: SMC Intake - Blueprint Gating Throttling Adjustment
timestamp: 2026-05-31
