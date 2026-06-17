# Projection and Contract Inventory - 2026-06-17

This is a Phase 4A planning artifact. It inventories the current projection/cache surfaces and the duplicated contract surfaces that can drift from authoritative domain truth.

## Projection and Cache Inventory

| Surface                                                                       | Current owner                                     | Duplication / risk                                                                                                                        | Future owning phase                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `smc_sf_engine_snapshot` user-meta cache                                      | WordPress monolith via `ensure_engine_snapshot()` | Cache carries domain-significant signal, regime, plan, and health state; stale reuse can become business-truth drift                      | 6 for signal/dashboard projection isolation, 7 for plan truth separation |
| `smc_sf_display_signals`                                                      | WordPress monolith signal-board lifecycle         | Projection can drift from raw MT5 candidates and snapshot `signals` if promotion/invalidation rules are implicit                          | 6                                                                        |
| `smc_sf_trade_plans`                                                          | WordPress monolith trade-plan persistence         | Persisted executable plans can diverge from snapshot/display plan payloads and frontend plan recomputation                                | 7                                                                        |
| `smc_sf_regime_snapshots`                                                     | WordPress monolith regime ingest/query path       | Regime snapshots can drift from Pine parity reference and frontend assumptions if normalization remains implicit                          | 5                                                                        |
| `smc_sf_mt5_signal_candidates`                                                | WordPress monolith candidate ingest/drift path    | Raw candidates are currently close to operational board logic, increasing the risk of dual truth between candidates and board projections | 6                                                                        |
| `smc_sf_user_settings` plus watchlist mutation cache                          | WordPress settings flow plus frontend query cache | Backend canonical watchlist can drift from frontend local/query state during mutation and invalidation paths                              | 4A                                                                       |
| `smc_sf_license_tiers` plus `/ea/license-check` and `/user/license` responses | WordPress monolith licensing flow                 | Entitlement persistence, EA gate response, and UI read model are coupled but not explicitly separated                                     | 9                                                                        |

## Contract Duplication Inventory

| Surface                                                             | Current owner                                                                                           | Duplication / risk                                                                              | Future owning phase                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Frontend types vs SDK types                                         | `src/types/sniper.ts` and `sdk/src/types/index.ts`                                                      | Type drift risk; some frontend vocabulary is richer than SDK surface                            | 5/6                                                                      |
| Frontend client normalization vs SDK client normalization           | `src/lib/api/sniperClient.ts` and `sdk/src/client/SniperClient.ts`                                      | Response normalization rules can diverge while both appear locally correct                      | 5/6                                                                      |
| Frontend plan policy vs backend plan policy                         | `src/routes/-plan.utils.ts`, `src/components/PlanCard.tsx`, backend plan builders                       | Completeness, min executable lot, and execution eligibility are computed in more than one place | 7                                                                        |
| Frontend freshness vocabulary vs backend / MT5 freshness vocabulary | `FreshnessState` in frontend, dashboard badges, backend health/snapshot semantics, MT5 freshness engine | Same state words can carry different meanings across layers, causing UI truth drift             | 6                                                                        |

## Phase 4A notes

- This inventory is not gate evidence and does not authorize runtime cleanup by itself.
- Any runtime change to these surfaces must wait for the owning migration phase.
- Closed phases and archived evidence remain unchanged.
