# 1. Issue classification
- Severity: HIGH
- Category: stale-data
- Layer(s) affected: PHP-backend / REST-API / Dashboard-JS
- Phase impact: Cross-phase

# 2. Confirmed evidence
- The backend trade-plan builder in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` currently derives sizing from `get_account_state($user_id)` and then forces a fake floor with `max((float) $account['equityUSC'], 1)`. This is the exact path that turns a missing or stale snapshot into a near-zero risk budget.
- The same file’s `get_account_state()` fallback defaults both `balanceUSC` and `equityUSC` to `0` when the snapshot blob is absent or stale, and only marks the account as `live` if the snapshot timestamp is recent enough.
- The dashboard contract in `src/components/PlanCard.tsx` renders `plan.lotSize.e1/e2/e3` directly, and the existing plan-route tests explicitly expect the UI to show `Below 0.01 lot` when backend stage lots fall below the execution minimum.
- The backend regression tests in `wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php` already cover the risk-derived stage lot-sizing path and the `0.01` execution floor, which makes this a real backend-authority sizing regression surface rather than a cosmetic display issue.

# 3. Root cause hypothesis
- Most likely root cause: the backend is using a stale or empty account snapshot as the sizing source, and the current `max(..., 1)` fallback masks that failure instead of surfacing it.
- Why that root cause best fits the evidence: the code path in `build_trade_plan()` depends on `equityUSC`, while `get_account_state()` intentionally returns `0` for `equityUSC` when no fresh account snapshot exists. The forced minimum of `1` then makes the risk calculation look valid but effectively collapses the risk budget to `0.01 USC`, which is consistent with the reported `Below 0.01 lot` outcome.
- What likely triggered or surfaced the issue: the backend now relies on a live snapshot for risk sizing, but the fallback path is not resilient when the snapshot is stale or missing; the result is under-sized or non-executable stages in the dashboard and queue path.
- Mark each sub-point as `Confirmed` or `Hypothesis`:
  - The live sizing path depends on `equityUSC` from `get_account_state()`: `Confirmed`
  - `get_account_state()` defaults to `0` for missing/stale account fields: `Confirmed`
  - `max((float) $account['equityUSC'], 1)` converts that failure into a fake minimum account value: `Confirmed`
  - The resulting near-zero risk budget is the most plausible reason for `0.00` / `Below 0.01 lot` stage output: `Confirmed`

# 4. Blast radius
- Every file likely affected:
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — backend plan sizing and account-state fallback path
  - `wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php` — existing backend regression coverage for lot sizing
  - `src/components/PlanCard.tsx` — dashboard rendering of `lotSize.e1/e2/e3`
  - `src/routes/-plan.test.tsx` — plan-card warnings and execution gating around non-executable stage lots
- Every system that reads from or writes to the broken component:
  - PHP backend plan builder writes `lotSize` into the trade plan
  - REST / execution path consumes that plan and can queue only the executable legs
  - Dashboard plan-card rendering reads the same `lotSize` values for display and warnings
- Every parity surface at risk: Pine <-> Backend <-> Dashboard <-> MT5
  - The highest immediate risk is backend-to-dashboard parity for executable stage lots
  - MT5 execution parity is also at risk because the backend plan’s stage lots are the source of the queued exposure
- Any stale-state, cache, sequencing, or authority-boundary risks:
  - A stale or missing account snapshot can silently poison the trade-plan calculation
  - The current fallback logic makes the defect look like a valid low-risk plan instead of a broken account source

# 5. Regression surface
- What currently working behavior could break if patched incorrectly:
  - The existing progressive stage-lot math and `0.01` execution minimum must still be preserved
  - The dashboard warning path for partially executable plans must not be weakened or bypassed
- Existing guards, stale-data protections, or validation paths that must not be weakened:
  - The backend already uses a `0.01` floor and stage-level progressive sizing logic
  - The UI already differentiates between executable and non-executable backend lots
- Tests, audits, or reports that appear to cover this area today:
  - `wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php` covers the main backend math path
  - `src/routes/-plan.test.tsx` covers the dashboard warning and gating behavior for under-sized backend stage lots

# 6. Resolution path options
- Path A: narrowest plausible correction surface
  - Re-audit the backend equity source used by `build_trade_plan()` and the fallback behavior in `get_account_state()` so that missing or stale snapshot data is not converted into fake, executable-looking sizing values.
- Path B: broader structural risk area if the narrow path is unsafe
  - Re-validate the full backend-to-dashboard contract for `lotSize` and the execution gating path, including the plan-card warnings and the existing PHP regression tests.
- Recommended: choose one and explain why
  - Recommend Path A first because the confirmed code path is concentrated in one backend sizing fallback, and the dashboard behavior is a downstream symptom of that faulty equity source.

# 7. Risk flags
- High-risk system involved: Yes — incorrect lot sizing affects real execution exposure and order viability
- Requires parity re-validation: Yes — backend sizing math and dashboard lot rendering should be re-validated together
- Migration-blocking: Yes — this affects the current backend-authority trade-plan path used by live signal execution
- Human review required before merge: Yes — because the fix touches financial-risk calculations and requires validation against the existing staged-lot contract

# 8. Handoff package
- Epicentre files to inspect first:
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `wordpress/smc-superfib-sniper/tests/php/test-progressive-lot-sizing.php`
  - `src/components/PlanCard.tsx`
- Inputs Codex must verify before planning:
  - Whether the live account snapshot is truly stale/missing at the point `build_trade_plan()` executes
  - Whether the backend should prefer live `equityUSC` or `balanceUSC` when `equityUSC` is unavailable
  - Whether the current fallback logic is masking broken account-state data instead of blocking invalid sizing
- Open unknowns that could invalidate the current hypothesis:
  - Whether the account snapshot is sometimes present but internally zeroed out rather than missing entirely
  - Whether any other execution path bypasses the backend risk model and writes fixed lot sizes directly
