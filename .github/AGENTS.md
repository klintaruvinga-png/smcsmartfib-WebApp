# Agents for SMC SuperFIB Migration

This workspace includes two specialized agents for the SMC SuperFIB → MT5 migration project.

---

## 1. SMC SuperFIB Full-Stack Stabilization Agent

**File**: `.github/agents/stabilization-agent.agent.md`

**Purpose**: Comprehensive full-stack code inspection, bug detection, parity validation, and surgical fixing.

**Responsibilities**:
- Run 7 mandatory inspection passes (runtime, wiring, contracts, refresh, signals, parity, cleanup)
- Detect bugs, wiring issues, parity drift, stale-data risks, signal-engine integrity problems
- Apply surgical fixes for every confirmed issue
- Generate bug scan reports (`.github/docs/BUG_SWEEP_REPORT_*.md`)
- Generate parity audits (`.github/migration/audits/phase-*-parity-*.md`)
- Suggest corrective actions and regression tests

**When to use**:
- `/smc-stabilization Phase 0 full scan` — Start of phase or periodic verification
- `/smc-stabilization Phase [X] parity check [engine]` — Before phase advancement
- `/smc-stabilization Fix stale-loop blocker` — Responding to escalation
- `/smc-stabilization Wiring audit` — Detecting missing integrations
- `/smc-stabilization Audit signal engine` — Phase 6+ validation

**Output**:
- Bug scan reports → `.github/docs/BUG_SWEEP_REPORT_[YYYY-MM-DD].md`
- Parity audits → `.github/migration/audits/phase-[X]-[engine]-parity-[YYYY-MM-DD].md`
- All files ready for auto-ingestion by Migration Manager

---

## 2. SMC Migration Project Manager Agent

**File**: `.github/agents/migration-project-manager.agent.md`

**Purpose**: Phase orchestration, report auto-ingestion, blocker escalation, and progress tracking across all 11 phases.

**Responsibilities**:
- Monitor git branches (`mt5-*`, `backend-*`, `dashboard-*`) for active track work
- Auto-detect and parse stabilization scan reports every 30 minutes
- Extract parity metrics and flag issues based on phase thresholds
- Escalate CRITICAL blockers immediately with corrective actions
- Enforce governance rules (parity gates, phase progression, risk prevention)
- Generate weekly status reports with trends and go/no-go decisions
- Track team assignments and phase dependencies

**When to use**:
- `/mt5-migration Phase [X] readiness check` — Full phase audit before transition
- `/mt5-migration Validate parity Phase [X]` — Check fib/regime/signal accuracy
- `/mt5-migration Phase status board` — See all 11 phases at a glance
- `/mt5-migration Risk assessment` — Identify blockers and team conflicts
- `/mt5-migration Generate weekly status` — Create week's status report
- `/mt5-migration Branch activity report` — Check track velocity

**Automatic triggers** (every 30 min):
- Branch/commit monitoring
- Bug scan report ingestion
- Parity report ingestion
- CRITICAL issue escalation
- Weekly report generation (Sunday 00:00 UTC)

**Output**:
- Phase status updates in `.github/migration-status.md`
- Escalation alerts with corrective actions
- Weekly reports in `.github/migration/weekly-reports/`

---

## Agent Workflow Integration

```
┌─────────────────────────────────────────────────────────┐
│  You run stabilization scan                              │
│  /smc-stabilization Phase 0 full scan                   │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│  Stabilization Agent scans codebase                      │
│  - 7 inspection passes                                   │
│  - Applies surgical fixes                               │
│  - Generates bug scan + parity audits                   │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│  Reports saved to migration folders                      │
│  .github/docs/BUG_SWEEP_REPORT_*.md                     │
│  .github/migration/audits/phase-*-parity-*.md           │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│  Migration Manager auto-detects (every 30 min)          │
│  - Parses reports                                        │
│  - Extracts parity metrics & severity levels             │
│  - CRITICAL issues escalated immediately               │
│  - Phase gates updated                                   │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│  You are notified of blockers + corrective actions       │
│  🚨 ESCALATION: CRITICAL — [Issue]                      │
│  Corrective actions provided                             │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│  You verify fixes & confirm phase completion            │
│  /mt5-migration Update Phase [X] status: complete       │
│                                                          │
│  Migration Manager checks prerequisites                  │
│  ✓ Phase N complete → Phase N+1 ready                   │
└──────────────────────────────────────────────────────────┘
```

---

## Key Files & Locations

| File | Purpose |
|------|---------|
| `.github/agents/stabilization-agent.agent.md` | Stabilization agent definition |
| `.github/agents/migration-project-manager.agent.md` | Migration manager agent definition |
| `.github/migration-status.md` | Global status board (all phases) |
| `.github/migration/README.md` | Detailed documentation |
| `.github/migration/QUICK_REFERENCE.md` | Command reference & examples |
| `.github/migration/BUG_SCAN_TEMPLATE.md` | Template for bug reports |
| `.github/migration/audits/PARITY_REPORT_TEMPLATE.md` | Template for parity audits |
| `.github/docs/BUG_SWEEP_REPORT_*.md` | Auto-ingested bug scan outputs |

---

## Governance Enforced by Agents

The system enforces 4 critical governance rules:

1. ✋ **Never migrate multiple engines simultaneously** — phases are sequential gates
2. ✋ **Every migration phase must achieve parity before next phase** — slip parity = prevent advancement
3. ✋ **Never remove Pine authority until MT5 parity proven** — dual-run validation is mandatory
4. ✋ **Execution only comes after analytical parity** — no trades before Phase 6 validation

If violations detected, agents escalate immediately with evidence.

---

## Success Metrics

**Stabilization Agent Success**:
- ✓ All 7 inspection passes completed
- ✓ CRITICAL issues patched
- ✓ Regression tests added
- ✓ Reports saved to migration folders

**Migration Manager Success**:
- ✓ Phase progression follows exit criteria
- ✓ Parity thresholds enforced (99% Phase 4, 95% Phase 5/6)
- ✓ Blockers escalated within 30 min
- ✓ Weekly status reports generated
- ✓ Team track velocity tracked
- ✓ Governance rules never violated

---

## Quick Start

1. **Invoke Stabilization Scan**:
   ```
   /smc-stabilization Phase 0 full scan
   ```

2. **Wait for Migration Manager Auto-Detection** (within 30 min):
   - Reports auto-ingested
   - CRITICAL issues escalated
   - Corrective actions provided

3. **Verify Fixes & Update Status**:
   ```
   /mt5-migration Update Phase 0 status: complete
   ```

4. **Check Weekly Progress**:
   ```
   /mt5-migration Generate weekly status
   ```

---

## Support

For questions about:
- **Stabilization scans**: See `.github/agents/stabilization-agent.agent.md`
- **Phase tracking**: See `.github/agents/migration-project-manager.agent.md`
- **Migration system**: See `.github/migration/README.md` or `.github/migration/QUICK_REFERENCE.md`
