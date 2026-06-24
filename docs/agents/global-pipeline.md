# Global Agent Pipeline

The pipeline can be launched from this repository but target any compatible repository.

## Commands

```bash
npm run agent-pipeline -- init --repo /path/to/repo
npm run agent-pipeline -- check --repo /path/to/repo
npm run agent-pipeline -- status --repo /path/to/repo
npm run agent-pipeline -- start --repo /path/to/repo
```

If `--repo` is omitted, the current working directory is used. `AGENT_PIPELINE_REPO`
can also provide the target repo path.

## Project Contract

Each target repository should provide:

- `.agent-pipeline/config.json`
- `.github/prompts/claude-plan-prompt.md`
- `.github/prompts/claude-implement-prompt.md`

The default profile expects:

- Copilot writes `reports/copilot-research.md`
- Claude writes `reports/claude-plan.md`
- Claude writes `reports/claude-implementation.md`
- Implementation branches use the `claude/` prefix
- Codex verifies with focused local checks and report artifacts

## Runtime State

Global runner metadata is stored outside the target repo:

```text
~/.agent-pipeline/runs/<repo-hash>/
```

Repo-specific workflow artifacts stay inside the target repo under `reports/`.
