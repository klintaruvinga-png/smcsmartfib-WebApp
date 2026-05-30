---
name: using-superpowers
description: Use when starting any task in this repository and deciding whether to apply project-specific skills.
---

# Using SMC Superpowers

This repository includes local skill documents under `skills/` that shape how tasks should be approached. Consult them before taking implementation action.

## Priority
1. User's explicit request
2. Root guidance in `AGENTS.md` and `CLAUDE.md`
3. Local skills in `skills/`
4. Default system behavior

## When to Use
- Starting a new feature, fix, or refactor
- Deciding whether a process or design skill applies
- Preparing to write code, tests, or documentation
- Choosing how to handle debugging or review work

## How to Use
- If a local skill applies, invoke it before writing or editing code.
- Prefer process skills first (`brainstorming`, `systematic-debugging`) and then implementation skills (`writing-plans`).
- For user requests that are explicitly narrow, still verify that no applicable skill should be used.

## Rule
If there is even a small chance a skill applies, consult the corresponding document before acting.
