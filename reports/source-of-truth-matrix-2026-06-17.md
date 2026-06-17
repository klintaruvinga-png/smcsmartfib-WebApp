# Source-of-Truth Matrix - 2026-06-17

This is a Phase 4A planning artifact. It is docs-only, read-only, and does not change any current migration gate or runtime truth source.

| Truth domain    | Authoritative owner now                                | Parity/reference owner              | Projections/caches allowed                                                                                         | Known divergence points                                                                                                                                                  | Blocked changes during active gates                                                                           | Future consolidation phase |
| --------------- | ------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Signal truth    | WordPress backend operational authority                | Pine visual/parity reference        | `smc_sf_engine_snapshot`, `smc_sf_display_signals`, `smc_sf_mt5_signal_candidates`, dashboard transport cache      | MT5 `SignalEngine` candidate output vs `post_ea_signal_candidates()`, snapshot `signals` vs `display_signals`, backend board response vs frontend fallback/rendering     | No fib math changes in Phase 4 soak, no signal gate/scoring changes in Phase 4A, no dashboard truth overrides | Phase 6                    |
| Plan truth      | WordPress backend                                      | None separate from backend contract | `smc_sf_trade_plans`, snapshot `plans`, dashboard transport cache                                                  | `build_trade_plan()` vs frontend `isTradePlanComplete()`, backend lot rules vs `getMinExecutableStageLot()`, persisted trade-plan rows vs snapshot/display plan payloads | No execution-state invention in frontend, no execution gate changes before Phase 7 activation                 | Phase 7                    |
| Regime truth    | WordPress backend operational authority                | Pine parity reference               | `smc_sf_regime_snapshots`, snapshot regime payloads, dashboard transport cache                                     | Pine regime vs MT5 `RegimeEngine`, MT5 snapshot vs backend normalized regime, frontend badge assumptions vs backend state                                                | No regime/chop scoring changes in Phase 4 soak or 4A                                                          | Phase 5                    |
| License truth   | WordPress backend                                      | None separate from backend contract | `smc_sf_license_tiers`, `/ea/license-check` response, `/user/license` response, dashboard transport cache          | EA `SendLicenseCheck()` startup gate vs `/user/license`, admin tier mutation path vs entitlement evaluation, future UI gating risk                                       | No licensing-logic changes in Phase 4A, no entitlement interpretation shifts outside owning phase             | Phase 9                    |
| Dashboard truth | Backend owns data truth; frontend owns view-state only | None separate from backend contract | React Query cache, local component state, `localStorage` schema/version markers, watchlist/settings mutation cache | Query cache vs live payload, mutation response vs cached watchlist, route-level fallback logic, stale/pending interpretation in UI                                       | No dashboard code may invent execution state or override backend signal truth during Phase 4 soak             | Phase 7                    |

## Authority defaults locked for later work

- Signal: backend operational authority, Pine parity reference.
- Plan: backend authority.
- Regime: backend operational authority, Pine parity reference.
- License: backend authority.
- Dashboard: backend owns data truth; frontend owns view-state only.

## Phase 4A governance notes

- This matrix may clarify ownership and sequencing, but it may not change any current route contract, payload shape, persistence rule, or gating rule.
- Closed phases remain closed.
- Phase 5 remains gated on Phase 4.
- The next runtime authority extraction begins only when the owning migration phase becomes active.
