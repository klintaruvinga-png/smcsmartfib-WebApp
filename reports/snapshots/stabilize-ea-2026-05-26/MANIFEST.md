# Snapshot Archive for stabilize-ea-2026-05-26

> **Rollback note**: Git tags for this workflow exist locally only — the environment
> prevented pushing them to the remote. All rollback commands below use commit hashes,
> which are always authoritative. Do not rely on tag names for remote operations.

## Initial State
- File: INITIAL-20260526T000000Z.json
- Timestamp: 2026-05-26T00:00:00Z
- Branch: claude/nice-fermat-28hKb
- Commit: 6a5262058670d2aa1fac56a249236f8666156515

## Findings
- File: FINDINGS-20260526T000200Z.json
- Issues found: 2 (1 MEDIUM, 1 LOW)
- MEDIUM: BUG-001 — invalid bid/ask values return 200 OK instead of structured error
- LOW: BUG-002 — Prettier formatting drift (12 lint errors)

## Pre-Patch
- File: PRE-PATCH-20260526T000100Z.json
- Commit: 6a5262058670d2aa1fac56a249236f8666156515
- Note: Lint auto-fix applied before any logic patches

## Patch Snapshots
- Files: AFTER-PATCH-1-20260526T001000Z.json
- Commit: 41db480bd2dcf3e6ea3c9b9b985a27d79aaf2e06

## Final State
- File: FINAL-20260526T001500Z.json
- Commit: 9ea2ae16 (docs commit — see ROLLBACK-MANIFEST.json for full hashes)
- Ready for deployment: YES (all checks pass)

## Rollback Points (commit hashes only)

| Point | Commit | Command |
|-------|--------|---------|
| Initial state | `6a5262058670d2aa1fac56a249236f8666156515` | `git reset --hard 6a5262058670d2aa1fac56a249236f8666156515` |
| Before patches | `6a5262058670d2aa1fac56a249236f8666156515` | `git reset --hard 6a5262058670d2aa1fac56a249236f8666156515` |
| After Patch 1 | `41db480bd2dcf3e6ea3c9b9b985a27d79aaf2e06` | `git reset --hard 41db480bd2dcf3e6ea3c9b9b985a27d79aaf2e06` |
