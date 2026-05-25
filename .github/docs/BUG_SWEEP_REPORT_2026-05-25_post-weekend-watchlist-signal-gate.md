# Bug Sweep Report

Date: 2026-05-25
Scope: Post-weekend MT5 session reopen, backend stale-CLOSED transient interpretation, and dashboard watchlist signal filtering.

## Integrity checks performed

- Verified `mt5/SessionManager.mqh` reopens the shared FX session gate at Sunday 21:00 UTC while preserving Saturday closure and leaving the crypto 24/7 path untouched.
- Verified `wordpress/smc-superfib-sniper/class-market-data-service.php` keeps `store_tick_snapshot()` write behavior unchanged and only overrides `get_price_snapshot()` reads when freshness is `CLOSED` and broker-time indicates the market should be open.
- Verified `DISCONNECTED -> offline` remains unchanged on the backend read path.
- Verified frontend watchlist comparison normalization is local-only and does not change canonical watchlist storage or `postWatchlistAdd` / `postWatchlistRemove` payloads.
- Verified `signals.tsx` preserves the existing toggle behavior and only adds DEV-gated diagnostics for filter triage.

## Findings

- Confirmed fixed: the MT5 weekend gate now has a post-weekend reopen path for non-crypto symbols, closing the Monday-open dead zone where FX symbols stayed `CLOSED` until a new tick arrived.
- Confirmed fixed: backend price snapshots no longer remain visibly `offline` after market reopen when the stored state came from stale `CLOSED` freshness and a later broker timestamp proves the market is open.
- Confirmed fixed: watchlist filtering now matches broker suffix variants such as `.r`, `.m`, `.pro`, compact suffixes documented in the repo, trailing `+`, and `-ECN`-style forms without changing API contracts.
- Confirmed preserved: `DISCONNECTED` still resolves to `offline`, mid-weekend `CLOSED` behavior is unchanged, and polling/query gating was not modified.

## Residual risks

- Manual Monday-open live verification is still required to confirm non-crypto instruments appear within the first post-open tick window in the deployed MT5/WordPress environment.
- Asset-class trading hours remain narrow symbol-name checks by contract design; bank-holiday or broker-specific exchange-hour edge cases were not widened into a broader schedule system in this patch.
- The new route test currently lives under `src/routes/signals.test.tsx`, so TanStack Router emits a non-blocking warning that the file is not a route when running Vitest/build. This does not affect runtime behavior or test pass/fail.
