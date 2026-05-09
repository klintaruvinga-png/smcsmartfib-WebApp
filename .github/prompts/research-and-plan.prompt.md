---
mode: agent
description: SMC full intake — research repo and produce implementation contract in one pass
---

@workspace

SMC_ISSUE: ${input:issue:Describe the issue in one sentence}

You are running a two-stage intake pipeline. Complete both stages in sequence without stopping.

---

## STAGE 1 — RESEARCH

Follow the research contract in .github/prompts/copilot-research-prompt.md exactly.

Find and document:
1. The exact frontend file and function rendering the affected component
2. How the relevant API response is consumed on the frontend
3. Whether the symptom is a filter, a missing render, or absent data
4. Where labels or identifiers are currently rendered (or confirmed absent)
5. How the relevant type, family, or context name is available at render time
6. Confirm backend data shape matches what the frontend expects

Do not suggest fixes in this stage.
Return file paths, line numbers, and code snippets only.

Save findings to reports/copilot-research.md.
Overwrite if the file already exists.

---

## STAGE 2 — PLAN

Follow the planning contract in .github/prompts/codex-plan-prompt.md exactly.

Read reports/copilot-research.md as your only input.

Produce a tight implementation contract that defines:
1. Exact files and functions to change — frontend and backend separately
2. Patch scope — what changes, what does not
3. Label format if applicable — exact string pattern
4. Acceptance criteria — what done looks like
5. Non-goals — what must not change
6. Regression guards — what must not break

Rules:
- Codex = Implementation Governance Layer
- Reject any weak hypothesis from the research stage
- No implementation — contract only
- Scope must be minimal — visual fixes stay in the render layer only

Save output to reports/codex-plan.md.
Overwrite if the file already exists.

---

## STAGE 3 — AUTOPUSH

When both files are saved and verified, run the following shell commands in sequence.
Do not skip any step. Do not ask for confirmation.

```bash
cd "${workspaceFolder}"
git add reports/copilot-research.md reports/codex-plan.md
git commit -m "chore(pipeline): research and plan — ${input:issue}"
git push
```

This push triggers Workflow 02 automatically.
The pipeline is not complete until the push succeeds.
Report the git output (commit hash and push confirmation) at the end of your response.

---

Both files must be saved before this run is considered complete.
Updated daily flow
Your entire manual input is now:

/research-and-plan
Type the issue when prompted. Everything else is automated:

/research-and-plan
        ↓
Copilot researches + plans in one pass
        ↓
reports/copilot-research.md  ← saved
reports/codex-plan.md        ← saved
        ↓
Push codex-plan.md → Workflow 02 triggers
        ↓
Claude Code implements → PR
        ↓
Codex reviews → Claude remediates
One prompt. One issue sentence. Done.