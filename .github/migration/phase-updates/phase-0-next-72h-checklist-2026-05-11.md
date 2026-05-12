# Phase 0 Next 72h Checklist - 2026-05-11

## Soak Window

- Baseline report source: `C:\Users\LEONNA\Downloads\phase0-soak-2026-05-11.md`
- Baseline report generated: `2026-05-11 08:57 SAST`
- Soak restart baseline window: `2026-05-11 08:57 SAST` to `2026-05-14 08:57 SAST`
- Current baseline facts from the attached report:
  - Feed status: `stale`
  - Backend sync: `live`
  - Engine run state: `live`
  - Watchlist count: `7`
  - Live watchlist symbols at baseline: `5/7`
  - Snapshots 24h: `25`
  - Candles 24h: `90320`
  - Engine runs 24h: `84072 total`, `1030 success`, `0 error`
  - Active blockers at baseline: `AUDUSD=CHOP_GATE_BLOCKED`, `NAS100=PRICE_NOT_MT5_FRESH`, `US30=PRICE_NOT_MT5_FRESH`, `ETHUSD=CHOP_GATE_BLOCKED`, `XAUUSD=INSUFFICIENT_CANDLE_HISTORY`

## Rules During This Window

- Keep the baseline as-is. Do not delete, overwrite, or recreate baseline soak rows once confirmed.
- Treat the backend as source of truth for health, snapshot, and soak evidence.
- Safe parallel work may harden UI, tests, and backend logic, but must not mutate or reset the active soak baseline.
- If a defect is discovered during monitoring, capture evidence first, then patch surgically.

## 1. Immediate T+0 to T+1h

| Status | Step | Completed At (SAST) | Comments |
|---|---|---|---|
| [x] | Confirm the baseline row exists in `wp_smc_sf_soak_checkpoints` for the 2026-05-11 restart. |2026-05-11 10:15:17  |baseline exists|
| [x] | Confirm `/admin/soak-report` exposes `baseline_checkpoint` for the active soak. | complete | backend route now implemented and can return baseline checkpoint; verify live response once authenticated. |
| [x] | Export or print the current baseline report from the admin page and record where it was saved. |2026-05-11 10:20  | Saved in downloads |
| [x] | Record the current admin-health payload as a repo markdown snapshot. Suggested file: `.github/migration/audits/phase-0-admin-health-baseline-2026-05-11.md`. |2026-05-11 10:01  |file saved to repo |
| [x] | Cross-check the restart state against `.github/migration/PHASE0_SOAK_TRACKER.md` and add a restart note if needed. |  | checked & good |
| [x] | Record the operator responsible for the 72h window. | 2026-05-11 10:31  |opertor is Admin user 1  |

## 2. Scheduled Soak Monitoring

Update each checkpoint with the exact fetch time, observed health values, and any anomaly notes.

| Status | Checkpoint | Target Time (SAST) | What To Record | Completed At (SAST) | Comments |
|---|---|---|---|---|---|
| [X] | T+0 | 2026-05-11 08:57 | Baseline confirmation, baseline export, `feedStatus`, `backendSync`, `engineRunState`, watchlist live count, blockers |  |  |
| [X] | T+6h | 2026-05-11 14:57 | Same fields plus snapshot/candle/engine-run growth vs baseline |  |  |
| [x] | T+12h | 2026-05-11 20:57 | Same fields plus any stale/live transition anomalies | Saved as 24h checkpoint  |  |
| [x] | T+24h | 2026-05-12 08:57 | Day 1 summary, export fresh soak report, compare against tracker | 2026-05-12 | Day 1 soak report exported and compared against tracker - no anomalies. |
| [ ] | T+36h | 2026-05-12 20:57 | Same fields plus admin health parity spot-check |  |  |
| [ ] | T+48h | 2026-05-13 08:57 | Day 2 summary, export fresh soak report, compare against tracker |  |  |
| [ ] | T+60h | 2026-05-13 20:57 | Same fields plus unresolved blocker review |  |  |
| [ ] | T+72h | 2026-05-14 08:57 | Final soak summary, final export, go or no-go for Phase 0 closeout |  |  |

## 3. What To Verify At Every Scheduled Check

| Status | Verification Step | Completed At (SAST) | Comments |
|---|---|---|---|
| [ ] | Confirm `feedStatus` is still backend-derived and not showing a false `live` state. |  |  |
| [ ] | Confirm `backendSync` remains `live` and `engineRunState` remains `live` unless there is a captured incident. |  |  |
| [ ] | Record baseline vs current watchlist live symbols count and list any symbols that dropped or recovered. |  |  |
| [ ] | Record whether `last batch` and `last engine run` ages look consistent with an active MT5 feed. |  |  |
| [ ] | Record whether 24h aggregates are growing plausibly: snapshots, candles, engine runs, audit events. |  |  |
| [ ] | Record whether the active blocker set changed, especially MT5 freshness or insufficient-candle cases. |  |  |
| [ ] | Export a new soak report immediately if the admin UI or health payload looks inconsistent. |  |  |

## 4. Event-Driven Monitoring

Use this section whenever something happens outside the scheduled checkpoints.

| Status | Trigger | Required Action | Completed At (SAST) | Comments |
|---|---|---|---|---|
| [ ] | `feedStatus` changes unexpectedly | Capture `/admin`, `/admin/soak-report`, and health payload evidence before any fix. |  |  |
| [ ] | A symbol loses MT5 freshness or candle coverage regresses | Record the symbol, timestamp, route payload, and whether the issue is backend truth or UI drift. |  |  |
| [ ] | `/health` and `/admin/health` disagree | Save both payloads and note which fields diverged. |  |  |
| [ ] | Export or print action fails | Capture the UI error, route response, and browser/network evidence. |  |  |
| [ ] | Admin page shows baseline/checkpoint ambiguity | Capture the UI state before applying any UX patch. |  |  |

## 5. Safe Parallel Work Lane

These items are safe to run during the soak because they harden presentation, contracts, and tests without resetting the soak state.

### 5.1 Documentation And Audit

| Status | Task | Deliverable | Completed At (SAST) | Comments |
|---|---|---|---|---|
| [x] | Create the current Phase 0 soak summary from the 2026-05-11 baseline. | `.github/migration/phase-updates/phase-0-soak-summary-2026-05-11.md` | 2026-05-12 | Restart-baseline summary added without claiming T+72h closeout before the soak completes. |
| [x] | Capture the current admin-health baseline as markdown evidence. | `.github/migration/audits/phase-0-admin-health-baseline-2026-05-11.md` | 2026-05-12 | Repo artifact created from the exported baseline soak report plus established `/health` and `/admin/health` parity evidence. |
| [x] | Cross-check baseline data against `PHASE0_SOAK_TRACKER.md` and log any mismatches. | Soak summary note | 2026-05-12 | Logged restart-baseline drift vs the original 2026-05-06 tracker baseline; no backend truth conflict found. |

### 5.2 UI Polish

| Status | Task | Acceptance Target | Completed At (SAST) | Comments |
|---|---|---|---|---|
| [ ] | Make baseline vs checkpoint distinction clearer on `/admin`. | Baseline and checkpoint states are visually and textually distinct. |  |  |
| [x] | Add explicit baseline-exists warning or status on `/admin`. | Operator can immediately see that a baseline already exists and should not be replaced. | 2026-05-12 | Closed by admin baseline warning lock patch. |
| [ ] | Surface baseline and checkpoint age more prominently. | Age is visible without opening secondary details. |  |  |
| [ ] | Improve print/export formatting for the soak report. | Printed or exported report is readable and keeps evidence sections intact. |  |  |
| [ ] | Harden `admin.tsx` error handling around `/admin/soak-report`. | Failures show explicit operator-facing status instead of silent breakage. |  |  |
| [x] | Make dashboard admin health display clearly read-only and backend-driven. | UI does not imply local editability or frontend authority. | 2026-05-12 | Closed by PR #140. |

### 5.3 Backend And EA Parity Hardening

| Status | Task | Acceptance Target | Completed At (SAST) | Comments |
|---|---|---|---|---|
| [x] | Audit MT5 snapshot persistence. | `wp_smc_sf_snapshots` writes use `source='mt5'` consistently. | 2026-05-12 | Verified on both `/snapshot` and EA ingest paths; `/snapshot` now audits and skips explicit non-`mt5` source attempts. |
| [x] | Verify MT5 snapshot timestamp authority. | `updated_at` tracks MT5 quote timestamp, not receipt time. | 2026-05-12 | Verified by PHP regression harness for tick-bearing vs freshness-only `/snapshot` writes and existing EA stream coverage. |
| [x] | Verify backend health parity. | `GET /wp-json/sniper/v1/health` and `GET /wp-json/sniper/v1/admin/health` use the same payload builder. | 2026-05-12 | Revalidated through shared `build_health_payload()` path plus PHP and frontend admin-route regressions. |
| [x] | Expand snapshot contract coverage. | Tests cover `post_snapshot()` auth, `state='live'`, and timestamp handling. | 2026-05-12 | Expanded `test-mt5-snapshot-contract.php` and added service-level non-MT5 source filtering coverage. |
| [x] | Audit `smc_sf_engine_snapshot` invalidation. | Watchlist changes invalidate stale engine snapshots cleanly. | 2026-05-12 | Revalidated watchlist mutation invalidation and added targeted `/snapshot` live/non-live transition invalidation plus cache-currentness coverage. |

## 6. Regression Checks For Every Parallel Patch

| Status | Regression Check | Completed At (SAST) | Comments |
|---|---|---|---|
| [ ] | Confirm the patch does not delete or rewrite active soak evidence rows. |  |  |
| [ ] | Confirm no API contract drift was introduced without tests. |  |  |
| [ ] | Confirm `/admin`, `/admin/soak-report`, `/health`, and `/admin/health` still load with backend-authoritative data. |  |  |
| [ ] | Confirm export or print still works after UI changes. |  |  |
| [ ] | Confirm snapshot and watchlist changes do not break engine snapshot invalidation behavior. |  |  |

## 7. Final 72h Closeout

| Status | Step | Completed At (SAST) | Comments |
|---|---|---|---|
| [ ] | Export the final T+72h soak report. |  |  |
| [ ] | Summarize baseline vs T+72h deltas: health, watchlist live symbols, blockers, snapshot growth, candle growth, engine-run growth. |  |  |
| [ ] | Mark whether Phase 0 soak passed or failed based on observed evidence. |  |  |
| [ ] | List any unresolved defects that must block Phase 0 closeout. |  |  |
| [ ] | Link the final summary, tracker updates, and any UI or backend hardening PR or commit references. |  |  |

## Operator Notes

| Date / Time (SAST) | Note |
|---|---|
|  |  |
| 2026-05-12 | Documentation lane completed for the 2026-05-11 restart baseline. Final Phase 0 closeout remains blocked on T+72h evidence scheduled for 2026-05-14 08:57 SAST. |
|  |  |
|  |  |
|  |  |

