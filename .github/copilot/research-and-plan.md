# /research-and-plan

## Step 1 — Validate Input

The user MUST provide an issue description after the command.

Format:
```
/research-and-plan
SMC_ISSUE: [description of the issue]
```

If `SMC_ISSUE:` is missing, respond:

```
❌ Missing issue description.
Usage: /research-and-plan
SMC_ISSUE: [describe the issue]
```

Do NOT proceed without it.

## Step 2 — Create Workflow Lock

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
🔒 Workflow locked — State: RESEARCHING
Copilot editing blocked. Claude Code will implement via Workflow 02.
```

## Step 3 — Research

Follow the research contract in `.github/prompts/copilot-research-prompt.md` exactly.

- Read files, trace logic, identify root causes
- DO NOT edit any source files
- DO NOT generate patches or implementation code

Save findings to `reports/copilot-research.md` (overwrite if exists).

Update `.smc-workflow-state.json` → `"state": "PLANNING"`.

## Step 4 — Plan

Follow the planning contract in `.github/prompts/codex-plan-prompt.md` exactly.

Read `reports/copilot-research.md` as the only input.
Produce a tight implementation contract.

Save output to `reports/codex-plan.md` (overwrite if exists).

Update `.smc-workflow-state.json` → `"state": "READY_FOR_IMPLEMENTATION"`.

## Step 5 — Autopush

Run these shell commands in sequence. Do NOT skip any step. Do NOT ask for confirmation.

```bash
cd "${workspaceFolder}"
git add reports/copilot-research.md reports/codex-plan.md .smc-workflow-state.json
git commit -m "chore(pipeline): research and plan — [issue slug]"
git push
```

Report the git output (commit hash + push confirmation).

The push triggers **Workflow 02** automatically, which runs Claude Code to implement the plan and open a PR.

## Step 6 — Confirm Handoff

```
✅ Pipeline handed off.
📄 reports/copilot-research.md — saved
📄 reports/codex-plan.md — saved
🔒 Copilot editing remains locked — Claude Code owns implementation
🚀 Workflow 02 triggered — Claude will implement and open a PR

No further action required until merge.
```

DO NOT perform any source code edits after this point.
Copilot's role in this issue is complete.
