# Codebase Refactor Log

## 2026-06-17 - Run 2

- Automation: `Codebase Refactor`
- Branch: `arch/codebase-refactor-review`
- Scope for this run:
  - align the architecture review to the live migration governance
  - keep closed phases and archived evidence untouched
  - create Phase 4A planning artifacts that do not change runtime behavior

### Migration artifacts reviewed

- `.github/migration-status.md`
- `.github/migration/phase-updates/phase4A-production-hardening-and-principles-contract.md`
- `.github/migration/phase-updates/phase4-next-actions-checklist-2026-05-27.md`
- `.github/migration/RISK_REGISTER.md`
- `reports/plugin-refactor-phase-summaries.md`
- `reports/plugin-refactor-completion-checklist.md`
- `reports/architecture-review-clean-hexagonal-plan-2026-06-17.md`

### Governance decisions locked

- Phases `0`-`3` remain closed and receive no new refactor tasks.
- Plugin-refactor Phases `1`-`7` remain closed and receive no new tasks.
- Phase `4` remains the active operational blocker.
- Phase `4A` is the immediate execution lane for docs-only and read-only refactor work.
- No runtime task may imply:
  - Phase `5` can start before Phase `4` closes
  - Phase `6` can start before Phase `5B` closes
  - Phase `7` can start before Phase `6` parity clears

### Phase 4A artifacts created

- `reports/source-of-truth-matrix-2026-06-17.md`
- `reports/route-to-use-case-map-2026-06-17.md`
- `reports/projection-and-contract-inventory-2026-06-17.md`

### Exact next task

- `4A-01 Source-of-Truth Matrix`

### Tracker updates linked

- `.github/migration-status.md`
- `.github/migration/phase-updates/phase4A-production-hardening-and-principles-contract.md`
- `reports/architecture-review-clean-hexagonal-plan-2026-06-17.md`

## 2026-06-17 - Run 1

- Automation: `Codebase Refactor`
- Branch: `arch/codebase-refactor-review`
- Scope for this run:
  - perform full-repository architecture assessment
  - identify divergence risks across signal, plan, regime, license, and dashboard truth
  - define a low-risk Clean Architecture / Hexagonal target structure
  - produce an incremental migration plan without changing runtime behavior

### Repository observations captured

- Runtime spans four distinct delivery surfaces in one repo:
  - React/TanStack dashboard in `src/`
  - WordPress plugin backend in `wordpress/smc-superfib-sniper/`
  - MT5 EA and engines in `mt5/`
  - SDK, scripts, CI, and migration governance artifacts in `sdk/`, `scripts/`, `.github/`, and `reports/`
- The main WordPress runtime remains highly centralized in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` at roughly `9.4k` lines.
- Partial extraction already exists, but only at the edges:
  - route registration
  - watchlist normalization
  - settings helpers
  - signal aggregation
- Domain rules are still duplicated across:
  - WordPress plugin
  - MT5 engines
  - frontend hooks and route utilities
  - SDK client and type layer

### Artifacts created

- `reports/architecture-review-clean-hexagonal-plan-2026-06-17.md`
- `reports/codebase-refactor-log.md`

### Next migration priority

1. Extract authoritative backend domain modules before any presentation or file-move cleanup.
2. Establish explicit source-of-truth boundaries for signal, plan, regime, license, and dashboard state.
3. Create shared contracts package generation strategy to remove frontend/SDK contract drift.

### Validation status

- `git diff --check`
  - result: passed with no diff hygiene errors
- `npx prettier --check reports/codebase-refactor-log.md reports/architecture-review-clean-hexagonal-plan-2026-06-17.md`
  - result: passed after formatting the report artifacts with Prettier

### Publication outcome

- Local commit:
  - `99672a4` - `docs: add architecture refactor review`
- Remote branch:
  - `arch/codebase-refactor-review`
- Pull request:
  - `#399` - `Architecture review and phased refactor plan`
- Labels applied:
  - `codex`
  - `codex-automation`
