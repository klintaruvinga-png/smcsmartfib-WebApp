# Phase 4A - Production Hardening and Principles Contract

**Created**: 2026-06-06
**Phase relationship**: Runs in parallel with Phase 4 live fib parity soak
**Status**: READY
**Primary rule**: No fib math, regime scoring, signal gate, or dashboard signal-truth behavior changes during Phase 4 soak unless the change is explicitly read-only.

## Objective

Capture production hardening and domain-contract work that can safely proceed while Phase 4 remains blocked on live paired MT5-vs-Pine fib evidence.

Phase 4A must not be used to reopen Phase 0-3 gates or bypass the Phase 4 closeout gate.

## Current Phase 4 Blocker

Weekend control note: do not rerun Phase 4 parity as a real gate during weekend market closure. The expected stale M15 candle state makes weekend failures data-invalid, not new fib/regime/signal evidence.

Next valid Phase 4 action: wait until markets reopen, confirm every Phase 4 test symbol has a newly closed M15 candle, then recapture the synchronized MT5 fib export snapshot and matching M15 candle set before rerunning `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/run-phase4-parity.ps1`.

Evidence basis:

- 2026-06-02/03 paired-export validator runs failed at `40.89%` parity with `227` critical mismatches.
- 2026-06-04 rerun was blocked before validator output because M15 candle exports were stale relative to the MT5 export snapshot.
- Weekend gate reruns are invalid while stale weekend timestamps remain in candle files.
- Phase 4 closeout still requires 99%+ paired-export parity, zero critical mismatches, weekend/sparse-data evidence, and operator export acceptance.

## Lane 1 - Hardening

Allowed work:

- Remove dangerous ignore rules that can hide source files.
- Add or repair normal PR CI.
- Fix or disable misaligned publish automation.
- Make the root license posture explicit.
- Add `SECURITY.md` and security reporting guidance.
- Harden auth storage and session handling.
- Centralize CORS origin configuration across PHP, Worker, and nginx.

Acceptance criteria:

- CI and repository hygiene changes are independently reviewable.
- Auth/security changes do not alter trading calculations or signal eligibility.
- Any publish workflow change clearly targets the intended package.

## Lane 2 - Parity Support

Allowed work:

- Improve export diagnostics.
- Preserve failed/blocked parity artifacts.
- Document stale-candle failure modes.
- Add read-only parity reporting and runbook improvements.

Acceptance criteria:

- Phase 4 evidence distinguishes validator/tooling PASS, paired-export FAIL/PASS, stale-export BLOCKED, and operator acceptance.
- Diagnostics help close Phase 4 without changing fib output.

## Lane 3 - Domain Contracts

Allowed work:

- Define contract-only fields and fixture expectations for:
  - SMT divergence.
  - AMD phase.
  - ERL/IRL model.
  - Silver Bullet window.
  - Weekly profile classifier.
- Add glossary and fixture docs under migration documentation.

Acceptance criteria:

- Contracts are documented as future/read-only until their owning migration phase is active.
- No backend, MT5, Pine, or dashboard scoring behavior changes are bundled into contract docs.

## Lane 4 - No-Behavior-Change Governance

Blocked during active Phase 4 soak:

- Fib anchor, family, ratio, rounding, or timeframe output changes.
- Regime/chop scoring changes.
- Signal candidate eligibility or scoring changes.
- Dashboard code that invents execution state or overrides backend truth.

Allowed exception:

- Read-only labels, fixtures, or diagnostics that do not alter persisted signal truth or operator gating.

## Immediate Next Repo Step

Pause Phase 4 parity reruns until market reopen. The next implementation PR can safely target docs cleanup, capture procedure hardening, stale-candle guard planning, artifact naming conventions, or Phase 4A non-behavior hardening. Do not use weekend parity evidence to fix fib, regime, or signal behavior.

## Regression Checks

For docs-only updates:

- `git diff --check`
- Manual review that Phase 0-3 remain complete.
- Manual review that Phase 5 remains gated on Phase 4.
- Manual review that Phase 4A does not authorize trading-output changes.
