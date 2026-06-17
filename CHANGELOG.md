## 2026-06-17 — Canonical Feed Stabilization Hardening (v13.1.1-canonical-feed-hardening)

- Wired `CanonicalMarketResolver` into quote and candle fetchers to ensure cross-user canonical feed selection.
- Added `no_cache_response()` to `get_regimes()` and `get_market_data_authority()` to enforce strict no-cache headers.
- Updated `useSniperData.ts` to disable placeholder data when any price becomes `stale`.
- Replaced test stubs with 6 integration test specifications for `CanonicalMarketResolver`.
- Added `scripts/collect-parity-baseline.sh` and `scripts/collect-parity-validation.sh` for two-user parity validation.
- Added CI workflow `.github/workflows/ci-canonical-feed.yml` to run tests and parity checks.
- Documentation: `README-canonical-feed-stabilization.md` and `IMPLEMENTATION-COMPLETE.md` added.

Notes:
- See `README-canonical-feed-stabilization.md` for verification commands (cache header checks, parity scripts).
- CI parity requires configured secrets: `SMC_BACKEND_URL`, `PARITY_USER_A`, `PARITY_USER_B`, `PARITY_PASSWORD`.
