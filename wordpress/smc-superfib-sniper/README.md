# SMC SuperFIB Sniper REST Backend

Install `smc-superfib-sniper.php` as a WordPress plugin on `trader.stokvelsociety.co.za`.

## Runtime contract

- Plugin version: `13.1.0`
- REST namespace: `/wp-json/sniper/v1`
- Auth: logged-in WordPress user + `X-WP-Nonce`
- Twelve Data key: submitted from the frontend, encrypted in WordPress, never returned by REST
- Execution: queues backend-confirmed LTF SF ladder orders only; no broker placement in v1

## v13.1.0 MT5 authority notes

- MT5-live symbols are authoritative for price refresh and direct quote lookups; stale or non-MT5 prices are blocked instead of falling back to Twelve Data quotes.
- Successful EA market-stream snapshot writes clear same-symbol TD quote-TTL and rate-limit transients, then write a lightweight `engine_runs` heartbeat so `/health` `backendSync` reflects live EA activity.
- MT5 snapshot `change_pct_1d` is derived from the first `source='mt5'` M1 candle of the current UTC day. Cold start remains `0` until that candle exists.
- Non-EA watchlist symbols stay blocked until fresh MT5 snapshots arrive. Their stale/non-MT5 state must not produce live frontend cards or READY engine output.

## Deferred maintenance

- Add scheduled pruning for high-frequency `engine_runs` heartbeat rows after live soak defines the desired retention window.
- Verify the MT5 M1 -> 15min aggregation path for any symbol still showing `insufficient candle history`; do not weaken the 30-candle gate without proof.

## Phase 0 soak logging

- Backend emits `PHASE0_SOAK` lines for per-symbol `/health` feed decisions, final `feedStatus`, candle fetch TTL/rate-limit transitions, and candle coverage counts.
- Frontend `src/routes/live.tsx` emits `console.warn` with the `PHASE0_SOAK` tag when a card is blocked by `RATE_LIMITED`.
- Primary operator runbook: `.github/migration/PHASE0_SOAK_TRACKER.md`
- Primary backend log target: WordPress `wp-content/debug.log`

## Frontend env

```env
VITE_SNIPER_BACKEND_URL=https://trader.stokvelsociety.co.za/wp-json
VITE_SNIPER_MOCK_MODE=false
```

If the frontend is served from a separate origin, add that origin through the `smc_sf_allowed_origins` filter so WordPress can return credentialed CORS headers.

When the Cloudflare CORS Worker in `cloudflare/wrangler-cors.jsonc` is deployed for `/wp-json/sniper/v1/*`, mirror any `smc_sf_allowed_origins` additions in the Worker `SMC_SF_ALLOWED_ORIGINS` variable. The Worker handles browser preflight before WordPress, so filtered origins must be present at the edge too.
