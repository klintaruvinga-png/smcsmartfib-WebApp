# Migration Project Management System

**Goal**: Orchestrate SMC SuperFIB → MT5 migration across 11 phases with automated parity validation, blocker escalation, and progress tracking.

**Two-Agent System**:
- **Stabilization Agent** (`.github/agents/stabilization-agent.agent.md`): Full-stack code inspection, bug detection, parity validation, surgical fixes
- **Migration Manager Agent** (`.github/agents/migration-project-manager.agent.md`): Phase tracking, report auto-ingestion, escalation, weekly status generation

**Status Board**: `../migration-status.md`

**Integration Workflow**:
```
Stabilization Agent (full-stack scan)
    ↓ generates scan reports + parity audits
    ↓ saves to .github/docs/ and .github/migration/audits/
    ↓
Migration Manager (auto-ingestion every 30 min)
    ↓ parses reports
    ↓ extracts metrics & detects blockers
    ↓ CRITICAL issues escalated immediately
    ↓ phase gates updated with corrective actions
```

---

## Two-Agent System Overview

### Agent 1: Stabilization Agent (Full-Stack Inspector)

**Purpose**: Scan entire codebase for bugs, wiring issues, parity drift, stale-data risks, and signal-engine integrity.

**What it does**:
- Runs 7 mandatory inspection passes (runtime, wiring, contracts, refresh, signals, parity, cleanup)
- Applies surgical fixes for every confirmed issue
- Generates structured bug scan reports
- Generates parity audit reports (fib/regime/signal)
- Saves reports to migration system folders

**Invocation**:
```
/smc-stabilization Phase 0 full scan
/smc-stabilization Fix stale-loop blocker
/smc-stabilization Verify fib parity Phase 4
```

**Output**:
- `.github/docs/BUG_SWEEP_REPORT_[YYYY-MM-DD].md` — Bug scan with CRITICAL/HIGH issues
- `.github/migration/audits/phase-[X]-[engine]-parity-[YYYY-MM-DD].md` — Parity audit with % metrics

---

### Agent 2: Migration Manager Agent (Phase Orchestrator)

**Purpose**: Track phase progression, auto-ingest stabilization reports, escalate blockers, enforce parity gates.

**What it does**:
- Monitors git branches (`mt5-*`, `backend-*`, `dashboard-*`) every 30 minutes
- Auto-detects and parses stabilization reports
- Extracts metrics and flags CRITICAL issues immediately
- Suggests corrective actions per phase and governance rules
- Generates weekly status reports with trends and go/no-go gates
- Prevents phase progression if exit criteria not met

**Invocation**:
```
/mt5-migration Phase 0 readiness check
/mt5-migration Validate parity Phase 4
/mt5-migration Generate weekly status
```

**Auto-triggered**:
- Every 30 min: Polls for new bug scan / parity reports
- When parity drops below threshold: Immediate escalation
- When CRITICAL blocker detected: Immediate escalation with suggested fixes
- Every Sunday 00:00 UTC: Generates weekly status report

---

## Workflow: End-to-End Scan → Escalation

### Phase 0 Scenario

1. **You run stabilization scan**:
   ```
   /smc-stabilization Phase 0 full scan
   ```

2. **Agent scans, identifies issues**:
   - Stale-loop deadlock in backend freshness engine
   - Fake-live states on market-open transition
   - Timestamp corruption in webhook handler
   - Missing wiring in dashboard Indicators component

3. **Agent applies surgical fixes**:
   - Adds timeout guard to refresh loop
   - Hardens timestamp validation
   - Fixes DOM ID mismatch in Indicators
   - Adds regression tests

4. **Agent saves reports**:
   ```
   .github/docs/BUG_SWEEP_REPORT_2026-05-03.md
   .github/migration/audits/phase-0-stale-state-2026-05-03.md
   ```

5. **Migration manager auto-detects** (within 30 min):
   - Parses bug scan
   - Extracts: 3 CRITICAL issues, 2 HIGH issues
   - Flags stale-loop deadlock as blocker
   - Updates Phase 0 status to "blocked" with blockers list

6. **You are notified**:
   - Migration manager escalates:
     ```
     🚨 **ESCALATION: CRITICAL — Phase 0 Blocker: Stale-Loop Deadlock**
     
     Issue: Backend freshness engine enters deadlock after ~48h
     Severity: Blocks Phase 0 completion; prevents Phase 1 start
     Corrective Action: [Applied by stabilization agent]
     - [ ] Re-test 72h+ continuous refresh
     - [ ] Verify no stale-loop recurrence
     - [ ] Confirm Phase 0 success criteria met
     ```

7. **You complete verification**:
   - Re-test passes 72h+ without deadlock
   - Signal readiness verified
   - No false LIVE states

8. **You trigger phase update**:
   ```
   /mt5-migration Update Phase 0 status: complete
   ```

9. **Migration manager**:
   - Checks Phase 1 prerequisites (Phase 0 = complete ✓)
   - Updates status board
   - Clears blocker list for Phase 0
   - Marks Phase 1 ready to start

---

## Report Format Requirements

For auto-ingestion to work, reports **MUST** follow the templates exactly:

### Bug Scan Report Format

**Location**: `.github/docs/BUG_SWEEP_REPORT_[YYYY-MM-DD].md`

**Template**: `.github/migration/BUG_SCAN_TEMPLATE.md`

**Critical sections**:
```markdown
## Summary
- Total Issues Found: [#]
- Critical Issues: [#]
- High Priority Issues: [#]

## Critical Issues (Blocks Phase Transition)
| Issue | Component | Impact | Blocker | Corrective Action |
|-------|-----------|--------|---------|-----------------|

## Parity Drift Alerts
| Engine | Previous % | Current % | Trend | Status |
|--------|-----------|----------|-------|--------|
```

**Auto-parsed by migration manager**:
- Severity levels (CRITICAL | HIGH | MEDIUM)
- Blocker status (Yes | No)
- Parity metrics (fib %, regime %, signal %)
- Corrective actions for escalation

### Parity Audit Report Format

**Location**: `.github/migration/audits/phase-[X]-[engine]-parity-[YYYY-MM-DD].md`

**Template**: `.github/migration/audits/PARITY_REPORT_TEMPLATE.md`

**Critical sections**:
```markdown
## Executive Summary
- Overall Parity: [X]%
- Threshold Required: [Y]%
- Pass/Fail: [✓ PASS | ✗ FAIL]
- Trend: [↑ Improving | ↔ Stable | ↓ Degrading]

## Component Parity Metrics
| Metric | Pine Value | MT5 Value | Match | Accuracy |
|--------|-----------|----------|-------|----------|

## Critical Issues Found
| Issue | Severity | Count | Resolution | Blocker |
|-------|----------|-------|-----------|---------|
```

**Auto-parsed by migration manager**:
- Parity % metric
- Pass/fail status
- Trend (↑ ↔ ↓)
- CRITICAL issues with blocker status

```
.github/
├── agents/
│   ├── stabilization-agent.agent.md          ← Full-stack scan & patch agent
│   └── migration-project-manager.agent.md    ← Phase tracking & escalation agent
├── migration/
│   ├── README.md                             ← This file
│   ├── QUICK_REFERENCE.md                    ← Command reference
│   ├── migration-status.md                   ← Global status board (all phases)
│   ├── BUG_SCAN_TEMPLATE.md                  ← Template for bug scan reports
│   ├── audits/
│   │   ├── PARITY_REPORT_TEMPLATE.md        ← Template for parity audits
│   │   └── phase-4-fib-parity-2026-05-03.md ← Example: actual parity audit
│   ├── test-logs/
│   │   ├── phase-0-refresh-stability-2026-05-03.log
│   │   └── phase-3-market-data-2026-05-03.log
│   ├── phase-updates/
│   │   └── phase-0-update-2026-05-03.md
│   └── weekly-reports/
│       └── weekly-status-2026-05-03.md
├── docs/
│   ├── BUG_SWEEP_REPORT_2026-05-03.md       ← Auto-ingested by migration manager
│   └── ...
```

---

## How the Agent Works

### 1. **Automated Monitoring** (Every 30 min)

The agent polls:
- **Git branches**: `mt5-*`, `backend-*`, `dashboard-*` for active work and commit velocity
- **Latest parity reports**: `./audits/*.md` for fib/regime/signal % metrics
- **Bug scan reports**: `../docs/BUG_SWEEP_REPORT_*.md` for CRITICAL/HIGH issues

### 2. **Immediate Escalation** (On Detection)

When the agent detects:
- **Parity drift below threshold** → Escalate with root cause suggestion + corrective actions
- **Critical blocker** → Escalate with impact analysis + priority ranking
- **Stalled branch** (7+ days no commits) → Flag team for check-in

Escalation format:
```
🚨 **ESCALATION: [CRITICAL|HIGH] — [Issue Title]**
[Issue details] → [Corrective actions] → [Verification criteria]
```

### 3. **Automatic Weekly Reports** (Every Sunday)

The agent generates: `.github/migration/weekly-reports/weekly-status-[YYYY-MM-DD].md`

Contains:
- All 11 phases: status, % progress, active blockers
- Parity metrics: trends (↑ improving / ↔ stable / ↓ degrading)
- Go/no-go gates: which phases are blocking next transitions
- Team velocity: commits per track, stalled work

### 4. **Data Ingestion & Inference**

| Input | Inferred | Output |
|-------|----------|--------|
| Branch `mt5-phase-4-fib-parity` | Phase 4 active | Track A shipping Phase 4 |
| Commit "Phase 4 fib parity 98.5%" | Parity metric | Update phase status + flag if <99% |
| Bug report "stale-loop deadlock" | CRITICAL blocker | Escalate Phase 0 progression |
| Parity audit: "fib 99.2%, regime 94%" | Regime drift | Phase 5 ready, but Phase 6 blocked |

---

## File Types & Naming Conventions

### Parity Audits
- **Path**: `./audits/`
- **Format**: `[phase-name]-parity-[YYYY-MM-DD].md`
- **Example**: `phase-4-fib-parity-2026-05-03.md`
- **Content**: Use `PARITY_REPORT_TEMPLATE.md` as template

### Bug Scan Reports
- **Path**: `../docs/`
- **Format**: `BUG_SWEEP_REPORT_[YYYY-MM-DD].md`
- **Content**: Use `BUG_SCAN_TEMPLATE.md` as template

### Phase Updates
- **Path**: `./phase-updates/`
- **Format**: `phase-[X]-update-[YYYY-MM-DD].md`
- **Content**: Deliverable checklist, success criteria pass/fail, test evidence

### Test Logs
- **Path**: `./test-logs/`
- **Format**: `phase-[X]-[test-type]-[YYYY-MM-DD].log` or `.md`
- **Content**: Raw test output, assertions, metrics

### Weekly Reports
- **Path**: `./weekly-reports/`
- **Format**: `weekly-status-[YYYY-MM-DD].md`
- **Auto-generated**: Every Sunday by agent

---

## How to Feed the Agent

### 1. Create a Parity Audit (Phase 4+)

Use template: `./audits/PARITY_REPORT_TEMPLATE.md`

Save as: `./audits/phase-4-fib-parity-2026-05-03.md`

Then run: `/mt5-migration Ingest parity report phase-4-fib-parity-2026-05-03.md`

Agent will:
- Parse fib parity %
- Flag if <99% (Phase 4 threshold)
- Suggest corrective actions

### 2. Create a Bug Scan Report

Use template: `./BUG_SCAN_TEMPLATE.md`

Save as: `../docs/BUG_SWEEP_REPORT_2026-05-03.md`

Then run: `/mt5-migration Ingest bug report BUG_SWEEP_REPORT_2026-05-03.md`

Agent will:
- Extract CRITICAL issues
- Trigger escalation if blocker
- Update phase status

### 3. Create Phase Update Log

Format: `./phase-updates/phase-0-update-2026-05-03.md`

Content:
- Deliverables: [✓ complete | ✗ incomplete]
- Success criteria: [✓ PASS | ✗ FAIL | ⏳ PENDING]
- Evidence links

Agent will:
- Verify phase readiness
- Check prerequisites for Phase N+1
- Recommend go/no-go decision

---

## Usage Guide

### Manual Commands

**Phase Readiness Check**:
```
/mt5-migration Phase 0 readiness check
```
Output:
- Phase status (not-started | in-progress | blocked | complete)
- Active branches (mt5-*, backend-*, dashboard-*)
- Success criteria verification with evidence
- Parity metrics (if applicable)
- Blockers & corrective actions

**Branch Activity Report**:
```
/mt5-migration Branch activity report
```
Output:
- Track A (MT5 EA): active branches + last commit + days since commit
- Track B (Backend): active branches + last commit + days since commit
- Track C (Dashboard): active branches + last commit + days since commit
- Flagged stalled work (7+ days)

**Validate Parity**:
```
/mt5-migration Validate parity Phase 4
```
Output:
- Latest parity audit
- Fib parity %, regime parity %, signal parity %
- Trend analysis
- Drift root causes if <threshold
- Corrective action plan

**Risk Assessment**:
```
/mt5-migration Risk assessment
```
Output:
- All active blockers (CRITICAL | HIGH | MEDIUM)
- Phase dependencies & gate status
- Team track alignment
- Recommended action items

**Generate Weekly Report**:
```
/mt5-migration Generate weekly status
```
Output:
- Creates `.github/migration/weekly-reports/weekly-status-[today].md`
- All phases + trends + go/no-go gates

---

## Integration with Git Workflow

**Branch naming convention** (auto-detected by agent):
- `mt5-phase-[X]-[feature]` → Track A work on Phase X
- `backend-phase-[X]-[feature]` → Track B work on Phase X
- `dashboard-phase-[X]-[feature]` → Track C work on Phase X

**Commit message signals**:
- "Phase [X] parity [X]%" → Agent updates phase status
- "Blocker: [issue]" → Agent flags as CRITICAL
- "Phase [X] deliverable: [name]" → Agent marks deliverable complete

---

## Governance Rules Enforced by Agent

1. ✋ **Never migrate multiple engines simultaneously** — gates between phases are firm
2. ✋ **Every migration phase must achieve parity before next phase** — slip parity verification = prevent advancement
3. ✋ **Never remove Pine authority until MT5 parity proven** — dual-run validation is mandatory
4. ✋ **Execution only comes after analytical parity** — no trades before Phase 6 validation

Agent will escalate violations with evidence.

---

## Support

For questions about phase status, parity validation, or blocker escalation, invoke:

```
/mt5-migration [Your question]
```

The agent will:
- Retrieve latest data
- Analyze blockers
- Suggest corrective actions
- Provide evidence links
