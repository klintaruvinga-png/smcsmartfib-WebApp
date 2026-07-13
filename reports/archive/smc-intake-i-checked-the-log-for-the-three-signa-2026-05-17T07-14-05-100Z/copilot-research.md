### 1. Issue classification
- Severity: HIGH
- Category: runtime-bug
- Layer(s) affected: MT5 / PHP-backend / REST-API
- Phase impact: Phase 1

### 2. Confirmed evidence
- User-provided log sample contains repeated backend failures: `SMC SuperFIB EA bridge auth failed: missing user_id.` around 2026-05-16 11:48:18–11:48:19 UTC.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` implements `permission_ea_bridge()` and rejects missing `user_id` with 400 and `smc_sf_user_required`.
- `wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php` validates that `GET /ea/license-check` uses `permission_ea_bridge`, allows valid requests, and fails predictable auth errors when authentication or payload is missing.
- `.github/docs/BUG_SWEEP_REPORT_2026-05-17.md` explicitly documents `EA Auth — missing user_id` as a correct 400 failure and confirms the Phase 1 bridge routes are implemented but live validation is pending.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` logs `SMC SuperFIB: CORS configuration inconsistency detected.` in the plugin init guard, indicating a separate configuration warning path that can coexist with the auth failure.
- `.github/migration/audits/phase-0-mt5-ea-market-stream-parity-2026-05-17.md` confirms `/wp-json/sniper/v1/ea/license-check` is registered and uses `permission_ea_bridge`.
- No `license allowed` or `license blocked` evidence is present in the reported log sample, consistent with an early auth rejection before the license decision layer.

### 3. Root cause hypothesis
- Confirmed: The backend auth callback is rejecting the EA bridge request because `user_id` is absent or zero in the EA payload, causing `permission_ea_bridge()` to fail before license-check behavior can execute.
- Hypothesis: The MT5 EA or request assembly path for `GET /ea/license-check` is omitting or dropping `user_id`, likely during payload serialization, query encoding, or request construction.
- Hypothesis: The CORS inconsistency warning is a separate non-fatal diagnostic and is not the direct cause of the missing `user_id` auth failure.
- Hypothesis: Because `license-check` is a GET endpoint, the request may be using a payload transmission mode that is not delivering JSON to the auth callback as expected.

### 4. Blast radius
- Files likely affected:
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php`
  - `reports/phase-1-ea-bridge-implementation-report.md`
  - `wordpress/smc-superfib-sniper/README.md` (allowed origins/CORS guidance)
  - MT5 EA client code path that generates `GET /ea/license-check`
- Systems affected:
  - EA MT5 client bridge auth sequence
  - WordPress REST API auth middleware
  - Phase 1 license-check gate
  - Backend write path bound to `wp_set_current_user()` for EA ingest
- Parity surfaces at risk:
  - MT5 then PHP bridge contract for `user_id`
  - Phase 1 gateway auth semantics vs. live EA payload handling
  - Dashboard live truth only if the EA ingest sequence is blocked from establishing an active license session
- Any stale-state/cache risks: low, because the failure occurs in auth prior to license decision and persistence.

### 5. Regression surface
- Must not weaken the `user_id` requirement in `permission_ea_bridge()`; this guard is essential to bind ingest writes to the correct WordPress user.
- Must preserve API key validation and alias support for `X-EA-API-Key` / `X-API-KEY` and 4 header forms.
- Must preserve 400/403 semantics for missing vs invalid `user_id` and keep `wp_set_current_user($ea_user_id)` on success.
- Existing regression assets include `wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php`, `test-cors-regression.php`, and the Phase 1 bridge migration audit documents.
- If the fix changes request handling for `GET /ea/license-check`, it should not open a route that bypasses `permission_ea_bridge` or accepts anonymous requests.

### 6. Resolution path options
- Path A: narrow corrective surface in the MT5 EA bridge request payload path so that `user_id` is always included and delivered to `permission_ea_bridge()` for `/ea/license-check`. This keeps the backend contract unchanged and addresses the observed missing-field failure directly.
- Path B: broaden the bridge auth handler to accept `user_id` from alternate GET request sources if the current API design allows it, such as query parameters or a different payload encoding mechanism, while still enforcing the same auth semantics.
- Recommended: Path A, because the backend already intentionally enforces `user_id` and the evidence points to the payload being missing rather than backend auth logic being incorrect.

### 7. Risk flags
- High-risk system involved: Yes — Phase 1 EA bridge auth and license-check gate is critical for MT5 access.
- Requires parity re-validation: Yes — MT5/PHP bridge contract for `user_id` and license-check request encoding.
- Migration-blocking: Yes — this impacts Phase 1 live bridge validation and the Phase 1 gate for EA route readiness.
- Human review required before merge: Yes — auth boundary fixes and Phase 1 gate behavior should be reviewed to avoid weakening backend authority.

### 8. Handoff package
- Epicentre files to inspect first:
  - `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - `wordpress/smc-superfib-sniper/tests/php/test-ea-license-check.php`
  - `.github/docs/BUG_SWEEP_REPORT_2026-05-17.md`
- Inputs Codex must verify before planning:
  - How the MT5 EA constructs and sends `GET /ea/license-check` payload data.
  - Whether `user_id` is expected as JSON body, query parameter, or another transport mechanism for that route.
  - Whether the CORS inconsistency warning is unrelated or could affect request delivery.
  - That `permission_ea_bridge()` should still reject missing `user_id` with 400.
- Open unknowns:
  - The exact live MT5 payload shape for the failed `license-check` request.
  - Whether the log entry corresponds to `/ea/license-check` specifically or another EA bridge endpoint using the same auth callback.
  - Whether a GET request body is being dropped by the PHP request parser in this environment.
