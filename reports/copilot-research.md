---
title: Copilot research — MT5 authority, shared quotes, and front-end harmony
date: 2026-06-11
author: GitHub Copilot (assistant)
---

Summary
-------

This research analyzes backend authority selection and MT5/shared-quote flows that affect front-end harmony and stability. The primary finding: mixed source selection (shared broker quotes, direct MT5 snapshot rows, and Twelve Data fallbacks) combined with coarse stale checks can produce broker-dependent inconsistent state.

Files inspected
--------------

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `wordpress/smc-superfib-sniper/class-market-data-service.php`
- `mt5/MarketDataEngine.mqh`
- `mt5/RegimeEngine.mqh`
- `mt5/CandleBuilder.mqh`

Evidence & observations
-----------------------

- `get_cached_price()` prefers `fetch_shared_market_quote()` (broker-aggregated) and returns it with `source: 'mt5'` and `sourceDetail: 'shared_market_quote'` when fresh.
- If shared quote is absent, `get_cached_price()` falls back to the MT5 `snapshots` row (`source = 'mt5'`).
- `is_mt5_authoritative()` returns true when `get_cached_price(..., PHP_INT_MAX)` yields `source === 'mt5'`, or when `SMC_MarketData_Service::has_mt5_data()` is true.
- `is_engine_snapshot_current()` enforces stale thresholds only when validating an entire engine snapshot (checks `updatedAt` for prices with `state === 'live'`), not at the authority decision point.
- Shared quotes make MT5 authority appear true even when some direct MT5 snapshot rows are stale or missing; the engine then prefers MT5-style behavior and may not fall back to Twelve Data.

Likely causes of inconsistent front-end harmony
----------------------------------------------

1. Mixed-source authority gap: MT5 authority is based on existence/source label but not per-symbol freshness at the authority check, so stale MT5 rows can still lock the engine into MT5-only logic.
2. Shared-quote timing: the broker-aggregated `market_quotes_latest` may update at different cadences per symbol/broker, producing per-symbol freshness skew.
3. Snapshot invalidation granularity: `ensure_engine_snapshot()` invalidates or retains the whole snapshot based on symbol equality and coarse refresh/stale thresholds, which can hide per-symbol staleness.
4. Candle aggregation gaps: `CandleBuilder` currently implements M1 aggregation only; missing parity in higher-TF aggregation may cause regime divergence across feeds.

Proposed mitigations / fixes (prioritized)
-----------------------------------------

1. Tighten MT5 authority check: require per-symbol freshness (age <= configured stale threshold) before treating `source === 'mt5'` as authoritative. If stale, allow Twelve Data fallback or mark authority uncertain.
2. Source provenance in engine snapshot: include `sourceDetail` and `age_sec` for each price in the engine snapshot so frontend and engine logic can make per-symbol decisions.
3. Per-symbol snapshot invalidation: modify `is_engine_snapshot_current()` to treat stale symbols individually (e.g., mark snapshot usable but degrade stale symbols), avoiding full-snapshot churn.
4. Shared-quote TTL alignment: ensure `fetch_shared_market_quote()` uses the same stale thresholds as `is_engine_snapshot_current()` to avoid mismatched expectations.
5. Harden EA dispatch: include `sourceDetail` in MT5 `BuildWebhookPayload()` (shared vs raw) so backend can better reason about origin.
6. Complete higher-TF aggregation parity in `CandleBuilder` to reduce regime divergence caused by aggregation differences.

Validation steps
----------------

1. Unit / integration tests that simulate per-symbol shared-quote latency: create test rows in `market_quotes_latest` with varying `updated_at` and verify engine snapshot decision tree.
2. Add logging: temporarily log `sourceDetail`, `age_sec`, and `stale_threshold_sec` for each symbol when `ensure_engine_snapshot()` computes a snapshot.
3. End-to-end smoke: with controlled MT5 feed (stale vs fresh rows) ensure frontend reflects fallback to Twelve Data only when MT5 is truly stale.

Next steps I can take
---------------------

- Produce a minimal patch that: (a) adds `sourceDetail`/`age_sec` to engine snapshots, and (b) tightens `is_mt5_authoritative()` freshness check.  (Requires CI/PR.)
- Or open this research PR for review and feedback before implementation.

Notes
-----

- I did not run any local pipeline watcher or runner; this research is read-only and follows repository workflow guidance.
- If you want the implementation patch, say which of the proposed mitigations to prioritise first.
