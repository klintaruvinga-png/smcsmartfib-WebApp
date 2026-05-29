# Live Signals Freshness Verification

## Automated validation

| Check | Result | Evidence |
| --- | --- | --- |
| `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | PASS | No syntax errors detected after adding route-local anti-cache headers to `get_live_signals()`. |
| `npx vitest run src/lib/api/sniperClient.test.ts src/hooks/useSniperData.test.tsx` | PASS | 2 test files passed, 16 tests passed. |
| `npm run validate:impl` | PASS | `reports/codex-implementation.md` and `reports/codex-implementation.meta.json` both validated successfully against the local workflow contract. |

## Regression evidence added

- `src/lib/api/sniperClient.test.ts` now fails if `apiClient.getLiveSignals(false)` stops appending a cache-bust token or stops sending fetch `cache: "no-store"`.
- `src/hooks/useSniperData.test.tsx` now fails if `useLiveSignals()` stops forcing `staleTime: 0` or changes its existing polling cadence.

## Manual authenticated verification

Not executed from this workspace. The patch still requires a logged-in dashboard/session verification against a real WordPress environment.

Required manual checks:

1. Open the authenticated dashboard and keep it running for at least three poll cycles.
2. Confirm each `GET /wp-json/sniper/v1/live-signals` request includes a unique `_=` cache-bust query parameter.
3. Confirm each successful live-signals response includes:
   - `Cache-Control: no-store, no-cache, must-revalidate`
   - `Pragma: no-cache`
4. Compare `/snapshot` and `/live-signals` for the same user after a backend update cycle and confirm signal parity remains intact.
5. Confirm a backend signal change becomes visible in the UI within one configured poll interval without a hard refresh.

## Evidence limitations

- No authenticated browser network capture was available in this workspace.
- No live intermediary cache layer was observable here, so origin/header behavior is proven by code plus regression coverage, not by deployed traffic capture.
