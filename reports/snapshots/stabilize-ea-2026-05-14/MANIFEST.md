# Snapshot Archive for stabilize-ea-2026-05-14

## Initial State
- File: INITIAL-20260514T000000Z.json
- Timestamp: 2026-05-14T00:00:00Z
- Branch: claude/serene-hopper-VFRyT
- Commit: da4720ebac830eb4757ebe04501f75a3c131ee18

## Findings
- File: FINDINGS-20260514T000100Z.json
- Issues found: 3 (1 MEDIUM, 2 LOW)
  - BUG-001: Stream_timestamp null bypass — staleness guards skipped when timestamp absent
  - BUG-002: Stale_data HTTP status 400 should be 422
  - INFO-001: Duplicate test labels in test-ea-market-stream.php

## Pre-Patch
- File: PRE-PATCH-20260514T000200Z.json
- Rollback tag: rollback/stabilize-ea-2026-05-14-before-patches

## Patch Snapshots
- Files: AFTER-PATCH-1-20260514T000300Z.json
- Tags: rollback/stabilize-ea-2026-05-14-after-patch-1
- Patches:
  - PATCH-1 (BUG-001): M1 + M15 server-time fallback for $stream_timestamp
  - PATCH-2 (BUG-002): Stale rejection HTTP 400 → 422
  - PATCH-3 (INFO-001): Test label numbering fix + Test 11 regression guard

## Final State
- File: FINAL-20260514T000400Z.json
- Commit: 1da5b02c9c290d873b807226ff0bdedff897fc5c
- Ready for deployment: YES
- All 11 EA market stream tests: PASS
- All 12 regression suites: PASS
- MQL5 include check: PASS
- PHP -l syntax: PASS

## Rollback Points
- snapshot/stabilize-ea-2026-05-14-start-20260514T000000Z (initial state)
- rollback/stabilize-ea-2026-05-14-before-patches (before any patch)
- rollback/stabilize-ea-2026-05-14-after-patch-1 (after patch cluster 1)
