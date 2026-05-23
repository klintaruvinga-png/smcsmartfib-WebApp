# Bug Sweep Report

Date: 2026-05-23
Scope: Crypto weekend market-open classification, MT5 freshness/session authority, backend snapshot state persistence, and dashboard offline truth.

## Integrity checks performed

- Verified the confirmed defect path still originates in `mt5/SessionManager.mqh` and not in backend freshness mapping.
- Verified the patch only changes `SessionManager.IsMarketOpenForSymbol()` for crypto-prefixed normalized symbols.
- Verified the backend `CLOSED -> offline` and `DISCONNECTED -> offline` mapping remains unchanged.
- Added an MT5 regression script that asserts crypto-vs-FX Saturday UTC classification without changing production runtime code paths outside `SessionManager`.
- Added a PHP regression assertion that a crypto `LIVE` snapshot persists as `state='live'`.

## Findings

- Confirmed fixed at source: crypto-normalized symbols now bypass weekend closure in `IsMarketOpenForSymbol()`, preventing the MT5 freshness engine from incorrectly aging weekend crypto into `CLOSED`.
- Confirmed preserved: FX weekend closure logic remains untouched because `ResolveSessionStateForSymbol()` and the existing base weekend schedule were not changed.
- Confirmed preserved: backend authority boundaries remain intact. `class-market-data-service.php` still treats `CLOSED` and `DISCONNECTED` as offline, so the patch does not weaken stale-data protections or invent frontend-only signal truth.
- Confirmed preserved: existing Phase 3 backend regression coverage for `CLOSED` freshness persisting as offline still passes.

## Residual risks

- MetaEditor CLI compile evidence is inconclusive from this workspace. The local CLI returned successfully but produced no repo-local compiler log or `.ex5` artifact, matching prior repository observations.
- Live weekend soak verification is still pending. The patched EA must be recompiled, reloaded in MT5, and observed on Saturday/Sunday UTC to confirm crypto renders live while FX remains offline/closed.
- `GetSessionNameForSymbol()` was intentionally not changed by contract, so weekend crypto can still carry a weekend/closed session label even though freshness gating remains live. This preserves scope but should be watched in operator UX.
