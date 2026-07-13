## 1. Issue validation

### Confirmed

**Phase 1 field execution prerequisites are fully met.**
Research confirms all 8 pre-validation prerequisites complete: EA build identified (build 5836), backend APIs implemented and PHP-tested, Deriv.com Demo account available, MT5 terminal access confirmed with EA deployed, broker/server/account type recorded, MT5 build recorded, and bridge auth config (WebhookURL, ApiKey, UserId) configured.

**`PHASE1_CHECKLIST.md` prerequisites section shows unchecked items despite the evidence being available.**
The research explicitly lists each prerequisite as `[x]` complete, but the checklist file still has `[ ]` (unchecked) for all 8 items. This is a documentation state drift: field evidence is in the research report but has not been committed to the canonical checklist file.

**`PHASE1_TRACKER.md` blocker "Validation environment facts not yet recorded" is stale.**
The research records broker (Deriv.com), server (Deriv-Demo), account type (Demo), MT5 build (build 5836), EA deployment status, WebRequest status, and bridge config. The tracker blocker for missing environment facts can be closed with a targeted update.

**Live terminal validation (48h run, scenarios) is out of scope for automation.**
No automated tooling can execute the MT5 live terminal validation. Scenario evidence must be captured by Track A (terminal field team) and Track B (backend team). The plan does not attempt to fabricate or pre-populate those evidence fields.

### Likely

**Tracker completion percentage (20%) correctly reflects pre-live-run state.** Research cites 20% as current. With prerequisites recorded as done, the automation can update last-updated metadata but must NOT advance the gate percentage — that requires live scenario evidence.

### Unconfirmed

**Whether the EA compiles without error in MT5 build 5836 in the deployed terminal.** Research notes this as open unknown #1. Automatable check: inspect `mt5/SMC_MarketDataEA.mq5` for obvious syntax issues visible in the source, but full compilation can only be confirmed in the MT5 IDE.

---

## 2. Implementation contract

### File 1: `.github/migration/PHASE1_CHECKLIST.md` — UPDATE

- **Section to modify**: Pre-Validation Prerequisites
- **Exact change required**: Change all 8 prerequisite items from `- [ ]` to `- [x]` with the evidence already captured in the research report:
  - `[x] EA code complete and the exact validation build identified` — build 5836, `mt5/SMC_MarketDataEA.mq5`
  - `[x] Backend APIs available in the target validation environment` — 4 routes implemented and PHP-tested
  - `[x] Broker test/validation account available` — Deriv.com Demo
  - `[x] MT5 terminal access confirmed` — EA deployed per research
  - `[x] Broker name and server recorded in PHASE1_TRACKER.md` — Deriv.com / Deriv-Demo (recorded in this patch)
  - `[x] Account type recorded in PHASE1_TRACKER.md` — Demo (recorded in this patch)
  - `[x] MT5 build recorded in PHASE1_TRACKER.md` — build 5836 (recorded in this patch)
  - `[x] WebhookURL, ApiKey, and UserId configured for the validation environment` — confirmed per research
- **Update**: Change status line to `**Status**: IN PROGRESS — Prerequisites complete, awaiting live execution`
- **Guard rails**: Must NOT check any Track A or Track B execution items. Must NOT pre-fill gate sign-off fields. Must NOT modify the track C deferred item.
- **Why in scope**: Documentation state drift between research evidence and canonical checklist creates coordination ambiguity for Track A and Track B teams.
- **Acceptance criterion**: All 8 prerequisite checkboxes show `[x]`. Status line reflects prerequisites done but live execution pending. No Track A, Track B, or gate sign-off items are pre-checked.

---

### File 2: `.github/migration/PHASE1_TRACKER.md` — UPDATE

- **Section to modify 1**: Current Status block and Last-Updated header
- **Exact change required**: Update `**Last-Updated**` to `2026-05-15`. Update Current Status text to include environment readiness facts:
  - Phase 0 closeout verified against `.github/migration/phase-updates/phase0-soak-closeout-final-2026-05-15.md`
  - Backend bridge routes are implemented and PHP-regression-covered (all tests PASS)
  - Environment readiness recorded: Broker Deriv.com, Server Deriv-Demo, Account Demo, MT5 build 5836, EA deployed, WebRequest enabled, bridge auth configured
  - Pre-validation prerequisites: COMPLETE (8/8 per research report 2026-05-15)
  - Live terminal validation: PENDING — awaiting Track A execution start
- **Section to modify 2**: Blocker Log — close the "Validation environment facts not yet recorded" blocker row: set status to RESOLVED and add resolution detail: "Recorded: Deriv.com / Deriv-Demo / Demo account / MT5 build 5836 / EA deployed / WebRequest enabled / bridge auth configured — 2026-05-15"
- **Guard rails**: Must NOT mark any gate progress checklist items as done. Must NOT change delivery status of pending deliverables. Must NOT advance phase completion percentage.
- **Why in scope**: The tracker blocker for missing environment facts is stale — facts are confirmed in research. Closing it removes a false open issue that would mislead Track B reviewers.
- **Acceptance criterion**: Last-Updated reflects 2026-05-15. Environment facts are recorded in the Current Status block. The "environment facts" blocker row shows RESOLVED with recorded facts inline. All gate progress checkboxes remain `[ ]`.

---

## 3. Patch sequence

1. **Update `PHASE1_CHECKLIST.md`** first — prerequisites section only. This is additive and has no dependency on the tracker state.
2. **Update `PHASE1_TRACKER.md`** second — Current Status block and Blocker Log. This references the checklist patch (prerequisites COMPLETE) so must follow step 1.
3. **No further file changes.** Do not touch `mt5/SMC_MarketDataEA.mq5`, any PHP backend file, any Pine script, any Vitest suite, or any frontend source file.

No migration, cache invalidation, or database state change is involved. Both files are markdown documentation only.

---

## 4. Regression guards

- **Verify gate progress section is unchanged**: All six `[ ]` items in the Phase Gate Progress section of `PHASE1_TRACKER.md` must remain unchecked after the patch.
- **Verify Track A and Track B execution items are unchanged**: All Track A (12 items) and Track B (7 items) in `PHASE1_CHECKLIST.md` must remain `[ ]` after the patch.
- **Verify gate sign-off fields are blank**: `Track A sign-off`, `Track B sign-off`, and `Phase 1 PASSED declaration` lines must remain as `____________________` with no content.
- **Verify no source files were touched**: Run `git diff --name-only` — only `.github/migration/PHASE1_CHECKLIST.md` and `.github/migration/PHASE1_TRACKER.md` should appear.
- **Existing protections that must hold**: PHP regression test suite state is unaffected (no PHP files changed). Watchlist persistence parity audit is unaffected. Pine source is unaffected.

---

## 5. Non-goals

- **Do not execute live MT5 terminal validation** — this requires human field execution in the Deriv.com Demo terminal.
- **Do not pre-fill Phase 1 scenario results** — terminal restart, VPS restart, internet interruption, duplicate heartbeat, invalid license, 48h heartbeat evidence must come from real execution.
- **Do not advance Phase 1 completion percentage** — 20% is the correct pre-execution state; only Track A + Track B sign-off can advance this.
- **Do not modify EA source code** — `mt5/SMC_MarketDataEA.mq5` is not in scope.
- **Do not modify PHP backend routes** — all four EA bridge routes are implemented and PHP-tested; no backend changes are needed.
- **Do not delete or archive Phase 1 tracking documents** — they are active canonical references.
- **Do not modify Pine scripts** — trading formulas are not affected by Phase 1 bridge validation.

---

## 6. Risk assessment

- **Worst-case failure mode**: Codex accidentally checks a gate progress item or pre-fills a sign-off date, creating false evidence that Phase 1 PASSED before live execution. This would corrupt the Phase 1 audit trail and allow Phase 2 to start without valid gate evidence.
- **User-visible failure mode**: If a Track B engineer reads the tracker and sees incorrect RESOLVED status on a blocker that is actually still open, they may skip a prerequisite check.
- **Backend authority risk**: None — no backend files are touched. PHP routes, WordPress database schema, and API contracts are unchanged.
- **Stale-state risk**: Low. Markdown documentation updates do not affect runtime state. No cache invalidation or live system state is involved.
- **Human approval required before merge**: YES — per the research report, Phase 1 gate requires Track A and Track B sign-off. The patch itself (prerequisites + environment facts recording) is low-risk, but the PR should be reviewed by the team lead before merge to confirm the environment facts match the actual deployment context.

---

## 7. Test requirements

- **Manual verification**: After patch, open `PHASE1_CHECKLIST.md` and confirm only the 8 prerequisite items are checked; all Track A and Track B items remain unchecked.
- **Manual verification**: Open `PHASE1_TRACKER.md` and confirm environment facts are recorded in Current Status, the environment-facts blocker shows RESOLVED, and all gate progress items remain unchecked.
- **Git diff check**: `git diff --name-only` must show only the two markdown files changed.
- **No new tests needed**: This patch only updates documentation. No code was changed; no new test suite is required.
- **Existing regression suites must remain green**: PHP backend tests (`test-ea-*.php`) must not be affected. Vitest frontend suite must not be affected. Both can be verified by confirming no source files were modified.

---

## 8. Implementation handoff

- **Branch naming**: `codex/complete-test-and-log-phase-1-step-below`
- **Commit grouping**: Single commit — "docs(phase1): record prereqs complete and environment facts in tracker/checklist"
- **Required artifacts after implementation**:
  - `reports/codex-implementation.md` with sections: Issue summary, Root cause implemented, Exact files changed, Tests run, Reports generated, Remaining risks, Any contract ambiguities resolved during implementation
- **State transition**: Set `.smc-workflow-state.json` state to `READY_FOR_IMPLEMENTATION` with `editing_locked=false` after this plan is accepted.
- **Remaining Phase 1 work (human-executed)**: Track A must execute live terminal scenarios and record evidence in `PHASE1_CHECKLIST.md`; Track B must validate backend logs for each scenario and update `PHASE1_TRACKER.md` gate progress; both tracks sign off before Phase 1 PASSED declaration.
