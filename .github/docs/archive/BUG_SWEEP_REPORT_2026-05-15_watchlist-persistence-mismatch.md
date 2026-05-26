# Bug Sweep Report

## Overview

- Scope: watchlist persistence mismatch affecting `AUDCAD` visibility and backend snapshot health.
- Severity: HIGH.
- Status: patched and regression-covered.

## Findings

1. Confirmed: `post_user_settings()` persisted a sanitized watchlist but returned only `{ ok: true }`, leaving it as the only watchlist mutation path that did not return the canonical persisted `watchlist` array.
2. Confirmed: `useWatchlistAdd()` and `useWatchlistRemove()` still invalidated `["user-settings"]` after writing the mutation response, despite the local guard comment stating that a lagging `GET /user/settings` can overwrite the canonical mutation result.
3. Confirmed: `AUDCAD` was already present in `instrument_specs()` and remained accepted by `is_supported_symbol()`. No normalization bug was found.
4. Confirmed: engine snapshot invalidation existed on all mutation routes, but `post_user_watchlist()` and `post_watchlist_remove()` invalidated even when the canonical symbol set was unchanged, and no no-op diagnostic existed.

## Recommendations

1. Keep watchlist mutations backend-authoritative by returning the post-persist canonical `watchlist` from every mutation endpoint, including `post_user_settings()`.
2. Do not refetch `["user-settings"]` immediately after watchlist add/remove success; use the mutation response as the canonical watchlist source and let other downstream queries refresh independently.
3. Preserve `delete_engine_snapshot()` for every real symbol-set change, and log no-op skips so stale-state investigations can distinguish unchanged watchlists from invalidation failures.
4. Manual staging verification is still required for the Account -> Live Radar add/remove flow because this run only exercised the PHP harness and Vitest watchlist hook suite.
