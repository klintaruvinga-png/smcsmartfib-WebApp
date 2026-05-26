# Bug Sweep Report - Phase 0

**Report Date**: 2026-05-17  
**Phase**: Phase 0 - Dashboard build integrity and live-route hardening  
**Scanner**: Codex automation `code-bug-fix-and-cleanup`  
**Scan Duration**: 08:00-08:08 SAST

---

# Executive Summary

- Overall health: Stable on touched dashboard surfaces after surgical build hardening
- Bugs found: 3 confirmed dashboard build defects, 0 backend/runtime truth defects in executed checks
- Fixes applied: Type-safe optional numeric formatting, chart Vitest runtime guard hardening, live-route utility de-routed from TanStack route discovery
- Remaining risks: Bundle-size warning on exported `PlanPage`; mojibake text remains in `src/routes/live.tsx`; no full regime/signal replay was required or re-run
- Migration readiness: PASS for scoped dashboard build surfaces

---

# Confirmed Problems

| Severity | Category | Problem | Root Cause | Impact |
|----------|----------|---------|------------|--------|
| HIGH | Dashboard build / plan rendering | `npx tsc --noEmit` failed in `src/components/PlanCard.tsx` on optional numeric values | `Number.isFinite()` did not narrow `number \| undefined` for `.toFixed()` and `fmtPrice()` calls under strict TypeScript | Production build and CI compile could fail even though runtime fallback rendering existed |
| HIGH | Dashboard build / charts route | `src/routes/charts.tsx` referenced `import.meta.vitest` without a declared type | Strict TypeScript rejected the Vitest-only meta field on the route debug guard | Compile instability on chart route blocked full workspace type verification |
| MEDIUM | Wiring / route discovery | `src/routes/live.utils.ts` was treated as a route file by TanStack Router | Helper lived under `src/routes/` without the ignored `-` prefix | Repeated route-tree warnings polluted verification runs and obscured real routing issues |

Blocker assessment:
- Blocks current phase: No
- Blocks build verification: Yes before patch, No after patch
- Timeline impact if unresolved: Immediate CI/build drift
- Risk level: HIGH before patch, LOW after patch

---

# Surgical Fixes Applied

| File | Change | Hardening |
|------|--------|-----------|
| `src/components/PlanCard.tsx` | Added `isFiniteNumber()` type guard and routed optional lot/price/R:R formatting through it | Prevents future optional numeric display helpers from compiling unsafely while preserving existing `--` fallbacks |
| `src/routes/charts.tsx` | Replaced direct `import.meta.vitest` access with `"vitest" in import.meta` runtime detection | Keeps the debug-only branch dev-only while staying type-safe under strict builds |
| `src/routes/-plan.test.tsx` | Normalized optional `stops` merging in the plan test builder | Locks regression coverage to the current `TradePlan` contract instead of depending on implicit optional spread behavior |
| `src/routes/live.tsx` | Updated helper import path | Preserved live radar logic after helper relocation |
| `src/routes/-live.test.ts` | Updated helper import path | Kept stale/offline live-radar regression coverage attached to the moved helper |
| `src/routes/-live.utils.ts` | Re-homed the Live Radar helper under the ignored route-file prefix | Removes false-positive route discovery without changing backend freshness truth logic |

No Pine formulas, MT5 logic, REST contracts, stale thresholds, or signal-engine decision paths were changed.

---

# Parity Verification Results

- Fib parity: PASS carry-forward. No fib logic changed; prior backend parity harness remains authoritative.
- Regime parity: PASS carry-forward. No regime classification logic changed this run.
- Signal parity: PASS on touched dashboard surfaces. Signal plan rendering and live radar helper tests passed after patch.
- Freshness parity: PASS on touched dashboard surfaces. Live Radar stale/offline visibility regression remained green after helper relocation.

Scoped parity metrics:

| Surface | Previous | Current | Trend | Status | Action |
|---------|----------|---------|-------|--------|--------|
| Dashboard build integrity | FAIL (`tsc`) | PASS | Improving | PASS | None |
| Live Radar helper wiring | PASS | PASS | Stable | PASS | None |
| Chart route debug guard | FAIL (`tsc`) | PASS | Improving | PASS | None |

---

# Remaining Risks

- `src/routes/plan.tsx` still exports `PlanPage`, producing a non-blocking TanStack Router code-splitting warning.
- `src/routes/live.tsx` still contains legacy mojibake text literals; this is visual debt, not a truth defect.
- Full backend signal-generation replay, regime replay, and Pine/MT5 parity re-validation were not re-run because this patch set stayed entirely on dashboard build surfaces.

---

# Regression Checklist

- [x] `npx tsc --noEmit`
- [x] `npx vitest run src/routes/-live.test.ts src/routes/-charts.test.ts src/routes/-plan.test.tsx`
- [x] Existing Live Radar stale/offline regression still passes
- [x] Existing chart refresh/countdown regression still passes
- [x] Existing plan-card ranking/execution regressions still pass
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`

Manual verification steps:

1. Open the dashboard build/preview and confirm Signal Plans still render optional TP/R:R gaps as `--` instead of crashing or blanking the card.
2. Open the Charts route in dev mode and confirm tick-flash debug logging still appears only outside Vitest.
3. Open Live Radar and confirm stale/offline MT5 symbols still show real backend degradation instead of an awaiting placeholder.

---

# Safe Deployment Order

1. Deploy frontend bundle containing the TypeScript build hardening.
2. Smoke-test Signal Plans, Charts, and Live Radar.
3. Promote only after confirming dashboard build and route generation are clean in CI.

---

# Do Not Touch List

- Backend signal-engine readiness math in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` without replay evidence
- MT5 freshness thresholds and timestamp authority code without coordinated parity review
- Pine anchor/fib formulas without separate parity proof

---

## Artifacts

- Verification commands: `npx tsc --noEmit`
- Verification commands: `npx vitest run src/routes/-live.test.ts src/routes/-charts.test.ts src/routes/-plan.test.tsx`
- Verification commands: `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
