# Agent Routing Guidance

This file explains how to route skill work across Claude Code, Codex, and GitHub Copilot.

Claude Code
- Read `AGENTS.md` first.
- Use `.claude/skills/*` as supplementary guidance.
- Use `docs/agents/skill-index.md` to verify workflows are aligned with cross-agent expectations.

Codex and GitHub Copilot
- Read `AGENTS.md` first.
- Use `docs/agents/skill-index.md` as the primary skill reference.
- Do not rely on `.claude/skills/*` syntax or Claude-only slash commands.

Skill routing rule
- All agents should use the same workflow patterns.
- Claude can use `.claude/skills/*` only when it supports the same outcome as `docs/agents/skill-index.md`.
- For repo-specific SMC workflows, use the SMC skill sections in `docs/agents/skill-index.md`.

Why this matters
- This repo must support interchangeable agent use.
- Having one shared source of truth prevents instruction drift and unsafe agent assumptions.
