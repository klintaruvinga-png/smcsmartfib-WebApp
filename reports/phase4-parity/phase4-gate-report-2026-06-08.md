# Phase 4 Parity Check Report

Date: 2026-06-08

## Summary

- Run command attempted: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-phase4-parity.ps1 -DryRun -NoPrompt`
- Result: **BLOCKED**
- Blockers:
  - `SMC_WP_USER` / `SMC_APP_PW` are not set, so the authenticated live MT5 export cannot run non-interactively.
  - `php` is not available on PATH in this workspace, so `scripts/parity-validator.php` cannot execute locally.
  - `node_modules` is not installed, so the Vitest parity automation contract tests could not be completed locally.

## Preflight checks

| Check | Result |
| --- | --- |
| Repository | `klintaruvinga-png/smcsmartfib-WebApp` on `main` at `0f71588` |
| Node.js | Present (`v25.0.0`) |
| PHP CLI | Missing from PATH |
| WordPress auth env | Missing |
| `node_modules` | Missing |

## Latest available gate baseline

- Latest tracked gate report: `reports/phase4-parity/phase4-gate-2026-06-04_173401.md`
- Gate: **FAIL**
- Overall parity: `51.04%`
- Tuples compared: `96`
- Exact matches: `34`
- Critical mismatches: `47`
- MT5 rows: `96`
- Pine rows: `96`

## Interpretation

The current workspace cannot produce a fresh authenticated Phase 4 parity gate. The most recent committed gate evidence remains failing at 51.04% parity, with critical mismatches concentrated in USDJPY M15 and XAUUSD M15 level groups.

## Next action

1. Install or expose PHP CLI in PATH for this workspace.
2. Install project dependencies with the locked package manager.
3. Set `SMC_BACKEND`, `SMC_WP_USER`, and `SMC_APP_PW`.
4. Re-run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-phase4-parity.ps1 -NoPrompt`.
