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

Create `.smc-workflow-state.json` in the repository root with this exact content:

```json
{
  "workflow": "research-and-plan",
  "state": "RESEARCHING",
  "issue": "[the SMC_ISSUE value]",
  "editing_locked": true,
  "started_at": "[current ISO timestamp]"
}
```

Confirm creation to the user:

```
🔒 Workflow locked.
State: RESEARCHING
All file edits are blocked until unlock.
```

## Step 3 — Perform Research Only

- Analyze the codebase relevant to the stated issue
- Read files, trace logic, identify root causes
- DO NOT edit any files
- DO NOT generate patches
- DO NOT write implementation code

## Step 4 — Output Research Artifact

Create `copilot-research.md` in the repository root containing:

- Issue summary
- Affected files and line ranges
- Root cause analysis
- Proposed fix approach (plain English, no code)
- Open questions for Codex/Claude verification

## Step 5 — Update State

Update `.smc-workflow-state.json`:

```json
{
  "workflow": "research-and-plan",
  "state": "PLANNING",
  "issue": "[same issue]",
  "editing_locked": true,
  "research_complete": true
}
```

## Step 6 — Handoff

Respond:

```
✅ Research complete.
📄 copilot-research.md created.
🔒 Editing remains locked.

Next: Hand copilot-research.md to Codex for verification.
After Codex creates codex-plan.md, run:
/unlock-implementation
```

DO NOT perform any edits after this point.
