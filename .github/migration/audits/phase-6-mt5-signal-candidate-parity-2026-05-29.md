# Executive Summary

- Report date: 2026-05-29
- Phase: 6 MT5 signal candidate parity
- Auditor: Codex automation
- Status: PASS with one repaired backend contract regression
- Overall parity: 100% repo-level synthetic fib gate retained; Phase 6 candidate persistence contract is now consistent with the MT5 emitter again

# Scope

- MT5 emitter: `mt5/SignalEngine.mqh`
- Backend ingest: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` `/ea/signal-candidates`
- Regression suite: `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`, `wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`, `scripts/mt5-signal-dispatch.test.mjs`

# Comparison Matrix

| Contract item | MT5 emitter expectation | Backend before patch | Backend after patch | Result |
| --- | --- | --- | --- | --- |
| `created_at` | Unix epoch seconds from `SignalToJson()` | Replaced with receipt time | Normalized from MT5 payload and stored as MySQL UTC | PASS |
| `pine_match` | Drift classifier should compare against latest Pine row | Worked only when live DB query path resolved | Preserved | PASS |
| `drift_pips` | Numeric drift metric should be stored for diagnostics | Dropped on ingest | Persisted on ingest | PASS |
| Direction mismatch telemetry | Candidate should still retain measurable price drift | Drift metric unavailable | Drift metric preserved, classification still `MISMATCH` | PASS |

# Acceptance Criteria

- [x] MT5 candidate `created_at` survives ingestion without fallback to receipt time.
- [x] `drift_pips` persists alongside `pine_match`.
- [x] Existing EA market-stream freshness and fib parity suites remain green.
- [x] No Pine formula or public API contract changes were introduced.

# Verification Results

| Check | Result |
| --- | --- |
| `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` | PASS |
| `php wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php` | PASS |
| `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php` | PASS |
| `npx vitest run scripts/mt5-signal-dispatch.test.mjs` | PASS |
| `php scripts/parity-validator.php --out reports/phase4-gate-2026-05-29.json` | PASS (`384/384` exact synthetic tuples, gate `PASS`) |

# Drift Analysis

- Previous state: backend persistence was silently collapsing MT5 candidate chronology to server receipt time and nulling drift evidence.
- Current state: candidate chronology and drift evidence are preserved again.
- Trend: stable after repair; no new parity drift observed in the local suite.

# Remaining Risks

- No fresh MT5/Pine export pair was present, so the validator remained in synthetic self-test mode.
- Operational parity still needs one live or Strategy Tester dispatch capture proving the repaired contract in runtime conditions.

# Migration Readiness

- Code-level readiness: yes
- Operational readiness: pending live MT5 evidence
- Blockers: none for code merge; runtime evidence still required for closeout
