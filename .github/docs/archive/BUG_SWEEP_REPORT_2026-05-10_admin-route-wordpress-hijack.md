# Bug Sweep Report - `/admin` WordPress Hijack

Date: 2026-05-10
Issue: `trader.stokvelsociety.co.za/admin` is being captured by WordPress while the SPA `/admin` route works on the standalone Workers host

## Scope

- Layer: Dashboard-JS / hosting / WordPress root-path routing
- Severity: High
- Category: Wiring / deployment-shape mismatch

## Confirmed findings

1. The SPA route exists.
   - `src/routes/admin.tsx` declares `createFileRoute("/admin")`.
   - `src/routeTree.gen.ts` registers `/admin`.

2. The frontend is deployed as a standalone Workers app, not a WordPress-mounted shell.
   - `wrangler.jsonc` uses `@tanstack/react-start/server-entry`.

3. WordPress is only the backend in this repo.
   - `src/lib/api/sniperClient.ts` points to `https://trader.stokvelsociety.co.za/wp-json`.
   - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` exposes REST routes under `/wp-json/sniper/v1/...` and does not mount SPA routes.

4. Production currently redirects `/admin` into WordPress admin.
   - Verified on 2026-05-10 with:
     - `curl -I -L https://trader.stokvelsociety.co.za/admin`
   - Observed response chain:
     - `302 Found` with `x-redirect-by: WordPress` to `/wp-admin/`
     - `302 Found` to `wp-login.php?...redirect_to=.../wp-admin/`

5. The WordPress REST backend is healthy and independent of the routing collision.
   - Verified on 2026-05-10 with:
     - `curl -i https://trader.stokvelsociety.co.za/wp-json/sniper/v1/health`
   - Response: `200 OK` JSON.

## Root cause

The application and deployment topology are split correctly for SPA + REST, but the SPA chose a root path that collides with WordPress host behavior. On the standalone Workers host, `/admin` is valid because the SPA owns path resolution. On `trader.stokvelsociety.co.za`, WordPress receives the request first and redirects `/admin` to its own admin namespace before the SPA can load.

## Safest fix decision

- Chosen direction: rename the SPA route away from `/admin`
- Recommended target: `/dashboard-admin`

## Rejected alternatives

1. WordPress rewrite or proxy mount for `/admin`
   - Rejected because it widens scope into host-layer behavior around `wp-admin`.
   - Higher regression risk than the failure warrants.

2. Changing app entry hosting
   - Rejected for this patch because it is a broader deployment migration, not the smallest safe fix.

## Files impacted by the chosen fix

- `src/routes/admin.tsx` -> rename to `src/routes/dashboard-admin.tsx`
- `src/routeTree.gen.ts` -> regenerate
- `src/` -> update any SPA navigation references to `/admin` if they exist

## Guard rails

- Keep `/wp-json/sniper/v1/admin/health` unchanged.
- Keep WordPress plugin code unchanged.
- Do not add a SPA-side `/admin` alias.
- Do not change Workers or WordPress hosting topology in the same patch.

## Required rollout checks

- `npx tsc --noEmit`
- `npm run build`
- Grep `src/` for stale SPA references to `/admin`
- Manual smoke test on the standalone app host for `/dashboard-admin`
- Manual confirmation that `/admin` on the WordPress host now remains a WordPress-owned path, not an expected SPA entry

## Open risks

- Old bookmarks or operator docs may still reference `/admin`
- External CDN or proxy rules are not discoverable from this repo and must be checked before merge
