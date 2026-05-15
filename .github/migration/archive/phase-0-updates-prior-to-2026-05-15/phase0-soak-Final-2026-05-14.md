# Phase 0 Soak Report

Generated at: 2026-05-14T14:02:03+00:00

## Baseline
- 11/05/2026, 08:57:17 | Watchlist symbols: 7. Live watchlist symbols now: 5/7. Lowest candle count currently observed: 0 on NAS100. Symbols under 30 candles: NAS100=0, US30=0, XAUUSD=5. Active blockers: AUDUSD=CHOP_GATE_BLOCKED, NAS100=PRICE_NOT_MT5_FRESH, US30=PRICE_NOT_MT5_FRESH, ETHUSD=CHOP_GATE_BLOCKED, XAUUSD=INSUFFICIENT_CANDLE_HISTORY.

## Health
- Feed status: stale
- Backend sync: live
- Engine run state: live
- Last batch: 14/05/2026, 16:01:54
- Last engine run: 14/05/2026, 16:01:58

## Aggregates
- Watchlist count: 11
- Snapshots 24h: 28
- Candles 24h: 65553
- Engine runs 24h: total=249878, success=645, error=0, last=14/05/2026, 16:02:05
- Audit events 24h: total=252979, error=3740, warning=3672

## Manual Evidence
- phase0-feed-watchlist | manual_note | admin | 12/05/2026, 03:10:00 | After 18hours of soak XAUUSD now has price but NAS100 and US30 are still not resolving
- baseline.notes | baseline_metadata | admin | 11/05/2026, 08:57:11 | Watchlist symbols: 7. Live watchlist symbols now: 5/7. Lowest candle count currently observed: 0 on NAS100. Symbols under 30 candles: NAS100=0, US30=0, XAUUSD=5. Active blockers: AUDUSD=CHOP_GATE_BLOCKED, NAS100=PRICE_NOT_MT5_FRESH, US30=PRICE_NOT_MT5_FRESH, ETHUSD=CHOP_GATE_BLOCKED, XAUUSD=INSUFFICIENT_CANDLE_HISTORY.
- baseline.watchlist_live_symbols | baseline_metadata | admin | 11/05/2026, 08:57:08 | 5/7 live: GBPUSD, AUDUSD, BTCUSD, ETHUSD, XAUUSD | not live: NAS100, US30
- baseline.twelve_data_key_status | baseline_metadata | admin | 11/05/2026, 08:57:06 | ok
- baseline.auth_confirmed | baseline_metadata | admin | 11/05/2026, 08:57:04 | YES
- baseline.t0_health_summary | baseline_metadata | admin | 11/05/2026, 08:57:01 | feedStatus=stale, backendSync=live, twelveDataKeyStatus=ok
- baseline.backend_health_endpoint | baseline_metadata | admin | 11/05/2026, 08:56:59 | https://smcsmartfib.lovable.app/wp-json/sniper/v1/health
- baseline.mt5_terminal_status | baseline_metadata | admin | 11/05/2026, 08:56:57 | Online
- baseline.frontend_watchlist | baseline_metadata | admin | 11/05/2026, 08:56:54 | GBPUSD AUDUSD BTCUSD NAS100 US30 ETHUSD XAUUSD
- baseline.ea_symbols | baseline_metadata | admin | 11/05/2026, 08:56:52 | EURUSD, USDJPY, GBPUSD, AUDUSD, USDCAD, USDCHF, NZDUSD, EURJPY, EURGBP, GBPJPY, EURCHF, AUDJPY, EURAUD, BTCUSD, ETHUSD, SOLUSD, DXYUSD, Boom 500 Index, Volatility 75(1s) Index, US Tech 100, Germany 40, US SP 500, Wall Street 30, GOLD
- baseline.started_at | baseline_metadata | admin | 11/05/2026, 08:56:50 | 2026-05-11T08:47
- baseline.started_by | baseline_metadata | admin | 11/05/2026, 08:56:47 | admin
- At baseline | manual_note | admin | 11/05/2026, 06:02:04 | Attempted to add XAUUSD and GOLD but its not watchlisted

## Checkpoints
- checkpoint | 14/05/2026, 15:57:29 | No operator notes
- checkpoint | 14/05/2026, 10:16:55 | Final soak
- checkpoint | 14/05/2026, 02:52:27 | Data has held consistent throughout the soak run, the issues we are seeing are the same, a stale feed and no price/candles on Nas and us30
- checkpoint | 13/05/2026, 18:23:28 | No operator notes
- checkpoint | 13/05/2026, 07:50:00 | No operator notes
- checkpoint | 12/05/2026, 10:22:50 | No operator notes
- checkpoint | 12/05/2026, 03:10:23 | No operator notes
- checkpoint | 11/05/2026, 21:11:11 | No operator notes
- checkpoint | 11/05/2026, 16:35:54 | No change in NAS100 or US30
candles still at 0
