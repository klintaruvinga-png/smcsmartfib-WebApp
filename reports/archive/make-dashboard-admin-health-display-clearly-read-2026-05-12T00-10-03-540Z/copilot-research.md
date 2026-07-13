# Copilot Research: Admin health UX should be read-only and backend-driven

### 1. Issue classification
- Severity: HIGH
- Category: data-contract / wiring / Dashboard-JS
- Layer(s) affected: PHP-backend / REST-API / Dashboard-JS / CSS / workflow
- Phase impact: Phase 0 / Cross-phase

### 2. Confirmed evidence
- `src/routes/admin.tsx` fetches admin health only via `fetchAdminHealth()` and renders backend fields as static cards in the `AdminPage` component.
- `src/lib/api/sniperClient.ts` defines `fetchAdminHealth()` as `call<AdminHealthResponse>("/admin/health", { cacheBust: true })`, confirming the UI relies on a backend-owned REST source and not local health computation.
- `.github/migration/audits/phase-0-admin-health-parity-2026-05-10.md` explicitly documents the intended contract: frontend `/admin` must fetch backend payload only, not compute health truth locally.
- `.github/migration/phase-updates/phase-0-next-72h-checklist-2026-05-11.md` contains the unresolved checklist item: “Make dashboard admin health display clearly read-only and backend-driven. UI does not imply local editability or frontend authority.”
- The same `AdminPage` currently mixes backend health cards with editable baseline metadata forms and manual evidence inputs on one page.

### 3. Root cause hypothesis
- Confirmed: backend health authority is implemented correctly in the API client and route contract.
- Hypothesis: the admin UI still combines backend-owned readonly diagnostics with editable operator evidence fields in a way that blurs the boundary and may imply the dashboard itself can edit or own health state.
- Hypothesis: the visibility of editable `Field` and `TextField` controls on the same page as health status may reduce clarity around which values are backend-owned read-only status versus operator-entered soak metadata.
- Hypothesis: there is no explicit UI affordance labeling the health section as “backend-owned / read-only,” so operators may treat it as local state.

### 4. Blast radius
- Files likely affected:
  - `src/routes/admin.tsx`
  - `src/lib/api/sniperClient.ts`
  - `src/types/sniper.ts` (EngineHealth contract)
  - `.github/migration/audits/phase-0-admin-health-parity-2026-05-10.md`
  - `.github/migration/phase-updates/phase-0-next-72h-checklist-2026-05-11.md`
- Systems involved:
  - Dashboard admin health UI
  - WordPress backend REST API `/wp-json/sniper/v1/admin/health`
  - Existing backend health `/wp-json/sniper/v1/health` parity surface
  - Soak report route and admin-only diagnostic surface
- Parity surfaces at risk:
  - Dashboard-JS <-> REST-API health contract
  - `/health` payload vs `/admin/health` payload
  - Admin route generation and authentication boundary
- Risks:
  - Operator confusion between backend health status and locally editable soak evidence.
  - User perception that the dashboard can authoritatively change `feedStatus`, `backendSync`, `engineRunState`, or `twelveDataKeyStatus`.
  - Potential stale-state misinterpretation if read-only fields are not visually separated from form inputs.

### 5. Regression surface
- Must not weaken the backend source-of-truth guarantee already present in `fetchAdminHealth()`.
- Must not break the existing admin soak evidence and baseline capture workflows in `src/routes/admin.tsx`.
- Must preserve auth/permission behavior and backend parity for `/admin/health` versus `/health`.
- Existing tests in `src/routes/-admin.test.tsx` cover soak report load failure handling but do not appear to cover read-only health display semantics.
- The parity audit file is the current guard for this area and should remain valid after any UI change.

### 6. Resolution path options
- Path A: narrow UI clarification in `src/routes/admin.tsx`.
  - Keep backend health fetch intact.
  - Add explicit “Read-only backend status” labeling and visual separation for health cards.
  - Ensure any health-related summary fields are displayed as text-only and not editable inputs.
  - Keep baseline/evidence forms separate and clearly labeled as operator-entered metadata.
- Path B: broader structural separation.
  - Split admin health diagnostics into a dedicated read-only panel or sub-route.
  - Keep soak baseline/evidence capture on a separate section or page.
  - This reduces risk of user confusion but is a larger UI/route change.
- Recommended: Path A.
  - The evidence shows backend parity is already correct.
  - The primary problem is UI affordance and messaging, not data wiring.
  - A targeted read-only/labeling fix is the smallest safe correction.

### 7. Risk flags
- High-risk system involved: No, the current fix is primarily UI clarity, but it touches admin health diagnostics which are important for operator decisions.
- Requires parity re-validation: Yes — verify `/admin/health` remains backend-authoritative and the dashboard still renders backend-only fields.
- Migration-blocking: No, this is Phase 0 stabilization UI hardening, not a migration gate blocker.
- Human review required before merge: Yes — validate that the wording and visual separation correctly communicate backend ownership to operators.

### 8. Handoff package
- Epicentre files to inspect first:
  - `src/routes/admin.tsx`
  - `src/lib/api/sniperClient.ts`
  - `.github/migration/audits/phase-0-admin-health-parity-2026-05-10.md`
  - `.github/migration/phase-updates/phase-0-next-72h-checklist-2026-05-11.md`
- Inputs Codex must verify before planning:
  - Whether `AdminPage` is the only admin health display route.
  - Whether any health fields are accidentally editable or appear editable.
  - Whether the health cards should be labeled as backend-owned and read-only.
  - Whether the backend has any local fallback health computation in the UI.
- Open unknowns:
  - Exact operator expectation for “clearly read-only” semantics.
  - Whether there are additional health display elements elsewhere in the dashboard that still imply local editability.
