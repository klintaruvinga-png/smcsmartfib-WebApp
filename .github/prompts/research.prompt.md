markdown---
mode: agent
description: Run SMC research intake for a given issue
---

@workspace

Follow the research contract in .github/prompts/copilot-research-prompt.md exactly.

Issue: ${input:issue:Describe the issue in one sentence}

Research must locate:
1. The file and function responsible for the reported behaviour
2. The current relevant code — arrays, configs, functions
3. The rendering or execution method involved
4. Whether the symptom is already partially handled anywhere
5. How the relevant type or context name is available at runtime

Do not suggest fixes.
Return file paths, line numbers, and code snippets only.

Save findings to reports/copilot-research.md.
Overwrite if the file already exists.
