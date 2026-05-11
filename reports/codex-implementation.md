# Issue summary

Baseline soak save is failing with `API /admin/soak-evidence failed: 400 - {"code":"smc_sf_soak_evidence_type_invalid"...}`. Repository inspection confirmed that the current source-level dashboard and backend contract already agree on the allowed `evidence_type` values, so the remaining defect is runtime-only and could not be fully verified from repository evidence alone.

## Root cause implemented

No source-visible contract mismatch was found in the baseline save path. `SoakEvidenceType`, `buildBaselineEvidenceEntries()`, and the backend whitelist already use the same five values, including `baseline_metadata`. The implemented fix is a diagnostic hardening patch: a client-side preflight validator now rejects and logs unsupported `evidence_type` values before the network call, the baseline builder logs the full evidence array before save, and the backend logs the sanitized request payload before enforcing the whitelist. This isolates the real runtime source of the bad value without weakening backend authority.

## Exact files changed

- `src/lib/api/soakEvidence.ts` - added the shared runtime whitelist and `assertValidSoakEvidencePayload()` helper used to reject unsupported `evidence_type` values before the request leaves the browser.
- `src/lib/api/sniperClient.ts` - added the client preflight guard at the `/admin/soak-evidence` network boundary.
- `src/lib/api/soakEvidence.test.ts` - added a targeted runtime test covering invalid and valid `evidence_type` handling.
- `src/types/soakEvidenceType.compile-test.ts` - added a compile-time `@ts-expect-error` guard proving unlisted evidence types fail TypeScript compilation.
- `src/routes/admin.tsx` - added a baseline payload `console.debug` line immediately after `buildBaselineEvidenceEntries()` returns.
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` - added sanitized payload logging immediately before backend whitelist validation.
- `.github/docs/BUG_SWEEP_REPORT_2026-05-11_soak-evidence-type-invalid.md` - added the required bug sweep report for the runtime-integrity issue.
- `.github/migration/audits/phase-0-dashboard-backend-soak-evidence-parity-2026-05-11.md` - added the required parity audit for the dashboard/backend soak evidence contract.
- `reports/codex-implementation.md` - updated the implementation summary for this run.

## Tests run

- `npx tsc --noEmit`
- `node --test --experimental-strip-types src/lib/api/soakEvidence.test.ts`
- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `npm run build`

## Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-11_soak-evidence-type-invalid.md`
- `.github/migration/audits/phase-0-dashboard-backend-soak-evidence-parity-2026-05-11.md`
- `reports/codex-implementation.md`

## Remaining risks

- The exact live failing `evidence_type` value is still unverified in this workspace because no authenticated live baseline save replay was available.
- If the production environment is serving a stale bundle or stale deploy artifact, this source patch alone will not fix the live incident until the environment is redeployed and cache-busted.
- The current worktree contains pre-existing untracked input artifacts (`reports/copilot-research.md`, `reports/codex-plan.md`, `reports/codex-plan.meta.json`) that were left untouched and are not part of this patch.

## Any contract ambiguities resolved during implementation

- The contract asked for `src/types/sniper.ts` to be narrowed only if `SoakEvidenceType` was a bare `string`; repository inspection showed it was already a strict literal union, so I preserved the type and added a compile-time contract test instead of changing the type definition.
- The contract described `upsertSoakEvidence()` as validating a payload array, but the real function accepts a single `SoakEvidencePayload`; I resolved this by adding the guard at the actual request boundary while keeping the validator array-aware for direct test coverage.
- Because the live failing value could not be reproduced from repository evidence, I applied the smallest safe interpretation of the contract: add diagnostics and preflight protection rather than widening the whitelist or guessing at a transport-layer fix.
