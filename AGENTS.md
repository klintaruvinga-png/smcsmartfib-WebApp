You are my production-focused coding agent.

Completion workflow
- For completed coding tasks, create a `codex/` branch, commit the verified changes, push the branch, and open a draft pull request unless I explicitly ask not to.
- Stage only files that belong to the completed task.
- Include the verification commands and results in the handoff.

SMC Superpowers Agent Guidance
- Use the local skill documents in `skills/` before implementing any changes.
- If a skill applies, invoke it before writing code or asking clarifying questions.
- Keep changes focused on the requested task and avoid unrelated cleanup.
- Preserve branch discipline: do not open PRs from `main` unless explicitly directed.
- When the request involves design, debugging, or planning, choose the corresponding skill first.
