# Workflow Governance Rules

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
