# SMC SuperFIB Dashboard Agent and Skill Operating Model

## Purpose
This repo supports interchangeable use of three agent environments:
- Claude Code
- Codex
- GitHub Copilot Agent

`AGENTS.md` is the primary cross-agent operating model for this repository. It defines the shared project context, workflow rules, skill guidance, guardrails, and evidence expectations.

## Read First
1. `AGENTS.md` — canonical cross-agent entry point.
2. `docs/agents/skill-index.md` — shared skill workflows for Codex and Copilot.
3. `CONTEXT.md` — SMC SuperFIB domain glossary and avoid language.
4. `docs/agents/workflow.md` — repo workflow and state guidance.

## Cross-Agent Skill Rule
- Claude Code may additionally use `.claude/skills/*`.
- Codex and GitHub Copilot must use `docs/agents/skill-index.md` as the cross-agent version of the same skill workflows.
- Skills describe workflow patterns, not slash-command syntax.
- Do not assume agent-specific commands work across all systems.

## Skill Governance and Validation

**Skill Reference Validation**
- Every skill listed in **Skill Selection Rules** must have a matching entry in `docs/agents/skill-index.md` and a corresponding implementation file under `.claude/skills/`.
- Each skill definition must include **validation steps** that demonstrate how the skill's outcome will be verified (e.g., lint, tests, parity checks, UI screenshots).
- Before any code change, run the skill's validation commands and capture their output in `reports/`.
- If a skill lacks a validation step, add a **"Demo / Validation Example"** section to its `SKILL.md` (see examples in other skill files).

- Agents should **cross‑check** that the skill name, description, and workflow match between `AGENTS.md`, `docs/agents/skill-index.md`, and `.claude/skills/`.
- Any drift should be corrected immediately to keep the cross‑agent model consistent.

## Skill Selection Rules
- Use `diagnose` for broad problem discovery, bug sweep, and assessing what layers are involved.
- Use `grill-with-docs` when the issue requires deep investigation using repo docs, existing reports, or architecture notes.
- Use `tdd` for intentional code/test cycles and when adding or improving automated coverage.
- Use `prototype` for experimental design or architecture proof-of-concept.
- Use `to-prd` when preparing a patch for production readiness.
- Use `to-issues` when converting findings into tracked tasks or repo issues.
- Use `triage` when issue classification, label assignment, or blocker determination is needed.
- Use `handoff` for final delivery instructions and verification details.
- Use `zoom-out` for high-level project planning or scope alignment.
- Use `improve-codebase-architecture` for structural refactors or architecture improvements.
- Use SMC-specific skills when behavior mentions Pine/MT5 parity, EA/backend bridge, dashboard plan cards, or workflow runner state.

## Repo-Specific Skill Wrappers
This repository also defines SMC-specific workflow wrappers:
- `pine-mt5-fib-parity`
- `ea-backend-bridge`
- `dashboard-plan-cards`
- `workflow-runner`

These wrappers are documented in `docs/agents/skill-index.md` and implemented as `.claude/skills/*` for Claude-specific use.

## General Workflow Rules
- Preserve local workflow state files such as `.smc-workflow-state.json` and `reports/` artifacts.
- Do not overwrite workflow state without reading it first.
- Do not force push.
- Do not delete branches.
- Do not delete platform-specific config files.
- Do not remove lockfiles without an explicit repo-specific reason.
- Avoid broad formatting-only diffs during logic fixes.
- Before automation or workflow changes, inspect `.github/workflows/`, package scripts, and workflow state/report files.

## Testing and Evidence Rules
- Do not claim tests passed unless you actually ran the command and cited the output.
- If a requested validation is not available, explain it clearly.
- Prefer small, testable vertical slices and incremental verification.
- For docs-only work, do not invent runtime behavior.

## Git and Automation Guardrails
- Prefer feature branches over `main`.
- Keep branch names descriptive and task-focused.
- Commit only files related to the task.
- Every session that changes files must end on a feature branch with a normal GitHub PR opened.
- If a session is read-only or produces no file changes, explicitly state that no branch or PR was created.
- When a PR is opened, include exact validation commands and results.
- If the repo has a local pipeline watcher or `reports/` state, preserve it and do not modify without cause.

## Existing Repo Guidance
This repo also contains `.github/AGENTS.md` as an agent-specific artifact definition file. That file is complementary and does not replace `AGENTS.md` as the cross-agent operating model.

## Summary
- `AGENTS.md` is the shared, canonical entry point for all agents.
- `docs/agents/skill-index.md` is the cross-agent skill directory Codex and Copilot should use.
- Claude Code may use `.claude/skills/*` as supplemental implementation guidance.
- Keep all work SMC-specific, evidence-driven, and aligned with Pine/MT5 parity rules.
