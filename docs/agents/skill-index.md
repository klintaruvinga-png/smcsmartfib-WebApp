# Agent Skill Index

This file is the shared cross-agent skill catalog for Codex and GitHub Copilot.
Claude Code should also align with these workflows.

## 1. diagnose
When to use:
- Broad bug discovery or when the root cause is unclear.
- Analyzing failing tests, parity mismatches, or system-wide failures.

Workflow:
1. Read `AGENTS.md` and `CONTEXT.md`.
2. Identify affected layers (Pine, MT5 EA, backend, dashboard).
3. Inspect code, logs, and reports.
4. Summarize findings and propose next skill or fix.

Repo-specific example:
- Investigate a failed `phase4-gate.json` parity run.

Expected output:
- A layer-by-layer diagnosis.
- Key suspect files and mismatch areas.
- Recommended next step.

## 2. grill-with-docs
When to use:
- Deep review with repo docs, ADRs, or reports.
- Audit existing guidance before changing architecture.

Workflow:
1. Read `docs/agents/`, `CONTEXT.md`, and relevant reports.
2. Identify the feature, process, or automation impacted.
3. Compare current behavior with documented intent.
4. Produce a focused implementation plan.

Repo-specific example:
- Review parity gate rules and compare with phase docs.

Expected output:
- Evidence from repo docs.
- Clear discrepancy list.
- Recommendation for patch scope.

## 3. tdd
When to use:
- Adding or improving tests alongside code changes.
- Protecting parity, data contracts, or dashboard display logic.

Workflow:
1. Identify relevant unit/integration test targets.
2. Write minimal failing tests for the bug or feature.
3. Implement the fix.
4. Confirm tests pass.

Repo-specific example:
- Add a component test for plan card currency display.

Expected output:
- Test file(s) added or updated.
- Regression protections documented.
- Exact test command used.

## 4. to-prd
When to use:
- Preparing a patch for production-ready delivery.
- Finalizing diagnostics, code changes, and validation.

Workflow:
1. Confirm the fix matches repo standards.
2. Verify with lint/test/docs commands.
3. Summarize changes and risks.
4. Prepare a PR-ready handoff.

Repo-specific example:
- Finalize an EA/backend bridge fix, cite `parity` and `workflow` impacts.

Expected output:
- A concise patch summary.
- Validation commands and results.
- Any known limitations or follow-up work.

## 5. to-issues
When to use:
- Converting findings into tracked issues or tickets.
- Documenting gaps without implementing immediately.

Workflow:
1. Capture the bug or improvement clearly.
2. Add context, steps to reproduce, and relevant files.
3. Recommend labels and readiness status.

Repo-specific example:
- Turn a parity mismatch investigation into `parity`/`ready-for-agent` issue.

Expected output:
- A well-formed issue description.
- Suggested labels and state.
- Links to relevant docs or artifacts.

## 6. triage
When to use:
- Assessing incoming requests, issue priority, or missing context.
- Deciding whether a task is ready for agent work.

Workflow:
1. Review the request or issue content.
2. Request missing information if needed.
3. Assign labels and readiness status.
4. Recommend the next agent workflow.

Repo-specific example:
- Label a dashboard currency mismatch issue `needs-info` or `ready-for-agent`.

Expected output:
- A triage decision.
- Required follow-up actions.
- Applicable labels.

## 7. handoff
When to use:
- Delivering the final implementation summary.
- Presenting validation and exact commands.

Workflow:
1. Summarize the work done.
2. List files changed and why.
3. Provide evidence commands and outputs.
4. Confirm the session branch and PR URL for any file-changing session.
5. Note any risks or unaddressed issues.

Repo-specific example:
- Handoff a parity patch with `phase4-gate` validation details.

Expected output:
- Clear handoff notes.
- Validation evidence.
- Branch and PR link when files changed.
- Recommended next steps.

## 8. prototype
When to use:
- Exploring alternative designs or architecture changes.
- Testing feasibility without full implementation.

Workflow:
1. Define the goal and scope.
2. Build a small proof of concept or architecture sketch.
3. Evaluate against repo constraints.
4. Recommend a follow-up plan.

Repo-specific example:
- Prototype a new plan card display data contract.

Expected output:
- Concept notes.
- Prototype code or diagrams.
- Recommendation to continue, revise, or stop.

## 9. zoom-out
When to use:
- High-level planning or scope alignment.
- Confirming technical direction for multi-layer work.

Workflow:
1. Review current issues, phases, and dependencies.
2. Map the problem across Pine, MT5 EA, backend, and dashboard.
3. Propose prioritized workstreams.
4. Document the tradeoffs.

Repo-specific example:
- Evaluate whether a parity fix requires backend, EA, and dashboard updates.

Expected output:
- A project-level summary.
- Recommended priorities.
- A concise roadmap.

## 10. improve-codebase-architecture
When to use:
- Structural refactors or cross-cutting architecture improvements.
- Improving reliability, parity, or data contracts.

Workflow:
1. Identify the architectural gap.
2. Review existing code and docs.
3. Propose a focused improvement.
4. Implement with minimal risk.

Repo-specific example:
- Refactor the MT5-to-backend fib generation path for parity clarity.

Expected output:
- Design rationale.
- Specific architectural changes.
- Regression protections.

## 11. pine-mt5-fib-parity
When to use:
- User mentions fib parity or `phase4-gate.json` failure.
- Pine draws differ from EA/backend.
- Anchor logic, AF/SF, HTF/LTF, or chop block behavior is under review.

Workflow:
1. Locate Pine source and backend/EA fib code.
2. Extract anchor and level rules.
3. Compare level generation, rounding, and normalization.
4. Compare session/timeframe rules.
5. Run parity validator if available.
6. Categorize mismatches and propose slices.

Expected output:
- Files inspected.
- Rule differences found.
- Parity risk summary.
- Proposed patch slices.
- Validation command or reason none was run.

## 12. ea-backend-bridge
When to use:
- User mentions heartbeat, market-stream, account-sync, symbol-sync, or license-check.
- EA logs and backend logs need comparison.
- Snapshot state or live sync is wrong.

Workflow:
1. Confirm EA event and route behavior.
2. Confirm REST route receipt.
3. Confirm DB persistence.
4. Confirm dashboard read path.
5. Identify the first broken layer.
6. Patch the smallest layer.
7. Verify end-to-end.

Expected output:
- Layer-by-layer status.
- First broken layer.
- Minimal fix plan.
- Test/evidence commands.

## 13. dashboard-plan-cards
When to use:
- User mentions plan cards, RR display, or currency display.
- Local/account currency mismatch exists.
- Min executable lot warnings are wrong.
- UI redesign or formatter issues are needed.

Workflow:
1. Inspect the plan card data contract.
2. Inspect formatter and helper logic.
3. Confirm account-symbol rules.
4. Patch display logic.
5. Add or update component tests.
6. Validate UI states.

Expected output:
- Data source inspected.
- Formatting/helper changes.
- Component test or manual validation path.
- Screenshot/state checklist if UI changed.

## 14. workflow-runner
When to use:
- The pipeline runner is stuck.
- A Codex task failed.
- PR review comments require local fixes.
- Automation lock or workflow state is inconsistent.

Workflow:
1. Read workflow state files.
2. Identify active or stale process.
3. Preserve logs.
4. Clear only safe stale locks.
5. Resume or re-plan.
6. Document outcome.

Expected output:
- State files inspected.
- Safe/unsafe cleanup list.
- Exact commands run.
- Resume recommendation.

## 15. workers-deployment
When to use:
- Deploying or updating Cloudflare Workers code.
- Testing Workers locally before production.
- Configuring bindings (KV, Durable Objects, service bindings).
- Validating environment variables and secrets.

Workflow:
1. Review `wrangler.jsonc` for build and deployment config.
2. Run `wrangler dev` to test locally and validate bindings.
3. Test all environment variables and KV access in dev mode.
4. Confirm no errors in `npm run build` output.
5. Deploy with `wrangler publish` and validate production endpoint.
6. Include deployment command output and validation results in PR.

Expected output:
- Local validation results from `wrangler dev`.
- Build output confirming no errors.
- Exact `wrangler publish` output showing deployment success.
- Production endpoint validation or health check result.
- Any new or modified bindings documented.

Repo-specific example:
- Deploy updated API endpoint or cache invalidation logic to Cloudflare Workers.

## 16. workers-diagnostics
When to use:
- Workers are experiencing performance issues or errors in production.
- Investigating Workers logs or analytics.
- Debugging binding access or environment variable issues.
- Analyzing request latency or error rates.

Workflow:
1. Use Cloudflare MCP observability server to fetch recent logs.
2. Review error patterns and failure rates.
3. Check Workers analytics for performance metrics.
4. Inspect binding access logs (KV, Durable Objects).
5. Correlate issues with recent deployments or config changes.
6. Propose fixes or diagnostic next steps.

Expected output:
- Log entries showing error patterns or timestamps.
- Analytics summary (error rate, latency, request count).
- Identified root cause or suspect component.
- Recommended fix or escalation path.
- Commands run and exact results.

Repo-specific example:
- Diagnose high error rate on market data endpoint and identify missing KV binding.
