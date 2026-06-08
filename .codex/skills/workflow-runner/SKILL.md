---
name: workflow-runner
description: Use when pipeline runner state, automation tasks, Codex workflow state, stale locks, or PR review fixes need local workflow handling.
---

# workflow-runner

Use when:
- The pipeline runner is stuck or automation tasks fail.
- Codex or agent workflow state is inconsistent.
- PR review comments require local fixes.

Workflow:
1. Read workflow state files.
2. Identify active or stale processes.
3. Preserve logs and state artifacts.
4. Clear only safe stale locks.
5. Resume or re-plan.
6. Document the outcome.

Expected output:
- State files inspected.
- Safe/unsafe cleanup list.
- Exact commands run.
- Resume recommendation.
