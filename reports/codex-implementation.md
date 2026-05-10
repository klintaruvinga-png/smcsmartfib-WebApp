# Issue summary

The symbol-normalization contract targeted backend watchlist acceptance for index aliases (`NASDAQ`, `US Tech 100`) and the requested crypto set (`BTCUSD`, `ETHUSD`, `XRPUSD`, `BNBUSD`, `SOLUSD`) while preserving backend authority and watchlist snapshot invalidation.

# Root cause implemented

Repository verification showed the required backend production logic was already present on the required branch history and on `main`: symbol aliases already collapse to `NAS100`, the crypto registry already includes `SOLUSD`, and watchlist mutation paths already invalidate `smc_sf_engine_snapshot`. The remaining implementation gap was regression protection. I extended the PHP watchlist regression harness so the authoritative alias path, supported-crypto path, and snapshot invalidation path are now exercised directly.

# Exact files changed

- `wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- `.github/docs/BUG_SWEEP_REPORT_2026-05-10_normalize-symbols.md`
- `.github/migration/audits/phase-0-deriv-symbol-parity-2026-05-10.md`
- `reports/codex-implementation.md`

# Tests run

- `php wordpress/smc-superfib-sniper/tests/php/test-watchlist-snapshot-regression.php`
- `php wordpress/smc-superfib-sniper/tests/php/test-pip-value-parity.php`
  - Fails in the existing harness before parity assertions because `register_deactivation_hook()` is not stubbed there. This was not changed in this patch.

# Reports generated

- `.github/docs/BUG_SWEEP_REPORT_2026-05-10_normalize-symbols.md`
- `.github/migration/audits/phase-0-deriv-symbol-parity-2026-05-10.md`
- `reports/codex-implementation.md`

# Remaining risks

- Live manual verification against an authenticated Deriv-backed environment is still required for final runtime confirmation of quote availability after watchlist add/remove.
- Deriv public indexed sources clearly confirm `US Tech 100` as the Nasdaq 100 label and show `BTCUSD`, `ETHUSD`, `XRPUSD`, `BNBUSD`, and `SOLUSD` naming across current public materials, but this turn did not query a live authenticated broker symbol list.
- The standalone pip-parity harness currently has a pre-existing bootstrap gap unrelated to this symbol patch.

# Any contract ambiguities resolved during implementation

- `reports/codex-plan.md` contains two unrelated plans. I treated the symbol-normalization contract as authoritative and only used the watchlist-snapshot language where it directly guarded backend truth for this issue.
- The required branch already contained the production fix history and had previously been merged into `main`. I fast-forwarded the branch to current `main` and limited this turn to missing regression coverage and required artifacts so the PR contains only net-new work.
