# Migration Agent Quick Reference

## Two-Agent System

The migration system uses **two specialized agents working together**:

1. **Stabilization Agent** (`/smc-stabilization`): Full-stack code inspection, bug detection, parity validation, surgical fixes
2. **Migration Manager Agent** (`/mt5-migration`): Phase tracking, report auto-ingestion, escalation, weekly status

---

## Agent 1: Stabilization Agent (`/smc-stabilization`)

Comprehensive full-stack scanning, patching, and hardening.

### Commands

| Command | Returns | When to Use |
|---------|---------|-------------|
| `Phase 0 full scan` | Full-stack bug scan + fixes + parity audit | Start of phase or periodic verification |
| `Phase [X] parity check [engine]` | Parity audit for fib/regime/signal | Before phase advancement |
| `Fix stale-loop blocker` | Diagnose + apply surgical fix + regression tests | Responding to stale-loop escalation |
| `Verify fib parity Phase 4` | Detailed fib anchor/level/zone comparison | Phase 4 readiness |
| `Audit signal engine` | Signal readiness, regime gating, entry/SL/TP consistency | Phase 6 dual-run validation |
| `Wiring audit` | DOM hooks, event listeners, REST endpoints, state fields | Detecting missing integrations |

### Output

**Bug Scan Report** (auto-saved):
```
.github/docs/BUG_SWEEP_REPORT_[YYYY-MM-DD].md
```

**Parity Audit** (auto-saved):
```
.github/migration/audits/phase-[X]-[engine]-parity-[YYYY-MM-DD].md
```

**Auto-ingested by Migration Manager every 30 min** ✅

---

## Agent 2: Migration Manager Agent (`/mt5-migration`)

### Phase Diagnostics

| Command | Returns | When to Use |
|---------|---------|-------------|
| `Phase 0 readiness check` | Full audit: status, branches, criteria, parity, blockers | Before phase transition |
| `Phase status board` | All 11 phases with % progress, blockers, owners | Quick overview |
| `Validate parity Phase 4` | Latest parity audit + trend + corrective actions | Verify engine accuracy |
| `Risk assessment` | All blockers (CRITICAL/HIGH/MEDIUM), dependencies, team gaps | Sprint planning |

### Automated Reporting

| Command | Returns | Frequency |
|---------|---------|-----------|
| `Generate weekly status` | `.github/migration/weekly-reports/weekly-status-[DATE].md` | Manual (auto Sun 00:00 UTC) |
| `Branch activity report` | Track A/B/C branches, commit velocity, stalled work | On-demand |
| `Review blockers` | All active escalations with severity + corrective actions | On-demand |

### Data Ingestion

| Command | Input | Auto-Parsed |
|---------|-------|------------|
| `Ingest bug report [filename]` | `.github/docs/BUG_SWEEP_REPORT_*.md` | CRITICAL/HIGH issues, parity metrics, timeline impact |
| `Ingest parity report [filename]` | `.github/migration/audits/*parity*.md` | Fib/regime/signal %, drift analysis |
| `Ingest phase update [filename]` | `.github/migration/phase-updates/*.md` | Deliverables ✓/✗, success criteria pass/fail |

### Escalation Handling

| Command | Triggered When | Returns |
|---------|----------------|---------|
| `Phase [X] blocker: [issue]` | Manual user report | Severity + impact + corrective plan |
| `Parity alert: [engine] dropped to [X]%` | Manual user report | Drift analysis + root causes + re-test strategy |
| Auto-escalation (immediate) | Blocker detected in bug scan OR parity drops | Severity assessment + recommended actions |

### Creation & Updates

| Command | Creates | Location |
|---------|---------|----------|
| `Create Phase 4 checklist` | Task list with success criteria | `.github/migration/phase-updates/` |
| `Update Phase 0 status: complete` | Marks phase done, checks prerequisites for Phase 1 | Updates `../migration-status.md` |

---

## Data Sources (Monitored Every 30 min)

| Source | What Agent Extracts |
|--------|-------------------|
| Git branches (`mt5-*`, `backend-*`, `dashboard-*`) | Active track work, commit velocity, stalled branches |
| Commit messages | Phase signals ("Phase 4 parity 98.5%"), blockers ("Blocker: stale-loop") |
| `.github/docs/BUG_SWEEP_REPORT_*.md` | CRITICAL/HIGH issues, parity metrics, severity levels |
| `.github/migration/audits/*.md` | Fib/regime/signal parity %, drift analysis, evidence |
| `../migration-status.md` | Current phase, deliverables, prerequisites |

---

## Automatic Escalation Examples

### Example 1: Parity Drops Below Threshold

**Trigger**: Bug scan report ingested showing "Fib parity 98.2% (threshold 99%)"

**Escalation**:
```
🚨 **ESCALATION: CRITICAL — Phase 4 Fib Parity Drift**

Issue: Fib parity dropped from 99.5% → 98.2%
Severity: Blocks Phase 5 advancement
Evidence: ./audits/phase-4-fib-parity-2026-05-03.md

Immediate Actions:
1. Review recent MT5 fib engine changes (commits in mt5-phase-4-* branches)
2. Run historical replay on affected pairs
3. Compare Pine vs MT5 anchor detection
4. Re-run parity audit and confirm >99%
```

### Example 2: Critical Blocker Detected

**Trigger**: Bug scan report shows "Stale-loop deadlock detected in backend freshness engine"

**Escalation**:
```
🚨 **ESCALATION: CRITICAL — Phase 0 Blocker: Stale-Loop Deadlock**

Issue: Backend freshness engine enters deadlock after ~48h of continuous refresh
Severity: Blocks Phase 0 completion; prevents Phase 1 start
Impact: Frozen live state, false LIVE signals

Immediate Actions:
1. Code review: Backend webhook handler timestamp validation
2. Root cause: Check lock acquisition order in queue processing
3. Fix: Implement timeout + circuit breaker
4. Re-test: 72h+ continuous refresh without deadlock
5. Verify: No false LIVE states after fix
```

### Example 3: Stalled Branch Detected

**Trigger**: Branch `backend-phase-1-api-endpoints` has no commits in 7+ days

**Escalation**:
```
⚠️  **ALERT: Track B At-Risk — Stalled Branch**

Branch: backend-phase-1-api-endpoints (last commit 2026-04-26)
Status: No commits in 7 days
Phase: 1 (MT5 Bridge Infrastructure) — CRITICAL PATH

Recommended Action:
- Team check-in: Is Phase 1 blocked? Reassign if needed
- Phase 1 deadline: 2026-06-01 (28 days remaining)
- If blocked: Surface blocker for immediate resolution
```

---

## Phase Exit Gates

Agent enforces these gates before allowing phase progression:

| Phase | Exit Criteria | Threshold | Gate Enforced |
|-------|---------------|-----------|--------------|
| 0 | No stale-loop deadlocks, 72h+ stable refresh | 100% (0 deadlocks) | Must Pass |
| 1 | Heartbeat stable, 48h+ no dropped sessions | 100% uptime | Must Pass |
| 2 | Dashboard matches MT5 exactly, no ghost trades | 100% accuracy | Must Pass |
| 3 | Fresh/stale detection accurate, no frozen feeds | 100% accuracy | Must Pass |
| 4 | Fib parity across all pairs/timeframes | ≥99% | Must Pass |
| 5 | Regime parity, stable chop detection | ≥95% | Must Pass |
| 6 | Signal parity over large sample | ≥95% | Must Pass |
| 7 | 100% execution reconciliation accuracy | 100% | Must Pass |
| 8 | No unauthorized execution, full audit trail | 100% | Must Pass |
| 9 | License enforcement stable, no duplicate abuse | 100% | Must Pass |

**Agent flags**: If threshold not met, Phase N+1 is blocked with reason + corrective action plan.

---

## Example Workflow: Phase 4 Readiness Check

**User**: `/mt5-migration Phase 4 readiness check`

**Agent returns**:

```
## [PHASE 4 STATUS] — Fib Engine Migration

### Status: IN-PROGRESS
- Current phase owner: Track A (MT5 EA)
- Active branches: mt5-phase-4-fib-parity (last commit 2h ago)
- Start date: 2026-04-15 | Progress: 65% | On-track for 2026-08-15

### Success Criteria Verification
| Criterion | Status | Evidence | Trend |
|-----------|--------|----------|-------|
| 99%+ fib parity all pairs | ⏳ PENDING | ./audits/phase-4-fib-parity-2026-05-03.md | ↑ improving (98.5%) |
| Historical replay pass | ✓ PASS | ./test-logs/phase-4-historical-2026-05-01.log | ↔ stable |
| Broker suffix normalization | ⏳ PENDING | In progress on EURUSD.m | ↑ improving |

### Parity Report
- **Fib Engine**: 98.5% parity vs Pine [Trend: ↑ improving]
  - Swap Fib 1: 99.2% ✓
  - Bull Run Fib: 97.8% (⚠️ below threshold, investigating)
  - Swap Fib 2: 98.1% ✓

### Risk & Dependency
- **Blockers**: Bull Run Fib parity drift (ROOT CAUSE: MT5 anchor detection off by 1 candle on volatile closes)
- **Parallel track conflicts**: None
- **Stalled branches**: None
- **Go/No-Go for Phase 5**: 🟡 CAUTION (Bull Run Fib needs fix; re-test, then GO)

### Corrective Actions (If Needed)
- [ ] Review MT5 Bull Run Fib anchor logic (commits mt5-phase-4-*)
- [ ] Add candle close validation filter
- [ ] Re-run parity audit on Bull Run Fib
- [ ] Confirm >99% before Phase 5 start
```

---

## Escalation Severity Levels

| Level | Blocks | Response Time | Action |
|-------|--------|---------------|--------|
| 🔴 **CRITICAL** | Current phase OR Phase N+1 | Immediate | Escalate + suggest fix + timeline impact |
| ⚠️ **HIGH** | May delay phase by 1-3 days | Same day | Flag + track + monitoring |
| ℹ️ **MEDIUM** | Track-level issue, no gate impact | EOD | Monitor, plan fix in backlog |

---

## Saving & Sharing Reports

**Weekly status** (auto-generated):
```
.github/migration/weekly-reports/weekly-status-2026-05-03.md
```

**Custom audit** (manual):
```
.github/migration/audits/phase-4-fib-parity-2026-05-03.md
```

**Bug scan** (auto-ingested):
```
.github/docs/BUG_SWEEP_REPORT_2026-05-03.md
```

All reports are version-controlled in git for audit trail & historical tracking.

---

## Example Workflow: Phase 0 Complete Cycle

### Step 1: Run Stabilization Scan
```
/smc-stabilization Phase 0 full scan
```

Stabilization agent:
- ✓ Scans 7 passes (runtime, wiring, contracts, refresh, signals, parity, cleanup)
- ✓ Finds 5 bugs (2 CRITICAL, 2 HIGH, 1 MEDIUM)
- ✓ Applies surgical fixes
- ✓ Saves reports to `.github/docs/` and `.github/migration/audits/`

### Step 2: Migration Manager Auto-Detects (within 30 min)
```
[Auto-triggered every 30 minutes]
```

Migration manager agent:
- ✓ Detects `BUG_SWEEP_REPORT_2026-05-03.md`
- ✓ Parses metrics: 2 CRITICAL, 2 HIGH
- ✓ Identifies blocker: "Stale-loop deadlock"
- ✓ Escalates immediately:

```
🚨 **ESCALATION: CRITICAL — Phase 0 Blocker: Stale-Loop Deadlock**

Issue: Backend freshness engine deadlock after ~48h
Severity: Blocks Phase 0 completion
Evidence: .github/docs/BUG_SWEEP_REPORT_2026-05-03.md

Corrective Actions (Already Applied by Stabilization Agent):
- Timeout guard added to refresh loop
- Timestamp validation hardened
- Regression tests added

Next Steps:
- [ ] Verify 72h+ refresh without deadlock
- [ ] Confirm no false LIVE states
- [ ] Mark Phase 0 success criteria met
```

### Step 3: You Verify Fixes

Run tests, confirm:
- 72h+ continuous refresh without deadlock ✓
- No false LIVE states ✓
- Signal readiness verified ✓

### Step 4: Trigger Phase Completion
```
/mt5-migration Update Phase 0 status: complete
```

Migration manager:
- ✓ Checks Phase 1 prerequisites (Phase 0 = complete ✓)
- ✓ Clears blockers
- ✓ Updates status board
- ✓ Opens Phase 1 for start

---

## Contact

For agent issues or feature requests, check:
- `.github/agents/stabilization-agent.agent.md` (agent definition)
- `.github/agents/migration-project-manager.agent.md` (agent definition)
- `.github/migration/README.md` (detailed documentation)
