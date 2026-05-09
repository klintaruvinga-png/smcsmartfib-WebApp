# /research-and-plan

## Step 1 - Validate Input

Preferred UX:

```
/research-and-plan
```

Type one issue sentence when prompted.

Fallback format:

```
/research-and-plan
SMC_ISSUE: [description of the issue]
```

Normalize both entry paths to one internal payload:

```text
SMC_ISSUE: [single-line issue description]
```

If the issue payload is empty, missing, multi-line, or unresolved, respond:

```
ERROR: Missing issue description.
Usage: /research-and-plan
SMC_ISSUE: [describe the issue]
```

Do NOT proceed without it.

## Step 2 - Create Workflow Lock

Create `.smc-workflow-state.json` in the repository root:

```json
{
  "workflow": "research-and-plan",
  "state": "RESEARCHING",
  "issue": "[the SMC_ISSUE value]",
  "editing_locked": true,
  "started_at": "[current ISO timestamp]"
}
```

Confirm to the user:

```
Workflow locked - State: RESEARCHING
Copilot editing blocked. Research only.
```

## Step 3 - Research

Follow the research contract in `.github/prompts/copilot-research-prompt.md` exactly.

- Read files, trace logic, identify root causes
- DO NOT edit any source files
- DO NOT generate patches or implementation code

Save findings to `reports/copilot-research.md` (overwrite if exists).

Update `.smc-workflow-state.json` to:

```json
{
  "workflow": "research-and-plan",
  "state": "PLANNING",
  "issue": "[the SMC_ISSUE value]",
  "editing_locked": true
}
```

## Step 4 - Handoff

Do NOT write `reports/codex-plan.md` yourself.

The local `npm run pipeline` runner owns the next two stages:

- Claude hardens `reports/copilot-research.md` into `reports/codex-plan.md`
- Codex implements from `reports/codex-plan.md`, pushes a branch, and opens a normal PR

Before handoff is considered complete, start or confirm the detached local runner:

```bash
npm run pipeline:start
```

## Step 5 - Confirm Handoff

```
Pipeline handed off.
reports/copilot-research.md - saved
Workflow state - PLANNING
Copilot editing remains locked
Local pipeline runner started or already active
Claude should now harden the plan into reports/codex-plan.md
Codex will implement and open a normal PR after the plan is ready

Do not edit source files or planning artifacts after this point.
```

Copilot's role in this issue is complete.
