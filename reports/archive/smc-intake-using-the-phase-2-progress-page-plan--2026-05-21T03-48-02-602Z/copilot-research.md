# Phase 2 Read-Only Trade Telemetry Research

## Issue
SMC Intake - Begin Phase 2 Implementation.

## Summary
Phase 2 is a read-only MT5 trade telemetry scope that extends the existing EA bridge route, persists authoritative account/position/order state in the backend, and surfaces only backend-owned telemetry in the dashboard. No frontend mutation of live trade truth is introduced, and existing audit-only POST endpoints remain non-authoritative.

## 1. Exact EA Trade Telemetry Payload Fields

### Route
- Use existing route: `POST /wp-json/sniper/v1/ea/market-stream`
- Extend the current market-stream payload with Phase 2 telemetry fields
- Preserve compatibility with existing route expectations: `symbol`, `bid`, `ask`

### Top-level required fields
- `schema_version` (e.g. `phase2.trade_telemetry.v1`)
- `user_id`
- `account_id`
- `terminal_id`
- `ea_version`
- `timestamp` (ISO-8601 UTC)
- `positions` (array)
- `pending_orders` (array)
- `account_metrics` (object)

### Existing required compatibility fields
- `symbol`
- `bid`
- `ask`

### Recommended Phase 2 payload structure
```json
{
  "schema_version": "phase2.trade_telemetry.v1",
  "user_id": 1,
  "account_id": "32206603",
  "terminal_id": "FB9A56D617EDDDFE29EE54EBEFFE96C1",
  "broker": "Deriv",
  "broker_server": "Deriv-Demo",
  "ea_version": "1.00",
  "terminal_build": "4755",
  "timestamp": "2026-05-20T10:15:00Z",
  "symbol": "EURUSD",
  "normalized_symbol": "EURUSD",
  "bid": 1.0845,
  "ask": 1.0847,
  "spread": 2,
  "freshness": "LIVE",
  "session": "London",
  "positions": [ ... ],
  "pending_orders": [ ... ],
  "account_metrics": { ... }
}
```

### Position object required fields
- `position_id`
- `symbol`
- `direction`
- `entry_price`
- `sl`
- `tp`
- `volume`
- `opened_at`
- `state`

### Pending order object required fields
- `order_id`
- `symbol`
- `order_type`
- `direction`
- `entry_price`
- `sl`
- `tp`
- `volume`
- `placed_at`
- `state`

### Account metrics required fields
- `balance`
- `equity`
- `margin`
- `free_margin`
- `floating_pl`

### Direction normalization rules
EA may send MT5-native values:
- `BUY`
- `SELL`
- `BUY_LIMIT`
- `SELL_LIMIT`
- `BUY_STOP`
- `SELL_STOP`
- `BUY_STOP_LIMIT`
- `SELL_STOP_LIMIT`

Normalize display values in backend/dashboard:
- `BUY`, `BUY_LIMIT`, `BUY_STOP` -> `LONG`
- `SELL`, `SELL_LIMIT`, `SELL_STOP` -> `SHORT`

## 2. Backend Persistence Fields and Duplicate-Ticket Behavior

### Authoritative persistence contract
Telemetry must persist authoritative state for:
- account metrics
- open positions
- pending orders

### Unique authoritative keys
- Positions: `user_id + account_id + terminal_id + position_id`
- Pending orders: `user_id + account_id + terminal_id + order_id`

This means duplicate tickets from the same account/terminal should update the existing authoritative row rather than inserting duplicates.

### Fresh batch behaviour
A new telemetry batch is the EA’s current truth for that account/terminal:
- If a previously open position is missing from `positions[]`, it must no longer be visible as open
- If a previously pending order is missing from `pending_orders[]`, it must no longer be visible as active

Acceptable implementation:
- mark missing rows `state = closed` or `state = inactive`
- exclude them from active read responses

### Recommended persistence storage contract
The backend may either add dedicated tables or enforce deterministic IDs on the existing generic table.

Recommended deterministic IDs:
- `position:{user_id}:{account_id}:{terminal_id}:{position_id}`
- `order:{user_id}:{account_id}:{terminal_id}:{order_id}`

Minimum persisted position payload:
- `user_id`
- `account_id`
- `terminal_id`
- `position_id`
- `symbol`
- `normalized_symbol`
- `direction`
- `entry_price`
- `current_price`
- `sl`
- `tp`
- `volume`
- `profit`
- `swap`
- `commission`
- `magic`
- `comment`
- `opened_at`
- `state`
- `ea_version`
- `last_seen_at`
- `updated_at`
- `raw_json`

Minimum persisted pending order payload:
- `user_id`
- `account_id`
- `terminal_id`
- `order_id`
- `symbol`
- `normalized_symbol`
- `order_type`
- `direction`
- `entry_price`
- `sl`
- `tp`
- `volume`
- `magic`
- `comment`
- `placed_at`
- `state`
- `ea_version`
- `last_seen_at`
- `updated_at`
- `raw_json`

Minimum persisted account telemetry payload:
- `user_id`
- `account_id`
- `terminal_id`
- `balance`
- `equity`
- `margin`
- `free_margin`
- `margin_level`
- `floating_pl`
- `currency`
- `leverage`
- `ea_version`
- `last_seen_at`
- `updated_at`
- `raw_json`

## 3. Dashboard Read-Only Consumption Surfaces

### Approved Phase 2 dashboard sources
- Account card -> backend GET account telemetry
- Live positions -> backend GET trades/positions
- Floating P/L -> backend position/account telemetry
- Hedge grouping -> backend open positions
- Sync health -> backend health or market-data-authority

### Explicit guardrail
The dashboard must not treat:
- `POST /user/trades`
- `POST /user/account`
as live Phase 2 source-of-truth.

Phase 2 source-of-truth must be:
EA -> `/ea/market-stream` -> backend persistence -> dashboard GET reads

### Audit-only endpoints
- `POST /user/trades` remains audit/config only
- `POST /user/account` remains non-authoritative for live telemetry

## 4. Track A/B/C Sign-Off Contract

### Track A — EA / MT5 payload sign-off
Track A approves when the EA emits the approved Phase 2 trade telemetry payload through the existing EA market-stream bridge without weakening Phase 1 bridge behavior.

Checklist:
- [ ] `schema_version` included
- [ ] `user_id` included
- [ ] `account_id` included
- [ ] `terminal_id` included
- [ ] `ea_version` included
- [ ] `timestamp` included in ISO-8601 UTC
- [ ] `positions[]` included every telemetry cycle
- [ ] `pending_orders[]` included every telemetry cycle
- [ ] `account_metrics` included every telemetry cycle
- [ ] Position objects include required fields
- [ ] Pending order objects include required fields
- [ ] Account metrics include required fields
- [ ] Payload sent through `POST /wp-json/sniper/v1/ea/market-stream`
- [ ] Existing EA auth headers preserved
- [ ] Existing heartbeat/account-sync/symbol-sync behavior unaffected

### Track B — Backend persistence/sign-off
Track B approves when backend accepts Phase 2 payload on existing `/ea/market-stream`, persists account metrics, open positions, pending orders, stores account_id/terminal_id, and handles duplicate tickets by overwrite.

Checklist:
- [ ] `/ea/market-stream` accepts Phase 2 payload
- [ ] Existing API-key auth enforced
- [ ] Existing user_id validation enforced
- [ ] Existing staleness validation enforced
- [ ] Account metrics persisted
- [ ] Open positions persisted
- [ ] Pending orders persisted
- [ ] `account_id` and `terminal_id` stored on every record
- [ ] `ea_version` and `last_seen_at` stored
- [ ] Duplicate position tickets update existing rows
- [ ] Duplicate pending order tickets update existing rows
- [ ] Missing previous positions no longer appear as open
- [ ] Broker reconnect does not leave stale positions visible
- [ ] backend GET reads expose current authoritative telemetry
- [ ] audit logs capture invalid telemetry payloads

### Track C — Dashboard read-only authority sign-off
Track C approves when all Phase 2 dashboard panels are read-only consumers of backend-owned telemetry and do not mutate live trade state.

Checklist:
- [ ] Account card reads backend account telemetry
- [ ] Live positions read backend trade telemetry
- [ ] Floating P/L reads backend telemetry
- [ ] Hedge grouping uses backend open positions
- [ ] Sync health uses backend health/authority
- [ ] Dashboard does not POST live trade state
- [ ] `POST /user/trades` remains audit-only
- [ ] `POST /user/account` remains non-authoritative
- [ ] No frontend local/mock/manual state overrides live MT5 telemetry
- [ ] Dashboard values match MT5 terminal scenarios

## 5. Implementation Guidance

Recommended order:
1. Add Phase 2 checklist/tracker and contract documentation
2. Add backend tests for duplicate-ticket overwrite and missing-position behavior
3. Extend `/ea/market-stream` to parse `positions`, `pending_orders`, `account_metrics`
4. Persist telemetry using deterministic unique keys
5. Add GET read normalization for dashboard consumers
6. Update EA emission to approved payload
7. Verify dashboard read-only surfaces and remove stale ghost state

> The core risk is stale trade rows. A fresh payload with empty `positions[]` must clear active open positions for the account/terminal.
