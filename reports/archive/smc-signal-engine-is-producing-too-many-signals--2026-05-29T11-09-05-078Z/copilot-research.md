# 1. Issue classification
- Severity: HIGH
- Category: signal-integrity
- Layer(s) affected: MT5 / PHP-backend / REST-API / Dashboard-JS
- Phase impact: Phase 6 / Cross-phase

# 2. Confirmed evidence
- The MT5 signal generation path in `mt5/MarketDataEngine.mqh` calls `SendSignalCandidatesToBackend()` every ~120 seconds, which means new candidate evaluation is dispatched on a fixed cadence and not gated by any live-signal lifecycle state in this file.
- The actual candidate scorer in `mt5/SignalEngine.mqh` computes `status`, `verdict`, `entryPrice`, `slPrice`, and `tpPrice` from fib levels, regime state, and RR checks, but the current path does not contain any suppression logic for an already-active signal on the same symbol/range.
- The backend ingest endpoint in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` accepts MT5 candidate payloads at `POST /ea/signal-candidates` and writes them into `smc_sf_mt5_signal_candidates`, then compares them against existing `smc_sf_signals` rows where `status != 'CLOSED'`.
- That comparison logic in `classify_signal_drift()` only classifies Pine drift / mismatch / no-Pine behavior; it does not appear to block, dedupe, or invalidate duplicate candidate generation for a still-valid signal.
- The existing regression guard in `scripts/mt5-signal-dispatch.test.mjs` verifies the MT5 dispatch contract and RR/AOV gates, but it does not cover a one-live-signal-per-range suppression rule.

# 3. Root cause hypothesis
- Most likely root cause: the current MT5 → backend signal flow has no lifecycle guard that says “do not push another candidate for this symbol/range while the previous signal is still valid.”
- Why this fits the evidence: the candidate generation path is timer-driven and score-based, while the backend only stores and compares candidates. No evidence was found in the reviewed path that enforces a live-signal validity window, SL/TP invalidation rule, or duplicate suppression on the same active range.
- What likely triggered or surfaced the issue: the fixed cadence of `SendSignalCandidatesToBackend()` and the current `status/verdict` generation allow repeated candidates to accumulate inside the same fib zone as long as the previous signal remains open, which matches the report of too many signals being generated in one range.
- Mark each sub-point as `Confirmed` or `Hypothesis`:
  - Candidate generation is timer-driven and repeats on a fixed cadence: `Confirmed`
  - The reviewed MT5 and backend path has no duplicate-suppression / active-signal gate: `Confirmed`
  - The current logic therefore permits repeated “same-range” candidate generation while an earlier signal may still be valid: `Hypothesis`

# 4. Blast radius
- Every file likely affected:
  - `mt5/MarketDataEngine.mqh` — fixed-interval signal dispatch cadence
  - `mt5/SignalEngine.mqh` — candidate scoring and signal lifecycle assumptions
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — MT5 candidate ingestion and drift classification path
  - `scripts/mt5-signal-dispatch.test.mjs` — existing parity guard for MT5 signal contract
- Every system that reads from or writes to the broken component:
  - MT5 dispatches candidate JSON to `/ea/signal-candidates`
  - PHP backend writes candidate rows and compares them to existing live Pine/MT5 signals
  - Dashboard/REST surfaces that consume the candidate stream would inherit any duplicate or invalid signal spam
- Every parity surface at risk: Pine <-> Backend <-> Dashboard <-> MT5
  - MT5-to-backend signal cadence parity is the primary risk
  - Pine drift classification and live-signal state handling may diverge if duplicate suppression is added without matching semantics
- Any stale-state, cache, sequencing, or authority-boundary risks:
  - A stale `status != 'CLOSED'` view of existing signals can allow repeated candidates to be accepted during the same active range
  - Fixed-cycle dispatch can amplify signal spam if the validity window is not enforced centrally

# 5. Regression surface
- What currently working behavior could break if patched incorrectly:
  - Valid signals could be suppressed too aggressively during normal market movement
  - The current parity / drift audit path could weaken if duplicate filtering is implemented without preserving existing candidate ingestion
- Existing guards, stale-data protections, or validation paths that must not be weakened:
  - The current AOV/RR checks in `mt5/SignalEngine.mqh`
  - The validation of candidate payload fields in `post_ea_signal_candidates()`
  - The existing Pine drift classification path for parity analysis
- Tests, audits, or reports that appear to cover this area today:
  - `scripts/mt5-signal-dispatch.test.mjs` verifies the MT5 signal dispatch contract
  - `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` appears to cover the MT5 snapshot / candidate contract path

# 6. Resolution path options
- Path A: narrowest plausible correction surface
  - Add a lifecycle gate in the MT5/backend signal path that blocks new candidate generation while an earlier signal for the same symbol/range is still valid, and only clears that block when the signal is invalidated by entry/SL/TP progression.
- Path B: broader structural risk area if the narrow path is unsafe
  - Rework the signal lifecycle state model across MT5, PHP, and dashboard consumers so the “active signal” / “invalidated” state is authoritative everywhere instead of inferred from candidate timestamps.
- Recommended: choose one and explain why
  - Recommend Path A first because the evidence is concentrated in the existing MT5 candidate generation and the backend ingest path, and the problem statement is specifically about preventing duplicated live signals in the same range.

# 7. Risk flags
- High-risk system involved: Yes — repeated signal generation can flood the user and corrupt live trade tracking
- Requires parity re-validation: Yes — MT5, backend candidate storage, and any frontend signal list must all agree on what counts as an active signal
- Migration-blocking: Yes — this affects the current Phase 6 signal-generation path that is already being audited for parity and live dispatch
- Human review required before merge: Yes — because trading-signal suppression logic affects live signal quality and must be verified against the existing drift/parity contract

# 8. Handoff package
- Epicentre files to inspect first:
  - `mt5/MarketDataEngine.mqh`
  - `mt5/SignalEngine.mqh`
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- Inputs Codex must verify before planning:
  - Whether an active signal state already exists in the backend or MT5 runtime
  - Where the signal becomes invalidated (entry touched, SL crossed, TP/countertrade reached)
  - Whether the existing candidate contract can support a one-active-signal-per-symbol/range rule without breaking drift parity
- Open unknowns that could invalidate the current hypothesis:
  - Whether an existing open-signal record is already available in the backend but not currently consulted
  - Whether the dashboard or Pine path applies a different validity rule than MT5, which would require explicit parity alignment
