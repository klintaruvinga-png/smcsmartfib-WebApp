# 1. Issue classification
- Severity: HIGH
- Category: signal-integrity
- Layer(s) affected: PHP-backend / REST-API / Dashboard-JS / MT5
- Phase impact: Cross-phase

# 2. Confirmed evidence
- The backend trade-plan builder in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` computes three progressive entry lots from user risk budget, `1:2:3` stage weights, stop distance, and symbol pip economics, with a `0.01` minimum lot floor.
- The same backend plan object is then consumed by `post_execute_signals()` in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`, which queues each stage using `plan['lotSize'][$stage]` into the execution queue.
- The dashboard contract in `src/types/sniper.ts` and `sdk/src/types/index.ts` exposes `lotSize: { e1, e2, e3 }`, and the plan card in `src/components/PlanCard.tsx` renders those stage lots directly.
- The migration note in `.github/migration/archive/stratupdate.md` explicitly states that the current backend plan blueprint now uses risk-derived stage lot sizes and the legacy fixed-lot ladder is no longer authoritative.
- Existing repo evidence therefore shows that the progressive entry lot-sizing patch is a backend-authority execution and display contract, not a purely cosmetic UI change.

# 3. Root cause hypothesis
- Most likely root cause: the progressive lot-sizing logic is implemented in the backend trade-plan builder, but the patch surface is spread across backend plan generation, queue execution, and dashboard rendering contracts. Any mismatch in how those three layers interpret `lotSize` can produce under- or over-sized progressive entries.
- Why this fits the evidence: the backend computes stage lots from real risk inputs, while the UI and REST contract depend on the same `lotSize` fields. The risk is therefore not in the existence of the patch, but in preserving parity across the plan generation and execution path.
- What likely triggered or surfaced the issue: the repo now uses backend-authored plans and execution queue mapping, so a sizing regression would appear immediately in both the plan preview and any queued order payload.
- Mark each sub-point as `Confirmed` or `Hypothesis`:
  - Backend lot sizing is risk-derived and stage-weighted: `Confirmed`
  - The execution queue consumes those stage lot sizes directly: `Confirmed`
  - The dashboard contract and preview rely on the same fields: `Confirmed`
  - A wiring or parity mismatch between these layers is the most likely defect path: `Hypothesis`

# 4. Blast radius
- Every file likely affected:
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — plan construction and execution queue mapping
  - `src/components/PlanCard.tsx` — display of entry-stage lots
  - `src/types/sniper.ts` — dashboard contract for `TradePlan.lotSize`
  - `sdk/src/types/index.ts` — SDK contract mirror
  - `src/mocks/sniperData.ts` and `sdk/src/mocks/fixtures.ts` — sample fixture data used by tests/UI
- Every system that reads from or writes to the broken component:
  - PHP backend plan builder writes `lotSize`
  - REST execution path `/user/execute-signals` reads `lotSize` and writes queued orders
  - Dashboard plan view reads `lotSize` for display
- Every parity surface at risk: Pine <-> Backend <-> Dashboard <-> MT5
  - Backend-to-dashboard contract parity is the highest immediate risk
  - MT5 execution parity depends on whether queued stage lots match the backend risk model
- Any stale-state, cache, sequencing, or authority-boundary risks:
  - A stale backend plan can cause the dashboard to show outdated progressive lot sizes
  - Order-queue dedupe depends on deterministic stage IDs, so any stage-size drift will affect queued execution consistency

# 5. Regression surface
- What currently working behavior could break if patched incorrectly:
  - Stage lot sizes could become flat, over-sized, or inconsistent with the user risk budget
  - Execution queue rows could send the wrong lot values to MT5 or the front-end plan preview
- Existing guards, stale-data protections, or validation paths that must not be weakened:
  - The backend confirms only READY signals before queueing
  - The queue path uses deterministic stage IDs and stage-specific TP mapping
  - The plan builder clamps results to a `0.01` minimum lot floor
- Tests, audits, or reports that appear to cover this area today:
  - `src/routes/-plan.test.tsx` verifies plan completeness in the dashboard path, but it does not specifically test progressive lot-sizing math
  - The backend code path itself is the main authoritative source for this patch surface

# 6. Resolution path options
- Path A: narrowest plausible correction surface
  - Validate and patch the backend lot-sizing math and execution-queue mapping in the existing `build_trade_plan()` / `post_execute_signals()` path, then confirm the dashboard contract still matches it.
- Path B: broader structural risk area if the narrow path is unsafe
  - Re-audit the full backend-to-frontend contract set (`TradePlan`, SDK fixtures, and plan-preview rendering) to ensure progressive lot sizing is not drifting across layers.
- Recommended: choose one and explain why
  - Recommend Path A first, because the evidence shows the authoritative sizing logic and execution consumption path are already concentrated in the backend and the UI contract is a direct mirror of that path.

# 7. Risk flags
- High-risk system involved: Yes — execution sizing directly affects account exposure and order risk
- Requires parity re-validation: Yes — backend plan math and dashboard/queue contract must be re-validated together
- Migration-blocking: Yes — this affects the live execution blueprint path used by the current backend-authority workflow
- Human review required before merge: Yes — because risk-model and execution sizing changes are financial-impacting and should be reviewed against live broker economics

# 8. Handoff package
- Epicentre files to inspect first:
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `src/components/PlanCard.tsx`
  - `src/types/sniper.ts`
- Inputs Codex must verify before planning:
  - The exact risk-budget formula used inside `build_trade_plan()`
  - Whether the queued order payload still matches the current `lotSize` contract
  - Whether the dashboard preview and execution path remain aligned for all three progressive stages
- Open unknowns that could invalidate the current hypothesis:
  - Whether broker-specific pip-value assumptions for `US30`, `NAS100`, `BTCUSD`, and `ETHUSD` differ from the current fallback math
  - Whether any untested frontend path still emits old fixed-lot assumptions instead of the backend-authored plan
