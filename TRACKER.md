# SMC SuperFIB WebApp (smcsmartfib-WebApp) — Progress Tracker

Product type: trading-dashboard
Status: active
Priority: high
Last updated: 2026-07-20
Synced from: EOM/projects.json

## Milestones

| Milestone | Due | Status |
|-----------|-----|--------|
| Backend migration (restore backend-2) | — | in_progress |
| Pine/MT5 FIB parity verified | — | pending |

## Workstreams / Tasks

| ID | Task | Status | Owner |
|----|------|--------|-------|
| SMC-01 | Backend migration restoration (backend-2-restoration-plan) | Done | — |
| SMC-02 | Pine/MT5 FIB parity checks | blocked | — |
| SMC-03 | EA/backend bridge | Pending | — |
| SMC-04 | Dashboard plan cards | Pending | — |
| SMC-05 | Workflow runner state stabilization | Pending | — |
| SMC-06 | Vibe-Trading agent: trade journal + risk limits workflow | Done | — |

## Blockers / Risks

- SMC-02 (blocked: wait for backend live + login) (med)
- SMC-07 (tooling error, low priority) (low)

## Notes

Trading dashboard + Vibe-Trading agent. Pine/MT5 parity rules. Monorepo: Vite frontend, Nitro backend, MT5 bridge. Check .smc-workflow-state.json before changes. Do not force push / delete branches. 3 GitHub Actions workflows present.

## Changelog
- 2026-07-20 — Synced from EOM/projects.json by sync_trackers.py
- 2026-07-20 — SMC-06 implemented: trade journal + risk-limit workflow (PR #434). Migration 005 + base 001-004 applied to Supabase Dev (remote confirmed up to date). Routes live-ready.
