# Executive Summary

- Report date: 2026-05-30
- Phase: 2 - dashboard live-signals response-time metadata parity
- Status: CONDITIONAL PASS
- Overall parity: targeted backend/dashboard contract parity passed for truth-bearing fields, with `polledAt` added as non-authoritative transport metadata only.
- Threshold required: preserve backend signal authority and stable dedup identity while ensuring repeated polls are observable to dashboard consumers.
- Trend: improving.

# Component Parity Metrics

## Live-signals repeated-poll contract

| Metric | Expected behavior | Result | Status |
| --- | --- | --- | --- |
| Stable signal identity | Repeated `/live-signals` responses over an unchanged snapshot must keep `id`, `createdAt`, and `backendConfirmed` unchanged. | Verified by the new PHP route regression. | PASS |
| Response-time metadata | Repeated `/live-signals` responses must include `polledAt` and change it per response without persisting it into snapshot truth. | Verified by the new PHP route regression and route-local code inspection. | PASS |
| Anti-cache headers | `/live-signals` must still return `Cache-Control: no-store, no-cache, must-revalidate` and `Pragma: no-cache`. | Verified by the new PHP route regression. | PASS |

## Contract parity across layers

| Metric | Suite / evidence | Result | Status |
| --- | --- | --- | --- |
| Backend authority preserved | `get_live_signals()` still reads from `ensure_engine_snapshot($user_id)` and does not mutate cached snapshot storage. | Verified by targeted code inspection. | PASS |
| Dashboard type contract updated | `src/types/sniper.ts` accepts optional `polledAt?: string`. | Verified by code inspection and Vitest suites staying green. | PASS |
| SDK contract updated | `sdk/src/types/index.ts` mirrors optional `polledAt?: string`. | Verified by code inspection. | PASS |

# Drift Analysis

- Previous risk: repeated polls could deliver identical signal objects because the route exposed only stable snapshot truth and no response-time marker, leaving dashboard consumers blind to fresh poll responses.
- Current state: repeated poll responses now remain truth-stable on identity fields while exposing `polledAt` as explicit transport metadata.
- Residual drift: live environment parity between `/snapshot` and `/live-signals` was not captured from an authenticated session in this workspace.

# Comparison Matrix

| Layer | Before patch | After patch | Notes |
| --- | --- | --- | --- |
| WordPress `/live-signals` response body | Stable signal fields only. | Stable signal fields plus response-only `polledAt`. | `polledAt` is not persisted. |
| Engine snapshot storage | Cached truth in user meta with `meta.computedAt`. | Unchanged. | Source of truth preserved. |
| Dashboard signal type | No explicit response-time field. | Optional `polledAt?: string`. | Backward compatible. |
| SDK signal type | No explicit response-time field. | Optional `polledAt?: string`. | Backward compatible. |

# Acceptance Criteria

- [x] `get_live_signals()` remains snapshot-backed and does not force recomputation.
- [x] Repeated poll responses keep `id`, `createdAt`, and `backendConfirmed` stable.
- [x] Repeated poll responses expose changing `polledAt`.
- [x] `/live-signals` anti-cache headers remain intact.
- [x] App and SDK contracts accept the new optional field.
- [ ] Authenticated dashboard verification completed across at least three poll cycles.
- [ ] `/snapshot` and `/live-signals` parity confirmed in a live environment on truth-bearing fields while excluding `polledAt`.

# Migration Readiness

- Ready to continue on the targeted dashboard live-signals continuity path.
- Not sufficient to fully close the issue until authenticated manual verification confirms that the live dashboard re-renders across repeated poll cycles without a hard refresh.

# Unresolved Edge Cases

- The new regression uses an opt-in REST response wrapper in the PHP test harness to avoid widening unrelated route-contract coverage.
- Repository-wide TypeScript validation remains blocked by the unrelated `vite.config.ts` option typing mismatch.

# Verification Artifacts

- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- `npx vitest run src/lib/api/sniperClient.test.ts src/hooks/useSniperData.test.tsx src/routes/-signals.page.test.tsx src/routes/-plan.test.tsx`
- `npx tsc --noEmit`
- `reports/implementation-verification.md`
