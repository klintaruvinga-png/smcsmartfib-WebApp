# Agent Workflow and State Guidance

This file explains how the repo manages agent work, workflow state, and validation.

Shared workflow model
- `AGENTS.md` is the canonical cross-agent operating model.
- Claude Code may additionally use `.claude/skills/*`.
- Codex and GitHub Copilot must use `docs/agents/skill-index.md` for skill workflows.

Local workflow state
- `.smc-workflow-state.json` captures pipeline progress and editing permissions.
- Preserve this file and read its state before making edits.
- Do not hand-edit workflow state unless the repo specifically instructs it.

Reports and artifacts
- Use `reports/` for local planning, analysis, and pipeline artifacts.
- Do not delete or overwrite existing report files without a clear reason.
- Keep report metadata consistent with the current issue and workflow state.

Validation rules
- Do not claim tests passed unless the command was run and output was cited.
- Prefer incremental validation: lint, docs checks, and targeted test commands.
- For docs-only updates, document what was checked and why runtime validation may not apply.

Routing note
- Use `docs/agents/agent-routing.md` to decide whether to follow `.claude/skills/*` or `docs/agents/skill-index.md`.
