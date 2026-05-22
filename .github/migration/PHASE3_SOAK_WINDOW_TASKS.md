# Phase 3 Soak Window Task List

**Soak window**: 2026-05-22 → 2026-05-25 (72h)  
**Purpose**: Tasks completable in parallel with the Phase 3 stability soak — clears all Phase 4 entry blockers  
**Governance**: No Phase 4 engine code until Phase 3 gate closes. Planning, docs, and infrastructure prep are permitted.

---

## Checklist

### 🔴 Priority 1 — Soak Governance

- [ ] **TASK 1 — Fix CI pipeline** (`ANTHROPIC_API_KEY` missing from GitHub Actions secrets)
  - Go to GitHub repo → Settings → Secrets and variables → Actions → New repository secret
  - Name: `ANTHROPIC_API_KEY` · Value: your Anthropic API key
  - Verify: trigger any branch push and confirm `03 - Autonomous Review Loop` passes
  - Unblocks: automated code review on all Phase 4 PRs
  - **Status**: ⏳ Pending

- [ ] **TASK 2 — Capture Phase 3 T0 baseline** in the admin soak workspace
  - Open `/admin` → Soak Workspace → Capture Baseline
  - Record: EA symbols active, health endpoint status, MT5 authority confirmed
  - This is the reference point used to compare against soak closeout numbers
  - **Status**: ⏳ Pending

---

### 🟡 Priority 2 — Documentation & Reporting

- [ ] **TASK 3 — Generate W21 weekly status report**
  - Output: `.github/migration/weekly-status-2026-05-22.md`
  - Covers: Phases 0–3 progress, Phase 4 readiness gap, CI blocker, soak window status
  - Last report: 2026-05-15 (W20) — 7 days overdue
  - **Status**: ⏳ Pending

- [ ] **TASK 4 — Create Risk Register**
  - Output: `.github/migration/RISK_REGISTER.md`
  - Covers: active risks for Phase 4 (fib drift, replay methodology, 99% parity gate, CI pipeline, track lead gaps)
  - Migration board currently says "Not yet created"
  - **Status**: ⏳ Pending

- [ ] **TASK 5 — Create Phase 3 closeout artifact template**
  - Output: `.github/migration/phase-updates/phase3-soak-closeout-template.md`
  - Pre-populate with the 3 gate queries and pass criteria from the soak tracking plan
  - Fill in with actual DB numbers at 2026-05-25
  - **Status**: ⏳ Pending

---

### 🟡 Priority 3 — Phase 4 Readiness (Planning Only)

- [ ] **TASK 6 — Audit Pine fib baseline and document as Phase 4 spec**
  - Review: `class-market-data-service.php` `fib_levels_from_candles()`, `test-fib-parity.php`, `test-session-anchors.php`, `test-superfib-weighting.php`
  - Extract: session anchor ladder, SuperFib recency weights (0.40/0.35/0.25), HTF_AF logic, compression guard
  - Output: fib parity spec section inside `PHASE4_IMPLEMENTATION.md` — becomes the Phase 4 parity target
  - **Status**: ⏳ Pending

- [ ] **TASK 7 — Create `PHASE4_IMPLEMENTATION.md`**
  - Output: `PHASE4_IMPLEMENTATION.md` (root, alongside PHASE3_IMPLEMENTATION.md)
  - Covers: MT5 Fib Engine design — Swap Fib 1, Bull Run Fib, Swap Fib 2, extensions, premium/discount zones
  - Architecture only — no MQL5 code
  - **Status**: ⏳ Pending

- [ ] **TASK 8 — Create `PHASE4_TESTING_GUIDE.md`**
  - Output: `PHASE4_TESTING_GUIDE.md` (root)
  - Covers: parity validator design, historical replay methodology, acceptable drift thresholds, multi-pair/timeframe matrix
  - Gate target: 99%+ fib parity
  - **Status**: ⏳ Pending

---

### 🟢 Priority 4 — Weekend Observation (Passive — Soak Window Covers Sat/Sun)

- [ ] **TASK 9 — Observe and record weekend session behaviour**
  - Observe on Sat 2026-05-23: Do FX symbols show `state=offline` (CLOSED)? Does crypto (BTC/ETH/SOL) stay LIVE?
  - Observe on Sun 2026-05-25: Does EA resume correctly when market opens (Sydney session ~22:00 UTC Sun)?
  - Closes: Phase 0 deferred `[ ] Weekend behavior` AND Phase 3 `[ ] Weekend freeze` test checklist items
  - Record: screenshot or DB snapshot of `smc_sf_snapshots.state` per symbol during weekend hours
  - **Status**: ⏳ Pending (window: Sat 2026-05-23 → Sun 2026-05-25)

- [ ] **TASK 10 — Assign Track leads**
  - All three tracks (Track A, B, C) still show `*TBD*` in the migration board
  - Update `.github/migration-status.md` Track Assignments table with actual names
  - Required before Phase 4 starts (Track A owns all of Phase 4)
  - **Status**: ⏳ Pending

---

## Completion Criteria

All 10 tasks complete + Phase 3 soak gate queries pass (2026-05-25) → Phase 4 permitted to start.

| Task | Dependency |
|------|-----------|
| Tasks 1–2 | None — start immediately |
| Tasks 3–5 | None — start after Task 1 |
| Tasks 6–8 | None — planning only, start any time |
| Task 9 | Passive — weekend observation, no action required |
| Task 10 | Human decision — assign at any time |
