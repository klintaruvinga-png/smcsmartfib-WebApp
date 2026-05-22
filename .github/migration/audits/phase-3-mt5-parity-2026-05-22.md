# Phase 3 MT5 Parity Audit

Date: 2026-05-22
Engine: MT5 EA candle engine
Scope: EA payload schema parity against `POST /wp-json/sniper/v1/ea/market-stream`

## Payload field parity

- `symbol`: emitted and ingested
- `normalized_symbol`: emitted and ingested
- `timeframe`: emitted and ingested
- `timestamp`: emitted as ISO 8601 UTC string, accepted by backend normalizer
- `bid` / `ask`: emitted and ingested
- `spread`: emitted and validated by backend
- `freshness`: emitted, normalized, stored, and mapped to snapshot state
- `session`: emitted, normalized, stored, and logged
- `candle` (M1 nested): emitted and ingested
- `candle_m15` (M15 nested): emitted and ingested
- `candle_*` flat aliases: emitted and accepted as compatibility aliases
- `candle_m15_*` flat aliases: emitted and accepted as compatibility aliases

## Session and freshness parity

- Freshness thresholds remain `LIVE < 30s`, `DELAYED < 300s`, `STALE >= 300s`.
- CLOSED now propagates per symbol based on session-open evaluation, including index off-hours.
- Session evaluation now converts broker server time to UTC before applying canonical session windows.

## Persistence parity

- Snapshot writes remain `source='mt5'`.
- Candle writes remain `source='mt5'`.
- Duplicate M1/M15 payloads for identical candle keys upsert to a single row.

## Validation results

- `phase3_mt5_simulation_test.php`: passed
- `test-ea-market-stream.php`: passed
- `test-mt5-snapshot-contract.php`: passed

## Known parity limits

- Timestamp format remains ISO 8601 UTC because that is the existing live backend contract; the implementation did not switch to Unix milliseconds.
- The full PHP test sweep has an unrelated streak-count failure in `test-phase2-trade-telemetry.php`, outside the Phase 3 MT5 payload seam.
