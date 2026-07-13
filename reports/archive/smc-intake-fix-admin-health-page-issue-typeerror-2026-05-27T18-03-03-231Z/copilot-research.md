## SMC SuperFIB - Admin Health Page: feedStatus TypeError Research

**Date:** 2026-05-27
**SMC_ISSUE:** SMC Intake - Fix admin Health page issue: TypeError reading 'feedStatus' in index-HU_NwOvP.js

---

### 1. Intake validation

- Payload present: yes
- Single-line: yes
- Contains template tokens: no

Normalized SMC_ISSUE: SMC Intake - Fix admin Health page issue: TypeError reading 'feedStatus' in index-HU_NwOvP.js

---

### 2. Observed evidence

- Console error (user-provided stack): `TypeError: Cannot read properties of undefined (reading 'feedStatus')` in compiled bundle `index-HU_NwOvP.js`.
- Screenshot: Engine Fault overlay "Cannot read properties of undefined (reading 'feedStatus')" on Admin/Health page.
- Quick source scan: `src/routes/admin.tsx` and related components reference `health.feedStatus` and `aggregate.health.feedStatus` without optional chaining in render paths.
- API/backing shape: Backend exposes `/admin/health` and snapshot/checkpoint payloads via `wordpress/smc-superfib-sniper` plugins; `build_health_payload()` generates `feedStatus` server-side but persisted snapshots may omit `health` in some rows.

---

### 3. Reproduction steps (recommended)

1. Open Dashboard Admin → Health page with a user that has at least one checkpoint snapshot.
2. Observe Engine Fault overlay and console error when `checkpoint.snapshot_data` lacks `health` or when `/admin/health` response is incomplete.
3. Reproduce by loading a saved checkpoint JSON where `snapshot_data` omits `health` (see Inputs below for how to extract failing rows).

---

### 4. Root-cause hypothesis

- The Admin UI assumes `health` is always present on the admin health payload or on persisted checkpoint snapshot blobs. When `aggregate` or `health` is `undefined`, code attempts to read `feedStatus` and throws.
- Likely sources: older persisted snapshots lacking `health`, partial backend responses, or a recent change in snapshot shape. The compiled stack trace pointing at `index-*.js` matches unguarded property access in `src/routes/admin.tsx`.

---

### 5. Immediate mitigation options

- Option 1 (Recommended, low risk): Add defensive guards in the Dashboard UI to avoid reading `feedStatus` from `undefined`. Replace occurrences with safe access and fallbacks, e.g. `health?.feedStatus ?? health?.priceFeed ?? 'unknown'` and `aggregate?.health?.feedStatus ?? aggregate?.health?.priceFeed ?? 'unknown'`.
- Option 2 (Medium): Server-side hardening—validate and backfill missing `health` for persisted snapshots, add save-time validation so `snapshot_data` always contains `health` (requires DB migration for existing rows).
- Option 3 (Comprehensive): Do both Option 1 and 2: quick UI fix now, backend migration later.

---

### 6. Files to inspect first (epicentre)

- src/routes/admin.tsx — HealthCard and Checkpoint rendering
- src/components/HealthCard.tsx (if present) — direct `health` usage
- src/lib/api/sniperClient.ts — `getAdminHealth()` / Admin health response typing
- wordpress/smc-superfib-sniper/smc-superfib-sniper.php — `build_health_payload()` and snapshot persistence
- wordpress/class-market-data-service.php — checkpoint/snapshot insertion and shape

---

### 7. Inputs for Codex plan hardening (required)

1. One or more raw DB rows (JSON) for failing checkpoint(s) from `wp_smc_sf_snapshots` or `soak_checkpoints` that caused the crash (include `id` and `snapshot_data` blob).
2. The exact backend version used to generate those snapshots (plugin commit or release tag), to check `build_health_payload()` behavior.
3. Confirmation whether the UI bundle referenced (`index-HU_NwOvP.js`) is current source-to-deploy mapping.
4. Any recent commits altering snapshot persistence or `build_health_payload()` shape.

---

### 8. Recommended next steps for Codex planning

1. Plan immediate UI defensive change: scan `src/routes/admin.tsx` and related components and replace unguarded `health.feedStatus` accesses with safe access and sensible fallbacks.
2. Add unit/test coverage for rendering checkpoint snapshots that lack `health` to prevent regressions.
3. Plan backend validation/migration to backfill missing `health` in persisted snapshot blobs (Path B) as a follow-up.

---

### 9. Notes / Risk flags

- Risk: UI crash affects Admin Health page availability — HIGH
- Migration-blocking: No
- Human review: Yes for backend migration; UI defensive PR low-risk but still requires review

---

Saved by Copilot intake.

