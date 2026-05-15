# Phase 0 Admin Health Baseline - 2026-05-11

## Scope

Record the backend-authoritative admin health baseline for the Phase 0 restart soak that began on `2026-05-11 08:57 SAST`.

This artifact documents the baseline evidence now present in git. It does not claim final `T+72h` parity re-validation.

## Evidence sources

- `C:\Users\LEONNA\Downloads\phase0-soak-2026-05-11.md`
- `.github/migration/archive/phase-0-updates-prior-to-2026-05-15/phase-0-next-72h-checklist-2026-05-11.md`
- `.github/migration/audits/phase-0-admin-health-parity-2026-05-10.md`
- `.github/migration/audits/phase-0-dashboard-admin-health-parity-2026-05-12.md`

## Baseline snapshot

**Baseline report generated**: `2026-05-11T06:57:21+00:00`  
**Baseline checkpoint**: `2026-05-11 08:57:17 SAST`

| Field | Baseline value | Evidence source |
| --- | --- | --- |
| `feedStatus` | `stale` | Exported soak report `Health` section |
| `backendSync` | `live` | Exported soak report `Health` section |
| `engineRunState` | `live` | Exported soak report `Health` section |
| `twelveDataKeyStatus` | `ok` | Exported soak report `Manual Evidence` |
| `lastBatchAt` | `2026-05-11 08:57:12 SAST` | Exported soak report `Health` section |
| `lastEngineRunAt` | `2026-05-11 08:57:18 SAST` | Exported soak report `Health` section |
| `auth` confirmation | `true` | Exported soak report `baseline.auth_confirmed` |
| Health endpoint recorded at baseline | `https://smcsmartfib.lovable.app/wp-json/sniper/v1/health` | Exported soak report `baseline.backend_health_endpoint` |

## Backend authority cross-check

1. Existing parity audits already confirm `GET /wp-json/sniper/v1/admin/health` and `GET /wp-json/sniper/v1/health` use the same backend payload builder.
2. The baseline values above were captured from the backend-owned soak export, not reconstructed from frontend UI state.
3. No frontend-owned health truth, local override, or stale-data bypass was introduced by this patch.

## Result

PASS FOR BASELINE CAPTURE

- The restart-baseline health evidence is now present in git as a formal artifact.
- Backend authority remains preserved.
- Final `T+72h` health comparison is still pending and must be handled by the closeout audit.

## Known limitation

The exact raw `admin/health` JSON payload captured on `2026-05-11` was not present in git before this patch. This artifact is therefore reconstructed from the exported soak report plus existing parity audits that prove `/admin/health` and `/health` share the same payload contract. No missing fields were invented.
