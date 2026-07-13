# 1. Issue classification
- Severity: CRITICAL
- Category: parity-drift / signal-integrity
- Layer(s) affected: MT5 / Pine / workflow
- Phase impact: Cross-phase

# 2. Confirmed evidence
- `mt5/FibEngine.mqh` computes 16 canonical SuperFIB ratios and emits `LTF_SF` / `HTF_AF` levels across M15, H1, H4, and D1, and the signal path reuses `BuildSignalFibLevels()` for candidate evaluation.
- `mt5/MarketDataEngine.mqh` dispatches fib payloads to `/ea/fib-levels` and also drives `SendSignalCandidatesToBackend()`, showing the same MT5 engine path is responsible for both parity geometry and signal generation.
- `mt5/SignalEngine.mqh` currently uses a simple proximity/displacement/HTF-alignment/regime gate only; it does not implement AOV-zone validation, equilibrium exclusion, or RR-based risk gates.
- `PHASE4_IMPLEMENTATION.md` and `PHASE4_TESTING_GUIDE.md` explicitly state that Pine (`SMC_SuperFib_v13.1.3.pine`) is the parity authority, that 99%+ fib parity is the Phase 4 target, and that live replay corpus validation remains manual.
- `.github/migration/RISK_REGISTER.md` records HIGH/MEDIUM open risk for MT5/Pine parity drift and for missing dedicated signal replay coverage, which directly aligns with the requested AOV authority patch.
- `reports/BUG_SWEEP_REPORT_2026-05-28_phase4-h4-timeframe-contract.md` confirms the H4 contract correction is code-safe at repo level, but still depends on live MT5/Pine capture for final closeout. This is evidence that the current parity surface is not yet fully operationally verified.

# 3. Root cause hypothesis
- Most likely root cause: the MT5 signal-generation path is not yet authority-bound to the same Pine parity and institutional-value rules that the requested patch requires. The repository evidence shows separate MT5 fib-generation and signal-evaluation logic in `mt5/FibEngine.mqh` and `mt5/SignalEngine.mqh`, while the parity authority and live replay validation are still documented as manual / pending.
- Why this best fits the evidence: `FibEngine.mqh` and `SignalEngine.mqh` are currently implemented as two different MT5 surfaces, and the existing signal gate is proximity-based rather than AOV-based. The Phase 4 docs also state that live MT5-to-Pine parity proof is still pending, so the patch target is a real governance gap rather than a rewritten architecture.
- What likely triggered or surfaced the issue: the Phase 4 H4 contract correction and the ongoing migration into MT5-native signal generation exposed that parity validation and signal gating are still only partially hardened. The risk register explicitly flags parity drift and missing signal replay coverage as open items.
- Mark each sub-point as Confirmed or Hypothesis:
  - The MT5 signal path currently lacks AOV/equilibrium/RR gating: Confirmed.
  - The current parity authority surface is still dependent on manual live replay and not fully closed out: Confirmed.
  - Exact GBPUSD / BTCUSD geometry drift is not yet evidenced in the repo snapshot: Unconfirmed.
  - The requested AOV patch is required to prevent over-signaling and to preserve Pine authority: Confirmed.

# 4. Blast radius
- Every file likely affected:
  - `mt5/FibEngine.mqh`
  - `mt5/MarketDataEngine.mqh`
  - `mt5/SignalEngine.mqh`
  - `SMC_SuperFib_v13.1.3.pine`
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `scripts/parity-validator.php`
  - `wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php`
  - `wordpress/smc-superfib-sniper/tests/php/test-fib-ingestion.php`
  - `wordpress/smc-superfib-sniper/tests/php/test-superfib-weighting.php`
  - `wordpress/smc-superfib-sniper/tests/php/test-htf-authority-anchor.php`
  - `wordpress/smc-superfib-sniper/tests/php/test-session-anchors.php`
- Every system at risk:
  - MT5 EA fib and signal generation
  - PHP backend ingest and fib-level storage
  - Pine authority reference and parity validator
  - dashboard/REST surfaces that consume MT5 fib/signal outputs
- Every parity surface at risk:
  - Pine <-> MT5 fib geometry
  - Backend ingestion <-> MT5 output contract
  - Dashboard/REST consumption of fib/signal payloads
- Stale-state / authority-boundary risks:
  - Live replay corpus still pending for final parity closeout
  - Automatic signal generation can drift if AOV and RR logic are patched without parity diagnostics
  - H4 contract correction must remain intact to avoid false fib geometry and missing-level regressions

# 5. Regression surface
- What could break if patched incorrectly:
  - MT5/Pine fib parity could degrade if the anchor or level-generation path changes without a validator.
  - Signal quality could worsen if AOV gating is applied too broadly or if existing hedge/laddering/risk behavior is disturbed.
  - Backend ingestion and dashboard consumption could break if the MT5 output contract changes shape.
- Existing guards that must not be weakened:
  - The existing 16-ratio, LTF_SF/HTF_AF, H4/D1 contract in the Phase 4 test suite
  - Backend authority and ingestion tests already documented in the repo
  - The manual live-corpus / replay validation path already called out in the Phase 4 guide
- Current tests / audits covering this area:
  - `test-fib-parity.php`
  - `test-fib-ingestion.php`
  - `test-superfib-weighting.php`
  - `test-htf-authority-anchor.php`
  - `test-session-anchors.php`
  - `scripts/parity-validator.php`
  - `PHASE4_IMPLEMENTATION.md`
  - `PHASE4_TESTING_GUIDE.md`

# 6. Resolution path options
- Path A: narrowest plausible correction surface
  - Add parity diagnostics and an AOV-sensitive signal gate inside the current MT5 path, preserving existing fib architecture and backend authority.
- Path B: broader structural risk area if the narrow path is unsafe
  - Rework the MT5 fib-to-signal handoff and validator coverage more widely, including a dedicated signal replay suite.
- Recommended: Path A
  - The repo evidence points to a governance and gating gap rather than an architectural rewrite need. The narrowest path preserves the current SuperFIB framework while enforcing the missing parity and institutional-zone controls the issue demands.

# 7. Risk flags
- High-risk system involved: Yes — MT5 signal generation and fib parity are execution-adjacent and can create false trade signals if the authority boundary is wrong.
- Requires parity re-validation: Yes — `FibEngine.mqh` / MT5 fib output and the Pine authority path must be re-validated for GBPUSD, XAUUSD, and BTCUSD before any implementation patch is accepted.
- Migration-blocking: Yes — Phase 4 parity and the downstream signal-authority path are both implicated; the issue is therefore a gate-level risk for further MT5 migration.
- Human review required before merge: Yes — the requested change touches trading logic, parity authority, and signal gating, which requires manual review of live replay evidence and risk-framework preservation.

# 8. Handoff package
- Epicentre files to inspect first:
  - `mt5/FibEngine.mqh`
  - `mt5/MarketDataEngine.mqh`
  - `mt5/SignalEngine.mqh`
  - `SMC_SuperFib_v13.1.3.pine`
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- Inputs Codex must verify before planning:
  - Exact MT5-to-Pine parity snapshots for GBPUSD, XAUUSD, BTCUSD
  - Current H4/H1 AOV and equilibrium-zone behavior in the live MT5 signal path
  - Existing RR and signal-risk logic currently present in the repo
- Open unknowns that could invalidate the current hypothesis:
  - Whether live MT5 replay shows real geometry drift on GBPUSD / BTCUSD, not just theoretical risk
  - Whether the backend already stores enough HTF/AOV context to support the requested institutional-zone gate without new contract fields
  - Whether the existing Phase 4 parity validator has enough live-corpus coverage to reject false positives before implementation