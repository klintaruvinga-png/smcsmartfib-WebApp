markdown---
mode: agent
description: Run Codex planning pass from existing research artifact
---

@workspace

Follow the planning contract in .github/prompts/codex-plan-prompt.md exactly.

Read reports/copilot-research.md as your only input.

Produce a tight implementation contract that defines:
1. Exact files and functions to change
2. Patch scope — what changes, what does not
3. Acceptance criteria
4. Non-goals
5. Regression guards

Codex = Implementation Governance Layer.
Reject any weak hypothesis from the research artifact.
Do not implement. Contract only.

Save output to reports/codex-plan.md.
Overwrite if the file already exists.
