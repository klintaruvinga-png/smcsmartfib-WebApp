# Bug Sweep Report - 2026-05-12

## Issue

Complete regression checks for parallel patches: confirm no soak evidence deletion, no API contract drift, verify admin routes load correctly, confirm export/print works, verify snapshot invalidation intact.

## Scope

This pass was verification-only. No product code was changed. The goal was to confirm the existing Phase 0 admin, soak, and snapshot surfaces still hold after parallel patch landing.

## Verified Results

### Pass

1. Build integrity
   - Command: `npm run build`
   - Result: passed
   - Notes: production client and SSR bundles built successfully. Current output hashes include `dist/client/assets/index-eKtx9GvE.js` and `dist/client/assets/styles-DB-eCWFu.css`. No pre-patch hash artifact existed in-repo, so hash-to-baseline comparison could not be completed.

2. Snapshot invalidation PHP regression harness
   - Command: `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
   - Result: passed
   - Confirmed:
     - symbol-set mismatch invalidates fresh snapshots
     - watchlist adds/removes invalidate `smc_sf_engine_snapshot`
     - canonical watchlist persistence still clears stale symbol snapshots

3. Admin route rendering regression suite
   - Command: `npx vitest run --environment jsdom src/routes/-admin.test.tsx`
   - Result: passed
   - Confirmed:
     - backend-owned health section renders
     - denial state renders
     - soak-report retry/error handling renders
     - baseline/checkpoint sections render
     - baseline lock and warning behavior render

4. Soak evidence payload validation
   - Command: `node --test src/lib/api/soakEvidence.test.ts`
   - Result: passed
   - Confirmed:
     - invalid `evidence_type` values are rejected before network calls
     - whitelisted evidence types are accepted

5. Soak report API client contract
   - Command: `npx vitest run --environment jsdom src/lib/api/sniperClient.test.ts`
   - Result: passed
   - Confirmed:
     - `fetchSoakReport()` accepts the full backend payload on 200
     - surfaced backend errors are preserved on 500

6. Runtime route registration on the configured WordPress backend
   - Backend root: `https://trader.stokvelsociety.co.za/wp-json`
   - Result: passed
   - Confirmed from the live REST index:
     - `/sniper/v1/admin/health` registered with `GET`
     - `/sniper/v1/admin/soak-report` registered with `GET`
     - `/sniper/v1/admin/soak-evidence` registered with `POST`
     - `/sniper/v1/admin/soak-checkpoint` registered with `POST`
     - `/sniper/v1/snapshot` registered with `GET` and `POST`

7. Runtime auth protection on live backend
   - Commands:
     - `Invoke-WebRequest https://trader.stokvelsociety.co.za/wp-json/sniper/v1/admin/health`
     - `Invoke-WebRequest https://trader.stokvelsociety.co.za/wp-json/sniper/v1/admin/soak-report`
     - `Invoke-WebRequest https://trader.stokvelsociety.co.za/wp-json/sniper/v1/snapshot`
   - Result: passed
   - Confirmed:
     - unauthenticated requests return `401`
     - protected routes are present and not exposed publicly

### Blocked

1. Soak evidence deletion history against the live database
   - Blocker: no database access or pre-patch row snapshot was available in this workspace
   - Impact: live row-count preservation and historical no-delete verification remain unconfirmed at runtime

2. WordPress object cache flush and re-prime check
   - Blocker: no WP-CLI or admin shell access for the live site was available in this workspace
   - Impact: live cache freshness for `/admin/soak-report` remains unconfirmed

3. Authenticated admin route load in the browser
   - Blocker: admin access depends on `sessionStorage` app-password credentials or a WordPress nonce in a real browser session; neither was present in the workspace
   - Additional blocker: the Browser Use workflow could not be completed because the required Node REPL browser-control tool was not exposed in this session
   - Impact: actual `/admin` page load, health-card render, and console cleanliness remain unconfirmed in a live authenticated browser

4. Export markdown and print preview
   - Blocker: same authenticated browser-session dependency as above
   - Impact: live file download behavior and print-preview rendering remain unconfirmed

5. Live snapshot invalidation after watchlist mutation
   - Blocker: requires authenticated app interaction plus backend state mutation against the live WordPress environment
   - Impact: runtime re-fetch timing within one poll cycle remains unconfirmed outside the PHP regression harness

## Validation Notes

1. `npx vitest run` against the full repository is not a reliable top-level pass/fail command here.
   - It pulls `node:test` files into Vitest and reports "No test suite found".
   - It also runs the DOM-based admin test without `jsdom` unless `--environment jsdom` is supplied.
   - This was treated as a runner-selection issue, not a product regression.

2. No parity audit was generated.
   - The contract and plan both state parity re-validation is not required for this verification pass.

## Risk Verdict

- Confirmed regression in product logic: none
- Confirmed regression in API contract: none
- Confirmed regression in snapshot invalidation guardrails: none in repo-local and PHP harness coverage
- Remaining risk: live authenticated runtime checks are still open because the required WordPress/browser access was not available from this workspace

## Required Manual Follow-up

1. Log into the production-backed dashboard as a WordPress administrator and open `/admin`.
2. Confirm backend health cards render and the browser console stays clean.
3. Export the soak report and verify the file is named `phase0-soak-YYYY-MM-DD.md` and contains baseline, checkpoint, and evidence sections.
4. Open print preview and confirm only the soak report print section remains visible.
5. Submit a test evidence row, reload, and confirm persistence.
6. Mutate the watchlist and confirm the snapshot is invalidated and refreshed within one poll cycle.
