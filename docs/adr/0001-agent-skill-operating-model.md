# ADR 0001: Agent and Skill Operating Model

## Status
Accepted

## Context
This repository is the SMC SuperFIB Dashboard / MT5 EA migration project. It spans Pine indicator validation, MT5 Expert Advisor bridge routes, WordPress backend persistence, and dashboard UI.

The project must support multiple agent environments: Claude Code, Codex, and GitHub Copilot Agent. Existing guidance is split across repo docs, `.claude`, and `.github` artifacts.

## Decision
Adopt a shared cross-agent operating model anchored in `AGENTS.md` and `docs/agents/*`.

- `AGENTS.md` is the primary, cross-agent source of truth.
- `docs/agents/skill-index.md` is the canonical skill catalog for Codex and Copilot.
- Claude Code may additionally use `.claude/skills/*` as supplemental guidance.
- Root-level `CLAUDE.md` and `.github/copilot-instructions.md` provide agent-specific entry points.
- `CONTEXT.md` captures SMC domain terms, project avoid language, and parity rules.

## Consequences
- All agents will follow the same workflow semantics.
- Claude-specific skill syntax is optional, not required.
- Codex and Copilot will not rely on `.claude/skills/*` or Claude-only slash commands.
- Workflow and state handling are preserved through repo artifacts and local workflow files.
- This approach reduces instruction drift and keeps docs aligned across agent environments.
