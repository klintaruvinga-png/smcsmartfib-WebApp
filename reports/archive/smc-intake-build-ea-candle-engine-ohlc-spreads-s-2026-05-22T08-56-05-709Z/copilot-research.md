# Issue classification
- Severity: HIGH
- Category: runtime-bug
- Layer(s) affected: MT5 / PHP-backend / REST-API
- Phase impact: Phase 3

## 2. Confirmed evidence
- `mt5/SMC_MarketDataEA.mq5` initializes the EA and schedules `OnTimer()` for periodic webhook dispatch.
- `mt5/MarketDataEngine.mqh` `OnPeriodic()` updates the session manager, ages freshness, and sends payloads to the backend for each configured symbol.
- `mt5/MarketDataEngine.mqh` `BuildWebhookPayload()` constructs JSON with `symbol`, `normalized_symbol`, `timeframe`, `timestamp`, `bid`, `ask`, `freshness`, `session`, `spread`, and candle OHLC fields.
- `mt5/MarketDataEngine.mqh` reads closed M1/M15 bars from `CopyRates()` and includes them in the webhook payload, while guarding against future candle timestamps.
- `mt5/FreshnessEngine.mqh` defines authoritative freshness states and updates them on both tick and periodic events.
- `mt5/SMC_MarketDataEA.mq5` polls non-chart symbols in `OnTimer()` so all watched symbols receive freshness updates even without chart ticks.
- `PHASE3_IMPLEMENTATION.md` explicitly lists the Phase 3 acceptance criteria for EA candle engine OHLC, spreads, sessions, tick movement, freshness states, and 10-second webhook dispatch.
- `PHASE3_IMPLEMENTATION.md` also requires backend persistence of tick snapshots and M1 candles with `source='mt5'` and recognizes `/sniper/v1/ea/market-stream` as the EA ingestion route.
- `.github/prompts/claude-stabilize-prompt.md` confirms `POST https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream` and identifies the plugin owner as `wordpress/smc-superfib-sniper/`.
- `MT5_CANONICAL_MARKET_SPEC.md` documents the canonical MT5 rules for tick ingestion, internal candle construction, session detection, freshness state calculation, and webhook frequency every 10 seconds.
- `src/types/sniper.ts` contains `PriceSource = "mt5"`, showing the frontend authority contract for MT5-sourced data.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` contains logic that enforces `source='mt5'` during EA persistence and protects MT5-authoritative rows.

## 3. Root cause hypothesis
- Most likely root cause: the MT5 EA webhook payload is the critical handoff point, and the issue is a need to validate its current payload contract against backend ingestion and source persistence requirements. (Confirmed)
- Why this fits: the EA payload builder and freshness/session engine are the only components that produce the runtime values required by Phase 3, and the backend route is already documented and expected to preserve `source='mt5'` authority. (Confirmed)
- Likely trigger: a Phase 3 validation gap between EA payload fields, backend webhook schema, and the `source='mt5'` write path. (Hypothesis)
- Secondary trigger: session/freshness misclassification during equity index closed hours or weekend gaps, causing backend rejects or stale authority. (Hypothesis)

## 4. Blast radius
- Files likely affected:
  - `mt5/SMC_MarketDataEA.mq5`
  - `mt5/MarketDataEngine.mqh`
  - `mt5/FreshnessEngine.mqh`
  - `mt5/CandleBuilder.mqh`
  - `mt5/TickProcessor.mqh`
  - `mt5/SessionManager.mqh`
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `wordpress/smc-superfib-sniper/class-market-data-service.php`
  - `wordpress/smc-superfib-sniper/tests/php/phase3_mt5_simulation_test.php`
  - `PHASE3_IMPLEMENTATION.md`
  - `PHASE3_TESTING_GUIDE.md`
  - `.github/prompts/claude-stabilize-prompt.md`
  - `MT5_CANONICAL_MARKET_SPEC.md`
  - `src/types/sniper.ts`
- Systems involved:
  - MT5 EA runtime market data engine
  - WordPress REST API ingestion path
  - Backend persistence of `mt5` snapshots and candles
  - Dashboard authority/read surfaces for MT5 source
- Parity surfaces at risk:
  - MT5 EA vs backend webhook schema
  - Backend `source='mt5'` rows vs Twelve Data fallback rows
  - Dashboard authority selection for MT5 data
- Stale-state and authority risks:
  - `FreshnessEngine` output aging into DELAYED/STALE incorrectly
  - `CLOSED` state propagation during equity index or weekend close
  - backend stale-data guards rejecting payloads older than 300 seconds

## 5. Regression surface
- What must not break:
  - Existing `POST /wp-json/sniper/v1/ea/market-stream` route and `X-EA-API-Key` auth contract
  - MT5 authority protection for `source='mt5'` candle rows
  - Twelve Data fallback for non-MT5 symbols
  - Dashboard freshness and authority display behavior
  - Engine heartbeat and `engine_runs` tracking
- Existing guards and coverage:
  - `BuildWebhookPayload()` regression guard against future candle timestamps
  - `FreshnessEngine` market-closed override to `CLOSED`
  - Backend source validation and hardcoded `source='mt5'` persistence
  - Phase 3 checklist and testing guide
  - PHP regression tests under `wordpress/smc-superfib-sniper/tests/php/`

## 6. Resolution path options
- Path A: narrowest plausible correction surface
  - Validate the MT5 webhook payload builder in `mt5/MarketDataEngine.mqh`
  - Confirm `freshness`, `session`, `spread`, `bid/ask`, and candle OHLC fields are present and formatted correctly
  - Confirm the WordPress route accepts the payload and persists `source='mt5'` rows
- Path B: broader structural risk area if the narrow path is unsafe
  - Audit the full EA-to-backend ingestion contract, including route registration, auth gating, `source='mt5'` upserts, and authority endpoints
  - Validate dashboard authority reads and stale-data fallback logic for MT5 vs Twelve Data
- Recommended: Path A
  - Because current evidence shows the existing backend contract is already implemented and the missing validation is likely in the MT5 payload/dispatch handoff

## 7. Risk flags
- High-risk system involved: Yes — MT5 live market data authority is critical and can break price source correctness.
- Requires parity re-validation: Yes — EA payload, backend storage, and dashboard authority surfaces must be validated together.
- Migration-blocking: Yes — Phase 3 gate requires MT5 webhook handoff and `source='mt5'` persistence.
- Human review required before merge: Yes — source authority, stale-state handling, and route auth are sensitive.

## 8. Handoff package
- Epicentre files to inspect first:
  - `mt5/SMC_MarketDataEA.mq5`
  - `mt5/MarketDataEngine.mqh`
  - `mt5/FreshnessEngine.mqh`
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `PHASE3_IMPLEMENTATION.md`
  - `MT5_CANONICAL_MARKET_SPEC.md`
  - `.github/prompts/claude-stabilize-prompt.md`
- Inputs Codex must verify before planning:
  - `POST /wp-json/sniper/v1/ea/market-stream` is registered and accepts the MT5 payload
  - Webhook payload includes freshness, session, spread, and candle OHLC
  - Backend writes rows with `source='mt5'` to `wp_smc_sf_snapshots` and `wp_smc_sf_candles`
  - `FreshnessEngine` transitions LIVE/DELAYED/STALE/CLOSED correctly
  - `session` values and timestamps follow canonical MT5 rules
- Open unknowns:
  - Whether backend route wiring in this workspace fully supports the current contract
  - Whether `CandleBuilder` and `CopyRates()` are both required or if one path is stale
  - Whether equity index session overrides are correct for all traded symbols
