# Claude Code Instructions for SMC SuperFIB Dashboard

This repository supports interchangeable use of Claude Code, Codex, and GitHub Copilot Agent.

## Read Before Acting
1. Start with `AGENTS.md`.
2. Then review `docs/agents/skill-index.md` and `CONTEXT.md`.
3. If the task is workflow or state-related, also read `docs/agents/workflow.md`.

## How Claude Should Work Here
- Treat `.claude/skills/*` as supplemental guidance, not the only source.
- The canonical cross-agent model is `AGENTS.md` and `docs/agents/skill-index.md`.
- Do not assume other agents can execute Claude-specific slash commands or proprietary skill syntax.
- Skills are workflow patterns, not command syntax.

## Skill Behavior
- When a user asks for a skill-like operation, follow the skill workflow described in `docs/agents/skill-index.md`.
- Use `.claude/skills/<skill>/SKILL.md` only as an internal implementation reference for Claude.
- Keep output aligned with cross-agent expectations and avoid Claude-only framing.

## Evidence and Validation
- Cite exact commands and outputs for tests and validations.
- Do not claim a test or verification passed without running it.
- For docs or workflow changes, explain what was checked and why no runtime command was available if applicable.

## Branch and PR Behavior
- Follow the repo’s branch discipline and do not create PRs from `main` unless explicitly directed.
- Prefer descriptive feature branches.
- Commit only files relevant to the task.
- If a PR is needed, include exact validation commands and results in the body.

## Existing Repo Guidance
This repo also contains `.github/copilot-instructions.md` for Copilot and `.github/AGENTS.md` for agent-specific artifacts. Use those only as supplementary references.

## Local Skill Note
Claude Code may use `.claude/skills/*`, but the workflow must remain aligned with `docs/agents/skill-index.md` so that Codex and Copilot can follow the same guidance.

## Autonomous PR Creation

After completing any code patch, branch creation, and push, Claude must
always attempt to create a pull request automatically without waiting to
be asked.

### Rules

- Always run `gh pr create` after pushing a branch.
- If a PR already exists for the branch, skip silently and do not error.
- Always use `--fill` so the PR title and body are populated from the
  commit messages.
- Always create a normal open PR. The PR-created Codex review stage depends
  on an active PR, not a draft PR.

## SMC Superpowers Guidance

- Follow root `AGENTS.md` and local skills in `skills/` before implementation.
- Only open a PR after the final diff has been reviewed and approved.
- Target the repository's active development branch rather than `main`, unless
  the user explicitly directs otherwise.
- Document agent assistance in the PR body if the change was generated or
  guided by an AI workflow.

## PR Review Fix Stage (Local Claude Code)

After Codex opens a PR, the review-fix stage runs locally — not via GitHub Actions.
Workflow 03 (Autonomous Review Loop) is disabled because it requires paid Claude API
access (`ANTHROPIC_API_KEY`), which is not available.

### How to apply PR review fixes

When a Codex PR has review comments (P1 / P2 / P3 findings from `chatgpt-codex-connector`
or any reviewer on a `codex/*` branch):

1. The pipeline watcher has already written `reports/codex-review.json` with PR review data.
2. In Claude Code, say: **"Review PR #\<N\> and apply fixes"**
3. Claude Code reads `.github/prompts/claude-remediate-prompt.md` for triage rules,
   reads `reports/codex-review.json` for the review findings, applies P1/P2/P3 fixes,
   commits to the branch, and pushes.

### Triage rules (from claude-remediate-prompt.md)

- **P1** — must be addressed
- **P2** — must be addressed unless clearly speculative
- **P3** — requires evidence before code change; skip with documented reason if absent
- `valid defect` items → fix. `speculative comment` items → document, no code change.
- Never widen scope into unrelated cleanup.
- Never ask for permission before creating the PR.
- Never skip this step even if the patch was small or experimental.

### Exact command to run

```bash
gh pr create --fill 2>/dev/null || echo "PR already exists, skipping."
```

### PR body must always include

When Claude Code generates the PR body, it must contain:

- One paragraph summarising the issue
- Root cause identified
- Exact files changed and what changed in each
- Regression protections added
- Any parity impact (Pine / MT5 / Backend / Dashboard)
- Systems intentionally not touched (Do Not Touch list)

### When NOT to create a PR

- If the branch is `main` or `master`, never PR directly from main.
- If Claude was only asked to read or analyse files with no changes made.
