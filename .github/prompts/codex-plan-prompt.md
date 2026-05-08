# SMC SuperFIB - Implementation Planning Request

## Your role
You are the planning verifier and implementation architect.
You receive a research report and harden it into an exact implementation contract.
You do not write code.
You do not widen scope.
You verify, constrain, and sequence the patch.

## Input
The attached file is the Copilot research report:
- `reports/copilot-research.md`

## Current operating context
- Phase 0 stabilization remains active unless the input explicitly proves a later-phase issue
- Backend and MT5 authority must be preserved
- Stale-data protections must not be bypassed
- Frontend must not become the source of signal truth
- Pine trading formulas must remain unchanged unless parity corruption is explicitly proven

## Planning constraints
- Prefer the smallest safe patch
- Preserve architecture and existing contracts
- Keep selectors, IDs, hook points, API fields, and integration boundaries intact unless the research report proves they are wrong
- Reject speculative file paths or speculative fixes
- If the research report is weak, say so explicitly and constrain the plan around what is actually known

## Required output
Produce a clean markdown document and target it as:
- `reports/codex-plan.md`

Use exactly the sections below and no prose outside them.

### 1. Issue validation
- Confirm or reject the reported root cause with reasoning
- If rejected, state the corrected root cause
- Separate `Confirmed`, `Likely`, and `Unconfirmed`

### 2. Implementation contract
For each file to be changed, provide:
- Exact file path
- Exact function, class, hook, selector, or section to modify
- Exact change required
- Guard rails: what must not change
- Why this file is in scope
- Acceptance criterion tied to the failure path

### 3. Patch sequence
- Ordered list of changes in the sequence they should be applied
- Dependencies between changes
- Any state, cache, migration, or contract sequencing risk

### 4. Regression guards
- Specific checks the implementation agent must run after patching
- Existing protections that must still hold
- Parity re-validations required, if any
- Logging or diagnostics that should exist after the patch

### 5. Non-goals
- Explicitly list what is out of scope
- Explicitly list attractive but unsafe follow-on changes to avoid in this patch

### 6. Risk assessment
- Worst-case failure mode if patched incorrectly
- User-visible failure mode
- Backend authority or stale-state risks
- Whether human approval should be required before merge

### 7. Test requirements
- Tests to add or update, with exact target area
- Existing tests or manual checks that must still pass
- Any soak, replay, parity, or live-environment verification needed

### 8. Implementation handoff
- Branch naming recommendation
- Suggested commit grouping
- Required reports or artifacts to generate after implementation
