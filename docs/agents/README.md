# Agent and Skill Docs for SMC SuperFIB Dashboard

This folder holds repository-level operating guidance for agent workflows.

Purpose
- Document the shared cross-agent model for Claude Code, Codex, and GitHub Copilot Agent.
- Provide a stable reference for skill selection, routing, domain context, and workflow state.
- Keep repo-specific agent guidance aligned across agent environments.

Key files
- `AGENTS.md` — primary cross-agent entry point.
- `docs/agents/skill-index.md` — shared skill catalog for Codex and Copilot.
- `docs/agents/workflow.md` — workflow state and change management.
- `docs/agents/agent-routing.md` — route skills between Claude and other agents.
- `docs/agents/domain.md` — SMC SuperFIB domain glossary and avoid language.
- `docs/agents/issue-tracker.md` — issue tracking and local planning guidance.
- `docs/agents/triage-labels.md` — repo triage label definitions.
- `docs/adr/0001-agent-skill-operating-model.md` — architecture decision record.

How to use
- Read `AGENTS.md` first for the canonical operating model.
- Use `docs/agents/skill-index.md` for all Codex and Copilot skill workflows.
- Use `.claude/skills/*` only as supplemental Claude-specific guidance.
