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
3. If `editing_locked` is `true` OR `state` is not `READY_FOR_IMPLEMENTATION`:
   - REFUSE the edit
   - Respond with:

     ```
     EDIT BLOCKED
     Workflow state: [state field value]
     Issue: [issue field value]

     Editing is locked until the local pipeline reaches READY_FOR_IMPLEMENTATION.
     Save `reports/copilot-research.md` and let the pipeline harden the plan first.
     ```

4. If `editing_locked` is `false`, `state` is `READY_FOR_IMPLEMENTATION`, and both artifacts below exist: proceed normally.
5. If the file does not exist: proceed normally.

## Artifact Requirements

- Never advance to implementation unless BOTH of these files exist:
  - `reports/copilot-research.md`
  - `reports/codex-plan.md`
- `.smc-workflow-state.json` is a local runtime file. Never stage or commit it.

## Workflow States Reference

| State                    | Editing Allowed |
| ------------------------ | --------------- |
| IDLE                     | Yes             |
| RESEARCHING              | No              |
| PLANNING                 | No              |
| READY_FOR_IMPLEMENTATION | Yes             |
