# Issue summary

US30 and NAS100 can age to `offline` in the MT5 -> backend -> dashboard path when the EA starts without an explicit post-resolution Market Watch subscription pass for every resolved symbol. This patch adds deterministic `SymbolSelect()` subscription and startup diagnostics in `OnInit()` at the exact point where `g_symArray[]` is final.

# Root cause implemented

Implemented the contract's `OnInit()` hardening step in `mt5/SMC_MarketDataEA.mq5`: after symbol resolution completes and before `engine.Initialize()`, the EA now iterates every resolved symbol in `g_symArray[]`, calls `SymbolSelect(sym, true)`, logs `[SymbolSelect] <symbol>: OK` on success, and logs a warning with the MT5 error code on failure without failing initialization.

# Exact files changed

- `mt5/SMC_MarketDataEA.mq5` — added explicit `SymbolSelect()` loop and per-symbol startup diagnostics in `OnInit()`.
- `.github/migration/audits/phase-0-mt5-multisymbol-parity-2026-05-03.md` — marked the `SymbolSelect()` in `OnInit()` acceptance criterion complete with 2026-05-27 follow-up note.
- `.github/migration/audits/phase-0-mt5-parity-2026-05-27.md` — added current parity re-validation artifact for this patch.
- `.github/docs/BUG_SWEEP_REPORT_2026-05-27_us30-nas100-symbolselect.md` — added runtime-integrity bug sweep report for the recurring offline path.
- `reports/fix-us30-nas100-symbolselect.md` — added patch evidence and explicit live-verification follow-up list.
- `reports/codex-implementation.md` — implementation summary required by contract.

# Tests run

- `npm run check:mql` — PASS
- `php wordpress/smc-superfib-sniper/tests/php/phase3_mt5_simulation_test.php` — PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` — PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-market-data-service-source-filter.php` — PASS
- `php wordpress/smc-superfib-sniper/tests/php/test-ea-market-stream.php` — PASS
- `npm run build` — PASS
- `MetaEditor64.exe` CLI compile attempt — inconclusive (no compiler log or workspace-visible fresh `.ex5` artifact emitted)

# Reports generated

- `reports/codex-implementation.md`
- `reports/fix-us30-nas100-symbolselect.md`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-27_us30-nas100-symbolselect.md`
- `.github/migration/audits/phase-0-mt5-parity-2026-05-27.md`

# Remaining risks

- Live MT5 rebuild, redeploy, Journal verification, backend snapshot verification, and dashboard live-session verification are still pending.
- MetaEditor automation from this workspace was inconclusive even though `MetaEditor64.exe` is installed locally, so a human operator should confirm the terminal-side rebuild output before rollout.
- Repository reality already includes `SymbolSelect()` in `ResolveBrokerSymbol()` and `MarketDataEngine.Initialize()`, so this patch is additive hardening plus explicit startup evidence rather than the first subscription call in the codebase.

# Any contract ambiguities resolved during implementation

- Runtime branch instruction conflicted with the contract handoff branch suggestion. I used the runtime branch `codex/smc-intake-us30-and-nas100-keep-going-offline-ho` because the execution steps explicitly require the runtime-context branch.
- The contract says no other files require code changes, but later mandates parity/bug-sweep artifacts. I treated that as "no other production code changes" and kept non-code artifact work separate.
