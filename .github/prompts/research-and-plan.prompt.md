---
mode: agent
description: SMC intake - validate one issue sentence, lock editing, and produce the research artifact only
---

@workspace

SMC_ISSUE: ${input:issue:Describe the issue in one sentence}

You are running the intake stage of a multi-agent pipeline.

Validate the injected issue payload before doing anything else:

- it must be present
- it must be a single line
- it must not still contain a template token

Normalize the input to the internal contract:

```text
SMC_ISSUE: <single-line issue description>
```

If validation fails, stop immediately and return:

```text
ERROR: Missing issue description.
Usage: /research-and-plan
SMC_ISSUE: [describe the issue]
```

---

## STEP 1 - CREATE WORKFLOW LOCK

Create or overwrite `.smc-workflow-state.json` in the repository root with:

```json
{
  "workflow": "research-and-plan",
  "state": "RESEARCHING",
  "issue": "[normalized SMC_ISSUE value]",
  "editing_locked": true,
  "started_at": "[current ISO timestamp]"
}
```

Do not stage or commit `.smc-workflow-state.json`.

---

## STEP 2 - RESEARCH

Follow the research contract in `.github/prompts/copilot-research-prompt.md` exactly.

Save findings to `reports/copilot-research.md`.
Overwrite if the file already exists.

---

## STEP 3 - HAND OFF TO CLAUDE PLAN HARDENING

After saving `reports/copilot-research.md`, update `.smc-workflow-state.json` to:

```json
{
  "workflow": "research-and-plan",
  "state": "PLANNING",
  "issue": "[normalized SMC_ISSUE value]",
  "editing_locked": true,
  "started_at": "[original ISO timestamp]"
}
```

Do not write `reports/codex-plan.md`.
Do not implement code.
Do not stage or commit any files.

Start or confirm the detached local pipeline runner:

```bash
npm run pipeline:start
```

---

## STEP 4 - FINAL RESPONSE

Respond with exactly this handoff summary, replacing the issue text:

```text
Workflow locked - State: PLANNING
Issue: [normalized SMC_ISSUE value]
reports/copilot-research.md - saved
Copilot intake complete
Local pipeline runner started or already active
Local pipeline runner now owns:
1. Claude plan hardening -> reports/codex-plan.md
2. Codex implementation -> branch + normal PR
```
