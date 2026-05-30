# Executive Summary

- Overall health: improved for the targeted `/live-signals` re-render path.
- Bugs found: 1 confirmed HIGH transport-contract defect between backend snapshot truth and repeated dashboard poll responses.
- Fixes applied: `/live-signals` now stamps a response-only `polledAt` on each returned signal, the PHP route regression now proves stable `id` plus changing `polledAt`, and app/SDK signal contracts now accept the optional transport field.
- Remaining risks: authenticated browser verification was not executed from this workspace, and `npx tsc --noEmit` still fails on an unrelated existing `vite.config.ts` type mismatch.
- Migration readiness: CONDITIONAL PASS for the targeted backend/dashboard live-signals continuity path.

# Confirmed Problems

| Severity | Component | Root cause | Impact | Status |
| --- | --- | --- | --- | --- |
| HIGH | Live-signals transport contract | `get_live_signals()` returned cached snapshot signals without any per-response field, so repeated polls could deliver structurally identical objects while `id` remained intentionally candle-anchored. | Frontend consumers could miss repeated poll updates and appear frozen until a hard refresh or another structural change occurred. | Patched |

# Surgical Fixes Applied

- [`wordpress/smc-superfib-sniper/smc-superfib-sniper.php`](/C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/wordpress/smc-superfib-sniper/smc-superfib-sniper.php:4992)
  - Preserved `ensure_engine_snapshot($user_id)` and stable signal `id` / `createdAt` semantics.
  - Added response-time `polledAt` stamping inside `get_live_signals()` only.
- [`wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`](/C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php:44)
  - Added header-capable REST test stubs and a repeated `/live-signals` regression proving stable identity plus changing `polledAt`.
- [`src/types/sniper.ts`](/C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/src/types/sniper.ts:154)
  - Added optional `polledAt?: string` to the dashboard signal transport type.
- [`sdk/src/types/index.ts`](/C:/Users/LEONNA/OneDrive/All%20Final%20Softwares/SMC%20SuperFib%20Dashboard/smcsmartfib-WebApp/sdk/src/types/index.ts:171)
  - Mirrored optional `polledAt?: string` for SDK contract parity.

# Verification Results

| Check | Result | Notes |
| --- | --- | --- |
| `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | PASS | Route patch is syntactically valid. |
| `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` | PASS | Repeated live-signals regression passes and anti-cache headers remain intact. |
| `npx vitest run src/lib/api/sniperClient.test.ts src/hooks/useSniperData.test.tsx src/routes/-signals.page.test.tsx src/routes/-plan.test.tsx` | PASS | 4 files passed, 37 tests passed. |
| `npx tsc --noEmit` | FAIL | Existing unrelated error in `vite.config.ts`: `test` is not a known property of `LovableViteTanstackOptions`. |
| Authenticated live dashboard verification | NOT RUN | Still required outside this workspace. |

# Remaining Risks

- No authenticated runtime capture was available here, so actual browser poll cycles against a live WordPress session still need manual confirmation.
- The route fix is transport-only by design; any frontend path that incorrectly keys off object identity instead of fresh query data still depends on the new `polledAt` field propagating through that path.
- Repository-wide TypeScript validation is currently blocked by the pre-existing `vite.config.ts` config typing error.

# Regression Checklist

- [x] `get_live_signals()` still reads through `ensure_engine_snapshot($user_id)` and does not force recomputation.
- [x] Signal `id`, `createdAt`, and `backendConfirmed` remain stable across repeated polls in the new PHP regression.
- [x] `/live-signals` anti-cache headers remain unchanged.
- [x] App and SDK signal contracts accept the optional response-only field without making it authoritative.
- [ ] Authenticated dashboard verification across at least three poll cycles completed.
- [ ] `/snapshot` versus `/live-signals` truth-bearing parity confirmed in a live environment while ignoring `polledAt`.

# Do Not Touch List

- `build_symbol_state()`, `run_engine_for_symbols()`, `ensure_engine_snapshot()`, and execution queue semantics.
- Signal ID formula, candle anchoring, and `createdAt`.
- TanStack Query structural-sharing behavior and polling cadence.
- Pine formulas, MT5 logic, stale-threshold rules, and backend authority boundaries.
