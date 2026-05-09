# Workflow Governance Rules

## Pre-Edit Check (MANDATORY)

Before performing ANY file edit, code generation, apply_patch, or write operation:

1. Check if `.smc-workflow-state.json` exists in the repository root
2. If it exists, read the `editing_locked` field
3. If `editing_locked` is `true`:
   - REFUSE the edit
   - Respond with:
     ```
     ⛔ EDIT BLOCKED
     Workflow state: [state field value]
     Issue: [issue field value]

     Editing is locked during research/planning.
     Run /unlock-implementation after codex-plan.md is verified.
     ```
4. If `editing_locked` is `false` or the file does not exist: proceed normally

## Artifact Requirements

- Never advance to implementation unless BOTH of these files exist:
  - `copilot-research.md`
  - `codex-plan.md`

## Workflow States Reference

| State | Editing Allowed |
|-------|----------------|
| IDLE | Yes |
| RESEARCHING | No |
| PLANNING | No |
| READY_FOR_IMPLEMENTATION | Yes |
