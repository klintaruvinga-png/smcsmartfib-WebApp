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
