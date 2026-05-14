# Issue summary

Backend-confirmed plans could still reach the execution button even when the published ladder was missing TP2/TP3 or R:R stages. The frontend already rendered three-stage ladders correctly; the missing safeguard was that partial backend ladders were treated as executable truth.

# Root cause implemented

I added a frontend completeness guard for backend ladder payloads and kept backend authority intact. The route now detects incomplete `TradePlan` target/R:R fields, shows a warning, and blocks execution without deriving any missing values on the client.

# Exact files changed

- `src/routes/plan.tsx`
- `src/routes/-plan.utils.ts`
- `src/routes/-plan.test.tsx`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-14_tp-rr-ladder-guard.md`
- `.github/migration/audits/phase-0-ladders-parity-2026-05-14.md`
- `reports/codex-implementation.md`

# Tests run

- `npx vitest run src/routes/-plan.test.tsx`
- `npx eslint src/routes/plan.tsx src/routes/-plan.test.tsx src/routes/-plan.utils.ts`
- `npx vitest run`
  - failed for pre-existing repo issues outside this patch
- `npm run lint`
  - failed for pre-existing repo issues outside this patch

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-14_tp-rr-ladder-guard.md`
- `.github/migration/audits/phase-0-ladders-parity-2026-05-14.md`
- `reports/codex-implementation.md`

# Remaining risks

- The backend `/ladders` producer is out of repo and still needs the authoritative fix.
- Repo-wide Vitest and lint runs are not clean before this patch because of unrelated legacy discovery and formatting issues.
- Screenshot artifacts requested by the contract were not captured because the required in-app browser automation tool surface was not available in this session.

# Any contract ambiguities resolved during implementation

- `reports/codex-plan.md` suggested branch `codex/plan-incomplete-tp-guard`, but runtime context required `codex/plan-the-tp-rr-lot-sizing-as-described-below`; I used the runtime branch as authoritative.
- The contract both prescribed an inline route change and requested unit-testable completeness logic. I resolved that by extracting the boolean rule into `src/routes/-plan.utils.ts` while keeping the route behavior identical to the contract.
