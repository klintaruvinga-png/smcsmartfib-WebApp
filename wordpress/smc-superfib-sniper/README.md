# SMC SuperFIB Sniper REST Backend

Install `smc-superfib-sniper.php` as a WordPress plugin on `trader.stokvelsociety.co.za`.

## Runtime contract

- REST namespace: `/wp-json/sniper/v1`
- Auth: logged-in WordPress user + `X-WP-Nonce`
- Twelve Data key: submitted from the frontend, encrypted in WordPress, never returned by REST
- Execution: queues backend-confirmed LTF SF ladder orders only; no broker placement in v1

## Frontend env

```env
VITE_SNIPER_BACKEND_URL=https://trader.stokvelsociety.co.za/wp-json
VITE_SNIPER_MOCK_MODE=false
```

If the frontend is served from a separate origin, add that origin through the `smc_sf_allowed_origins` filter so WordPress can return credentialed CORS headers.
