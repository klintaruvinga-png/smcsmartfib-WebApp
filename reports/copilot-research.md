# Phase 0 Closeout Verification & Phase 1 Roadmap Research

**Research Date**: 2026-05-15  
**Researcher**: Copilot (intake stage)  
**Issue**: Phase 0 Close out docs are in. verify closeout, check codebase for Phase 1 status, create Phase 1 roadmaps, trackers and checklist. Complete task with a docs merge and prune to declutter repo.

---

## 1. Issue Classification

- **Severity**: HIGH
- **Category**: migration-governance / documentation
- **Layer(s) affected**: migration-system / repo-organization / project-management / all-phases
- **Phase impact**: Phase 0 completion / Phase 1 preparation / Cross-phase

---

## 2. Confirmed Evidence

### Phase 0 Closeout Status

**Official closeout artifact**: `.github/migration/phase-updates/phase0-soak-closeout-final-2026-05-15.md`
- **Gate decision**: PASSED
- **Completion date**: 2026-05-15 16:37 UTC
- **All success criteria**: Met (100% on all 11 criteria)
- **Final validation**: NAS100 (29,263.70 LIVE), US30 (49,756.00 LIVE), XAUUSD (4,556.34 LIVE)
- **Backend soak metrics**: 259,464 engine runs / 0 errors / 69,262 candles over 24h
- **Parity status**: 100% on Pine/backend/dashboard/watchlist audited surfaces

**Key blockers resolved**:
1. NAS100/US30 equity-session freshness — resolved 2026-05-15 with SessionManager fix
2. XAUUSD candle-history readiness — resolved 2026-05-15 with SymbolNormalizer GOLD alias
3. Frontend feed-status chip lag (BUG-001) — resolved with `staleTime: 0` on useEngineHealth()
4. Watchlist persistence defects — resolved with post_user_settings() and hook regression coverage

**Files changed for Phase 0 closeout**:
- `src/hooks/useSniperData.ts` — feed-status fix
- `src/hooks/useSniperData.test.tsx` — regression test
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — watchlist mutation response fix
- `src/hooks/useSniperData.watchlist.test.tsx` — Vitest watchlist regression suite
- `mt5/SymbolNormalizer.mqh` — GOLD alias update
- `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php` — PHP watchlist harness
- `wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php` — EA market stream tests

### Phase 1 Status (Current)

**Status board**: `.github/migration-status.md` (updated 2026-05-15)
- **Progress**: 20% complete
- **Target completion**: 2026-06-01
- **Current blocker**: Live bridge validation pending (heartbeat, account-sync, symbol-sync, market-stream)
- **Owners**: Track A (MT5 EA) + Track B (Backend)

**Deliverables - Completed**:
- [x] Backend APIs: `POST /ea/heartbeat`, `POST /ea/account-sync`, `POST /ea/symbol-sync`, `GET /ea/license-check`

**Deliverables - Pending**:
- [ ] MT5 Bridge EA: heartbeat, account sync, symbol sync, terminal telemetry
- [ ] Live terminal verification: heartbeat stability (48h+), reconnect handling, session validation

**Success criteria**:
- Heartbeat stable for 48h+
- No dropped sessions
- Automatic reconnect working
- All test checklist items (terminal restart, VPS restart, internet interruption, duplicate protection, invalid license rejection)

### Documentation Status

**Phase 0 documents**: 49 files identified across `.github/migration/phase-updates/` and `.github/migration/audits/`
- **Primary closeout**: `phase0-soak-closeout-final-2026-05-15.md` (replaces earlier versions)
- **Superseded documents** (can be archived):
  - `phase0-soak-Final-2026-05-14.md`
  - `phase-0-completion-2026-05-14.md`
  - `phase-0-focused-validation-attempt-2026-05-14.md`
  - `phase-0-post-fix-validation-checklist-2026-05-14.md`
  - `phase-0-next-actions-2026-05-14.md`
  - `phase-0-next-72h-checklist-2026-05-11.md`
  - `phase-0-soak-summary-2026-05-11.md`
- **Active parity audits** (keep): `phase-0-watchlist-persistence-parity-2026-05-15.md`, `phase-0-full-parity-2026-05-14.md`, `phase-0-pine-backend-parity-2026-05-14.md`, etc.

**Phase 1 documentation**: Missing
- No Phase 1 roadmap document exists
- No Phase 1 tracker/checklist exists
- No Phase 1 success criteria details exist beyond migration-status.md summary
- Phase 2 and beyond: Similar pattern (summary in migration-status.md but no detailed roadmaps)

**Docs to declutter**:
- Multiple Phase 0 snapshot folders in `reports/snapshots/` (5+ dated directories) — can be archived/consolidated
- Build/test log files in root: `.codex-vite-dev.err.log`, `.codex-vite-dev.log`, `.codex-vite-mock.err.log`, `.codex-vite-mock.log` — candidate for cleanup
- `phase3_mt5_simulation_test.php` in root (likely test artifact) — can be moved to tests/ directory
- `build-watchlist.log` in root — candidate for cleanup
- `stratupdate.md` in root — unclear purpose, candidate for review/archive

**Root-level documentation** (keep):
- `README.md` — main project documentation
- `CLAUDE.md` — Claude coding contract
- `PHASE2_IMPLEMENTATION.md` — Phase 2 technical reference
- `PHASE3_TESTING_GUIDE.md` — Phase 3 testing procedures
- `MT5_CANONICAL_MARKET_SPEC.md` — architecture reference
- `SMC_SuperFib_v13.1.3.pine` — Pine indicator source
- `.github/copilot-instructions.md` — workflow governance

### Codebase Phase 1 Evidence

**MT5 Bridge implementation status** (from `mt5/` directory):
- [x] TickProcessor.mqh — tick ingestion (complete)
- [x] CandleBuilder.mqh — M1 candle construction (complete)
- [x] SessionManager.mqh — session awareness (complete)
- [x] FreshnessEngine.mqh — freshness states (complete)
- [x] SymbolNormalizer.mqh — canonicalization (complete, GOLD alias added 2026-05-15)
- [x] MarketDataEngine.mqh — core engine (complete)
- [ ] SMC_MarketDataEA.mq5 — live terminal validation pending

**Backend bridge APIs** (from Phase 1 status):
- [x] POST /ea/heartbeat
- [x] POST /ea/account-sync
- [x] POST /ea/symbol-sync
- [x] GET /ea/license-check

**Dashboard phase 1 work**: Not scheduled (Phase 1 is MT5+backend only; dashboard work deferred to Phase 2)

---

## 3. Root Cause Hypothesis

**Confirmed**:
- Phase 0 gate was passed on 2026-05-15 with all success criteria met
- Phase 1 is currently active but at 20% (backend APIs complete; EA live validation pending)
- Documentation is scattered: Phase 0 closeout completed but not consolidated; Phase 1-10 lack detailed roadmaps/trackers
- Repository root contains temporary/test artifacts cluttering the workspace

**Hypothesis**:
- The issue is primarily **documentation governance** and **repo organization**, not a technical blocker
- Phase 1 can proceed to live terminal validation without documentation changes
- However, the lack of detailed Phase 1 roadmap/tracker/checklist increases risk of unclear ownership, sequencing, and acceptance criteria
- Repository cluttering (test logs, temporary artifacts) reduces discoverability and increases noise

---

## 4. Blast Radius

### Files Affected by Documentation Consolidation

**Phase 0 docs to consolidate**:
- Superseded Phase 0 checkpoints: 8 files can be archived to `.github/migration/archive/`
- Phase 0 audit trail: Keep latest parity audits; consolidate earlier snapshots
- PHASE0_SOAK_TRACKER.md: Review whether active soak logging is still needed; may be historic

**Phase 1 docs to create** (new):
- `.github/migration/PHASE1_BRIDGE_ROADMAP.md` — detailed technical plan (5–7 sections)
- `.github/migration/PHASE1_TRACKER.md` — live status board (replaces inline status in migration-status.md)
- `.github/migration/PHASE1_CHECKLIST.md` — task breakdown for teams and acceptance criteria

**Repository root to clean**:
- Log files: `.codex-vite-dev.err.log`, `.codex-vite-dev.log`, `.codex-vite-mock.err.log`, `.codex-vite-mock.log` → move to `.artifacts/logs/` or .gitignore
- Test artifact: `phase3_mt5_simulation_test.php` → move to appropriate test directory
- Unknown: `stratupdate.md` → review and either document or archive

**Every system reading or depending on Phase 0/1 migration docs**:
- `.github/agents/migration-project-manager.agent.md` — auto-ingests reports from `.github/migration/audits/` and `.github/migration/phase-updates/`
- `.github/migration-status.md` — currently serves as single source of truth; Phase 1 detailed plan is missing
- Scripts: `scripts/pipeline-watcher.js` — monitors git branches and phase progression
- Teams: Track A (MT5 EA), Track B (Backend), Track C (Dashboard) — need clear Phase 1 roadmap to prevent stalled work

**Parity surfaces at risk**:
- None direct; this is pure documentation. But unclear Phase 1 plan increases risk of wiring gaps or missed acceptance criteria during implementation.

---

## 5. Regression Surface

**What currently working behavior could break**:
1. **Pipeline automation**: If `.github/migration/phase-updates/` structure changes, the pipeline watcher may fail to auto-ingest reports. Keep folder structure stable.
2. **Migration-status.md ingestion**: If the format of phase summary tables changes, automated parsing could break.
3. **Archive folder**: If archived Phase 0 docs are referenced by scripts, breakage. Need to audit references first.

**Existing guards**:
- `.github/agents/migration-project-manager.agent.md` — auto-ingests and parses reports; resilient to file renaming if folder structure preserved
- `.smc-workflow-state.json` — workflow lock prevents conflicting edits during planning phase (currently RESEARCHING)
- Phase gates in `.github/migration-status.md` — prevent Phase 2+ advancement until Phase 1 complete

**Tests covering this area**:
- `scripts/pipeline-watcher.test.mjs` — tests report ingestion and phase gate logic
- No tests for doc structure validation (could add to prevent future regressions)

---

## 6. Resolution Path Options

### Path A: Narrow Consolidation (Documentation Only)

**Scope**: Phase 0 closeout consolidation + Phase 1 roadmap/tracker creation
1. Archive Phase 0 superseded checkpoints (8 files) → `.github/migration/archive/phase-0-updates-prior-to-2026-05-15/`
2. Create `PHASE1_BRIDGE_ROADMAP.md` — detailed plan extracted from migration-status.md + EA implementation status
3. Create `PHASE1_TRACKER.md` — live status board with ownership, dates, blockers
4. Create `PHASE1_CHECKLIST.md` — task breakdown per team (Track A, B, C specifics)
5. Update migration-status.md to reference new docs (no structural change)
6. Leave repository root temp artifacts as-is (low priority)

**Effort**: 3–4 hours  
**Risk**: Low; pure documentation, no code changes  
**Benefit**: Phase 1 teams have clear roadmap; pipeline automation unaffected

### Path B: Full Repository Cleanup (Documentation + Artifacts)

**Scope**: Path A + repository decluttering
1. All Phase A actions
2. Move test logs (`.codex-*.log*`) to `.artifacts/logs/`
3. Move `phase3_mt5_simulation_test.php` to `wordpress/smc-superfib-sniper/tests/php/`
4. Archive or delete `stratupdate.md` after review
5. Consolidate `reports/snapshots/` into single archive folder
6. Add `.gitignore` rules to prevent future log spillage in root
7. Update `.github/docs/` structure if needed for consistency

**Effort**: 5–6 hours  
**Risk**: Medium; moving files could break hardcoded references in scripts or CI pipelines (need audit first)  
**Benefit**: Cleaner repo; improved discoverability; reduced noise

### Recommended: Path A + Selective Path B

**Why**:
- Phase 1 roadmap creation is high-priority; teams need clarity now (Path A critical)
- Full cleanup (Path B) is lower-risk if done carefully but requires script audit first (deferred)
- Compromise: Execute Path A immediately; queue Path B for a separate story after Phase 1 planning complete

**Exact steps**:
1. Create Phase 1 detailed roadmap, tracker, checklist (3 new docs)
2. Archive Phase 0 superseded checkpoints (folder consolidation, no file deletes)
3. Update migration-status.md to reference new Phase 1 docs
4. Leave root artifacts for now; revisit after Phase 1 kickoff
5. Defer `.artifacts/logs/` reorganization; risky without full script audit

---

## 7. Risk Flags

**High-risk system involved**: No
- Documentation and repo organization changes; no code changes in critical systems (MT5 EA, backend APIs, signal engine)

**Requires parity re-validation**: No
- Phase 0 parity (100%) is complete and confirmed; Phase 1 is just beginning with backend APIs already in place

**Migration-blocking**: No
- Phase 1 can start without detailed roadmap (APIs ready, EA validation can begin)
- However, lack of clarity **increases risk** of coordination failures between tracks

**Human review required before merge**: Yes
1. Archive folder structure must not break pipeline ingestion (review with migration manager agent)
2. New Phase 1 docs should be reviewed by Track A, B, C leads for accuracy and completeness
3. Root artifact cleanup (if included) must be audited against scripts first

---

## 8. Handoff Package

### Epicentre Files to Inspect First

1. **`.github/migration-status.md`** — primary source of truth; Phase 1 summary sections (lines 95–150)
2. **`.github/migration/phase-updates/phase0-soak-closeout-final-2026-05-15.md`** — official Phase 0 closeout artifact
3. **`.github/migration/PHASE0_SOAK_TRACKER.md`** — reference for Phase 0 scope; understand what Phase 1 replaces
4. **`mt5/SMC_MarketDataEA.mq5`** — EA live terminal validation status (what's ready for testing?)
5. **`reports/phase-1-ea-bridge-implementation-report.md`** — existing Phase 1 work summary (if any)

### Inputs Codex Must Verify Before Planning

1. **Phase 1 success criteria clarity**:
   - "Heartbeat stable for 48h+" — where is the 48h test window? Does it require live MT5 terminal or can be simulated?
   - "No dropped sessions" — acceptance: 0 drops, or <0.1% acceptable?
   - "Reconnect works automatically" — auto-reconnect after what events? (Terminal restart, VPS restart, internet interruption?)

2. **Track assignments**:
   - Track A (MT5 EA): Who owns SMC_MarketDataEA.mq5 live terminal validation?
   - Track B (Backend): Who verifies API stability and edge cases (invalid license, duplicate heartbeat, etc.)?
   - Track C (Dashboard): Explicitly deferred to Phase 2 — confirm no Phase 1 work?

3. **Live terminal constraints**:
   - Where will Phase 1 terminal testing happen? (Production MT5, staging broker, simulation?)
   - Access requirements? (API keys, account credentials, broker details)
   - Timeline: When can testing begin? (EA code ready? Backend APIs in staging?)

4. **Archive folder safety**:
   - Any scripts or CI pipelines that parse `.github/migration/phase-updates/` directly? (Not just agent auto-ingest)
   - Can archived Phase 0 docs be safely moved without breaking references?

### Open Unknowns That Could Invalidate Hypothesis

1. **Phase 1 EA testing environment**: Unclear if live terminal testing is blocked by infrastructure (broker connectivity, testing account availability)
2. **Track C exclusion**: Confirm dashboard is truly blocked on Phase 1 completion, not just deferred preference
3. **Archive folder policy**: Check if archived docs need to remain queryable or can be truly removed from active view
4. **Documentation review cycle**: Do Track A/B leads need approval on new Phase 1 docs, or is Copilot/Codex authority sufficient?
5. **Phase 1 timeline pressure**: Is 2026-06-01 target realistic given live validation requirements, or is it aspirational?
