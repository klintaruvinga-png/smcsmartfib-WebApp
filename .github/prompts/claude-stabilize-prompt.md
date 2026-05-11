# SMC SuperFIB Stabilization, EA Integration, Snapshot, and Rollback Workflow

You are working inside the **SMC SuperFIB** codebase at the repository root.

This is an **active implementation workflow**, not a passive analysis task.

Your job is to stabilize the current plugin structure, verify the existing
backend/dashboard/signal-engine wiring, confirm the MT5 EA sender integration
path, apply only safe surgical fixes, and leave the system fully
snapshot-protected and rollback-ready.

Do not redesign the platform.
Do not rewrite large systems.
Preserve the current architecture and plugin structure.

---

## Architecture at a Glance

| Layer | Location | Deployment |
|---|---|---|
| WordPress plugin | `wordpress/smc-superfib-sniper/` | trader.stokvelsociety.co.za |
| Frontend dashboard | `src/` (React + TanStack Start) | Cloudflare Workers/Pages |
| MT5 EA | `mt5/` (MQL5 `.mq5` / `.mqh`) | MT5 terminal |
| Scripts | `scripts/` | local / CI |

**REST namespace**: `sniper/v1`
**Backend base URL**: `https://trader.stokvelsociety.co.za/wp-json`
**Full EA route**: `POST https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream`

---

## Current Development Status

The project is in the **MT5-native migration / Phase 0 soak** phase.

### Known current state

- The SMC SuperFIB dashboard is a **React/TanStack Start** SPA deployed to
  Cloudflare. It is **not** a WordPress PHP template.
- Backend logic lives in the **WordPress plugin**
  (`wordpress/smc-superfib-sniper/smc-superfib-sniper.php` and
  `class-market-data-service.php`).
- The REST API client lives in `src/lib/api/sniperClient.ts`.
- Frontend auth utilities are in `src/lib/auth.ts`.
- TypeScript types are in `src/types/sniper.ts`.
- Mocks live in `src/mocks/sniperData.ts`.
- MT5 EA MQL5 source is in `mt5/SMC_MarketDataEA.mq5` and the companion
  `.mqh` include files.
- Plugin PHP regression tests are in
  `wordpress/smc-superfib-sniper/tests/php/`.
- Workflow state is written at runtime to `.smc-workflow-state.json`.
  **This file is local-only.** It is listed in `.gitignore` and
  `.github/workflows/02-implementation.yml` fails CI with a hard error if it
  is ever found in a commit (`test ! -f .smc-workflow-state.json`). Never
  `git add` this file. Read it; do not stage or commit it.

### EA route — already implemented

The route `POST /wp-json/sniper/v1/ea/market-stream` **exists** and uses the
`permission_ea_market_stream` callback. Do not create a duplicate.

**Authentication model (actual)**

| Header | Value |
|---|---|
| `X-EA-API-Key` | Shared secret — checked via `hash_equals` against `SMC_SF_EA_API_KEY` |

`SMC_SF_EA_API_KEY` is read from the PHP constant or `getenv()` fallback.
The header aliases `X-API-KEY`, `x-ea-api-key`, `x_ea_api_key`, `x_api_key`
are also accepted.

**The payload must include `user_id`** — the permission callback uses it to
bind writes to a concrete WordPress user context via `wp_set_current_user()`.
Without a valid `user_id`, the request is rejected with `400`.

### Diagnostic route behavior

`GET /wp-json/sniper/v1/authority-diagnostics?symbol=EURUSD` returns HTTP 401
for unauthenticated requests. **This is expected** — the route uses
`permission_user` which requires a logged-in WordPress session. Do not make
it public to satisfy curl testing.

Admin routes (`/admin/health`, `/admin/soak-report`, `/admin/soak-evidence`,
`/admin/soak-checkpoint`) require `manage_options` capability.

### Available scripts

```
npm run lint          # eslint across all src/
npm run build         # vite build
npm run check:mql     # MQL5 include validator (mt5/)
npm run pipeline      # pipeline watcher
```

There is no `npm test`, no `phpunit` CLI script, and no `composer test`
target. Static syntax checks must be used for PHP verification.

---

## Primary Goal

Stabilize and harden the current SMC SuperFIB system while confirming
reliable MT5 EA price and candle streaming end-to-end.

The workflow must:

1. Create a complete initial snapshot before changes.
2. Inspect the current plugin, dashboard, REST routes, signal engine, refresh
   engine, and migration files.
3. Confirm the real current route structure before editing.
4. Verify authentication and permission callbacks for all relevant REST routes.
5. Confirm the EA market-stream ingestion route is wired correctly.
6. Patch only confirmed issues.
7. Preserve backend signal authority.
8. Add stale-data and payload validation guards where missing.
9. Add regression protection where possible.
10. Create post-patch snapshots and rollback tags.
11. Generate a clear final report.

---

## Systems In Scope

Inspect and maintain the existing implementation across:

- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `wordpress/smc-superfib-sniper/class-market-data-service.php`
- `wordpress/smc-superfib-sniper/tests/php/`
- `src/lib/api/sniperClient.ts`
- `src/lib/auth.ts`
- `src/types/sniper.ts`
- `src/hooks/useSniperData.ts`, `useStreamingTicks.ts`, `useTickFlash.ts`
- `src/routes/` (all route files)
- `src/mocks/sniperData.ts`
- `mt5/SMC_MarketDataEA.mq5` and companion `.mqh` files
- `scripts/`
- `.smc-workflow-state.json` (**read-only — never commit; see warning above**)
- `.github/migration/` (parity audits, soak tracker)
- `.github/docs/` (bug sweep reports)
- `reports/` (snapshots, pipeline artifacts)

---

## Strict Operating Rules

Follow these rules exactly:

- Do not redesign the architecture.
- Do not perform broad rewrites.
- Do not rename public APIs unless they are clearly broken.
- Do not weaken authentication.
- Do not expose private diagnostic routes publicly.
- Do not make authenticated browser-only routes serve as EA ingestion routes.
- Do not fake live status from fetch time.
- Do not let stale quotes or stale candles qualify signals.
- Do not move signal truth to the frontend.
- Do not alter Pine/MQL5 trading formulas unless proven parity corruption
  exists.
- Do not change UI layout unless the UI is broken.
- Use the smallest safe patch.
- Preserve existing behavior unless it is confirmed incorrect.
- Add guards rather than bypassing validation.
- Every patch cluster must have a rollback point.
- Every major stage must have a snapshot.
- Every generated JSON snapshot must be readable and parseable.

---

## Required Execution Pipeline

Execute the following stages in order.

### Stage 0 — Repository and Plugin Structure Discovery

Before patching anything:

- Detect current branch.
- Detect current commit hash.
- Check for uncommitted changes (check `.smc-workflow-state.json` for
  `editing_locked`).
- Read `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` to confirm the
  registered REST routes and permission callbacks.
- Read `wordpress/smc-superfib-sniper/class-market-data-service.php` for
  market data handling.
- Locate all references to `ea/market-stream` in the codebase.
- Confirm which routes are public, which require WordPress session login, and
  which use EA API key auth.
- Locate `src/lib/api/sniperClient.ts` and read the `call()` function to
  confirm how auth headers are attached.
- Locate `.smc-workflow-state.json` and read it.
- Do not assume file names. Confirm them from the actual repo.

### Stage 1 — Initial Snapshot and Rollback Prep

Before scanning or patching, create an initial snapshot.

Create directory:

```
reports/snapshots/[WORKFLOW_ID]/
```

Use a workflow ID based on the current branch slug or a generated timestamp
slug, e.g. `stabilize-ea-2026-05-11`.

Create:

```
reports/snapshots/[WORKFLOW_ID]/INITIAL-[timestamp].json
```

Snapshot must include:

```json
{
  "snapshot_type": "INITIAL",
  "workflow_id": "...",
  "timestamp": "...",
  "git": {
    "branch": "...",
    "commit_hash": "...",
    "remote": "origin",
    "uncommitted_changes_count": 0
  },
  "repo_structure": {
    "plugin_root": "wordpress/smc-superfib-sniper",
    "plugin_files": [],
    "rest_route_files": [],
    "frontend_api_client": "src/lib/api/sniperClient.ts",
    "mt5_ea_files": [],
    "migration_files": []
  },
  "app_state": {
    "workflow_state_file_exists": true,
    "workflow_state": {}
  },
  "known_dev_status": {
    "authority_diagnostics_requires_wp_session": true,
    "ea_market_stream_route_exists": true,
    "ea_auth_header": "X-EA-API-Key",
    "ea_auth_secret_env": "SMC_SF_EA_API_KEY",
    "ea_payload_requires_user_id": true,
    "migration_phase": "MT5-native migration / Phase 0 soak"
  }
}
```

Then:

- Tag current HEAD:
  ```
  git tag snapshot/[WORKFLOW_ID]-start-[timestamp]
  ```
- If there are uncommitted changes, document them.
- Do not discard existing work.
- Create an empty rollback manifest:
  ```
  reports/snapshots/[WORKFLOW_ID]/ROLLBACK-MANIFEST.json
  ```

### Stage 2 — REST API and Authentication Audit

Inspect the current WordPress REST API structure from the actual plugin file.

Confirm:

- REST namespace (currently `sniper/v1`).
- All registered routes, HTTP methods, and permission callbacks.
- Which endpoints require WordPress browser session (`permission_user`).
- Which endpoints require WordPress admin session (`permission_admin`).
- Whether `ea/market-stream` permission callback correctly validates:
  - `X-EA-API-Key` header presence.
  - `SMC_SF_EA_API_KEY` configured.
  - `hash_equals` comparison.
  - `user_id` in payload.
  - `wp_set_current_user` binding.
- Whether the EA route rejects missing token, invalid token, missing
  `user_id`, and invalid `user_id`.

Important:

- The current 401 from `authority-diagnostics` is **not a bug**.
- Do not make `authority-diagnostics` public.
- The EA route already exists — confirm it is correctly implemented, do not
  create a duplicate.

### Stage 3 — EA Market Stream Contract Verification

Confirm the expected EA payload contract against what the plugin validates.

The EA route should accept:

```json
{
  "user_id": 1,
  "symbol": "EURUSD",
  "timeframe": "M1",
  "source": "MT5",
  "server_time": "2026-05-11T12:32:10Z",
  "quote_time": "2026-05-11T12:32:09Z",
  "bid": 1.08521,
  "ask": 1.08534,
  "spread": 1.3,
  "candles": [
    {
      "time": "2026-05-11T12:31:00Z",
      "open": 1.0851,
      "high": 1.0855,
      "low": 1.0849,
      "close": 1.0853,
      "tick_volume": 123
    }
  ]
}
```

Note: `user_id` is required at the auth layer, not just the handler.

Verify or implement validation for:

- `symbol` — present, non-empty, recognized.
- `timeframe` — present, supported value.
- `source` — present.
- `quote_time` — parseable ISO timestamp; must not be stale (reject if older
  than configured threshold, e.g. 60 seconds).
- `candles[*].time` — parseable; must not pre-date `quote_time` by an
  unreasonable margin.
- `bid`, `ask` — finite positive numbers.
- `spread` — finite non-negative number.
- OHLC fields — finite numbers, high ≥ max(open, close), low ≤ min(open,
  close).
- `tick_volume` — non-negative integer.
- Missing required fields → structured 400 error.
- Invalid numeric values → structured 400 error.
- Stale `quote_time` → structured 422 error.

Never accept stale or malformed market data as live.

### Stage 4 — EA Authentication Verification

Confirm the existing `permission_ea_market_stream` implementation is complete
and correct:

- `X-EA-API-Key` is read from the request headers (all four alias variants).
- `SMC_SF_EA_API_KEY` is read from the PHP constant or `getenv()`.
- `hash_equals()` is used — not `==` or `===`.
- Missing token → 401.
- Unconfigured secret → 503 with an `error_log` entry.
- Invalid token → 403.
- Missing `user_id` → 400.
- Invalid `user_id` → 403.
- `wp_set_current_user($ea_user_id)` is called before returning `true`.

If any of the above are missing or incorrect, apply the smallest safe patch.

Do not expose the token in frontend JavaScript or any public endpoint.
Document exactly how the MT5 EA should send the token (see curl examples
below).

### Stage 5 — Runtime, Wiring, and Data Flow Audit

Inspect the full path:

```
MT5 EA → POST /wp-json/sniper/v1/ea/market-stream
       → permission_ea_market_stream (auth + user bind)
       → post_ea_market_stream handler
       → class-market-data-service.php (state/cache update)
       → signal engine
       → GET /wp-json/sniper/v1/snapshot (frontend poll)
       → src/lib/api/sniperClient.ts → apiClient.getSnapshot()
       → useSniperData hook
       → React route rendering
```

Inspect for:

- Missing route consumers or producers.
- Broken dashboard fetches (`sniperClient.ts` `call()` function).
- State fields written in the EA handler but never read by the signal engine.
- State fields read by the dashboard but never populated by the EA handler.
- Duplicate refresh loops in frontend hooks.
- Stale cache paths.
- Empty catches or silent failures.
- Async race conditions in `useSniperData.ts`.
- Mismatched payload field names between the EA MQL5 sender and the PHP
  handler.

### Stage 6 — Refresh and Stale-State Audit

Inspect:

- `useStreamingTicks.ts`, `useSniperData.ts` polling intervals.
- Cache update logic in `class-market-data-service.php`.
- Quote freshness logic — is `age_sec` populated from `quote_time` or from
  fetch time?
- Candle freshness logic — are candle timestamps validated server-side?
- Frontend `FreshnessBadge.tsx` — does it use `age_sec` from the backend or
  compute its own age from page-load time?
- `VerdictBadge.tsx` — does it gate on backend `is_live` flag or derive live
  status locally?

Detect and fix any path where:

- Fetch time is treated as market data time.
- Stale data is marked live.
- Frozen prices remain valid past freshness threshold.
- Signal engine runs without fresh candles.
- Frontend displays live status without backend confirmation.
- Cache success is treated as market movement.

### Stage 7 — Signal Engine Integrity Audit

Verify:

- Signal readiness rules in `class-market-data-service.php`.
- Regime gating and chop blocking.
- Candle requirements before signal generation.
- Entry/SL/TP consistency.
- Backend/live reconciliation.
- Signal persistence and deduplication.

Flag any path where:

- Signal engine falsely reports LIVE.
- Stale prices qualify signals.
- Dashboard and backend disagree on signal state.
- Frontend overrides backend truth.
- EA stream updates do not reach signal readiness logic.

After this stage, create:

```
reports/snapshots/[WORKFLOW_ID]/FINDINGS-[timestamp].json
```

Include:

```json
{
  "snapshot_type": "FINDINGS",
  "workflow_id": "...",
  "timestamp": "...",
  "confirmed_issues": [
    {
      "id": "BUG-001",
      "severity": "CRITICAL",
      "system": "EA Market Stream",
      "description": "...",
      "root_cause": "...",
      "impact_zones": ["REST API", "Signal Engine", "Dashboard"],
      "proposed_fix": "..."
    }
  ],
  "statistics": {
    "total_issues": 0,
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0
  }
}
```

**Do not patch before the FINDINGS snapshot is created.**

### Stage 8 — Migration Parity Validation

Validate current parity across:

- MT5 EA MQL5 logic (`mt5/*.mqh`) vs. PHP plugin calculations.
- Backend calculations vs. dashboard rendering.

Check:

- Fib anchor and level calculations.
- Regime classification.
- Chop logic.
- Signal generation thresholds.
- Entry/SL/TP derivation.
- Symbol normalization (see `mt5/SymbolNormalizer.mqh`).
- Timeframe normalization.
- Timestamp handling (UTC everywhere).

Reference existing parity audits in `.github/migration/audits/` — especially:

- `phase-0-ea-authority-rate-limit-parity-2026-05-06.md`
- `phase-0-mt5-authority-parity-2026-05-03.md`
- `phase-0-freshness-authority-parity-2026-05-04.md`

Do not change MQL5 or Pine formulas unless parity corruption is proven.
If parity drift is found, document exact drift and source.

### Stage 9 — Surgical Patching Phase

Before applying patches:

- Tag rollback point:
  ```
  git tag rollback/[WORKFLOW_ID]-before-patches
  ```
- Create:
  ```
  reports/snapshots/[WORKFLOW_ID]/PRE-PATCH-[timestamp].json
  ```

For every confirmed issue:

- Identify root cause.
- Apply the smallest safe patch.
- Preserve architecture.
- Add defensive validation.
- Improve diagnostics where useful.
- Add or update regression tests in
  `wordpress/smc-superfib-sniper/tests/php/` where possible.
- Verify no weakening of stale-data protection.
- Verify backend remains the source of truth.
- Verify the frontend dashboard still compiles (`npm run build`).

Patch priority:

1. EA route auth and payload validation gaps.
2. Stale/freshness correctness.
3. Signal readiness correctness.
4. REST contract mismatches.
5. Dashboard rendering truth.
6. Migration parity blockers.
7. Cleanup only if safe and provably unused.

After each patch cluster:

```
git tag rollback/[WORKFLOW_ID]-after-patch-[N]
```

Create:

```
reports/snapshots/[WORKFLOW_ID]/AFTER-PATCH-[N]-[timestamp].json
```

Update rollback manifest.

### Stage 10 — Testing and Verification

Run the available project checks:

```bash
npm run lint
npm run build
npm run check:mql
```

Also perform PHP static syntax checks on modified plugin files:

```bash
php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php
php -l wordpress/smc-superfib-sniper/class-market-data-service.php
```

There is no `npm test`, no `phpunit` CLI, and no `composer test` script.
Document that automated test coverage requires these to be set up if the
checks above pass but no unit tests run.

At minimum verify:

- PHP syntax passes on all modified PHP files.
- JS/TS build (`npm run build`) succeeds.
- `npm run lint` passes with no new errors.
- `npm run check:mql` passes on MT5 files.
- EA endpoint rejects missing `X-EA-API-Key`.
- EA endpoint rejects invalid `X-EA-API-Key`.
- EA endpoint rejects missing `user_id`.
- EA endpoint rejects malformed payload.
- EA endpoint rejects stale `quote_time`.
- EA endpoint accepts a valid fresh payload.
- Dashboard does not mark stale data as live.
- Signal engine does not run on stale data.
- `authority-diagnostics` still returns 401 for unauthenticated requests.
- Admin routes still require `manage_options`.

### Stage 11 — Rollback Manifest

Maintain:

```
reports/snapshots/[WORKFLOW_ID]/ROLLBACK-MANIFEST.json
```

Format:

```json
{
  "workflow_id": "...",
  "created_at": "...",
  "branch": "...",
  "initial_commit": "...",
  "rollback_points": [
    {
      "name": "Initial state",
      "tag": "snapshot/[WORKFLOW_ID]-start-[timestamp]",
      "commit_hash": "...",
      "snapshot_file": "INITIAL-[timestamp].json",
      "command": "git reset --hard [commit_hash]"
    },
    {
      "name": "Before patches",
      "tag": "rollback/[WORKFLOW_ID]-before-patches",
      "commit_hash": "...",
      "snapshot_file": "PRE-PATCH-[timestamp].json",
      "command": "git reset --hard [commit_hash]"
    }
  ],
  "emergency_rollback": {
    "command": "git checkout main && git reset --hard origin/main"
  }
}
```

### Stage 12 — Final Snapshot

Before the final report, create:

```
reports/snapshots/[WORKFLOW_ID]/FINAL-[timestamp].json
```

Include:

```json
{
  "snapshot_type": "FINAL",
  "workflow_id": "...",
  "timestamp": "...",
  "git": {
    "branch": "...",
    "commit_hash": "...",
    "tags_created": []
  },
  "patches_applied": [],
  "tests": {
    "commands_run": ["npm run lint", "npm run build", "npm run check:mql", "php -l ..."],
    "passing": true,
    "failures": []
  },
  "ea_integration_status": {
    "market_stream_route": "POST /wp-json/sniper/v1/ea/market-stream",
    "auth_required": true,
    "auth_header": "X-EA-API-Key",
    "secret_env": "SMC_SF_EA_API_KEY",
    "user_id_required": true,
    "payload_validation": true,
    "stale_rejection": true
  },
  "rollback": {
    "manifest": "ROLLBACK-MANIFEST.json",
    "rollback_points_count": 0
  }
}
```

### Stage 13 — Required Reports

#### Bug Sweep Report

Save:

```
.github/docs/BUG_SWEEP_REPORT_[YYYY-MM-DD].md
```

Follow the template in `.github/docs/BUG_SWEEP_REPORT_TEMPLATE.md`. Include:

- Executive Summary (health, bugs found, fixes applied, remaining risks,
  migration readiness, snapshot archive, rollback command).
- Confirmed Problems (severity, root cause, impact, files affected).
- Surgical Fixes Applied (files changed, logic hardened, regression
  protection, rollback points before and after).
- EA Integration Status (route, auth model, required header, `user_id`
  requirement, payload contract, validation status, stale-data rejection).
- Parity Verification (Pine/MQL5 vs. backend, backend vs. dashboard,
  backend vs. MT5, known drift).
- Regression Checklist.
- Remaining Risks.
- Safe Deployment Order.
- Rollback Procedure.

#### Parity Audit Report

Save:

```
.github/migration/audits/phase-0-mt5-ea-market-stream-parity-[YYYY-MM-DD].md
```

Use `PARITY_REPORT_TEMPLATE.md` in `.github/migration/audits/` as the base.
Include:

- Route parity.
- Payload parity (MQL5 field names vs. PHP handler field names).
- Timestamp parity (UTC handling in EA vs. plugin).
- Fib parity.
- Signal-readiness parity.
- Known blockers.
- Acceptance criteria.

#### Snapshot Manifest

Create:

```
reports/snapshots/[WORKFLOW_ID]/MANIFEST.md
```

Include:

```markdown
# Snapshot Archive for [WORKFLOW_ID]

## Initial State
- File: INITIAL-[timestamp].json
- Timestamp:
- Branch:
- Commit:

## Findings
- File: FINDINGS-[timestamp].json
- Issues found:

## Pre-Patch
- File: PRE-PATCH-[timestamp].json
- Rollback tag:

## Patch Snapshots
- Files:
- Tags:

## Final State
- File: FINAL-[timestamp].json
- Commit:
- Ready for deployment:

## Rollback Points
- snapshot/[WORKFLOW_ID]-start-[timestamp]
- rollback/[WORKFLOW_ID]-before-patches
- rollback/[WORKFLOW_ID]-after-patch-[N]
```

---

## EA Testing Commands

After verification, provide curl commands using the **actual** implemented
auth model.

### Missing token test

```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -d '{"user_id":1,"symbol":"EURUSD"}'
```

Expected response (401):

```json
{
  "code": "smc_sf_api_key_missing",
  "message": "X-EA-API-Key or X-API-KEY header required.",
  "data": { "status": 401 }
}
```

### Invalid token test

```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: wrong-token" \
  -d '{"user_id":1,"symbol":"EURUSD"}'
```

Expected response (403):

```json
{
  "code": "smc_sf_api_key_invalid",
  "message": "Invalid API key.",
  "data": { "status": 403 }
}
```

### Missing user_id test

```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{"symbol":"EURUSD"}'
```

Expected response (400):

```json
{
  "code": "smc_sf_user_required",
  "message": "user_id is required for EA ingest.",
  "data": { "status": 400 }
}
```

### Valid full payload test

```bash
curl -X POST "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream" \
  -H "Content-Type: application/json" \
  -H "X-EA-API-Key: YOUR_TOKEN_HERE" \
  -d '{
    "user_id": 1,
    "symbol": "EURUSD",
    "timeframe": "M1",
    "source": "MT5",
    "server_time": "2026-05-11T12:32:10Z",
    "quote_time": "2026-05-11T12:32:09Z",
    "bid": 1.08521,
    "ask": 1.08534,
    "spread": 1.3,
    "candles": [
      {
        "time": "2026-05-11T12:31:00Z",
        "open": 1.0851,
        "high": 1.0855,
        "low": 1.0849,
        "close": 1.0853,
        "tick_volume": 123
      }
    ]
  }'
```

---

## Success Conditions

The workflow is successful only if all of the following are true:

- [ ] Initial snapshot exists.
- [ ] Findings snapshot exists.
- [ ] Pre-patch snapshot exists.
- [ ] Final snapshot exists.
- [ ] Rollback manifest exists.
- [ ] Rollback tags are created.
- [ ] Current REST route structure is documented.
- [ ] `authority-diagnostics` remains protected (401 for unauthenticated).
- [ ] EA ingestion route `POST /sniper/v1/ea/market-stream` is confirmed or
      repaired.
- [ ] EA route uses `X-EA-API-Key` / `SMC_SF_EA_API_KEY` shared-secret auth.
- [ ] EA route requires valid `user_id` in payload.
- [ ] EA payload validation exists (stale quotes rejected, malformed payloads
      rejected).
- [ ] Backend authority is preserved (signal truth lives in WordPress plugin,
      not the React frontend).
- [ ] Dashboard does not fake live state.
- [ ] Signal engine does not run on stale data.
- [ ] `npm run lint`, `npm run build`, and `npm run check:mql` pass.
- [ ] PHP `-l` syntax check passes on all modified plugin files.
- [ ] Final bug sweep report saved to `.github/docs/`.
- [ ] Parity audit saved to `.github/migration/audits/`.
- [ ] Deployment and rollback instructions are documented.

---

## Final Output Required From Coder

At completion, provide a concise final summary with:

- Files inspected.
- Files changed.
- REST routes found (all `sniper/v1/*`).
- REST routes added or modified.
- Auth model confirmed for EA route.
- Payload contract confirmed or patched.
- Bugs found (with IDs).
- Bugs fixed.
- Commands run and their results.
- Snapshot files created.
- Rollback tags created.
- Remaining risks.
- Exact curl command to test EA ingestion.
- Exact rollback command.

Do not stop at analysis.

Complete the scan, patch, snapshot, rollback, and report workflow.
