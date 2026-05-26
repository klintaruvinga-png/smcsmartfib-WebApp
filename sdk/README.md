# @smc/superfib-sdk

TypeScript SDK for the **SMC SuperFib Dashboard** — a multi-platform trading signal execution and monitoring system built on Smart Money Concepts (SMC) Fibonacci strategies.

---

## What's in the kit

| Module | Contents |
|--------|----------|
| `@smc/superfib-sdk` | Everything (barrel) |
| `@smc/superfib-sdk/client` | `SniperClient` REST client, typed errors |
| `@smc/superfib-sdk/types` | All domain TypeScript types |
| `@smc/superfib-sdk/utils` | Price formatting, freshness helpers, Fibonacci utilities |
| `@smc/superfib-sdk/constants` | Symbol lists, session windows, API constants |
| `@smc/superfib-sdk/mocks` | Mock fixtures and synthetic data generators |
| `@smc/superfib-sdk/auth` | Isomorphic auth helpers (browser + Node.js) |

---

## Installation

```bash
# From the monorepo root
npm install ./sdk

# Or link it locally during development
cd sdk && npm run build
```

---

## Quick start

### 1. Create a client

```typescript
import { SniperClient } from "@smc/superfib-sdk/client";

const client = new SniperClient({
  baseUrl: "https://trader.stokvelsociety.co.za/wp-json",
  username: "trader",
  appPassword: "xxxx xxxx xxxx xxxx",
  onAuthRequired: () => window.location.href = "/login",
});
```

### 2. Fetch live market data

```typescript
const snapshot = await client.getSnapshot();

for (const price of snapshot.prices) {
  console.log(`${price.symbol}: ${price.mid} (${price.state})`);
}
```

### 3. Check for READY signals

```typescript
import { isSignalActionable } from "@smc/superfib-sdk/utils";

const signals = await client.getLiveSignals();
const ready = signals.filter(isSignalActionable);
console.log(`${ready.length} signals ready to execute`);
```

### 4. Format prices

```typescript
import { fmtPrice, fmtPct, relTime } from "@smc/superfib-sdk/utils";

fmtPrice(156.435, "USDJPY");  // "156.435"
fmtPrice(1.2675, "GBPUSD");   // "1.26750"
fmtPrice(2331.65, "XAUUSD");  // "2331.65"
fmtPct(0.42);                  // "+0.42%"
relTime("2026-05-26T10:00:00Z"); // "3m ago"
```

### 5. Work with Fibonacci levels

```typescript
import { fibPriceAtRatio, nearestFibLevel, pdZone, FIB_RATIOS } from "@smc/superfib-sdk/utils";

const levels = await client.getChartSnapshot("GBPUSD");
const nearest = nearestFibLevel(1.2675, levels.fibLevels);
const zone = pdZone(1.2675, levels.fibLevels);  // "PREMIUM" | "DISCOUNT" | ...
```

### 6. Use mock data in tests

```typescript
import { mockSignals, mockPrices, mockPlan } from "@smc/superfib-sdk/mocks";
import { mockPriceSeries, mockFibLevels } from "@smc/superfib-sdk/mocks";

const series = mockPriceSeries("GBPUSD", 100);   // 100 synthetic M1 candles
const fibs = mockFibLevels("GBPUSD");             // 16-level Fib grid
```

---

## API Reference

### `SniperClient`

All methods return typed Promises. Errors are typed (`AuthError`, `ApiError`, `NetworkError`).

#### Market data

| Method | Returns | Description |
|--------|---------|-------------|
| `getSnapshot()` | `MarketSnapshot` | Prices, regimes, gates, diagnostics for the watchlist |
| `getChartSnapshot(symbol, timeframe?)` | `ChartSnapshot` | OHLC candles + Fib levels for one symbol |
| `getLiveSignals()` | `SignalCandidate[]` | Active WATCH/ARMED/READY signals |
| `getLadders(symbol?)` | `TradePlan[]` | Active LTF_SF ladder plans |
| `getSession()` | `SessionInfo` | Current trading session (no auth required) |
| `getEngineHealth()` | `EngineHealth` | Feed freshness, blocker state |
| `getAdminHealth()` | `EngineHealth` | Same as above, cache-busted |

#### Account

| Method | Returns | Description |
|--------|---------|-------------|
| `getAccountTelemetry()` | `AccountTelemetry` | Raw MT5 account data |
| `getUserAccount()` | `AccountState` | Computed account state |
| `postUserAccount(payload)` | `{ ok: true }` | Update account fields |

#### Settings

| Method | Returns | Description |
|--------|---------|-------------|
| `getUserSettings()` | `DashboardSettings` | Watchlist, risk allocation, intervals |
| `postUserSettings(payload)` | `{ ok: true }` | Persist settings changes |
| `postTwelveDataKey(payload)` | `{ ok, status }` | Set or test a Twelve Data key |
| `deleteTwelveDataKey()` | `{ ok, status }` | Remove the stored key |

#### Risk & progress

| Method | Returns | Description |
|--------|---------|-------------|
| `getUserRiskProfile()` | `RiskProfile` | Tier, lot limits, drawdown cap |
| `postUserRiskProfile(payload)` | `{ ok: true }` | Update risk settings |
| `getUserProgress()` | `UserProgress` | Equity pulse, streak, milestones |

#### Positions & execution

| Method | Returns | Description |
|--------|---------|-------------|
| `getPositions()` | `Position[]` | Open MT5 positions |
| `getOrders()` | `PendingOrder[]` | Pending MT5 orders |
| `postExecuteSignals(payload)` | `{ ok, queued }` | Queue signals for execution |
| `postEngineBatch(symbols?)` | `{ ok, diagnostics }` | Force engine run |
| `postWatchlistAdd(symbol)` | `{ ok, watchlist }` | Add symbol to watchlist |
| `postWatchlistRemove(symbol)` | `{ ok, watchlist }` | Remove symbol from watchlist |

#### Soak testing (admin)

| Method | Returns | Description |
|--------|---------|-------------|
| `getSoakReport()` | `SoakReport` | Full soak evidence and checkpoint data |
| `upsertSoakEvidence(payload)` | `SoakEvidenceRow` | Record an evidence entry |
| `createSoakCheckpoint(opts?)` | `SoakCheckpointRow` | Capture a checkpoint snapshot |

---

### Errors

```typescript
import { AuthError, ApiError, NetworkError, isSniperError } from "@smc/superfib-sdk/client";

try {
  await client.getLiveSignals();
} catch (err) {
  if (err instanceof AuthError)   /* redirect to login */;
  if (err instanceof ApiError)    console.error(err.status, err.path);
  if (err instanceof NetworkError) console.error("No connectivity");
}
```

---

### Types

All domain types are exported from `@smc/superfib-sdk/types`:

```typescript
import type {
  SignalCandidate, Verdict, SignalStatus,
  TradePlan, Position, PendingOrder,
  FreshnessState, EngineBlocker,
  FibLevel, FibFamily, FibRole,
  RegimeState, GateState, PairPrice,
  AccountState, AccountTelemetry,
  RiskProfile, DashboardSettings,
  SoakReport, SoakEvidencePayload,
  MarketSnapshot, SessionInfo,
} from "@smc/superfib-sdk/types";
```

---

### Constants

```typescript
import {
  ALL_KNOWN_SYMBOLS,   // all 37 symbols
  DEFAULT_WATCHLIST,   // 8 liquid pairs
  FOREX_PAIRS,
  METALS, INDICES, CRYPTO,
  TRADING_SESSIONS,    // Sydney, Tokyo, London, NY, etc.
  currentSessionName,  // "London-AM" | "New York" | ...
  VERDICT_RANK,        // { "A+": 3, A: 2, B: 1, C: 0 }
  SIGNAL_STATUS_RANK,  // { WATCH: 0, ARMED: 1, READY: 2 }
} from "@smc/superfib-sdk/constants";
```

---

### Utilities

#### Freshness
```typescript
import { isLive, isStale, isUsable, freshnessLabel, freshnessColor } from "@smc/superfib-sdk/utils";
```

#### Fibonacci
```typescript
import { FIB_RATIOS, fibRole, fibPriceAtRatio, nearestFibLevel, pdZone } from "@smc/superfib-sdk/utils";
```

#### Format
```typescript
import { fmtPrice, fmtPct, fmtUSC, fmtZAR, relTime } from "@smc/superfib-sdk/utils";
```

---

## Build

```bash
cd sdk
npm install
npm run build      # outputs to sdk/dist/
npm run typecheck  # TypeScript check without emit
```

---

## Architecture notes

- The SDK has **zero runtime dependencies** — no React, no Vite env vars, no WordPress globals.
- Auth supports both **Basic auth** (application passwords) and **WP-Nonce** (for pages served by WordPress).
- All normaliser logic (snake_case → camelCase, `NaN` coercion) lives inside `SniperClient` so consumers always receive clean typed objects.
- `@smc/superfib-sdk/mocks` is a **test-only** module. Do not import it in production bundles.
