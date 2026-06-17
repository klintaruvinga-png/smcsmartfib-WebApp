# Codebase Refactor Log

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
- `node .\node_modules\prettier\bin\prettier.cjs --check reports/codebase-refactor-log.md reports/architecture-review-clean-hexagonal-plan-2026-06-17.md`
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
