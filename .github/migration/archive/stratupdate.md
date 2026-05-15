# SMC SuperFib Strategy Reconciliation

This document reflects the strategy behavior implemented in the current repository state. It is not a tutorial and it does not inherit legacy assumptions unless they are still present in code.

## Current Strategy State

- `Implemented` `Backend authority`: The WordPress engine is the authoritative source for live regimes, gates, signals, and trade plans. `run_engine_for_symbols()` persists backend-generated signals and plans, and the frontend reads them from REST instead of recomputing execution truth locally.
- `Implemented` `Dashboard mirror`: The dashboard consumes `/snapshot`, `/regimes`, `/live-signals`, and `/ladders`. The plan screen now binds the displayed blueprint to the active signal by `signalId`, and subsystem tiles mirror backend sync state instead of hardcoded `live`.
- `Implemented` `Signal construction`: For each symbol with enough candles and a positive price, the backend derives range high/low, close position ratio, PD state, directional bias, chop score, fib levels, sequence state, gate, regime, signal, and backend plan.
- `Implemented` `Direction selection`: Direction is `LONG` when close position ratio is at or above `62.5`, `SHORT` when at or below `25`, and otherwise falls back to bias: `BEAR -> SHORT`, every other bias state -> `LONG`.
- `Implemented` `F3 / chop handling`: `engine.f3Chop` is now binary: `clear` or `caution`. Mid-range position ratio (`37.5` to `62.5`) and high chop (`>= 0.7`) downgrade the setup to `caution`, but no longer hard-block signal or plan creation.
- `Implemented` `Status progression`: Backend status is no longer blocked by F3 chop. Status is `WATCH` when no sweep exists, `ARMED` after sweep without MSS, and `READY` after both sweep and MSS in the chosen direction.
- `Implemented` `Confluence`: Backend confluence always starts with `HTA_SF` and `LTF_SF`, then conditionally adds `sweep`, `MSS`, `F3-clear`, and `HTA-override`.
- `Implemented` `Gate behavior`: With live enough input data, the backend gate now always emits directional permission (`BUY` for `LONG`, `SELL` for `SHORT`) with `state: live`. Hard blocking remains only in insufficient-data paths.
- `Implemented` `Hard block path`: If candle history is under 30 bars or price is non-positive, the backend returns `gate.allow = BLOCKED`, `signal = null`, and `plan = null`. Missing Twelve Data key also keeps the symbol blocked through stale/blocked upstream states.
- `Implemented` `Backend confirmation`: `backendConfirmed` is only true when status is `READY`, price feed state is `live`, and the last candle is fresh within `7200` seconds. Stale data can still produce a signal object, but not a backend-confirmed executable one.
- `Implemented` `Supported symbol registry`: Backend `instrument_specs()` is now the authoritative support list for watchlist validation and plan pip modeling. It currently covers the coded forex set, `XAUUSD`, `XAGUSD`, `US30`, `NAS100`, `BTCUSD`, and `ETHUSD`.
- `Implemented` `Symbol mapping`: Twelve Data formatting is now structural. Any 6-letter all-alpha token is slash-formatted (`EURUSD -> EUR/USD`, `BTCUSD -> BTC/USD`), while digit-bearing symbols such as `US30` and `NAS100` pass through unchanged.
- `Implemented` `Feed resilience`: Unsupported or malformed symbols no longer invalidate the stored Twelve Data key by themselves. Only auth failures (`401` or `403`) mark the key invalid; symbol-level `400/404` cases or `2xx` payloads with `status:error` preserve key status and prevent one bad symbol from poisoning the whole feed.
- `Implemented` `MT5 price authority`: In v13.0.0, symbols with fresh `source=mt5` snapshots bypass Twelve Data in both bulk price refresh and direct quote lookup paths. Successful EA snapshot writes clear same-symbol TD quote-TTL/rate-limit transients and write backend heartbeat rows so sync health reflects EA activity.
- `Implemented` `MT5 day-change display`: MT5 snapshot `change_pct_1d` is derived from the first MT5 M1 candle of the UTC day when available; cold start remains `0` until the day-open candle exists.
- `Implemented` `Plan blueprint`: Backend plans are always emitted as `source: backend-blueprint` with `executionSource: LTF_SF`, three ladder entries, per-entry stops, shared TP ladder, RR values, and stage lot sizes derived from the user risk profile. Lot sizing now uses per-trade risk, `1:2:3` stage weights, stop distance, backend instrument `pip_size`, backend instrument `pip_val`, and a `0.01` minimum lot floor.
- `Implemented` `Execution queue mapping`: `/user/execute-signals` now queues deterministic order IDs per `signalId + stage` and maps TP targets by stage (`e1 -> tp1`, `e2 -> tp2`, `e3 -> tp3`) instead of routing every entry to `tp1`.
- `Implemented` `Execution gate`: The frontend only posts `/user/execute-signals` from the plan page when the selected signal is backend-confirmed.
- `Visual only` `Frontend refresh`: Account and watchlist mutations now invalidate or update cached dashboard queries immediately so removed symbols disappear faster and refreshed backend truth appears sooner. This changes visibility timing, not backend strategy logic.

## Divergences And Legacy Notes

- `Diverged` `Legacy F3 assumption`: Older behavior treated equilibrium / yearly chop territory as a blocking condition, produced `f3Chop = blocked`, and could suppress both signal and plan creation. Current backend behavior does not do that.
- `Diverged` `Legacy mid-range neutrality`: Older behavior could leave direction unresolved in the center of the range. Current backend forces a directional outcome by bias fallback.
- `Diverged` `Legacy fixed lot ladder`: Older backend behavior emitted a hardcoded `0.01 / 0.02 / 0.03` lot ladder. Current backend computes lots from risk budget, stop distance, and symbol-specific pip economics.
- `Diverged` `Legacy symbol heuristics`: Older backend logic special-cased only JPY and `XAUUSD` for lot sizing and used narrower slash-format rules for upstream symbol translation. Current backend uses a support registry for sizing inputs and a broader structural formatter for 6-letter alpha symbols.
- `Deprecated` `Blocked F3 contract`: The shared TS contract no longer accepts `engine.f3Chop = blocked`; only `clear` and `caution` remain valid.
- `Legacy` `Frontend-local authority`: UI components still contain divergence messaging for frontend-computed, unconfirmed signals, but the tracked execution path in this repo is backend-authored for live signals and backend-authored for trade plans.

## Partial / Not Verified

- `Partial` `Dashboard mirror`: The dashboard mirrors backend truth for live signals and plans, but some UI warning and divergence states still support older frontend-computed scenarios. Those branches are retained as safety UI, not confirmed as active production strategy flow.
- `Partial` `Instrument registry breadth`: The registry is implemented and authoritative for supported symbols in this repo, but symbols outside that hardcoded set are rejected at watchlist add/save time unless explicitly added to backend specs.
- `Not verified` `Pine parity`: No Pine indicator source is present in this workspace, so Pine-to-backend parity for fib anchoring, HTF/LTF mapping, sweep/MSS logic, and alert payload shape could not be verified in this pass.
- `Not verified` `Broker-specific index/crypto economics`: `US30`, `NAS100`, `BTCUSD`, and `ETHUSD` use coded default `pip_val` assumptions in the backend registry. Broker contract and tick-value parity were not independently validated in this pass.
- `Not verified` `Session mapping`: Session naming and timeframe-to-session strategy logic were not changed in the reviewed commits and were not fully re-audited.
- `Not verified` `Webhook schema`: No webhook producer/consumer change was present in the reviewed commits, and no independent schema fixture was validated in this pass.
- `Deferred` `Engine heartbeat retention`: EA-driven `engine_runs` heartbeat rows can grow quickly during multi-symbol live streaming. Add scheduled pruning after live soak defines the required retention window.
- `Deferred` `Candle aggregation soak`: The MT5 M1 -> 15min aggregation path still needs a focused live/data regression pass for symbols previously showing `insufficient candle history`.

## Planned

- `Planned` `None documented in code`: This document does not promote roadmap intentions to implemented behavior unless they appear in the tracked code.

## Recent Session Patch

- `Implemented` `Fib recency contract`: `F1` now maps to the most recent completed session, `F2` to the middle session, and `F3` to the oldest tracked session. This corrects the legacy behavior where `F3` could appear as the most recent Fib in some charting paths.
- `Implemented` `default visibility`: `show_f1_inp = true`, `show_f2_inp = false`, `show_f3_inp = false` so the most recent Fib remains visible by default.
- `Implemented` `draw styling`: `F1` renders as the recent/thin Fib, `F2` renders as a standard mid-session Fib, and `F3` renders as the oldest/thick Fib.
- `Implemented` `neutral Fib zones`: Both `50%` and `62.5%` are now treated as neutral chop territory in the local Fib drawing logic, mirroring buyside behavior.
- `Implemented` `HTF authority AF`: HTF Authority Fib (AF) is now the F3 from the next higher timeframe.
  - `15/30/60` charts use `H4` F3
  - `H4` charts use `D1` F3
  - `D1` charts use `M1` F3
  - `W1` charts use `Y1` F3
  - `M1` charts use `Y1` F3
- `Implemented` `HTF star confirmation`: Higher timeframe AF now carries visual star rating confirmation on the local chart.
- `Deprecated` `EF`: All EF inputs, draw paths, alerts, table rows, and TP fallback logic were removed from the current patch.

## Versioned Update Log

- `2026-04-22` Initial reconciliation baseline created from then-current repository state. Documented backend authority, nested anchor contract expectations, F2 compressed-swap handling, EF-first routing, backend execution gates, timeframe risk profile behavior, freshness/schema rejection, planner blueprint precedence, and marked unresolved parity gaps as `Partial`, `Deprecated`, `Planned`, or `Not verified`.
- `2026-04-23` Documented backend plan-authority flow observed at that time: backend-owned planner verdict states, authenticated backend plan retrieval, removal of JS re-gating for backend-approved blueprints, legacy local planner downgrade to diagnostic or unauthenticated fallback, and stricter per-pair `updated_at` freshness gating during engine-batch ingestion.
- `2026-05-01` Recreated `stratupdate.md` because the file was missing from the tracked workspace. Reconciled current backend code and documented the active strategy divergence: F3/equilibrium territory no longer blocks signals or plans, direction now falls back to bias in the center of the range, `f3Chop` no longer exposes `blocked`, and the dashboard remains a backend-mirror execution surface with immediate post-key-refresh invalidation.
- `2026-05-02` Recreated `stratupdate.md` on the current branch from the last reconciled baseline because the file was again absent from `main`. Documented the backend instrument registry as the active symbol-support and pip-model authority, replaced the stale fixed-lot description with risk-derived lot sizing, recorded stage-correct TP routing plus deterministic execution order IDs, and noted that unsupported-symbol data errors no longer invalidate the full Twelve Data feed.
- `2026-05-05` Documented v13.0.0 MT5 authority behavior: MT5-live symbols bypass Twelve Data in refresh and quote paths, EA pushes clear same-symbol TD cooldown state, backend sync receives EA heartbeats, MT5 day-change derives from UTC-day M1 opens, and heartbeat pruning plus candle aggregation soak are deferred maintenance items.
- `2026-05-05` Documented the final Pine patch: recency-renamed F1/F2/F3 contract, buyside neutral zone mirror for `50%` and `62.5%`, HTF Authority Fib (AF) as the next-higher-timeframe F3, HTF star confirmation on local charts, and removal of EF paths from the current patch. Updated HTF authority routing to use F3 from the next higher timeframe (15/30/60->H4 F3, H4->D1 F3, D1->M1 F3, W1/M1->Y1 F3).
- `2026-05-09` Documented the chart-route merge verification outcome: the final `src/routes/charts.tsx` state keeps backend-authoritative candle and fib rendering on the `lightweight-charts` path, preserves `useBackendReady()` gating before chart polling starts, and adds no new strategy or fib-calculation drift. The local build blocker was environmental/lockfile state, not a change in backend truth rules.
