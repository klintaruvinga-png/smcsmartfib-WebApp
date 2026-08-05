# SMC-03 — EA/Backend Bridge: Live End-to-End Checklist

Status: **Audited + offline-tested. Live EA verification is a human-run step** (the
agent shell is non-TTY and cannot drive the MT4/5 EA or the Railway backend).

This checklist proves the EA to backend path end-to-end against the real
infrastructure. Run it once the backend is deployed to a Node host
(Railway/Render/Fly) and the EA is compiled with the UUID `UserId` input.

## Prerequisites

- [ ] Backend deployed to a live Node host; `GET /api/health` returns `{"status":"ok"}`.
- [ ] Database migrations applied to the live Supabase project (tables `users`,
      `fib_levels`, `ea_sessions` exist; verify with `supabase db push` -> "up to date").
- [ ] A live `ea` role user exists in `public.users` with a real `ea_api_key`
      (hashed). Capture the plaintext key + the user's UUID `id`.
- [ ] `EA_API_KEY` on the backend host equals the plaintext value the EA will send.

## EA configuration (MT4/5 inputs)

- [ ] `WebhookURL` = the Worker origin, e.g.
      `https://smcsuperfibwebapp.klintaruvinga.workers.dev`
- [ ] `ApiKey` = the Railway `EA_API_KEY` plaintext (matches `users.ea_api_key` hash).
- [ ] `UserId` = the UUID from `public.users.id` (must be `input string`, NOT `int`).
- [ ] EA recompiled after the `input string UserId` change in
      `mt5/SMC_MarketDataEA.mq5` + `mt5/MarketDataEngine.mqh`.

## Verification steps (run in order)

1. **Connectivity / license-check target**
   - If `POST /api/ea/license-check` is built: POST with the `X-EA-API-Key`
     header; expect `{ status, allowed, backend, eaVersion, timestamp }`.
   - If not yet built: a minimal `POST /api/ea/fib-levels` with a valid key is the
     stable JSON target (see step 3).

2. **Heartbeat**
   - If `POST /api/ea/heartbeat` is built: POST with valid key; expect `{ ok: true }`.
   - Confirm a row appears in `ea_sessions` (status `connected`, `last_ping` recent).

3. **Fib-levels ingest (implemented today)**
   - Build a `POST /api/ea/fib-levels` payload per `src/lib/ea/handlers.ts`
     (`symbol`, `levels[]` with `timeframe`, `ltf_sf[]`, `htf_af[]`, each
     `{ ratio, price }`).
   - Send with `X-EA-API-Key`. Expect `{ ok: true, symbol: <UPPER>, levels_written: N, levels_failed: 0 }`.
   - Query the dashboard path `GET /api/market-data/fib-levels` (Bearer) and confirm
     the ingested levels are returned with `ratio`/`price` as numbers.

4. **Auth rejection (negative tests)**
   - [ ] Missing `X-EA-API-Key` -> 401.
   - [ ] Wrong/unknown key -> 401.
   - [ ] Valid key but `role != 'ea'` -> 401.
   - [ ] Malformed payload (empty `symbol`, out-of-enum `ratio`) -> 400.

5. **Failure modes (debug order)**
   - HTML body in EA log -> wrong host/route (stale URL, retired provider page).
   - `httpStatus=-1` -> URL/transport unreachable from MT4/5 (network, not app error).
   - Browser gets JSON but EA gets nothing -> correct the EA backend URL/endpoint first.

## What the agent already proved (offline)

- `requireEaAuth` rejects missing / unknown / wrong-role keys (tested).
- `submitEaFibLevels` rejects invalid zod payloads (400) and out-of-enum ratios
  (no write), writes valid levels, normalizes symbol to uppercase, and resolves
  the owning user from the EA key before insert (tested in
  `tests/integration/ea-bridge.contract.test.ts`).
- Backend typecheck + integration suite green:
  - **Typecheck**: `npm run typecheck` — passes with no errors
  - **Integration tests**: `npm run test:integration` — 63 tests passing across 9 files
    - tests/integration/risk-engine.test.ts (6 tests)
    - tests/integration/fib-levels.test.ts (4 tests)
    - tests/integration/market-data.test.ts (4 tests)
    - tests/integration/settings.test.ts (8 tests)
    - tests/integration/ea-bridge.contract.test.ts (10 tests)
    - tests/integration/ea-endpoints.test.ts (3 tests)
    - tests/integration/users.test.ts (6 tests)
    - tests/integration/ea-sessions.test.ts (4 tests)
    - tests/integration/auth.test.ts (18 tests)

## Deferred (separate follow-up tasks)

- `POST /api/ea/heartbeat` (wire existing orphaned `ea-sessions` queries).
- `POST /api/ea/license-check`.
- `market-stream` / `account-sync` / `symbol-sync` (BACKEND-2e roadmap).
