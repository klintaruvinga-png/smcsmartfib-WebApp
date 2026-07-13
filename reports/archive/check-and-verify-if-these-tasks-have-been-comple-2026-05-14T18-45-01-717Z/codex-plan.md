Now I have all the context needed. Let me produce the hardened plan.

---

# SMC SuperFIB — Phase 0 Closeout Task Verification Plan

`reports/codex-plan.md` | Generated: 2026-05-14 | Verifier: Claude

---

## 1. Issue validation

### Confirmed

**NAS100 / US30 `PRICE_NOT_MT5_FRESH`**
Root cause confirmed by research report AND corroborated by `.github/migration-status.md` blocker entry dated 2026-05-14. `SessionManager` in the MT5 EA used FX-only session hours; equity-index symbols fell outside those windows and were incorrectly aged stale. The PHP backend health check did not carry equivalent off-session logic. Code fix is confirmed merged: PR #170 (`fix(phase0): NAS100/US30 freshness + XAUUSD candle-history closeout`) and PR #171 (`fix: remap multi-word broker symbol names`) are visible in `git log`. The fix is in-repo but has not been live-validated in a post-fix soak.

**XAUUSD `INSUFFICIENT_CANDLE_HISTORY`**
Root cause confirmed. `SymbolNormalizer.mqh` lacked a "GOLD" → "XAUUSD" broker alias. On brokers presenting the symbol as "GOLD", the EA never added XAUUSD to its active symbol list, so no M1 candles accumulated and the 15m aggregation path never populated. Fix is confirmed merged in the same PR cluster. Post-fix EA restart and 7.5h accumulation period have not yet been verified.

**AUDUSD / ETHUSD `CHOP_GATE_BLOCKED`**
Confirmed as correct live engine behavior. Chop is computed from the live 15m regime, not from a cache. The research report, `.github/migration-status.md`, and `phase-0-next-actions-2026-05-14.md` all classify this as Explanation A. No code change is warranted; the blocks are expected outcomes given live market conditions.

**Tracking and documentation tasks — pre-fix state**
Confirmed as partially complete. The following artifacts are confirmed in-repo (verified by direct file reads):
- `phase0-soak-Final-2026-05-14.md` — raw soak export committed (untracked, present on disk)
- `phase-0-completion-2026-05-14.md` — modified, contains final soak observations and "Phase 0 closeout: blocked" conclusion
- `phase-0-next-actions-2026-05-14.md` — new untracked file, lists confirmed-done items and immediate next tasks
- `.github/migration-status.md` — modified, contains inline blocker entries with "FIXED 2026-05-14 — Awaiting validation soak" notation

### Likely

**`staleThresholdSec` and equity-session definitions are aligned between deployed EA and repo code.**
The fixes are in merged PRs but there is no in-repo confirmation that the updated EA binary has been deployed to the live MT5 terminal. The soak export's last checkpoint (14/05/2026, 15:57) predates the merged fix timestamp. This is likely still pending EA reload.

### Unconfirmed

**Superseding Phase 0 closeout artifact.**
No artifact exists in the repo that declares the migration gate cleared after a post-fix validation soak. The `phase-0-completion-2026-05-14.md` explicitly states "Phase 0 closeout: blocked" and "Ready for Phase 1: NO". The `phase-0-next-actions-2026-05-14.md` records the superseding closeout artifact as still to be created. This is the single remaining gate item for Phase 0 advancement.

---

## 2. Implementation contract

This plan covers **documentation and tracker updates only**. The code patches are already merged. No new code changes are in scope.

---

### File 1: `.github/migration-status.md`

- **Section to modify**: Phase 0 Deliverables checklist, Success Criteria checklist, Test Checklist, and Blockers narrative
- **Exact change required**:
  - Under **Deliverables**, mark `[ ] Signal engine stability` with a partial inline note: `[~] Signal engine stability: NAS100/US30 freshness fix merged; XAUUSD alias fix merged; post-fix validation soak pending`
  - Under **Test Checklist**, mark `[ ] MT5 M1 -> 15min aggregation verification for symbols previously showing insufficient candle history` as `[~] In progress — EA restart + 7.5h accumulation pending post-fix`
  - Under **Blockers**, append a sub-bullet to the NAS100/US30 entry: `Post-fix validation soak not yet started as of 2026-05-14 16:00 UTC.`
  - Under **Blockers**, append a sub-bullet to the XAUUSD entry: `Post-fix EA restart and candle accumulation not yet confirmed as of 2026-05-14 16:00 UTC.`
  - Under **Blockers**, add new bullet: `Superseding Phase 0 closeout artifact not yet published. Gate remains BLOCKED until focused validation soak passes and artifact is written.`
  - Do **not** change the overall Phase 0 `Status: BLOCKED` header or the table row until the superseding artifact is confirmed.
- **Guard rails**: Do not change any `[x]` items to unchecked. Do not advance Phase 0 status to COMPLETE. Do not touch Phase 1–10 rows. Do not alter the Parity Status block or the Automated Escalations table.
- **Why in scope**: This is the primary migration tracking board. The Copilot research report identified it as a key evidence file. The blocker narratives were added on 2026-05-14 but do not yet reflect that post-fix soak confirmation is still outstanding.
- **Acceptance criterion**: After edit, the board accurately shows that code fixes are merged but live validation is pending, and no reader can mistakenly conclude Phase 0 is closed.

---

### File 2: `.github/migration/phase-updates/phase-0-completion-2026-05-14.md`

- **Section to modify**: `## Next Actions` block and `## Conclusion` block
- **Exact change required**:
  - Under `## Next Actions`, mark items 1 and 2 as `[ ] PENDING — fix merged, live validation not yet confirmed`.
  - Append a new section `## Fix Deployment Status` with entries:
    - `NAS100/US30 freshness fix: Merged in PR #170, PR #171 — EA reload and live validation soak required`
    - `XAUUSD alias fix: Merged in PR #170 — EA restart and 7.5h candle accumulation required`
    - `AUDUSD/ETHUSD chop blocks: No fix; classified as live engine behavior — observation only`
  - Under `## Conclusion`, append: `Code patches merged 2026-05-14. Post-fix live validation soak not yet started. Superseding closeout artifact blocked pending validation.`
- **Guard rails**: Do not change the final soak summary observations. Do not alter the soak window dates. Do not remove or modify the "Phase 0 closeout: blocked" and "Ready for Phase 1: NO" lines until the superseding artifact is written.
- **Why in scope**: This file is the Phase 0 completion log and is the nearest document to a closeout artifact. It must accurately record the distinction between patches merged and patches live-validated.
- **Acceptance criterion**: After edit, the log contains a clear fix deployment status section distinguishing code-merged from live-confirmed, and the "blocked" conclusion remains intact.

---

### File 3: New file — `.github/migration/phase-updates/phase-0-post-fix-validation-checklist-2026-05-14.md`

- **Section to create**: Single new document
- **Exact content structure required**:
  - Header: `# Phase 0 Post-Fix Validation Checklist — 2026-05-14`
  - Section `## Prerequisites` listing: EA must be reloaded with the compiled fix binary, backend must be restarted to pick up PHP changes
  - Section `## Validation gates` with per-symbol pass/fail rows for NAS100, US30, XAUUSD (must show LIVE + candle count ≥ 180 for XAUUSD), AUDUSD (observation only — chop state expected), ETHUSD (observation only — chop state expected)
  - Section `## Pass criteria for superseding closeout` stating: NAS100 = `feedStatus=live`, US30 = `feedStatus=live`, XAUUSD = `feedStatus=live` + M1→15m candle count ≥ 180; AUDUSD and ETHUSD may remain chop-blocked without blocking Phase 0 gate
  - Section `## Outcome` with two fields to fill: `Validation completed at: [PENDING]` and `Superseding artifact path: [PENDING]`
- **Guard rails**: This file must not be pre-filled as passed. It must remain a checklist template until actual live observation data is recorded.
- **Why in scope**: The Copilot research report's open unknown §8 asks whether a superseding closeout artifact can be published; the parity audit at `.github/migration/audits/phase-0-full-parity-2026-05-14.md` prescribes exactly this artifact. The checklist formalizes the gate condition so the superseding artifact has a defined pass criterion.
- **Acceptance criterion**: File exists, contains per-symbol pass/fail table with PENDING outcome, and is referenced in the Phase 0 blockers section of `migration-status.md`.

---

## 3. Patch sequence

1. **Read and confirm** `.github/migration-status.md` current content to identify exact line positions before editing. (No dependency; can proceed immediately.)
2. **Edit** `.github/migration-status.md` — add post-fix validation pending notation to the NAS100/US30 and XAUUSD blocker entries; add superseding artifact gate bullet. (Depends on step 1.)
3. **Read and confirm** `.github/migration/phase-updates/phase-0-completion-2026-05-14.md` current content. (Independent of steps 1–2; can run in parallel with step 1.)
4. **Edit** `phase-0-completion-2026-05-14.md` — add `## Fix Deployment Status` section and append to `## Conclusion`. (Depends on step 3.)
5. **Write** new file `.github/migration/phase-updates/phase-0-post-fix-validation-checklist-2026-05-14.md`. (Independent; can run in parallel with steps 1–4.)
6. **Edit** `.github/migration-status.md` again (or in step 2) to add cross-reference link to the new checklist file under the Blockers section. (Depends on step 5.)

**Sequencing risk**: Steps 2 and 6 both touch `migration-status.md`. Merge them into a single edit pass to avoid overwrite collisions. Steps 3–4 and step 5 are independent and can be applied in any order after step 2.

**State risk**: None. These are documentation-only changes. No cache, migration schema, or API contract is involved.

---

## 4. Regression guards

- **After edits**: Confirm `migration-status.md` Phase 0 overall status header still reads `BLOCKED`, not `COMPLETE`. A reader doing a grep for `Status: BLOCKED` must still return a match on the Phase 0 row.
- **After edits**: Confirm the Phase 0 table row still shows `BLOCKED` in the Phase Summary table, not `IN PROGRESS` or `COMPLETE`.
- **After edits**: Confirm all previously `[x]` checklist items in `migration-status.md` remain checked. No regression on already-completed deliverables.
- **After edits**: Confirm `phase-0-completion-2026-05-14.md` still contains `Phase 0 closeout: blocked` and `Ready for Phase 1: NO` in its Conclusion section.
- **After new file created**: Confirm the new checklist file's Outcome section reads `[PENDING]` — not a pre-filled pass.
- **Parity re-validation**: Not applicable to documentation changes. No backend, MT5, or PHP code is touched.
- **Logging/diagnostics**: No code-level logging changes are in scope. The checklist file itself is the diagnostic artifact.

---

## 5. Non-goals

**Out of scope for this patch:**
- Any edit to `mt5/MarketDataEngine.mqh`, `mt5/SymbolNormalizer.mqh`, or `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — those code changes are already merged via PRs #170 and #171 and must not be re-touched.
- Writing the superseding Phase 0 closeout artifact — that artifact requires actual live validation data from a post-fix soak, which is not yet available. It cannot be written from repo state alone.
- Marking Phase 0 as complete or advancing the migration phase board to Phase 1.
- Any change to AUDUSD or ETHUSD chop-gate logic — this was audited and classified as correct behavior.
- Updating `reports/codex-implementation.md` — that file records the original soak closeout state and must remain as the immutable historical record.
- Touching `reports/snapshots/stabilize-ea-2026-05-14/MANIFEST.md` or any snapshot artifact.

**Attractive but unsafe follow-on changes to avoid:**
- Do not relax `staleThresholdSec` or any MT5 session window to make NAS100/US30 appear live before live validation confirms the fix is working. That would defeat stale-data protections.
- Do not pre-fill the validation checklist as passed based on the fact that the code fix is merged. Merged ≠ live-confirmed.
- Do not create a Phase 0 superseding closeout artifact with placeholder data. The artifact must be backed by actual live health check observations.
- Do not advance the Phase 1 prerequisites entry in `migration-status.md` while Phase 0 is still gated.

---

## 6. Risk assessment

**Worst-case failure mode if patched incorrectly**: The migration board is prematurely updated to show Phase 0 as COMPLETE before live validation passes. This would create false confidence that the system is ready for Phase 1, potentially allowing the bridge infrastructure work to begin while NAS100/US30 are still stale in production — masking the failure and making it harder to diagnose later.

**User-visible failure mode**: Dashboard still shows stale feed / PRICE_NOT_MT5_FRESH for NAS100 and US30 after the tracker says Phase 0 is closed. This destroys trust in the migration board as a source of truth.

**Backend authority or stale-state risks**: None from documentation-only edits. The PHP health check and MT5 freshness engine logic are not modified. Stale-data protections remain intact.

**Human approval required before merge**: Yes. The decision to advance Phase 0 to COMPLETE and publish a superseding closeout artifact is explicitly classified as requiring human signoff in the research report (§7 risk flags). The documentation edits in this plan (marking tasks in-progress, adding a validation checklist) do not require human approval before merge. The superseding artifact itself does.

---

## 7. Test requirements

**Tests to add or update:**
- No automated test additions are in scope for this documentation patch.
- The new `phase-0-post-fix-validation-checklist-2026-05-14.md` file IS the test protocol for the live validation soak.

**Existing checks that must still pass after this patch:**
- Manual: Open `migration-status.md` and confirm Phase 0 table row still reads `BLOCKED`.
- Manual: Open `phase-0-completion-2026-05-14.md` and confirm Conclusion section reads `Phase 0 closeout: blocked` and `Ready for Phase 1: NO`.
- Manual: Confirm no `[x]` item in the Phase 0 deliverables or success criteria has been changed to `[ ]`.

**Live-environment verification required (not by this plan — triggers superseding closeout):**
1. Deploy the updated EA binary (from merged PRs #170, #171) to the live MT5 terminal. Confirm EA reload completes without compile errors.
2. Restart the backend PHP service to pick up equity-index off-session logic changes.
3. Monitor the live health endpoint for NAS100 and US30 status. Pass condition: both symbols transition from `PRICE_NOT_MT5_FRESH` to `feedStatus=live` during their active trading window (13:30–20:00 UTC on a trading day).
4. Allow at least 7.5 hours of MT5 candle accumulation for XAUUSD after EA restart. Pass condition: XAUUSD shows ≥ 180 M1 candles and `INSUFFICIENT_CANDLE_HISTORY` clears.
5. Confirm AUDUSD and ETHUSD remain at `CHOP_GATE_BLOCKED` or transition to live based on live market conditions only — no code-driven change to their state.
6. Record the live health check snapshot and populate the validation checklist. If all three primary symbols pass, write the superseding Phase 0 closeout artifact and then change migration board Phase 0 status to COMPLETE.

---

## 8. Implementation handoff

**Branch naming recommendation**: `docs/phase0-closeout-task-verification-2026-05-14`

**Suggested commit grouping**:
- Commit 1: `docs(phase0): mark fix deployment status in completion log and migration board`
  - `.github/migration-status.md` (blocker sub-bullets + checklist cross-reference)
  - `.github/migration/phase-updates/phase-0-completion-2026-05-14.md` (Fix Deployment Status section + Conclusion append)
- Commit 2: `docs(phase0): add post-fix validation checklist gate artifact`
  - `.github/migration/phase-updates/phase-0-post-fix-validation-checklist-2026-05-14.md` (new file)

**Required reports or artifacts after implementation**:
- The validation checklist file itself is the artifact. No additional reports.
- After the live validation soak completes and passes (separate future task): write `phase-0-superseding-closeout-[date].md` and update `migration-status.md` Phase 0 row to COMPLETE.

**State transition**: `READY_FOR_IMPLEMENTATION` | `editing_locked=false`
