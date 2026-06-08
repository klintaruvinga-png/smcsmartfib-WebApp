---
name: tdd
description: Use when adding or updating tests alongside code changes to protect parity, data contracts, or UI behavior.
---

# tdd

Use when:
- You are adding or updating tests alongside code changes.
- You want to protect behavior around parity, data contracts, or UI formatting.

Workflow:
1. Identify the smallest relevant test surface.
2. Write a minimal failing test.
3. Implement the fix.
4. Confirm the new and existing tests pass.

Expected output:
- Tests added or updated.
- A clear link between the bug and the regression coverage.
- Exact test commands used.
