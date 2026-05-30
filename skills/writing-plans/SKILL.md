---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code.
---

# Writing Plans

Write a clear implementation plan that a skilled developer can follow without prior context.

## When to Use
- After design approval or when requirements are clear
- Before editing code for a feature, fix, or refactor
- When the task needs multiple steps or files

## What to include
- Goal and architecture summary
- Exact files to create or modify
- Specific tests to add or update
- Detailed step-by-step tasks with commands and expected results
- Plans should be test-driven, minimal, and YAGNI-aware

## Document structure
Start with a header that includes:
- Feature name
- Goal
- Architecture
- Tech stack

Then break the work into bite-sized tasks that each:
- describe a single action
- identify exact files
- include commands and expected output
- end with a commit step

## Rule
Avoid placeholders such as `TODO`, `TBD`, or vague task descriptions. Every step should be actionable and complete.
