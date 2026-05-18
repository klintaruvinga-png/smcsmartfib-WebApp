# Workflow Governance Rules

## Intake Trigger Check (MANDATORY)

Before deciding whether to edit, inspect the current user message for either of these trigger markers:

- `/research-and-plan`
- `SMC_ISSUE:`

If either marker is present:

1. Enter intake mode immediately.
2. Parse the issue text from the message or prompted input.
3. Validate that the issue payload is:
   - present
   - single-line
   - not an unresolved template token
4. Create or update `.smc-workflow-state.json` with:
   - `workflow: "research-and-plan"`
   - `state: "RESEARCHING"` before research starts
   - `state: "PLANNING"` after `reports/copilot-research.md` is written
   - `editing_locked: true` for both states
5. Produce `reports/copilot-research.md` only.
6. Start or confirm the detached local runner with `npm run pipeline:start`.
7. Do NOT edit source files.
8. Do NOT write `reports/codex-plan.md`.
9. Do NOT implement the fix directly.
10. Do NOT treat the absence of `.smc-workflow-state.json` as permission to patch the issue.

If validation fails, respond with:

```text
ERROR: Missing issue description.
Usage: /research-and-plan
SMC_ISSUE: [describe the issue]
```

The intake trigger check takes priority over every normal edit path below.

## Pre-Edit Check (MANDATORY)

Before performing ANY file edit, code generation, apply_patch, or write operation:

1. Check if `.smc-workflow-state.json` exists in the repository root.
2. If it exists, read the `state`, `editing_locked`, and `issue` fields.
3. If `editing_locked` is `true`:
   - REFUSE the edit
   - Respond with:

     ```
     EDIT BLOCKED
     Workflow state: [state field value]
     Issue: [issue field value]

     Editing is locked until the local pipeline reaches READY_FOR_IMPLEMENTATION.
     Save `reports/copilot-research.md` and let the pipeline harden the plan first.
     ```

4. If `editing_locked` is `false`: proceed normally, regardless of `state`.
   - `IMPLEMENTATION_FAILED` always sets `editing_locked: false` — editing is allowed so
     you can fix the issue, revise research, or start a new `/research-and-plan` cycle.
   - To reset the pipeline to IDLE after inspecting the failure, run:
     `npm run pipeline:reset`
     This writes `reports/.pipeline-reset-requested` and the running watcher clears the
     state to IDLE within one poll cycle (≤ 5 seconds).
5. If the file does not exist: proceed normally.

## Artifact Requirements

- Never advance to implementation unless BOTH of these files exist:
  - `reports/copilot-research.md`
  - `reports/codex-plan.md`
- `.smc-workflow-state.json` is a local runtime file. Never stage or commit it.
- If `state` is `IMPLEMENTATION_FAILED`, inspect `reports/.codex-implementation-failed.json` and `reports/codex-last-message.txt` before starting a new cycle.
- Once `IMPLEMENTATION_COMPLETE`, the pipeline watcher polls GitHub every ~60 s for the merged PR on `codex/<issue-slug>`. When the PR is merged it archives the cycle artifacts to `reports/archive/` and resets state to `IDLE` automatically.
- To manually reset the pipeline to `IDLE` from any non-PLANNING state (e.g. after `IMPLEMENTATION_FAILED`), run `npm run pipeline:reset`. The watcher detects the sentinel file and resets within one poll cycle. Do NOT directly edit `.smc-workflow-state.json` by hand.
- `IDLE` means no active cycle. The next `/research-and-plan` trigger starts a fresh cycle.

## Workflow States Reference

| State                    | Editing Allowed | Notes |
| ------------------------ | --------------- | ----- |
| IDLE                     | Yes             | No active issue. Pipeline waiting for new trigger. |
| RESEARCHING              | No              | Copilot writing research artifact. |
| PLANNING                 | No (locked)     | Pipeline calling Claude to harden the plan. |
| READY_FOR_IMPLEMENTATION | Yes             | Plan hardened. Pipeline calling Codex. |
| IMPLEMENTATION_FAILED    | Yes             | Codex stopped. Inspect `.codex-implementation-failed.json`. Run `npm run pipeline:reset` to return to IDLE. |
| IMPLEMENTATION_COMPLETE  | Yes             | Codex opened PR. Pipeline polling for merge to close cycle. |
