# SMC SuperFIB - `/admin` WordPress Hijack Patch Plan

## 1. Issue validation

**Confirmed**

- `src/routes/admin.tsx` exports `createFileRoute("/admin")`, and `src/routeTree.gen.ts` registers `/admin`. The SPA already owns that route when it is served from its standalone app host.
- `wrangler.jsonc` points the frontend at `@tanstack/react-start/server-entry`, which confirms the SPA is deployed as a standalone Cloudflare Workers app, not mounted inside WordPress.
- `src/lib/api/sniperClient.ts` defaults to `https://trader.stokvelsociety.co.za/wp-json`, so the frontend depends on the WordPress REST backend but not on WordPress serving the SPA shell.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` only registers REST routes under `/wp-json/sniper/v1/...`. There is no WordPress-side rewrite, proxy, shortcode, or template hook in this repo that would hand `/admin` to the SPA.
- Live production verification on May 10, 2026 confirmed the host-layer intercept:
  - `curl -I -L https://trader.stokvelsociety.co.za/admin`
  - Response 1: `302 Found`, `x-redirect-by: WordPress`, `location: https://trader.stokvelsociety.co.za/wp-admin/`
  - Response 2: `302 Found`, `x-redirect-by: WordPress`, `location: .../wp-login.php?redirect_to=.../wp-admin/`
- Live production verification on May 10, 2026 also confirmed the backend is healthy and separately reachable:
  - `curl -i https://trader.stokvelsociety.co.za/wp-json/sniper/v1/health`
  - Response: `200 OK` JSON from the WordPress REST backend.

**Likely**

- The standalone app host works for `/admin` because the Workers app controls route resolution there, and the WordPress site is only acting as the backend API origin.
- The safest fix is Path A: rename the SPA route away from bare `/admin` so the frontend stops colliding with a WordPress-reserved path on the root host.
- `https://smcsuperfibwebapp.klintaruvinga.workers.dev` is the primary standalone Workers host in this repo, based on the allowed-origin list in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`.

**Unconfirmed**

- Whether any CDN, proxy, or load-balancer rule outside this repo also references `/admin`.
- Whether external docs, bookmarks, onboarding flows, or operator habits depend on the old `/admin` URL.
- Whether `/dashboard-admin` is the final approved path token, or whether product wants a different non-conflicting name such as `/admin-health`.

**Rejected**

- The failure is not a missing SPA route. The route exists and is generated correctly.
- Path B, a WordPress rewrite or proxy mount for `/admin`, is not the safest fix. It would require host-layer behavior changes around a WordPress-owned admin namespace and increases the risk of collateral `wp-admin` breakage.
- Path C, changing app entry hosting, is not justified for this patch. It is a broader deployment change than the failure requires.

**Corrected root cause**

WordPress on `trader.stokvelsociety.co.za` intercepts `/admin` before the SPA can load. The frontend route is valid only on the standalone Workers host that controls its own routing. The defect is a host-routing namespace collision, not an application-router defect.

## 2. Implementation contract

**Decision**

- Recommended fix: Path A.
- Planned new SPA route: `/dashboard-admin`.
- Backend REST path stays unchanged: `/wp-json/sniper/v1/admin/health`.

### File: `src/routes/admin.tsx`

- Exact section to modify: the file itself and the `createFileRoute()` declaration.
- Exact change required:
  - Rename the file to `src/routes/dashboard-admin.tsx`.
  - Change `createFileRoute("/admin")` to `createFileRoute("/dashboard-admin")`.
- Guard rails:
  - Do not change the component render logic.
  - Do not change auth behavior.
  - Do not change any backend fetch path.
  - Do not add a client-side alias or redirect from `/admin`.
- Why in scope: this is the SPA route that collides with WordPress.
- Acceptance criterion: the admin page is reachable at `/dashboard-admin` on the standalone app host, and `/admin` is no longer claimed by the SPA.

### File: `src/routeTree.gen.ts`

- Exact section to modify: generated route registry.
- Exact change required: regenerate the file after the route rename.
- Guard rails:
  - Do not hand-edit the generated file.
  - Do not remove unrelated routes.
- Why in scope: the generated router map must reflect the renamed file-based route.
- Acceptance criterion: `/dashboard-admin` appears in the generated route tree and `/admin` no longer appears as a registered SPA route.

### File scope: `src/` SPA navigation references

- Exact section to modify: any in-app navigation target that points to `/admin`.
- Exact change required: replace SPA navigation targets from `/admin` to `/dashboard-admin`.
- Guard rails:
  - Do not touch `/admin/health` backend REST strings.
  - Do not touch `/wp-admin`.
  - Do not rewrite historical markdown artifacts under `.github/` that describe earlier point-in-time behavior.
- Why in scope: stale in-app links would silently preserve the broken path after the rename.
- Acceptance criterion: a grep of `src/` shows no SPA navigation references to `/admin`.

### File: `reports/codex-implementation.md`

- Exact section to modify: the implementation summary artifact after the real code patch lands.
- Exact change required: record the route rename, validations, and any rollout constraints that were resolved before merge.
- Guard rails:
  - Do not claim production verification that was not performed.
  - Do not record WordPress rewrite work, because it is out of scope for the chosen fix.
- Why in scope: required delivery artifact.
- Acceptance criterion: summary reflects the actual code patch and rollout checks.

### Files explicitly not in scope

- `src/lib/api/sniperClient.ts`
  - Reason: `/admin/health` is a backend REST path and must remain unchanged.
- `wrangler.jsonc`
  - Reason: current standalone Workers entry is correct for the chosen fix.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - Reason: the chosen fix does not alter WordPress routing or backend contracts.
- `.htaccess`, server rewrites, reverse proxies
  - Reason: Path B is rejected for this patch.

## 3. Patch sequence

1. Confirm the final replacement path token with human review.
   - Default recommendation: `/dashboard-admin`.
   - This is the only unresolved product-level naming decision.

2. Rename the SPA route module.
   - `src/routes/admin.tsx` -> `src/routes/dashboard-admin.tsx`
   - Update `createFileRoute("/admin")` -> `createFileRoute("/dashboard-admin")`

3. Search `src/` for any SPA links or route targets that still reference `/admin`.
   - Update only client-side navigation references.
   - Leave backend REST strings untouched.

4. Regenerate `src/routeTree.gen.ts`.

5. Run verification.
   - `npx tsc --noEmit`
   - `npm run build`
   - grep for stale `/admin` SPA references in `src/`

6. Deploy the frontend build to the standalone app host.
   - No WordPress plugin deploy is required for the chosen fix.

7. Run live smoke checks after deploy.
   - Standalone app host: `/dashboard-admin` works.
   - WordPress host: `/admin` still resolves to WordPress and no longer represents a broken SPA expectation.

**Dependencies**

- Step 4 depends on steps 2 and 3.
- Step 5 depends on step 4.
- Step 7 depends on step 6.

**Sequencing risks**

- Adding any `/admin` alias back into the SPA would recreate the host collision.
- Deploying before the route tree is regenerated risks a broken client bundle.
- Updating backend or WordPress code in the same patch widens the blast radius without solving the underlying namespace collision more safely.

## 4. Regression guards

**Required checks**

- `rg -n 'createFileRoute\\(\"/admin\"\\)|to:\\s*\"/admin\"|href=\"/admin\"|navigate\\(\\{\\s*to:\\s*\"/admin\"' src`
  - Expected: zero matches after the implementation.
- `rg -n '"/dashboard-admin"|/dashboard-admin' src/routeTree.gen.ts`
  - Expected: the new route is registered.
- `npx tsc --noEmit`
  - Expected: zero TypeScript errors.
- `npm run build`
  - Expected: clean production build.

**Protections that must still hold**

- `GET /wp-json/sniper/v1/admin/health` remains the backend-owned admin endpoint.
- `src/lib/api/sniperClient.ts` remains unchanged.
- No stale-data guard, auth boundary, or backend authority rule is weakened.

**Manual verification**

- Standalone Workers host:
  - authenticated user opens `/dashboard-admin` and the admin page renders
  - unauthenticated user opens `/dashboard-admin` and is redirected to `/login`
- WordPress host:
  - `https://trader.stokvelsociety.co.za/admin` still resolves to WordPress admin/login behavior
  - no operator-facing docs or app links still instruct users to use `/admin` for the SPA

**Diagnostics**

- Keep the `curl -I -L https://trader.stokvelsociety.co.za/admin` trace in the PR discussion or implementation summary as evidence of the original collision.
- No parity audit is required unless someone expands the patch beyond frontend route renaming.

## 5. Non-goals

- Do not add WordPress rewrite rules, proxy rules, or plugin hooks for `/admin`.
- Do not change `wrangler.jsonc`, Workers routing, or frontend hosting topology.
- Do not rename the backend REST path `/wp-json/sniper/v1/admin/health`.
- Do not add a compatibility redirect from `/admin` inside the SPA.
- Do not rewrite historical audit files solely to rename past references to `/admin`.
- Do not widen this into a broader "dashboard subdomain migration" project.

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly**

- The frontend is renamed, but stale navigation or documentation still points users to `/admin`, which silently lands them in WordPress instead of the dashboard.
- Hand-editing `src/routeTree.gen.ts` instead of regenerating it could break route matching in the SPA bundle.

**User-visible failure mode**

- Admin users continue opening `/admin` from habit or old links and see the WordPress login/admin flow instead of the dashboard page.

**Backend authority and stale-state risk**

- None from the recommended patch, provided the backend endpoint and auth rules remain untouched.

**Human approval before merge**

- Required.
- Approvals needed:
  - final path token
  - confirmation that `/admin` does not need backwards compatibility
  - confirmation that no external proxy or runbook outside this repo also needs updating

## 7. Test requirements

**Automated checks required**

- `npx tsc --noEmit`
- `npm run build`
- repo grep for stale SPA references to `/admin`

**Manual checks required**

- Standalone host smoke test for `/dashboard-admin` with and without authentication.
- WordPress host smoke test for `/admin` to confirm the collision is no longer part of the expected SPA path.

**Existing checks that must remain true**

- Public health endpoint on the WordPress backend remains reachable.
- Admin backend endpoint remains backend-owned and auth-protected.

**Testing limitation**

- This repo does not currently expose a frontend route-test harness or `npm test` script for route-level assertions. Manual route verification is part of the required rollout.

## 8. Implementation handoff

**Recommended path**

- Proceed with Path A: rename the SPA route from `/admin` to `/dashboard-admin`.

**Current research branch**

- `codex/research-this-repo-and-deployment-shape-confirm-`

**Suggested future implementation commit grouping**

1. `fix(routing): rename admin SPA route to dashboard-admin to avoid WordPress collision`
2. `chore(routing): regenerate TanStack route tree after admin route rename`

**Required artifacts**

- `.github/docs/BUG_SWEEP_REPORT_2026-05-10_admin-route-wordpress-hijack.md`
- `reports/codex-implementation.md`

**State transition**

- `READY_FOR_IMPLEMENTATION`
- `editing_locked=false`
