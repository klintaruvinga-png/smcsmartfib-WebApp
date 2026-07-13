# 1. Issue classification
- Severity: HIGH
- Category: stale-data
- Layer(s) affected: PHP-backend / REST-API / Dashboard-JS
- Phase impact: Cross-phase

# 2. Confirmed evidence
- The backend live-signal route is served by `get_live_signals()` in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`, which returns `ensure_engine_snapshot($user_id)` output directly.
- The snapshot cache is implemented in `ensure_engine_snapshot()` / `save_engine_snapshot()` / `is_engine_snapshot_current()` in the same PHP file; the route can therefore return a previously saved snapshot instead of forcing recomputation on every request.
- The frontend fetch path in `src/lib/api/sniperClient.ts` calls `call("/live-signals")` with no `cacheBust: true`, so the browser is not forcing a no-store fetch for the live-signal endpoint.
- The React Query hook in `src/hooks/useSniperData.ts` uses `useQuery({ queryKey: ["live-signals"], ... refetchInterval: enabled ? pollMs : false })` but does not override the global `staleTime: 10_000` from `src/router.tsx`, so cached data can remain fresh-looking for a short window.
- The current plugin code has no explicit `Cache-Control`, `Pragma: no-cache`, or `nocache_headers` logic for the live-signal REST path. The archived plugin in `wordpress/_archive/Old_plugin/.../sniper-webhook.php` does set `Cache-Control: no-store, no-cache, must-revalidate` and `Pragma: no-cache` on the dashboard HTML path, which is the clearest authority reference for the intended anti-cache behavior.

# 3. Root cause hypothesis
- Most likely root cause: the live-signal path is exposed to both backend snapshot reuse and missing cache-busting, so the dashboard can render older signal data even after the backend has generated newer signals.
- Why this fits the evidence:
  - `Confirmed`: the live-signal route depends on `ensure_engine_snapshot()`, which can short-circuit and reuse a cached snapshot.
  - `Confirmed`: `src/lib/api/sniperClient.ts` does not add `cacheBust: true` to the `/live-signals` fetch.
  - `Confirmed`: the current plugin does not emit anti-cache headers on the REST surface, unlike the archived plugin behavior that did.
  - `Hypothesis`: LiteSpeed or another intermediary is caching the endpoint response, which is why the symptom appears to clear only after a cache flush and hard refresh.

# 4. Blast radius
- Every file likely affected:
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `src/lib/api/sniperClient.ts`
  - `src/hooks/useSniperData.ts`
  - `src/router.tsx`
  - `wordpress/_archive/Old_plugin/SMC-SmartFIB-v12.0.9-Base-codex-v12.0.9.1Working/sniper-webhook.php`
- Every system that reads from or writes to the broken component:
  - PHP engine snapshot cache writes the `signals` payload
  - REST `/live-signals` returns that cached payload to the dashboard
  - React Query polling renders the cached payload in the UI
- Every parity surface at risk:
  - Backend snapshot output vs frontend live-signal rendering
  - REST freshness vs browser/intermediary caching
  - Snapshot authority vs visible signal freshness

# 5. Regression surface
- What currently working behavior could break if patched incorrectly:
  - The existing polling model must remain intact; this is not a redesign of the live-signal path.
  - Snapshot freshness and stale-data guards in the PHP engine path must not be weakened.
  - The backend-authority snapshot logic must continue to preserve the current MT5 / market-data precedence.
- Existing guards, stale-data protections, or validation paths that must not be weakened:
  - `ensure_engine_snapshot()` still controls when the snapshot is recomputed.
  - The backend snapshot itself remains the source of truth for the live-signal payload.
- Tests, audits, or reports that appear to cover this area today:
  - `src/hooks/useSniperData.test.tsx` covers cache behavior for `engine-health` and `user-progress`, but not the `live-signals` path specifically.

# 6. Resolution path options
- Path A: narrowest plausible correction surface
  - Fix the live-signal fetch and cache contract only: force no-store / cache-busting on `/live-signals`, and ensure the query path does not inherit a stale cache window.
- Path B: broader structural risk area if the narrow path is unsafe
  - Re-audit the backend snapshot cache contract itself if the stale response persists after the fetch/cache fixes.
- Recommended: Path A first, because it addresses the obvious stale-response path while preserving backend authority, snapshot architecture, and the current polling model.

# 7. Risk flags
- High-risk system involved: Yes — stale live-signal output directly affects the dashboard’s frontend truth and can mislead trading decisions.
- Requires parity re-validation: Yes — backend snapshot output and dashboard signal rendering must both be validated after any fix.
- Migration-blocking: Yes — this affects live signal freshness confidence in the current stabilization phase.
- Human review required before merge: Yes — because this is a cache/freshness path and the fix must not change the authority model.

# 8. Handoff package
- Epicentre files to inspect first:
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `src/lib/api/sniperClient.ts`
  - `src/hooks/useSniperData.ts`
  - `src/router.tsx`
- Inputs Codex must verify before planning:
  - Whether the deployment environment is actually caching `/wp-json/sniper/v1/live-signals`.
  - Whether the live-signal endpoint can safely emit anti-cache headers without breaking auth/session requirements.
  - Whether the `live-signals` query needs an explicit stale-time override for the polling contract.
- Open unknowns that could invalidate the current hypothesis:
  - Whether the deployed environment uses LiteSpeed or another edge cache on the REST path.
  - Whether the backend snapshot cache is invalidated frequently enough to explain the stale behavior even without an external cache layer.

