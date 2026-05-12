# Phase 0 Soak Summary - Restart Baseline 2026-05-11

**Issue**: Complete documentation and audit: create Phase 0 soak summary, capture admin-health baseline, cross-check against tracker  
**Soak window**: 2026-05-11 08:57 SAST to 2026-05-14 08:57 SAST  
**Status on 2026-05-12**: IN PROGRESS  
**Operator**: `admin` / Admin user 1

---

## Executive summary

This artifact closes the documentation gap for the 2026-05-11 restart baseline without claiming Phase 0 closeout before the soak finishes.

- The restart baseline is documented from the exported soak report saved on 2026-05-11.
- Day 1 (`T+24h`) was marked complete in the live checklist with `no anomalies`.
- Final `T+36h`, `T+48h`, `T+60h`, and `T+72h` evidence is not available in git as of 2026-05-12, so this file does not declare PASS/FAIL for Phase 0.

---

## Baseline snapshot (`T+0`)

**Evidence source**: `C:\Users\LEONNA\Downloads\phase0-soak-2026-05-11.md`  
**Generated at**: `2026-05-11T06:57:21+00:00`  
**Baseline checkpoint time**: `2026-05-11 08:57:17 SAST`

| Field | Recorded value |
| --- | --- |
| Feed status | `stale` |
| Backend sync | `live` |
| Engine run state | `live` |
| Watchlist count | `7` |
| Live watchlist symbols | `5/7` |
| Snapshots 24h | `25` |
| Candles 24h | `90320` |
| Engine runs 24h | `84072 total`, `1030 success`, `0 error` |
| Audit events 24h | `159335 total`, `76286 error`, `76240 warning` |
| Last batch | `2026-05-11 08:57:12 SAST` |
| Last engine run | `2026-05-11 08:57:18 SAST` |
| Twelve Data key status | `ok` |
| Auth confirmed | `YES` |

**Baseline watchlist live state**

- Live: `GBPUSD`, `AUDUSD`, `BTCUSD`, `ETHUSD`, `XAUUSD`
- Not live: `NAS100`, `US30`

**Baseline blockers**

- `AUDUSD=CHOP_GATE_BLOCKED`
- `NAS100=PRICE_NOT_MT5_FRESH`
- `US30=PRICE_NOT_MT5_FRESH`
- `ETHUSD=CHOP_GATE_BLOCKED`
- `XAUUSD=INSUFFICIENT_CANDLE_HISTORY`

---

## Recorded checkpoint evidence

| Checkpoint | Time | Evidence | Notes |
| --- | --- | --- | --- |
| `T+0` | `2026-05-11 08:57 SAST` | Exported soak report | Restart baseline recorded and preserved. |
| Ad hoc restart export | `2026-05-11 16:35 SAST` | `phase0-soak-2026-05-11 (2).md` | Health remained `stale/live/live`; checkpoint note: `No change in NAS100 or US30, candles still at 0`. |
| `T+24h` | `2026-05-12 08:57 SAST` | Live checklist entry | Marked complete with comment: `Day 1 soak report exported and compared against tracker - no anomalies.` Raw export is not checked into git. |
| `T+36h` | `2026-05-12 20:57 SAST` | Not yet due at patch time | Pending. |
| `T+48h` | `2026-05-13 08:57 SAST` | Not yet due at patch time | Pending. |
| `T+60h` | `2026-05-13 20:57 SAST` | Not yet due at patch time | Pending. |
| `T+72h` | `2026-05-14 08:57 SAST` | Not yet due at patch time | Final closeout pending. |

---

## Tracker cross-check

### Confirmed matches

- The restart checklist and exported soak report agree on the `2026-05-11 08:57 SAST` baseline window.
- Baseline health remained backend-derived: `feedStatus=stale`, `backendSync=live`, `engineRunState=live`.
- The blocker set captured in the restart baseline matches the checklist summary copied into `phase-0-next-72h-checklist-2026-05-11.md`.
- Day 1 status in the checklist records `no anomalies`, and no conflicting in-repo evidence was found.

### Confirmed mismatches or scope differences

- `.github/migration/PHASE0_SOAK_TRACKER.md` still describes the original `2026-05-06` soak baseline, not the `2026-05-11` restart baseline.
- The original tracker baseline lists a different watchlist and different candle coverage than the restart baseline. This is expected historical drift, not a backend truth conflict.
- The original tracker notes `no symbols under 30 candles` at its own `T+0`; the restart baseline export records `NAS100=0`, `US30=0`, and `XAUUSD=5` under 30 candles. These statements refer to different soak windows and must not be merged.
- The restart checklist marks an admin-health markdown snapshot as already saved to repo, but no such file existed in git before this patch.

### Safe interpretation

For the restart soak, `.github/migration/phase-updates/phase-0-next-72h-checklist-2026-05-11.md` and the exported restart soak reports are the authoritative evidence chain. `PHASE0_SOAK_TRACKER.md` remains a valid Phase 0 operating guide and historical baseline, but not the numeric source of truth for the `2026-05-11` restart window.

---

## Open items before Phase 0 closeout

- Add the missing raw Day 1 export to the evidence chain if it is available outside git.
- Capture and document `T+36h`, `T+48h`, `T+60h`, and `T+72h` checkpoints.
- Write the final Phase 0 completion log and final parity audit after `T+72h`.
- Keep Phase 0 and Phase 1 board status unchanged until the final closeout evidence exists.

---

## Documentation note

The implementation contract referenced Phase 0 completion artifacts that require future soak data not yet available on 2026-05-12. The smallest safe interpretation was to complete the restart-baseline documentation lane now and leave final closeout artifacts pending the scheduled `T+72h` checkpoint.
