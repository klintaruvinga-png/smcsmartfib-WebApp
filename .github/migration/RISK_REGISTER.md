# Migration Risk Register

**Created**: 2026-05-25  
**Last Updated**: 2026-05-27  
**Current Phase**: 4 (IN-PROGRESS — code complete; live soak active; live corpus pending)

---

## Active Risks

| ID | Risk | Severity | Probability | Phase Impact | Owner | Mitigation | Status |
|----|------|----------|-------------|--------------|-------|-----------|--------|
| RISK-01 | ~~No track leads assigned~~ — **RESOLVED 2026-05-25**: all three tracks (A/B/C) assigned to admin (klintaruvinga@gmail.com) | HIGH | RESOLVED | None | — | — | RESOLVED |
| RISK-02 | 99% fib parity gate is stricter than any prior phase (Phase 5/6 used 95%) — MT5 fib calculation may drift from Pine at edge anchors or sparse candle datasets | HIGH | MEDIUM | Phase 4 gate may fail on first attempt; extends timeline | Track A | `FibEngine.mqh` mirrors PHP session-grouping exactly; `scripts/parity-validator.php` ready; live soak active from 2026-05-27; replay corpus still needed | MITIGATED (engine + validator built 2026-05-25; live corpus accumulation is the sole remaining open item) |
| RISK-03 | Regime and signal replay suites are absent from the focused regression command — parity regressions in those paths will not be caught by the daily CI run | MEDIUM | HIGH | Covered-path regression may miss drift in regime/signal authority | Track B | Add dedicated regime replay suite; add multi-case signal replay suite (GAP-01, GAP-02) | OPEN |
| RISK-04 | ~~NAS100/US30 not in EA Symbols~~ — **RESOLVED 2026-05-25**: NAS100/US30 ARE present in EA as Deriv broker names `US Tech 100` and `Wall Street 30`. SymbolNormalizer alias map correctly resolves both to canonical symbols. Offline status in closeout snapshot (04:17 UTC) is expected pre-market behaviour (equities open 13:30 UTC EDT). No action required. | LOW | RESOLVED | None | — | — | RESOLVED |
| RISK-05 | Historical replay methodology for fib parity not yet defined — Pine fib levels are computed from candle history; MT5 fib must replay identically or parity will fail | MEDIUM | MEDIUM | Phase 4 parity validator cannot be trusted without agreed replay corpus and methodology | Track A + Track B | Define replay corpus, timeframes, and acceptable drift thresholds in `PHASE4_TESTING_GUIDE.md` | MITIGATED (guide created 2026-05-25) |
| RISK-06 | ~~T0 admin baseline capture not yet done~~ — **RESOLVED 2026-05-27**: Phase 4 soak workspace baseline captured/exported (`PHASE_4_30_DAY`; baseline row visible in `.github/migration/phase-updates/phase-4-30-day-2026-05-27.md`) | LOW | RESOLVED | None | — | — | RESOLVED |
| RISK-07 | CI Workflow 03 (autonomous review loop) disabled — review loop requires paid `ANTHROPIC_API_KEY` which is not available; local Claude Code path is the only review path | LOW | CERTAIN | No automated PR review feedback; review quality depends on manual Claude Code runs | Project | Re-enable when `CLAUDE_CODE_OAUTH_TOKEN` is available in repo secrets | MONITORING |
| RISK-08 | Pine transition strategy (Phase 10) depends on MT5 signal parity ≥95% over Phase 6 — if parity is not achieved by Phase 6, the Pine decommission timeline slips | LOW | LOW | 2027 timeline impact only; no current phase risk | Track A | Monitor signal parity trends starting Phase 6; flag if drift pattern emerges early | FUTURE |

---

## Resolved Risks

| ID | Risk | Resolution | Resolved |
|----|------|-----------|---------|
| RISK-R01 | CI Workflow 03 auto-firing on every PR and failing — blocked PR merges | Workflow converted to `workflow_dispatch` only; local Claude Code review-fix protocol established | 2026-05-22 |
| RISK-R02 | Synthetic `updatedAt` fabrication in `build_symbol_state()` causing false-LIVE states | Patched in commit `6f3c835`; broker timestamp age now gates freshness | 2026-05-24 |
| RISK-R03 | Admin soak DOM suite not executing (jsdom missing) — harness returned false green | jsdom environment pragma restored; 18/18 assertions now pass | 2026-05-25 |
| RISK-R04 | Vitest scope pollution (node_modules + archive suites) — full regression command returned false failures | Vitest scoped to `src/**/*.test.*` and `scripts/**/*.test.*`; archive/dependency trees excluded | 2026-05-25 |
| RISK-R05 | Phase 2 streak fixture contradicted approved backend active-day definition | Fixtures now seed `status=complete` engine-run rows to match `CALENDAR_DAY_WITH_ANY_COMPLETED_ENGINE_RUN` | 2026-05-25 |
| RISK-R06 | Phase 3 closeout remained conditional because no formal admin baseline had been captured | Operator captured/exported the Phase 4 T0 baseline on 2026-05-27, clearing the conditional closeout note | 2026-05-27 |

---

## Risk Review Schedule

- **Phase gate reviews**: Before each phase closes (manual review of this register)
- **Weekly**: Project manager agent auto-generates weekly status including open risk summary
- **Escalation trigger**: Any RISK severity=HIGH moves to CERTAIN probability → immediate escalation
