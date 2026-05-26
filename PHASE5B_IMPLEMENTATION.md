# Phase 5B — Fundamentals Regime Feed: Implementation Readiness Package

**Status**: CODE COMPLETE (2026-05-25) — awaiting Phase 5 parity gate  
**Target Start**: After Phase 5 gate passes  
**Target End**: 2026-10-01  
**Owner**: Track B (data ingestion + scoring) + Track C (dashboard)  
**Branch**: To be created from main once Phase 5 gate clears  

---

## Overview

Phase 5B integrates macro-economic data as a numerical bias overlay that filters
and weights technical regime + signal conditions. It does not replace fib/regime/signal
logic — it adds a conviction multiplier based on macro alignment.

**Design principle**: Technicals = precision entries/exits. Fundamentals = directional conviction.

---

## What Was Implemented (2026-05-25)

### Track B — Backend

**New DB tables:**

`wp_smc_sf_fundamental_events`
```
id, currency, event_type, event_name, event_date,
actual, forecast, previous, raw_score (-2..+2),
source, created_at
UNIQUE KEY (currency, event_type, event_date)
```

`wp_smc_sf_fundamental_bias`
```
id, currency, composite_score (-2.0..+2.0),
category (BULLISH/NEUTRAL/BEARISH),
event_count, computed_at, expires_at
UNIQUE KEY (currency)
```

**New REST endpoints:**

`POST /fundamentals/refresh` (user auth)
- Pulls economic calendar from Twelve Data `/economic_calendar` (existing TD key)
- Scores each event using `score_fundamental_event()`
- Recomputes composite bias per currency using `recompute_fundamental_bias()`
- Returns `{ ok, events_ingested, currencies_updated }`

`GET /fundamentals/bias?currency=USD` (user auth)
- Returns composite bias for one currency (or all if no filter)
- Response: `{ ok, bias: { currency, compositeScore, category, eventCount, computedAt, expiresAt } }`

**New WP-Cron job: `smc_sf_refresh_fundamentals`**
- Runs every 30 min (custom `twicehourly` cron schedule)
- Calls `cron_refresh_fundamentals()` for all users with a valid TD key
- Bias recomputed once after all user calendar pulls

**Event scoring logic (`score_fundamental_event`):**

| Event Type | Score Method |
|------------|-------------|
| `rate_decision` | actual > previous → +1 (hike); < previous → -1 (cut); same → 0 |
| `cpi` / `nfp` / `gdp` / `retail_sales` | Surprise ratio: (actual−forecast)/forecast → mapped to -2/−1/0/+1/+2 |
| `unemployment` | Inverted polarity (higher unemployment = bearish) |
| `pmi` / `trade_balance` / `other` | Standard surprise ratio |

**Composite bias decay:**
- Events within 30 days: weight = 1.0×
- Events 30–90 days old: weight = 0.25×
- Events older than 90 days: excluded
- composite_score = weighted_sum / event_count, clipped to [−2.0, +2.0]
- BULLISH: score ≥ 0.5 | NEUTRAL: −0.5 to 0.5 | BEARISH: score ≤ −0.5

**Data sources (all free tier):**
| Feed | Use | Status |
|------|-----|--------|
| Twelve Data `/economic_calendar` | CPI, NFP, GDP, rate decisions, all G10 | ✅ Same TD key already in backend |
| MT5 EA `DXYUSD` | USD conviction (already streaming) | ✅ Ready |
| MT5 EA `Volatility 75(1s) Index` | VIX proxy (already streaming) | ✅ Ready |
| FRED API | Deeper US macro (free, new key needed) | ⏳ Pending — register at fred.stlouisfed.org |

---

## Track C — Dashboard (Pending implementation)

The following dashboard components are specified but not yet implemented.
They will be built when Phase 5B starts after Phase 5 gate clears.

- [ ] Fundamentals bias chip per currency on watchlist row (BULLISH/NEUTRAL/BEARISH)
- [ ] Per-pair bias breakdown panel (base vs. quote currency bias)
- [ ] Upcoming economic events widget (next 24h, filtered by watched pairs)
- [ ] Conviction weight indicator on signal cards
- [ ] Manual bias override toggle (operator can pin pair to NEUTRAL pre-NFP)

---

## Signal Conviction Weighting (Phase 5B → 6 integration)

When Phase 5B is live and Phase 6 signals are evaluated, the conviction multiplier applies:

| Alignment | MT5 vs Fundamental Bias | Conviction Weight |
|-----------|------------------------|-------------------|
| Aligned   | Same direction         | 1.0× (full)       |
| Neutral   | NEUTRAL fundamental    | 0.7×              |
| Opposed   | Opposite direction     | 0.3× (reduced, not suppressed) |

Opposed signals are not blocked — they are flagged with lower confidence so the operator can decide.

---

## Phase 5B Gate Checklist

### Automated (code-complete)
- [x] `wp_smc_sf_fundamental_events` table schema
- [x] `wp_smc_sf_fundamental_bias` table schema
- [x] `POST /fundamentals/refresh` endpoint
- [x] `GET /fundamentals/bias` endpoint
- [x] WP-Cron `smc_sf_refresh_fundamentals` every 30 min
- [x] Event scoring: rate_decision, CPI, NFP, GDP, unemployment, PMI
- [x] Composite bias with 30d/90d time decay

### Manual (operator action — starts after Phase 5 gate)
- [ ] **Register FRED API key** at fred.stlouisfed.org
- [ ] **Run `/fundamentals/refresh`** and verify events ingested for USD, EUR, GBP, JPY, AUD, CAD
- [ ] **Historical accuracy test** — verify bias category matches known events (e.g. 2025 rate hikes)
- [ ] **Parity regression** — confirm Phase 5 regime parity unchanged after 5B overlay

---

## Parity Status

```
Fundamental bias accuracy vs. known events: PENDING (Phase 5 must clear first)
Signal conviction weighting regression:     PENDING
Regime parity post-overlay:                 PENDING
```
