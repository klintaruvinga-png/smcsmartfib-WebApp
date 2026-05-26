# Bug Sweep Report

Date: 2026-05-22
Scope: Phase 3 MT5 EA candle-engine handoff, stale-data protection, backend MT5 authority persistence, and EA route validation.

## Integrity checks performed

- Verified the EA payload builder still keeps the future-candle guard for M1 and M15.
- Verified per-symbol freshness aging now accepts symbol-aware market-open state instead of a single global session state.
- Verified `ea/market-stream` still enforces API-key auth and now rejects incomplete Phase 3 payloads with HTTP 400.
- Verified MT5 snapshot and candle writes still hardcode `source='mt5'`.
- Verified duplicate candle writes still upsert on `(user_id, symbol, timeframe, candle_time)` via `replace`.
- Verified CLOSED freshness persists a snapshot without weakening the 300-second payload stale-data guard.

## Findings

- Confirmed fixed: the backend route previously accepted incomplete Phase 3 payloads and only logged malformed candle objects. It now returns HTTP 400 for missing `freshness`, `session`, `spread`, or required OHLC fields when the payload is the dual-timeframe Phase 3 shape.
- Confirmed fixed: per-symbol market-open evaluation now covers equity index closed hours before freshness is aged, preventing a `STALE`/`CLOSED` mismatch for off-session index symbols.
- Confirmed fixed: the MT5 payload now exposes both the existing nested candle objects and flat candle aliases for M1/M15 so the schema seam can be validated explicitly.
- Confirmed preserved: legacy snapshot-only and single-candle bridge traffic still passes the existing PHP regression tests.

## Residual risks

- MT5 files were not compiled in a live MetaTrader environment from this workspace, so the MT5 changes are verified logically but not runtime-compiled here.
- The full PHP test script sweep still has an unrelated failure in `test-phase2-trade-telemetry.php` on streak counting (`current_streak_days` expected `1`, actual `0`). This patch did not touch streak logic.
- Phase 3 validation now assumes dual-timeframe payloads from the EA after history preload. Cold-start environments with missing M15 history should be watched during live deployment.
