#  Copilot Research: SMC Intake - resolve account-sync/symbol-sync user_id handling

### 1. Issue classification
- Severity: HIGH
- Category: data-contract
- Layer(s) affected: MT5 / PHP-backend / REST-API
- Phase impact: Phase 1

### 2. Confirmed evidence
- `mt5/MarketDataEngine.mqh` — `SendAccountSync()`, `SendSymbolSync()`, `SendLicenseCheck()`, and `BuildWebhookPayload()` construct POST/GET payloads and include `user_id` usage sites (class member `wpUserId`). Evidence of JSON keys and query string construction observed in the file.
- `mt5/SMC_MarketDataEA.mq5` — `UserId` EA input documented and passed into engine `Initialize(..., userId)`.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — `permission_ea_bridge()` validates API key then extracts `user_id` via `ea_request_value()` and rejects `user_id <= 0` before binding `wp_set_current_user()`.
- `.github/migration/audits/phase-1-mt5-ea-post-init-user-id-parity-2026-05-17.md` — audit confirming code parity: EA now emits `user_id` and backend consumes it; live attach validation pending.
- Plugin tests: `wordpress/smc-superfib-sniper/tests/php/test-ea-*.php` cover heartbeat/account-sync/symbol-sync and are passing per audit.

### 3. Root cause hypothesis
- Most likely root cause: EA post-init payloads omitted or failed to include `user_id` during an earlier change, causing `permission_ea_bridge()` on the backend to reject requests as `missing user_id`. — Confirmed
- Why it fits: backend auth gate requires a positive `user_id` before any route handler runs; missing `user_id` in transport will cause an immediate 400/401/403 depending on the check. Audit and bug-sweep docs show exactly this failure pattern. — Confirmed
- Trigger hypothesis: a regression in the EA payload construction or initialization ordering after a recent refactor caused `wpUserId` not to be emitted in some post-init requests. — Hypothesis

### 4. Blast radius
- Files likely affected: `mt5/SMC_MarketDataEA.mq5`, `mt5/MarketDataEngine.mqh`, `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`, and the EA bridge tests in `wordpress/smc-superfib-sniper/tests/php/`.
- Systems affected: MT5 EA (sender), WordPress REST backend (auth & ingest), database tables `smc_sf_account_snapshots`, `smc_sf_symbol_sync`, `smc_sf_engine_runs` (ingest consumers), and downstream dashboard surfaces that read these tables.
- Parity surfaces at risk: MT5 EA <-> Backend (auth & ingest), Backend <-> Dashboard (freshness and account telemetry).
- Sequencing risks: post-init chain (license-check → account-sync → symbol-sync → heartbeat) can short-circuit if `user_id` missing, preventing downstream data writes and creating stale-state on dashboard.

### 5. Regression surface
- Risky changes: relaxing `permission_ea_bridge()` to accept missing `user_id` would widen auth semantics and potentially allow unauthorized ingest — high-risk.
- Guards to preserve: API-key validation (`X-EA-API-Key`), `ea_request_value()` precedence (JSON body before query params), and `wp_set_current_user()` binding must remain intact.
- Tests and audits: existing PHP route tests plus the Phase 1 parity audit cover the affected routes and should be re-run after any change.

### 6. Resolution path options
- Path A (narrow): Ensure EA emits `user_id` in every post-init payload (license-check query, account-sync JSON, symbol-sync JSON, heartbeat JSON). Rebuild EA, attach a live terminal, and validate the post-init chain with live logs and DB writes. Recommended: choose Path A because it preserves the backend auth model and minimizes risk.
- Path B (broader): Add a safe backend fallback (e.g., resolve an admin owner when `user_id` missing) to allow transient EA attaches while retaining audit logs. This is higher risk and requires careful human review and explicit migration gating.

### 7. Risk flags
- High-risk system involved: Yes — authentication and ingest path (affects data integrity and write ownership).
- Requires parity re-validation: Yes — MT5 bridge engine and account/symbol ingest paths (re-run Phase 1 live attach validation).
- Migration-blocking: Yes — Phase 1 gate (live bridge validation) until EA rebuild + attach verification completes.
- Human review required before merge: Yes — validate live attach evidence and confirm no permissive fallback is introduced.

### 8. Handoff package
- Epicentre files to inspect first: `mt5/MarketDataEngine.mqh`, `mt5/SMC_MarketDataEA.mq5`, `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`.
- Inputs Codex must verify before planning: current EA binary/source includes `user_id` emissions in all post-init payloads; PHP tests pass locally; live attach logs show successful `/ea/account-sync` and `/ea/symbol-sync` with `user_id` and 200 responses; DB rows written to `smc_sf_account_snapshots` and `smc_sf_symbol_sync`.
- Open unknowns: live terminal attach evidence (post-deploy), any intermittent race that still omits `user_id` on rare platforms, and whether any EA builds in circulation still lack the fix.
