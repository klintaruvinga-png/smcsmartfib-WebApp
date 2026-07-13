## 1. Issue validation

- Confirm or reject the reported root cause with reasoning:
  The reported root cause is partially confirmed. The confirmed defect is in `mt5/SignalEngine.mqh`, where candidate selection is proximity-first and does not enforce institutional value-zone authority, equilibrium exclusion, or minimum RR gating before emitting MT5 candidates. The broader report claim that Pine, fib geometry, backend ingest, or the parity validator must be changed is not proven by the repo evidence.
- Corrected root cause:
  Phase 6 MT5 signal generation is too permissive relative to repo-proven Pine value-zone and RR semantics. This is a signal-gating defect, not a confirmed fib-generation defect.

- `Confirmed`
  - `mt5/SignalEngine.mqh` currently selects the nearest fib level and gates only on proximity, displacement, HTF alignment, and regime state.
  - `mt5/MarketDataEngine.mqh` posts those candidates to `/ea/signal-candidates`, so the MT5 signal engine is the failure path.
  - `SMC_SuperFib_v13.1.3.pine` contains premium/discount/equilibrium logic and a minimum RR gate.
  - `PHASE4_IMPLEMENTATION.md` explicitly marks Pine as the parity target and explicitly says `SMC_SuperFib_v13.1.3.pine` is not to be modified.
  - Existing Phase 4 parity tooling validates fib geometry, not Phase 6 signal gating.

- `Likely`
  - Over-signaling risk is caused by MT5 emitting candidates outside institutional value zones because no AOV-side filter runs before candidate creation.
  - The narrowest safe correction is MT5-only inside `SignalEngine.mqh`, reusing existing fib outputs and preserving the current MT5->PHP payload contract.

- `Unconfirmed`
  - Any live fib-geometry drift on GBPUSD, BTCUSD, or XAUUSD.
  - Any need to modify `mt5/FibEngine.mqh`, `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`, or `scripts/parity-validator.php` for this patch.
  - Any need for new backend fields, schema changes, or Pine edits to enforce the requested authority rule.

## 2. Implementation contract

- Exact file path:
  `mt5/SignalEngine.mqh`
  Exact function, class, hook, selector, or section to modify:
  `SignalEngine::EvaluateSymbol()`
  Exact change required:
  Replace unrestricted nearest-level triggering with an authority-bound candidate filter that:
  1. derives the authoritative value-zone state from the existing `FibLevelOut[]` set already supplied by `FibEngine`,
  2. rejects equilibrium candidates,
  3. rejects directionally invalid value-zone candidates,
  4. computes SL and TP using the existing helpers,
  5. computes RR from the existing `entry/sl/tp` path,
  6. suppresses candidate emission when RR is below the Pine baseline threshold already present in `SMC_SuperFib_v13.1.3.pine`,
  7. preserves the existing WATCH/ARMED/READY and verdict flow only for candidates that survive the new AOV and RR gates.
  Guard rails: what must not change:
  - Do not change the 16-ratio set.
  - Do not change `FibEngine` anchor math, timeframe coverage, or family names.
  - Do not change the `/ea/signal-candidates` required payload fields unless re-planning is explicitly approved.
  - Do not bypass the existing CHOP, displacement, HTF-alignment, or missing-fib/missing-regime early exits.
  - Do not make frontend or PHP the source of signal truth.
  - Do not edit `SMC_SuperFib_v13.1.3.pine`.
  Why this file is in scope:
  This is the confirmed source of MT5 candidate creation and the only confirmed place where the requested AOV/equilibrium/RR controls are missing.
  Acceptance criterion tied to the failure path:
  - A candidate is not emitted when the best nearby level is equilibrium or the wrong side of value for its direction.
  - A candidate is not emitted when the computed RR is below the Pine minimum.
  - A valid premium-short or discount-long candidate that still passes the existing gates continues to emit with the current payload contract intact.

## 3. Patch sequence

1. Lock scope before editing: no Pine edits, no fib-engine edits, no backend schema edits, no validator edits.
2. In `mt5/SignalEngine.mqh`, add internal helper logic only as needed to derive authority high/low or zone state from the already supplied `FibLevelOut[]` data. Do not change the caller contract yet.
3. Update `SignalEngine::EvaluateSymbol()` so candidate selection is filtered by institutional value-zone authority before proximity scoring is finalized.
4. After a candidate survives AOV filtering, reuse the existing SL and TP helpers, then compute RR and block emission when RR is below the Pine baseline minimum.
5. Preserve the existing JSON contract unless implementation proves that payload changes are strictly required for verification. If that proof appears, stop and re-plan instead of widening silently.
6. Run existing regression checks and complete live/manual verification before claiming closeout.

- Dependencies between changes:
  - AOV filtering depends on current `FibLevelOut[]` containing enough information to derive zone state from existing levels.
  - RR gating depends on the existing `ComputeSwingSL()` and `ComputeFibTP()` outputs staying unchanged.

- Any state, cache, migration, or contract sequencing risk:
  - There is no justified migration in the current evidence set. Any proposed DB, REST, or schema change is a scope escalation and requires re-approval.
  - If implementation discovers that `SignalEngine` cannot derive zone state from current fib outputs without changing `FibEngine`, stop and re-plan. Do not widen in the same patch.

## 4. Regression guards

- Specific checks the implementation agent must run after patching:
  - Confirm `SignalEngine` still returns `false` when `fibCount == 0`.
  - Confirm CHOP blocking still applies before candidate emission.
  - Confirm `SignalToJson()` still emits the existing required fields with unchanged names and shapes.
  - Confirm no candidate is emitted for an equilibrium-level trigger.
  - Confirm no candidate is emitted when RR is below the Pine minimum.
  - Confirm at least one premium-short and one discount-long case still survive when all gates pass.

- Existing protections that must still hold:
  - Phase 4 fib parity protections and the 16-ratio `LTF_SF` / `HTF_AF` contract.
  - `M15/H1/H4/D1` fib coverage.
  - Backend stale-data and authority protections already enforced outside this patch.
  - Phase 6 execution gating in `is_phase6_gate_cleared()`.

- Parity re-validations required, if any:
  - Re-run fib parity validation against fresh MT5/Pine captures because this patch must not alter fib geometry indirectly.
  - Minimum required corpus remains the existing Phase 4 baseline in `PHASE4_TESTING_GUIDE.md`.
  - Do not claim issue-specific operational closeout without fresh captures for the issue symbols if GBPUSD and BTCUSD were the motivating live cases.

- Logging or diagnostics that should exist after the patch:
  - MT5 logs must show symbol, selected fib family, selected fib ratio, derived zone state, computed RR, and explicit block reason when AOV or RR suppresses a candidate.
  - Diagnostics must remain local to MT5 unless an additive backend contract change is explicitly approved.

## 5. Non-goals

- Explicitly list what is out of scope:
  - Editing `SMC_SuperFib_v13.1.3.pine`.
  - Changing `mt5/FibEngine.mqh` ratio math, anchors, timeframe ladder, or payload geometry.
  - Changing `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` REST contracts or database schema.
  - Changing `scripts/parity-validator.php`.
  - Changing dashboard rendering, approval queue behavior, or Phase 7 execution logic.

- Explicitly list attractive but unsafe follow-on changes to avoid in this patch:
  - Rebuilding Phase 6 around full Pine signal parity.
  - Adding new MT5->PHP candidate fields or schema columns without explicit need.
  - Introducing a new replay framework or signal backtester in the same patch.
  - Tuning Pine formulas, RR thresholds, or value-zone math beyond what is already proven in-repo.

## 6. Risk assessment

- Worst-case failure mode if patched incorrectly:
  Directional AOV filtering is inverted or RR is miscomputed, causing systematic suppression of valid candidates or continued emission of invalid ones.

- User-visible failure mode:
  The dashboard shows either a sharp drop in MT5 candidates or continued over-signaling despite the patch, while Phase 6 drift metrics become harder to interpret.

- Backend authority or stale-state risks:
  - If the patch widens into backend-required fields, candidate ingestion can break even though the signal defect is MT5-side.
  - If the patch bypasses existing early exits for missing fib/regime data, stale or partial state could become signal truth.

- Whether human approval should be required before merge:
  Yes. This touches execution-adjacent signal logic and must be reviewed with live replay evidence before merge.

## 7. Test requirements

- Tests to add or update, with exact target area:
  - No new repo-level automated MQL harness should be invented in this patch.
  - If `SignalToJson()` or the `/ea/signal-candidates` payload shape changes at all, add `wordpress/smc-superfib-sniper/tests/php/test-ea-signal-candidates.php` to verify legacy payload acceptance and additive-field tolerance.

- Existing tests or manual checks that must still pass:
  - `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php`
  - `php wordpress/smc-superfib-sniper/tests/php/test-fib-ingestion.php`
  - `php wordpress/smc-superfib-sniper/tests/php/test-superfib-weighting.php`
  - `php wordpress/smc-superfib-sniper/tests/php/test-htf-authority-anchor.php`
  - `php wordpress/smc-superfib-sniper/tests/php/test-session-anchors.php`
  - `php scripts/parity-validator.php`

- Any soak, replay, parity, or live-environment verification needed:
  - One live or Strategy Tester capture showing a valid discount-long candidate passes.
  - One live or Strategy Tester capture showing a valid premium-short candidate passes.
  - One live or Strategy Tester capture showing an equilibrium case is blocked.
  - One live or Strategy Tester capture showing an RR-below-minimum case is blocked.
  - Fresh MT5/Pine fib capture replay with `php scripts/parity-validator.php --mt5-file <...> --pine-file <...> --out reports/phase4-gate.json`.
  - One full MT5 signal-dispatch cycle with no contract or serialization errors in logs.

## 8. Implementation handoff

- Branch naming recommendation:
  `fix/phase6-aov-authority-gate`

- Suggested commit grouping:
  - Commit 1: `mt5/SignalEngine.mqh` AOV authority and RR gate only.
  - Commit 2: optional test or evidence artifact updates only if the payload contract changed.

- Required reports or artifacts to generate after implementation:
  - Fresh `reports/phase4-gate.json` from MT5 vs Pine fib replay.
  - MT5 log excerpt proving one blocked equilibrium case and one blocked RR case.
  - MT5 log excerpt proving one allowed premium-short case and one allowed discount-long case.

- State transition required after plan handoff:
  `READY_FOR_IMPLEMENTATION` with `editing_locked=false`
