### 1. Issue validation

#### Confirmed

- Shared-market identity is session-scoped. `normalize_market_feed_key()` builds keys in the form `BROKER_SERVER|SESSION`, while `persist_user_shared_feed_key()` stores one feed key per user and symbol and `resolve_user_shared_feed_key()` returns only that stored value.
- This produces two confirmed rollover failures:
  - If a user's EA goes offline before a session transition, that user's stored pointer remains on the old session key while peer EAs begin writing to a new session partition.
  - If the user's EA remains online, the pointer advances to the new session key, but the prior session's candle history remains in a different partition and is no longer part of the current read.
- `is_mt5_authoritative()` is freshness-blind because it calls `get_cached_price(..., PHP_INT_MAX)` and accepts `source === 'mt5'`; when that lookup does not establish authority, it falls back to `SMC_MarketData_Service::has_mt5_data()`, which represents historical MT5 presence rather than current usability.
- `get_cached_price()` preserves `source: 'mt5'` for a stale direct snapshot, so replacing `PHP_INT_MAX` alone is insufficient. Authority must also require `state === 'live'`, acceptable age, and a valid quote.
- There is no Twelve Data quote fallback. `fetch_quote()` returns `null` when MT5 is not authoritative, and the engine guard requires a fresh MT5-origin price before building symbol state.
- `fetch_candles()` returns any non-empty shared candle array before checking whether it contains enough bars for the engine. A fresh quote can also make `$mt5_authority` true and therefore make `$candle_ttl_active` true, suppressing Twelve Data even when the shared candle set is insufficient.
- The aggregated M1-to-higher-timeframe path can log an insufficient count and still return that insufficient set.
- `upsert_shared_market_quote()` performs a read followed by `REPLACE` without an atomic timestamp guard, allowing an older accepted packet to overwrite a newer canonical quote under concurrent or delayed delivery.
- Standard and grace-window `STALE_HELD` transitions can retain an earlier `engineBlocker: OK`. Recovery currently removes grace flags but does not guarantee that stored engine metadata is replaced from a current matching candidate.
- The Plan page header badge is derived from candidate divergence rather than backend price and candle health, so it can show `LIVE` while cards are stale, planless, or blocked by missing candles.

#### Likely

- The screenshots are consistent with a user-specific EA becoming stale while peer data moved to another session partition, leaving durable display signals in `STALE_HELD` and current ladders empty. Production user-meta, shared quote, shared candle, diagnostic, and display-signal rows are still required to prove the exact incident chronology.

#### Unconfirmed

- No confirmed defect was established in MT5 `CandleBuilder` higher-timeframe parity for this issue.
- No evidence supports adding shared provenance to the EA payload; `sourceDetail: shared_market_quote` is assigned by the backend after selecting the shared table row.
- No evidence supports treating the shared-candle transient as a database-query cache. The existing candle transient controls upstream-fetch cadence; the defect is candle-set usability and source selection, not the absence of a transient around every shared-table read.

### 2. Implementation contract

#### File: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`

##### Area: shared feed-key resolution and shared candle reads

- Modify `resolve_user_shared_feed_key()` and add narrowly scoped private helpers for deriving a broker-family root from an existing stored key and locating fresh rows within that exact family.
- When the stored key is empty, return an empty key. Do not search globally because no trusted broker identity is available.
- When the stored key is present but its quote row is missing or older than the configured stale threshold, search `market_quotes_latest` only within the exact broker family:
  - exact root match; or
  - an escaped `root|%` legacy-session match.
- Use `$wpdb->esc_like()` for the legacy family pattern. A root such as `BROKER_A` must not match `BROKERXA`, `BROKER_A_DEMO`, or unrelated prefixes.
- Accept a replacement feed key only when the candidate quote itself is within the configured stale threshold. Persist the replacement key back to user meta only after that validation.
- Modify `fetch_shared_market_candles()` so a stored legacy session key can read the full exact broker family rather than one session partition only.
- For 15-minute rows, collect non-disputed rows across the exact family, deduplicate by `candle_open_time`, order chronologically, and return the requested tail.
- For 1-hour and 4-hour requests, collect the family-wide M15 input first, then pass that merged input into `derive_higher_timeframe_from_m15()`.
- Preserve broker-server isolation and the existing `confidence <> 'disputed'` rule.
- Do not delete or rewrite existing shared rows in this patch.

Guard rails:

- No schema migration.
- No global newest-symbol lookup.
- No cross-broker candle or quote sharing.
- Do not change EA payload fields or session calculation.

Acceptance criterion:

- A user whose stored key points to an old session can resolve a fresh peer quote and continuous family-wide candle tail from the same broker server after a session rollover.

##### Area: `is_mt5_authoritative()`

- Replace the source-only and historical-presence contract with a complete current-quote contract.
- Authority is true only when `get_cached_price()` returns:
  - `source === 'mt5'`;
  - `state === 'live'`;
  - `age_sec <= staleThresholdSec`;
  - positive bid, ask, and mid values;
  - ask greater than or equal to bid.
- Remove the `has_mt5_data()` fallback from this authority decision.

Guard rails:

- Preserve the engine rule that actionable symbol state requires a fresh MT5-origin quote.
- Do not invent a Twelve Data quote path.
- Do not label stale direct snapshots authoritative merely because their source remains `mt5`.

Acceptance criterion:

- A stale shared quote, stale direct snapshot, or historical MT5 candle cannot establish current MT5 authority; a fresh valid shared or direct MT5 quote can.

##### Area: `fetch_candles()` and MT5 candle-set selection

- Separate quote authority from candle-set usability.
- Define a required count from the request, bounded by the engine minimum: `min(30, max(1, outputsize))`.
- Treat a candle source as usable only when it supplies at least the required count and its newest closed candle passes the existing timeframe freshness rule.
- Evaluate sources in this order:
  1. merged broker-family shared MT5 candles;
  2. current per-user stored MT5 candles and the existing M1-derived higher-timeframe set;
  3. Twelve Data, only when no usable MT5 candle set exists and the existing rate-limit/cooldown rules permit the request;
  4. final canonical database read after any upstream fetch.
- Do not return a non-empty shared set merely because it exists.
- Do not return an aggregated M1-derived set after logging that its count is insufficient.
- Remove quote-level `$mt5_authority` from the condition that suppresses Twelve Data candle retrieval. A fresh quote does not prove sufficient candle coverage.
- Preserve existing Twelve Data authentication and 429 handling, and preserve the rule that Twelve Data rows do not overwrite MT5 rows for the same candle time.

Guard rails:

- Do not add a Twelve Data quote fallback.
- Do not bypass freshness or closed-session protections.
- Do not add an unrelated database-cache transient around shared reads.
- Do not change fib, regime, or signal formulas.

Acceptance criterion:

- A fresh peer quote plus fewer than the required shared bars does not produce an early planless return and does not suppress the permitted candle fallback path.

##### Area: `upsert_shared_market_quote()`

- Replace the read-then-`REPLACE` canonical write with one atomic `INSERT ... ON DUPLICATE KEY UPDATE` operation guarded by incoming versus stored `updated_at`.
- Update bid, ask, mid, canonical timestamp, source hash, and source-count metadata only when the incoming timestamp is not older than the stored timestamp.
- When the incoming packet is older, reject the entire canonical update and emit a bounded diagnostic. Do not change contributor metadata for a packet whose price was rejected.

Guard rails:

- Preserve the existing unique identity of `(feed_key, normalized_symbol)`.
- Do not count a rejected old packet as a new contributor.
- Do not weaken the market-stream payload age guard.

Acceptance criterion:

- Concurrent or delayed delivery cannot move a canonical quote timestamp or price backward.

##### Area: `reconcile_live_signal_board()` and `transition_display_signal()`

- In both standard and grace-window `STALE_HELD` paths, persist the current data-health blocker into the stored engine JSON.
- Before iterating active rows, build a lookup of current candidates by symbol, direction, and signal-family key where available.
- On recovery, require a matching current candidate before returning a held row to `DISPLAY_ACTIVE`.
- Replace the stored engine JSON with the current candidate's engine metadata, then remove `graceHold` and `graceHoldReason`.
- If no matching current candidate exists, keep the row held; do not remove the blocker and allow the read mapper to default to `OK`.

Guard rails:

- Preserve the five-minute blueprint grace window.
- Preserve terminal lifecycle states and replacement rules.
- Do not make a stale-held signal executable.

Acceptance criterion:

- A stale-held card displays the current blocker, and a recovered card becomes active only with current engine metadata rather than a fabricated `OK` state.

#### File: `src/routes/-plan.page.tsx`

##### Area: Plan-board header freshness

- Add a pure helper, colocated with the page or in `-plan.utils.ts`, that derives board freshness from watchlist-scoped `snapshot.prices` and `snapshot.diagnostics`.
- Use price states and data-health diagnostics, including stale/offline/missing candle conditions and blockers such as `PRICE_NOT_MT5_FRESH` or `CANDLES_MISSING`.
- Do not downgrade feed health for structural trading blockers such as equilibrium, fundamental opposition, or ordinary setup disqualification.
- Handle supported states explicitly: `blocked`, `offline`, `stale`, `unavailable`, `pending-sync`, `closed_session`, `live`, and `mock`.
- Return `closed_session` only when all relevant available symbols are closed. Mixed live and legitimately closed symbols should remain live.
- When snapshot data is unavailable during an otherwise rendered state, return `pending-sync` rather than `live`.
- Keep candidate divergence as its own banner or synchronization indicator. It must not determine the market-health badge.

Guard rails:

- The frontend remains a projection of backend state, not the source of signal truth.
- Do not change the 3/5/10 board-size behavior.
- Do not alter execution eligibility.

Acceptance criterion:

- The Plan header cannot show `LIVE` when relevant symbols have stale prices, missing/stale candles, or data-health blockers, while healthy mixed live/closed-session boards are not falsely degraded.

#### File: `wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php`

- Extend shared-market tests for broker-family session rollover, exact family isolation, family-wide candle merge, and out-of-order quote rejection.
- Reuse the existing shared-market table harness and private-method invocation conventions already present in this file.

#### File: `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`

- Add authority and signal-board lifecycle regression coverage where the existing snapshot/display-signal harness supports it.
- If the existing harness cannot isolate these private paths cleanly, add one focused PHP test file under the same test directory rather than broadening unrelated tests.

#### File: `src/routes/-plan.test.tsx`

- Extend the existing mocked `useSnapshot()` coverage for the derived header state and separation from divergence state.

### 3. Patch sequence

1. Add failing PHP regression tests for exact broker-family resolution, rollover candle merge, stale authority, insufficient candle coverage, and older quote rejection.
2. Implement exact broker-family helpers and family-wide shared candle reads.
3. Tighten `is_mt5_authoritative()` to the fresh/live/valid quote contract and remove historical presence fallback.
4. Restructure `fetch_candles()` so usability, not quote authority, determines whether MT5 candle data suppresses Twelve Data.
5. Replace shared quote writes with the atomic timestamp-guarded upsert.
6. Add failing lifecycle tests, then update standard hold, grace hold, and recovery metadata handling.
7. Add frontend freshness-helper tests, then replace the divergence-derived header badge.
8. Run targeted PHP and frontend tests before the broader repository checks.

Dependencies and sequencing risks:

- Family-wide candle reads must land before the candle usability flow is evaluated; otherwise the new flow can unnecessarily call Twelve Data at every session transition.
- Authority tightening must not be used as a substitute for candle usability. They are separate contracts.
- The atomic quote write must be implemented before soak validation; otherwise test results can still be destabilized by delayed packets.
- No database migration is required, but legacy session-partition rows are part of the compatibility read path and must not be purged during implementation.

### 4. Regression guards

- A user with no stored shared key must not read another user's or another broker's shared market rows.
- An exact broker root must not match similarly prefixed broker servers.
- Fresh direct MT5 data must continue to outrank Twelve Data.
- Twelve Data must remain a candle-only fallback.
- Stale prices must continue to block engine plan generation and execution.
- Closed-session index handling and continuous crypto handling must remain unchanged.
- Disputed shared candles must remain excluded.
- Existing MT5 candle rows must not be overwritten by Twelve Data rows for the same candle time.
- A stale account telemetry state must continue to produce zero live risk sizing and execution-disabled plans even when shared market intelligence remains live.
- Existing signal-board terminal states, replacement ordering, board ranking, and 3/5/10 display limits must remain unchanged.
- Add bounded diagnostics for:
  - shared feed-family rollover selection;
  - rejected out-of-order quote packets;
  - insufficient shared and direct MT5 candle sets;
  - stale-held recovery deferred because no current matching candidate exists.

### 5. Non-goals

- Do not modify `mt5/MarketDataEngine.mqh`, `mt5/CandleBuilder.mqh`, session calculation, or EA payload provenance.
- Do not add `sourceDetail` to the EA payload.
- Do not create a Twelve Data quote path.
- Do not change Pine, fib, regime, signal-scoring, stop, target, or risk formulas.
- Do not share account telemetry, positions, orders, execution state, or account heartbeat across users.
- Do not redesign the shared tables or migrate every legacy feed key to a new schema in this patch.
- Do not purge legacy session rows.
- Do not introduce a generic database-query cache or reinterpret the existing candle transient as one.
- Do not refactor the WordPress plugin monolith beyond the functions required for this failure path.
- Do not change execution-button logic or enable execution from shared data when account telemetry is stale.

### 6. Risk assessment

- Worst-case backend failure if implemented incorrectly: shared data can cross broker boundaries, an older quote can be accepted as current, or a fresh quote can suppress all usable candle fallback and recreate the planless state.
- Worst-case user-visible failure: the board reports `LIVE` while cards are stale or planless, or valid read-only peer blueprints disappear across every session transition.
- Worst-case execution risk: stale data is mislabeled live and becomes executable. The existing engine fresh-MT5 guard and account-telemetry sizing guard must remain hard gates.
- Performance risk: family-wide candle queries can expand row scans. Keep symbol, timeframe, confidence, ordering, and requested-lookback bounds in the SQL and rely on the existing shared-table indexes.
- Compatibility risk: legacy session keys must remain readable until a separately approved migration removes them.
- Human approval is required before merge because the patch changes source authority, candle fallback, durable signal lifecycle, and user-visible health state.

### 7. Test requirements

#### PHP automated tests

1. Stored `BROKER|LONDON` key with a fresh peer `BROKER|NEWYORK` quote resolves only within the exact broker family and updates user meta.
2. Empty stored feed key performs no global fallback lookup.
3. `BROKER_A` cannot select rows from `BROKER_A_DEMO`, `BROKERXA`, or another broker family.
4. M15 rows split across legacy session keys merge, deduplicate by candle time, remain chronological, and exclude disputed rows.
5. Higher-timeframe derivation receives merged family-wide M15 rows.
6. A stale shared quote does not establish MT5 authority.
7. A stale direct MT5 snapshot does not establish MT5 authority even though its source is `mt5`.
8. Historical MT5 candle presence alone does not establish authority.
9. A fresh valid shared or direct MT5 quote establishes authority.
10. Fewer than the required shared candles do not return early.
11. A fresh quote plus insufficient shared candles does not suppress a permitted Twelve Data candle request.
12. An insufficient M1-derived higher-timeframe set does not return early.
13. A usable MT5 candle set prevents an unnecessary Twelve Data request.
14. An older shared quote packet cannot replace a newer canonical quote.
15. A rejected old quote packet does not alter source hash or source count.
16. Standard stale hold persists the current blocker.
17. Grace stale hold persists the current blocker and grace metadata.
18. Recovery with a current matching candidate replaces stored engine metadata and clears grace metadata.
19. Recovery without a current matching candidate leaves the signal held.

#### Frontend automated tests

1. Live prices and healthy diagnostics produce a `live` header badge.
2. Stale price state produces `stale` even when divergence count is zero.
3. Live price plus `CANDLES_MISSING` or stale candle diagnostics does not produce `live`.
4. Candidate divergence remains represented separately and does not overwrite market health.
5. All relevant symbols closed produces `closed_session`.
6. Mixed live and closed-session symbols produces `live`.
7. Missing snapshot data produces `pending-sync`.
8. Structural setup blockers do not falsely report stale market data.

#### Existing checks and manual verification

- Run the existing PHP market-stream and snapshot-contract test commands documented by the repository test harness.
- Run the targeted Vitest file for `src/routes/-plan.test.tsx`, followed by the standard frontend test suite and type check.
- Run PHP syntax validation on the modified plugin file.
- Perform a controlled replay across at least one session transition with two same-broker users: user A offline, user B online.
- Verify user A receives live shared prices and read-only blueprints after rollover while account telemetry remains stale and execution remains disabled.
- Verify a different broker server never receives those shared rows.
- Capture before/after database evidence for user feed meta, family quote rows, family candle counts, diagnostics, display-signal lifecycle, and ladder output.
- No Pine parity rerun is required because trading formulas are explicitly out of scope.

### 8. Implementation handoff

- Keep PR #393 as the research and planning artifact. Do not apply source-code changes to its branch.
- Claude's next stage must read:
  - `reports/copilot-research.md`;
  - `reports/codex-plan.md`;
  - the current repository functions and tests named above.
- Claude must harden this plan against current HEAD without rewriting the research report. It may update `reports/codex-plan.md` or produce `reports/hardenedplan.md` when preserving the original plan is required.
- Claude must produce, but not silently apply, a unified application diff named `pr-393-shared-market-recovery.diff`, together with the required chat outputs: Issue Brief, Patch Summary, File to Patch, and Unified `.diff` File.
- Recommended implementation branch after human approval: `claude/shared-market-rollover-authority`.
- Suggested commit grouping:
  1. shared feed-family resolution, candle usability, and authority tests;
  2. atomic quote ordering and lifecycle recovery;
  3. Plan-board health projection and frontend tests;
  4. implementation report and validation evidence.
- Required post-implementation artifact: `reports/codex-implementation.md` or the repository's current equivalent, containing commands, outputs, files changed, known limitations, and live replay evidence.
- State transition after the hardened plan is approved: `READY_FOR_IMPLEMENTATION` with `editing_locked=false`.
