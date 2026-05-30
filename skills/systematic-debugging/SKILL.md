---
name: systematic-debugging
description: Use when investigating a bug, failure, or unexpected behavior before proposing a fix.
---

# Systematic Debugging

Find the root cause before making changes. Random fixes waste time and create new bugs.

## When to Use
- There is a bug, test failure, crash, or unexpected result
- Behavior is flaky, inconsistent, or hard to reproduce
- A code change could impact multiple subsystems

## Core rule
No fixes without root cause investigation first.

## Phases
1. Reproduce the issue reliably
2. Read error messages and logs carefully
3. Check recent changes and relevant code paths
4. Trace data flow to the source of the failure
5. Form a single hypothesis
6. Test minimally with one change at a time
7. Verify the fix with a regression test

## If a fix does not work
- Stop after the first failed hypothesis
- Re-examine the evidence
- Do not pile multiple unverified changes together

## Recommended output
Document the failing signal, the root cause, and the exact change needed before editing code.
