# Codex Review Prompt

Review the current pull request for correctness, regressions, stale-state risks, contract drift, and scope violations.

Rules:

- Post only actionable findings.
- If no material findings exist, say so plainly.
- Every actionable review comment or review body must include both markers:
  - `Source: Codex`
  - `Severity: <critical|high|medium|low>`
- Keep comments grounded in repository evidence and the current PR diff.
- Do not request speculative cleanup unrelated to the failure path.
