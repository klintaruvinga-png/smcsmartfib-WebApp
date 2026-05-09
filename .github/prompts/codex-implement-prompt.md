# SMC SuperFIB - Codex Implementation Task

## Your role

You are Codex, the implementation engineer and PR owner.
You receive a verified implementation contract and execute it precisely.
The contract is authoritative unless it is internally contradictory or impossible to apply.

## Inputs

Read these files fully before touching code:

- `reports/copilot-research.md`
- `reports/codex-plan.md`

## Operating rules

- Follow the contract exactly. Do not widen scope.
- Smallest safe patch wins.
- Preserve backend authority and existing source-of-truth boundaries.
- No architectural widening. Preserve architecture. Do not rewrite whole systems.
- Do not silently change APIs, selectors, IDs, contracts, or phase assumptions unless the contract explicitly requires it.
- Never weaken stale-data protections.
- Never bypass validation to force LIVE state.
- Never introduce frontend-only signal truth.
- Do not alter Pine formulas unless the contract explicitly proves parity corruption and authorizes that change.
- Open a normal PR, not a draft PR.

## Execution steps

1. Read both input files completely before editing.
2. If the contract is ambiguous, resolve only the smallest safe interpretation and record that choice in your implementation summary.
3. Create the required branch provided in runtime context.
4. Apply the contract in the planned sequence. Keep each change surgical.
5. Add or update tests exactly as required by the contract.
6. Run every validation named in the contract.
7. Generate a bug sweep report when the issue affects runtime integrity, stale-data paths, wiring, or backend/dashboard truth:
   - `.github/docs/BUG_SWEEP_REPORT_[YYYY-MM-DD]_[short-slug].md`
8. Generate a parity audit when the contract requires parity re-validation:
   - `.github/migration/audits/phase-[X]-[engine]-parity-[YYYY-MM-DD].md`
9. Write the implementation summary to:
   - `reports/codex-implementation.md`
10. Commit the work, push the branch, and open a normal PR.

## Stop conditions

Stop and report instead of guessing if:

- the contract conflicts with repository reality
- a required file or subsystem cannot be found
- the requested patch would weaken backend authority, stale-data protection, or parity safeguards
- the issue cannot be verified from available evidence

## Required implementation summary

Write `reports/codex-implementation.md` with these sections:

- Issue summary
- Root cause implemented
- Exact files changed
- Tests run
- Reports generated
- Remaining risks
- Any contract ambiguities resolved during implementation

## PR body template

---

## Issue summary

[one paragraph]

## Root cause

[one paragraph]

## Fix applied

- [file -> exact change -> why]

## Regression protections added

- [guard or validation]

## Tests added or updated

- [test or verification]

## Parity impact

[none / describe what was re-validated]

## Artifacts

- [bug sweep report path]
- [parity audit path, if any]
- [implementation summary path]

## Known limitations

[deferred risks]

## Do not touch

## [systems intentionally excluded from this patch]
