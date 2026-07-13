### 1. Issue validation

- Confirmed:
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php::get_live_signals()` returns `ensure_engine_snapshot($user_id)['signals']` directly.
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php::run_engine_for_symbols()` writes every computed backend signal to `smc_sf_signals`, but `/live-signals` does not read from that durable store.
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php::get_mt5_candidate_lifecycle_state()` already contains lifecycle validity checks for active positions, pending orders, pre-entry state, stopped-out state, and direction flips.
  - Existing stale-data protections are in `determine_engine_blocker()`, `backendConfirmed`, price freshness checks in `run_engine_for_symbols()`, and snapshot currency checks in `is_engine_snapshot_current()`.
- Likely:
  - The reported board instability is caused by `/live-signals` exposing transient per-snapshot signals instead of a backend-owned display board assembled from durable signal state.
  - The smallest safe correction is to introduce a backend display arbiter that reuses `smc_sf_signals` as the committed display source, rather than adding a new table in this patch.
  - `WATCH` rows should remain engine/internal candidate state and should not be promoted into the live display board unless future requirements explicitly prove that behavior is intended.
- Unconfirmed:
  - A new `wp_smc_sf_display_signals` table is required.
  - Frontend components require shape changes for `/live-signals`.
  - A new `signal_family_key` field is required.
  - Pine formulas or signal math are corrupt.
  - Frontend ranking is the primary root cause.

### 2. Implementation contract

- Exact file path: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - Exact section to modify: `run_engine_for_symbols($user_id, $symbols, $prices, $force = false)`
  - Exact change required:
    - After the per-symbol loop has produced `$signals`, `$plans`, and `$diagnostics`, and before `$result` is cached with `set_transient()`, call a new private arbiter helper that reconciles the durable display board from the current engine result.
    - The helper must use the existing `smc_sf_signals` table; do not create a new table for this patch.
    - The helper must upsert only display-eligible engine signals:
      - `status` is `ARMED` or `READY`.
      - `engineBlocker` is exactly `OK`.
      - `computedBy` is `backend`.
      - `symbol` is in the current watchlist passed to `run_engine_for_symbols()`.
    - The helper must not promote `WATCH` signals into the display board.
    - The helper must delete or hide existing board rows for the current user/watchlist symbols when the current run reports a hard stale or blocker diagnostic for that symbol.
  - Guard rails:
    - Do not change Pine formulas, fib calculations, `build_symbol_state()`, `determine_engine_blocker()`, `backendConfirmed`, or trade-plan persistence rules.
    - Do not change the `smc_sf_signals` schema unless implementation proves a blocking schema defect.
    - Do not write frontend-computed signals into backend persistence.
    - Do not bypass the existing 5-second engine transient except through the existing `$force` behavior.
  - Why this file is in scope:
    - It is the backend source for engine snapshots, durable signal writes, lifecycle checks, and `/live-signals`.
  - Acceptance criterion tied to the failure path:
    - A fresh engine run containing transient `WATCH` output must not cause `/live-signals` to return a new display card, while an eligible `ARMED` or `READY` backend signal with `engineBlocker=OK` must persist and be returned with stable `id` and `createdAt` across repeated polls.

- Exact file path: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - Exact function to modify: `get_live_signals()`
  - Exact change required:
    - Continue calling `ensure_engine_snapshot($user_id)` first so existing freshness, watchlist, and stale-data checks still execute.
    - Replace direct use of `$snapshot['signals']` with a new private reader helper that loads display-eligible rows from `smc_sf_signals`.
    - Return the same response envelope shape:
      - `signals`: array of `SignalCandidate`-shaped objects.
      - `polledAt`: current `gmdate('c')`.
    - Preserve `no_cache_response()` and existing anti-cache headers.
  - Guard rails:
    - Do not return raw snapshot signals as a fallback when the durable board is empty.
    - Do not add frontend-only ranking, frontend-derived confirmation, or mock success state.
    - Do not remove `polledAt` from the envelope or add `polledAt` to individual signals.
  - Why this file is in scope:
    - This is the direct failure path: `/live-signals` currently exposes raw computed snapshot signals.
  - Acceptance criterion tied to the failure path:
    - Repeated calls to `get_live_signals()` must return the same durable board rows until backend reconciliation changes those rows, not a newly recomputed raw snapshot list.

- Exact file path: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - Exact private helpers to add near existing signal persistence/lifecycle helpers:
    - `private function reconcile_live_signal_board(int $user_id, array $symbols, array $signals, array $diagnostics): void`
    - `private function is_display_signal_eligible(array $signal, array $watchlist_lookup): bool`
    - `private function read_live_signal_board(int $user_id, array $symbols): array`
    - `private function signal_row_to_candidate(array $row): array`
  - Exact change required:
    - `reconcile_live_signal_board()` must:
      - Build a normalized watchlist lookup from `$symbols`.
      - Build blocker diagnostics by symbol from `$diagnostics`.
      - Remove or exclude rows for symbols whose current diagnostic has `engineBlocker` other than `OK`, `priceState` other than `live`, or `candleState` indicating stale/offline/missing candle data.
      - Upsert eligible signals into `smc_sf_signals` using the same columns already used by `run_engine_for_symbols()`.
      - Preserve the original signal `id` and `createdAt`; only `updated_at` should advance on refresh.
    - `read_live_signal_board()` must:
      - Query `smc_sf_signals` for the current `user_id`.
      - Filter to current watchlist symbols.
      - Filter to `status IN ('ARMED', 'READY')`.
      - Filter to rows whose decoded `engine.engineBlocker` or top-level row-derived `engineBlocker` is `OK`.
      - Sort deterministically by backend confirmation first, verdict strength next (`A+`, `A`, `B`, `C`), then `updated_at DESC`, then `id ASC`.
      - Return `SignalCandidate`-shaped arrays compatible with `src/types/sniper.ts::SignalCandidate`.
    - `signal_row_to_candidate()` must:
      - Decode `confluence` and `engine` JSON defensively.
      - Map `backend_confirmed` to boolean `backendConfirmed`.
      - Convert `created_at` with the existing `to_iso()` helper.
      - Set `computedBy` to `backend`.
      - Preserve `engineBlocker` from decoded engine data when present; otherwise default to `OK` only for rows that passed eligibility.
  - Guard rails:
    - Do not invent new API fields for this patch.
    - Do not change `table($name)` semantics.
    - Do not alter `get_mt5_candidate_lifecycle_state()`, `has_directional_price_crossed()`, or `candidate_matches_trade_record()`.
    - Do not rank or cap top-N in the backend unless an existing setting or contract already proves the board size.
  - Why this file is in scope:
    - The arbiter belongs behind the backend API boundary because frontend must not become signal truth.
  - Acceptance criterion tied to the failure path:
    - `/live-signals` must be driven by durable backend rows that survive repeated polling and reject stale/blocker/WATCH noise.

- Exact file path: `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
  - Exact section to modify: existing `get_live_signals` stability assertions around the `$stableLiveSignalsSnapshot` fixture.
  - Exact change required:
    - Replace the snapshot-only fixture dependency with seeded `smc_sf_signals` rows that represent the durable display board.
    - Keep assertions that the response is an envelope, `polledAt` exists on the envelope only, anti-cache headers are preserved, count is stable, `id` is stable, `createdAt` is stable, and `backendConfirmed` is stable.
    - Add a regression fixture where a current snapshot contains a `WATCH` signal and assert that `get_live_signals()` does not return that `WATCH` signal unless it already exists as an eligible durable board row, which it should not in this patch.
    - Add a regression fixture where a persisted `READY` row has a current diagnostic blocker such as `PRICE_NOT_MT5_FRESH` and assert that it is not returned.
  - Guard rails:
    - Do not weaken existing snapshot contract assertions for `ensure_engine_snapshot()`.
    - Do not remove tests covering stale price, stale candle, active open position, pending order, or backend confirmation guards.
  - Why this file is in scope:
    - It already owns the backend snapshot/live-signal contract tests and is the narrowest PHP test target for this behavior.
  - Acceptance criterion tied to the failure path:
    - The test suite must fail against the current raw-snapshot implementation and pass only when `/live-signals` reads the durable backend board with stale/blocker/WATCH rejection.

### 3. Patch sequence

1. Update `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` first with failing contract coverage for durable-board reads, `WATCH` rejection, and stale/blocker rejection.
2. Add the private display-board helpers in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`.
3. Wire `run_engine_for_symbols()` to reconcile eligible engine signals into the existing `smc_sf_signals` durable board after the engine loop and before result caching.
4. Change `get_live_signals()` to call `ensure_engine_snapshot($user_id)` and then return `read_live_signal_board($user_id, $snapshot['meta']['watchlist'] ?? $this->get_settings($user_id)['watchlist'])`.
5. Run PHP contract tests and fix only failures directly tied to the new display-board contract.
6. Run frontend type/tests only to verify the unchanged `/live-signals` response shape still satisfies existing clients.
7. Do not add migrations unless the implementation proves `smc_sf_signals` cannot represent the required board state.
8. Sequencing risk:
   - If `get_live_signals()` reads the durable board before `ensure_engine_snapshot()` runs, stale rows may be returned; preserve the `ensure_engine_snapshot()` call first.
   - If reconciliation occurs before diagnostics are complete, stale/blocker rows may survive; reconcile only after `$diagnostics` is complete.
   - If cached snapshots skip `run_engine_for_symbols()`, the board remains as last reconciled; the reader must still enforce watchlist and row eligibility.

### 4. Regression guards

- Specific checks the implementation agent must run after patching:
  - `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
  - `npm test -- --run src/lib/api/sniperClient.test.ts src/hooks/useSniperData.test.tsx src/routes/-signals.page.test.tsx src/routes/-plan.test.tsx`
  - `npm run typecheck`
- Existing protections that must still hold:
  - `backendConfirmed` is true only for `READY` signals with live data and `engineBlocker=OK`.
  - `build_pending_or_confirmed_plan()` persists executable backend plans only when backend confirmation is true.
  - `get_mt5_candidate_lifecycle_state()` still suppresses active open positions, active pending orders, and active pre-entry candidates.
  - `determine_engine_blocker()` still blocks stale price, stale candles, closed sessions, missing keys, rate limits, AOV equilibrium, and opposing HTF fundamentals.
  - `no_cache_response()` headers remain present on `/live-signals`.
- Parity re-validations required:
  - Verify that Pine formulas and fib calculations are untouched by diff review.
  - Verify that persisted `smc_sf_signals.engine` JSON still matches the backend-computed signal payload.
  - Verify that MT5 candidate lifecycle tests still pass unchanged.
- Logging or diagnostics that should exist after the patch:
  - Existing `error_log()` and `audit()` diagnostics for candidate suppression must remain.
  - Add at most one concise backend diagnostic log when reconciliation removes a display row due to a current blocker or stale diagnostic.
  - Do not add noisy per-poll frontend console logging.

### 5. Non-goals

- Do not create `wp_smc_sf_display_signals` in this patch.
- Do not change Pine trading formulas.
- Do not change fib anchoring, HTF/LTF regime logic, AOV rules, or freshness thresholds.
- Do not make the frontend the arbiter of signal truth.
- Do not add new `/live-signals` response fields unless an existing client contract requires them.
- Do not change `src/types/sniper.ts::SignalCandidate` unless tests prove the backend response shape must change.
- Do not change `src/lib/api/sniperClient.ts::normalizeLiveSignalsResponse()` unless the backend envelope shape changes, which is not part of this contract.
- Do not add top-N board-size behavior on the backend in this patch; frontend already slices top candidates where needed.
- Do not add speculative `signal_family_key` identity behavior without concrete evidence that existing `signal.id` is unstable for the intended board lifecycle.
- Do not refactor `run_engine_for_symbols()` or `build_symbol_state()` beyond the minimal reconciliation hook.

### 6. Risk assessment

- Worst-case failure mode if patched incorrectly:
  - Stale or invalid signals remain visible and could be queued for execution if backend confirmation or plan guards are accidentally weakened.
- User-visible failure mode:
  - The Signal Engine or Signal Plans pages may show an empty board, flickering rows, stale rows, or rows that disappear during valid ARMED/READY conditions.
- Backend authority or stale-state risks:
  - Returning raw snapshot signals as a fallback would preserve the original defect.
  - Reading durable rows without first refreshing/checking the engine snapshot would allow stale-state leakage.
  - Promoting `WATCH` rows would keep microswing noise in the display path.
  - Changing confirmation logic would risk backend/dashboard truth mismatch.
- Human approval before merge:
  - Required before merge because the patch changes live signal display authority and can affect user trading decisions.

### 7. Test requirements

- Tests to add or update, with exact target area:
  - `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
    - Add seeded `smc_sf_signals` durable-board fixture for `/live-signals`.
    - Add assertion that raw snapshot-only `WATCH` signals are not returned.
    - Add assertion that persisted rows with current stale/blocker diagnostics are not returned.
    - Add assertion that repeated polls preserve durable row `id`, `createdAt`, `backendConfirmed`, and envelope-only `polledAt`.
  - `src/lib/api/sniperClient.test.ts`
    - Existing test for envelope normalization must still pass with `{ signals, polledAt }`.
  - `src/routes/-signals.page.test.tsx` and `src/routes/-plan.test.tsx`
    - Existing tests must still pass without requiring frontend contract edits.
- Existing tests or manual checks that must still pass:
  - PHP snapshot contract tests for stale price, stale candle, backend confirmation, active open position, pending order, and AOV blocker behavior.
  - Frontend hook tests for `useLiveSignals()` cache-busting and query key behavior.
  - Manual check: call `/wp-json/smc-superfib/v1/live-signals` twice with the same eligible persisted signal and verify stable `signals[0].id` and `signals[0].createdAt` while `polledAt` changes.
  - Manual check: ingest or seed a `WATCH` snapshot signal and verify it is absent from `/live-signals`.
  - Manual check: force a stale MT5 price diagnostic and verify previous display rows for that symbol are absent.
- Soak, replay, parity, or live-environment verification needed:
  - Replay one MT5 candidate flow through `WATCH -> ARMED -> READY` and verify only `ARMED`/`READY` display eligibility.
  - Replay active open position and pending order cases and verify no backend-confirmed executable duplicate appears.
  - Run a short live polling soak of `/live-signals` for at least 10 polling intervals and verify stable board identity unless backend state genuinely changes.
  - Diff review must confirm no Pine formula, fib formula, or stale threshold changes.

### 8. Implementation handoff

- Branch naming recommendation:
  - `codex/signal-persistence-arbiter`
- Suggested commit grouping:
  - Commit 1: `test: lock live signal board persistence contract`
  - Commit 2: `fix: read live signals from backend display arbiter`
  - Commit 3: `test: verify frontend live signal contract compatibility` only if frontend tests require fixture updates.
- Required reports or artifacts to generate after implementation:
  - Update `reports/implementation-verification.md` with commands run, pass/fail results, and any skipped checks.
  - Include API sample output for two repeated `/live-signals` polls showing stable signal identity and changing envelope `polledAt`.
  - Include diff note confirming no Pine formula or backend confirmation guard changes.
- State transition required after plan handoff:
  - `READY_FOR_IMPLEMENTATION` with `editing_locked=false`
