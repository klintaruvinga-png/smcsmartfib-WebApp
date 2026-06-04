# Issue Tracker Guidance

This repo uses GitHub Issues and PRs for implementation tracking, while local planning and workflow state may live in repo artifacts.

Use GitHub Issues/PRs for:
- Implementation tasks and bug fixes.
- Tracking parity, EA/backend, dashboard, and workflow issues.
- Code review, branch coordination, and release gate decisions.

Local planning and artifacts
- Use `reports/`, `docs/`, or `.scratch/` for draft notes, analysis, and workflow state artifacts.
- Preserve local planning files unless explicitly asked to clean them up.
- Do not overwrite `.smc-workflow-state.json` without reading the current state first.

Task readiness markers
- `AFK-ready` — the task is ready for agent execution with minimal human input.
- `HITL-required` — human-in-the-loop review or decision is required before progress.
- `blocked` — external dependency, missing information, or environment issue prevents work.
- `deferred` — the task is intentionally postponed.

When to create a task
- Create a GitHub issue for new bugs, enhancements, parity gaps, and workflow blockers.
- Link local artifacts under `reports/` or `docs/` when the task requires extra analysis.
- Use issue labels and commentary to indicate whether the task is ready for agent work.

Best practices
- Include the exact repo path, relevant files, and any validation commands.
- Prefer short, factual issue descriptions with clear acceptance criteria.
- Use repo-specific terms like Pine visual authority, parity gate, and market-stream.
