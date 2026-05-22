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
