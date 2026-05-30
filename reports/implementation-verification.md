# Live Signals PolledAt Verification

## Automated validation

| Check | Result | Evidence |
| --- | --- | --- |
| `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php` | PASS | No syntax errors detected after adding response-time `polledAt` stamping inside `get_live_signals()`. |
| `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` | PASS | The new repeated-poll regression proves stable `id` / `createdAt` / `backendConfirmed`, changing `polledAt`, and preserved anti-cache headers. |
| `npx vitest run src/lib/api/sniperClient.test.ts src/hooks/useSniperData.test.tsx src/routes/-signals.page.test.tsx src/routes/-plan.test.tsx` | PASS | 4 test files passed, 37 tests passed. |
| `npx tsc --noEmit` | FAIL | Existing unrelated repository error in `vite.config.ts`: `test` is not a known property of `LovableViteTanstackOptions`. |

## Response-contract evidence

Sanitized repeated-response excerpt from the PHP regression:

```json
[
  {
    "id": "sig-eurusd-long-stable",
    "createdAt": "2026-05-03T08:15:00+00:00",
    "backendConfirmed": true,
    "polledAt": "2026-05-30T04:20:54+00:00"
  },
  {
    "id": "sig-eurusd-long-stable",
    "createdAt": "2026-05-03T08:15:00+00:00",
    "backendConfirmed": true,
    "polledAt": "2026-05-30T04:20:55+00:00"
  }
]
```

What this proves:

1. Signal identity remains candle-anchored and stable.
2. Response-time metadata changes across poll cycles.
3. The route can now expose repeated poll freshness without altering backend truth.

## Manual authenticated verification

Not executed from this workspace. The patch still requires a logged-in dashboard/session verification against a real WordPress environment.

Required manual checks:

1. Open the authenticated dashboard and keep it running for at least three poll cycles.
2. Confirm consecutive `GET /wp-json/sniper/v1/live-signals` responses preserve `id` and `createdAt` while changing `polledAt`.
3. Confirm each successful live-signals response still includes:
   - `Cache-Control: no-store, no-cache, must-revalidate`
   - `Pragma: no-cache`
4. Compare `/snapshot` and `/live-signals` for the same user after a backend update cycle and confirm parity on truth-bearing fields only: `id`, `symbol`, `direction`, `status`, `verdict`, `backendConfirmed`, `createdAt`.
5. Confirm the live signals UI remains visible and updates across repeated poll cycles without a hard refresh.

## Evidence limitations

- No authenticated browser network capture was available in this workspace.
- The TypeScript baseline error in `vite.config.ts` prevented a clean repo-wide `tsc --noEmit` pass unrelated to this patch.
