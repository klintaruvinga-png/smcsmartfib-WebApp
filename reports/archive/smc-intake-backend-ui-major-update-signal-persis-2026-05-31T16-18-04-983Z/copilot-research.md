### 1. Issue classification
- Severity: HIGH
- Category: runtime-bug / signal-integrity / wiring
- Layer(s) affected: MT5 / PHP-backend / REST-API / Dashboard-JS
- Phase impact: Phase 5 / Cross-phase

### 2. Confirmed evidence
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` contains the backend engine snapshot orchestration in `ensure_engine_snapshot()` and the live endpoint in `get_live_signals()`, which currently returns raw computed snapshot signals.
- `run_engine_for_symbols()` produces the `signals` payload and persists `smc_sf_signals` rows, but there is no existing committed board persistence layer for display signals.
- `get_mt5_candidate_lifecycle_state()` already implements direction-aware entry crossing, stop crossing, and position/order matching, making it a direct validity check engine.
- `has_directional_price_crossed()` and `candidate_matches_trade_record()` are used in lifecycle evaluation and are already wired into MT5 candidate handling.
- `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` contains snapshot contract tests for `ensure_engine_snapshot()` and the `signals` payload, confirming the API contract is important.
- `run_engine_for_symbols()` persists backend-confirmed signals and confirmed trade plans via `smc_sf_signals` and `smc_sf_trade_plans`, showing the backend already has durability semantics for signal state.
- Existing candidate ingestion code at `smc-superfib-sniper.php` around line 3800 uses `find_latest_mt5_candidate_for_range()` and suppressed status logic, demonstrating the candidate lifecycle is already an active gating concept.
- The issue text references a persistent stable display board, and the backend currently returns dynamic `snapshot['signals']` rather than a committed board, indicating a wiring gap between detection and display.

### 3. Root cause hypothesis
- Most likely root cause: the backend currently exposes raw live engine signals directly to `/live-signals` instead of reconciling them through a persistence/arbitration layer, so the frontend sees transient WATCH/ARMED/READY noise and lacks stability. `Confirmed`.
- The existing MT5 candidate lifecycle checks provide validity semantics, but they are only used for suppression and plan gating, not for a committed display board. `Confirmed`.
- The repo already has durable backend signal persistence via `smc_sf_signals` and confirmed plans, so the missing piece is a display-level “arbiter board” that maps candidates to stable signal slots. `Hypothesis`.
- Frontend signal ranking and board size appear to be recomputed from raw backend payloads, which would amplify flicker and prevent stable top-N display behavior. `Hypothesis`.
- The current `WATCH` state is likely being surfaced on the frontend as a board signal rather than being held as a candidate until it advances to ARMED/READY, causing the microswing noise described in the issue. `Hypothesis`.

### 4. Blast radius
- Files likely affected:
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
  - Frontend contract code in `src/lib/api/sniperClient.ts` and any dashboard components consuming `/live-signals`
  - Any backend persistence schema or migrations if adding `wp_smc_sf_display_signals`
- Systems affected:
  - MT5 engine signal production (`run_engine_for_symbols()`, `build_symbol_state()`, `build_pending_or_confirmed_plan()`)
  - PHP backend snapshot storage and live endpoint (`ensure_engine_snapshot()`, `get_live_signals()`)
  - Candidate ingestion and lifecycle logic (`smc_sf_mt5_signal_candidates`, `get_mt5_candidate_lifecycle_state()`, `find_latest_mt5_candidate_for_range()`)
  - Dashboard display layer consuming `/live-signals`
- Parity surfaces at risk:
  - Pine <-> Backend: existing Pine authority assumptions are preserved by backend-confirmed signals, but introducing display persistence must not change the source-of-truth semantics.
  - Backend <-> Dashboard: the contract for `/live-signals` will change from raw signal snapshots to committed board rows, so clients must be updated accordingly.
  - MT5 <-> Backend: lifecycle states already reconcile trade records and candidate ranges; adding persistence must not alter matching or suppression behavior.
- Stale-state/cache risks:
  - `ensure_engine_snapshot()` caches snapshots in user meta and is current based on refresh and stale thresholds, so a display board must be invalidated consistently when engine state changes.
  - Transient engine caching in `run_engine_for_symbols()` uses 5-second transients; the arbiter should either be computed after this or share invalidation logic.

### 5. Regression surface
- Existing backend guards:
  - `get_mt5_candidate_lifecycle_state()` prevents repeated READY signals from promoting if an active position/order already exists.
  - `build_pending_or_confirmed_plan()` already blocks plan persistence unless `backend_confirmed === true` and live data conditions are met.
  - `determine_engine_blocker()` and `backend_confirmed` enforce price/candle freshness before a signal can be confirmed.
- Must not weaken:
  - `backendConfirmed` gating for confirmed plans.
  - lifecycle state suppression for active positions/orders.
  - stale data protections around `price_state`, `candle_state`, and `engineBlocker`.
- Existing tests and reports:
  - `test-mt5-snapshot-contract.php` provides a foundation for snapshot contract validation.
  - No existing tests appear to cover a dedicated display signal board or board-size semantics, so this is a new regression surface.

### 6. Resolution path options
- Path A: implement a backend display board persistence layer that accepts MT5 candidates, computes a stable `signal_family_key`, quality score, and lifecycle transitions, then returns committed board rows from `/live-signals` instead of raw snapshot signals. This is the narrowest correction because it reuses existing lifecycle logic and keeps engine output intact. `Recommended`.
- Path B: refactor the engine output itself so that `run_engine_for_symbols()` emits display-grade signals directly and `ensure_engine_snapshot()` stores them as the board. This is broader because it touches engine signal construction and may risk changing current plan-building semantics. `Alternative`.
- Recommended: Path A, because the repo already has separate candidate and signal persistence layers, and the issue specifically calls for a persistence arbiter between raw candidate detection and displayed board state.

### 7. Risk flags
- High-risk system involved: Yes — backend signal persistence and display API are central to live signal behavior and can affect user-facing board stability.
- Requires parity re-validation: Yes — MT5 candidate lifecycle and backend signal persistence must be validated against existing Pine-derived authority and live signal expectations.
- Migration-blocking: No — not a phase gate blocker by itself, but it affects Phase 5 stability and cross-phase signal integrity.
- Human review required before merge: Yes — because the change touches display contract, board stability, and lifecycle semantics that can produce visible regression if miswired.

### 8. Handoff package
- Epicentre files to inspect first:
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
  - `src/lib/api/sniperClient.ts`
- Inputs Codex must verify before planning:
  - whether `/live-signals` consumers already expect raw snapshot signals or if a board contract change is safe
  - how persisted `smc_sf_signals` currently differ from raw `engine['signals']`
  - whether `signal_family_key` should be derived from existing candidate identity fields or a new board-specific stable identity
- Open unknowns:
  - existing frontend code paths that may be quietly relying on current `snapshot['signals']` shape beyond the `/live-signals` endpoint
  - whether a new table schema must include explicit board size metadata or if that should remain purely query-time
  - whether display signal persistence should be written at engine snapshot time or during a separate reconciliation step after snapshot creation
