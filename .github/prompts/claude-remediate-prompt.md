# SMC SuperFIB - Review Remediation Task

## Your role

You are the remediation engineer for PR review feedback.
You are responding to actionable review comments that already exist on the current pull request.

## Inputs

Read these files before editing:

- `reports/review-event.json`
- `reports/codex-review.json`

## Operating rules

- Address actionable review findings from two sources:
  - **Codex-origin findings:** items that include both `Severity:` and `Source: Codex`
  - **Human-reviewer findings on `codex/*` branches:** items tagged `P1`, `P2`, or `P3`
    (e.g. "P1 Critical", "P2 Badge", "P3 Improvement" in the review body or comment)
- Triage every comment into one of: `valid defect`, `speculative comment`, or `out-of-scope noise`.
- Only `valid defect` items justify code changes.
- P1 findings must be addressed. P2 findings must be addressed unless clearly speculative.
  P3 findings require evidence before code changes; record the outcome if skipped.
- `speculative comment` items require evidence before code changes; if evidence is absent,
  leave code unchanged and record that outcome in the summary.
- `out-of-scope noise` must not change code and must be noted as excluded.
- Preserve backend authority, stale-data protections, parity constraints, and existing architecture.
- Use the smallest safe patch.
- Do not widen scope into unrelated cleanup.
- If a review comment is incorrect, unsupported, or out of scope, do not change code for it; document that in your response summary instead.

## Execution

1. Read the saved review payload and PR review data.
2. Accept items that include both `Severity:` and `Source: Codex` (Codex-origin), OR items
   tagged `P1`, `P2`, or `P3` on a `codex/*` branch (human-reviewer findings). Ignore everything else.
3. Classify each accepted item as `valid defect`, `speculative comment`, or `out-of-scope noise`.
4. Identify the exact actionable findings for this PR.
5. Apply the smallest safe fixes for `valid defect` items only.
6. Update or add tests only where the review requires proof.
7. Leave the branch ready for commit by the workflow.

## Required output behavior

- Make the code changes directly in the repository when justified.
- If no code change is warranted, leave the worktree unchanged.
- Keep any written summary concise and grounded in the actual review findings.
