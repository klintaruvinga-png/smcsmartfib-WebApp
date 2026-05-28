# Executive Summary

- Overall health: stable after a targeted MT5 signal-dispatch hardening patch.
- Bugs found today: 2 confirmed issues total.
- Fixes applied: 1 HIGH logic fix this run, 1 LOW formatting fix preserved from the earlier same-day sweep.
- Remaining risks: no MT5 terminal replay or MetaEditor compile artifact was available in this workspace, so live candidate emission is not runtime-verified here.
- Migration readiness: the MT5 signal-dispatch blocker is cleared in code; Phase 6 runtime parity still needs live replay validation.

This report supersedes the earlier 2026-05-27 same-day sweep that reported no HIGH issues. The MT5 signal-dispatch path contained a confirmed scaffold defect that prevented candidate emission.

# Confirmed Problems

## HIGH

### BUG-2026-05-27-002 - MT5 signal candidate dispatch was hard-disabled

- Severity: HIGH
- Category: Signal engine integrity / MT5 migration parity
- Files: `mt5/MarketDataEngine.mqh`, `mt5/FibEngine.mqh`, `mt5/RegimeEngine.mqh`
- Root cause: `SendSignalCandidatesToBackend()` built no fib levels (`fibCount` stayed zero) and injected placeholder regime values (`TRANSITIONAL` / `RANGING` / `0.5`) instead of authoritative engine outputs.
- Impact: MT5 could not emit signal candidates on this path, Phase 6 parity was overstated, and backend/dashboard signal truth could never converge from MT5-generated inputs.
- Blocker status: fixed in this run.

## LOW

### BUG-2026-05-27-001 - Prettier formatting drift in strict lint paths

- Severity: LOW
- Category: Frontend CI / lint gate
- Files: `src/lib/api/sniperClient.ts`, `src/routes/-admin.test.tsx`
- Root cause: pre-existing formatting drift from the earlier same-day run.
- Impact: strict lint gating could fail without affecting runtime behavior.
- Blocker status: fixed earlier on 2026-05-27 and preserved.

# Surgical Fixes Applied

## PATCH-2026-05-27-002 - MT5 signal dispatch authority wiring

- Exact files changed:
- `mt5/MarketDataEngine.mqh`
- `mt5/FibEngine.mqh`
- `mt5/RegimeEngine.mqh`
- `scripts/mt5-signal-dispatch.test.mjs`

- Exact logic hardened:
- `mt5/MarketDataEngine.mqh` now refreshes broker offset before the signal pass, builds real M15 signal fib levels, and consumes live regime output before evaluating candidates.
- `mt5/FibEngine.mqh` now exposes `BuildSignalFibLevels()` so the signal engine consumes the same anchor logic already used by the fib dispatch path.
- `mt5/RegimeEngine.mqh` now exposes `ComputeRegimeState()` and a typed `RegimeSnapshotOut` payload so callers can reuse authoritative regime calculations without JSON scaffolding.
- `scripts/mt5-signal-dispatch.test.mjs` now fails if the MT5 signal path regresses to placeholder regime values or an empty fib-count scaffold.

- Defensive protections added:
- Signal dispatch now logs and skips per symbol when fib inputs or regime inputs are unavailable instead of silently evaluating against fabricated defaults.
- The source-level regression test asserts the signal path must call the authoritative helper methods and must not reintroduce the previous placeholder constants.

## PATCH-2026-05-27-001 - Strict lint formatting normalization

- Preserved from earlier same-day run.
- No logic changes.

# Parity Verification Results

- Fib parity: targeted signal-input parity is restored. The MT5 signal path now sources fib inputs from `FibEngine` rather than a zero-length scaffold. `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php` passed.
- Regime parity: targeted signal-input parity is restored. The MT5 signal path now sources `htfBias`, `ltfRegime`, and `chopScore` from `RegimeEngine` rather than placeholders.
- Signal parity: the confirmed emission blocker is removed. End-to-end runtime replay parity remains pending because no MT5 terminal replay or compiled EA artifact was available in this workspace.
- Freshness parity: unchanged by this patch. `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` passed, confirming no regression in backend timestamp/freshness contracts.

# Remaining Risks

- Runtime verification gap: no MetaEditor compile log or MT5 terminal replay was available, so live candidate creation from broker data remains unobserved in this workspace.
- Replay coverage gap: the focused automation suite still lacks a dedicated multi-case Phase 6 signal replay harness.
- Data availability edge case: if M15 or H1/D1 history is unavailable for a symbol, signal dispatch will now skip that symbol with diagnostics instead of fabricating candidate inputs. This is correct but operationally visible.

# Regression Checklist

- [x] `npm run check:mql`
- [x] `npx vitest run scripts/mt5-signal-dispatch.test.mjs`
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php`
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- [x] Signal dispatch no longer contains placeholder `TRANSITIONAL` / `RANGING` regime defaults
- [x] Signal dispatch no longer evaluates with `fibCount = 0`
- [x] Backend contracts and freshness authority remained unchanged

# Safe Deployment Order

1. Deploy the MT5 source changes in `mt5/FibEngine.mqh`, `mt5/RegimeEngine.mqh`, and `mt5/MarketDataEngine.mqh`.
2. Rebuild the EA in MetaEditor and capture the compile log.
3. Run a controlled MT5 replay or paper-session pass to confirm candidate emission on symbols with valid M15/H1/D1 history.
4. Verify backend `/ea/signal-candidates` ingestion and dashboard signal visibility.
5. Keep the frontend lint-only changes from the earlier same-day run if that branch is also deployed.

# Do Not Touch List

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` freshness and snapshot authority paths unless a separate backend defect is confirmed.
- Pine trading formulas in `SMC_SuperFib_v13.1.3.pine` unless parity evidence proves formula drift.
- Frontend signal truth rendering rules in `src/hooks/useSniperData.ts` and `src/components/PlanCard.tsx` unless backend contracts change.
