---
name: research-and-plan
description: Run the global research‑and‑plan pipeline watcher on the current repository.
---

# /research-and-plan

Invokes the **global research‑and‑plan** automation that:

1. Starts the `pipeline-watcher` using the current working directory as the repo root.
2. Verifies the research findings, hardens the plan, and runs the Codex implementation.
3. Prints the watcher’s log output so the user can see the status.

The command does **not** perform the research step itself – that is handled by Copilot. It simply validates the research artifact, runs plan hardening, and drives the implementation.

## Usage
```
/research-and-plan
```

The skill runs the helper script `scripts/run-research-and-plan.js` which forwards to the existing `scripts/pipeline-watcher.js` with `--repo <cwd>`.

## Requirements
- The `codex` CLI must be installed and on the system `PATH`.
- The repository must contain the standard pipeline configuration (see `scripts/pipeline-config.js`).

When invoked, the skill will output the watcher’s log lines directly to the console.
