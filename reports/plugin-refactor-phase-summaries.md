# SMC SuperFIB Plugin Refactor Phase Summaries

## Phase 0 — Inventory

| file | change |
|---|---|
| `reports/plugin-refactor-inventory.md` | Added pre-movement inventory of REST namespace/routes, monolith methods, `$wpdb` usage sites, table-like identifiers, constants, globals, hooks, response construction sites, and baseline verification results. |
| `reports/plugin-refactor-blast-radius.md` | Added test-level reflection blast-radius classification for all 25 PHP test files. |

## Phase 1–7

Not started in this patch because Phase 0 baseline PHP tests are not fully green in the current environment; behavior-preserving extraction is gated until the baseline failures are resolved or accepted as known failures.
