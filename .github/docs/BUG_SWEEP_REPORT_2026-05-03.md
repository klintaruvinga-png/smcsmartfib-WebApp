# Executive Summary

- Overall health: Improved, with the MT5 ingress contract now protected against anonymous writes, stale timestamp spoofing, and empty authority audits.
- Bugs found: 4 confirmed backend contract defects or gaps in the active migration path.
- Fixes applied: Hardened MT5 snapshot auth, canonical state/timestamp persistence, authority watchlist enumeration, and PHP regression harness portability.
- Remaining risks: No live MT5 terminal soak was executed in this run, and multi-symbol MT5 hydration still depends on terminal-side symbol/tick availability.
- Migration readiness: Phase 0 backend ingress is patch-ready, but migration governance still needs live staging verification.

**Report Date**: 2026-05-03  
**Phase**: 0 (Stabilization / MT5 ingress hardening)  
**Scanner**: Code Bug Fix And Cleanup automation  
**Scan Duration**: 2026-05-03T13:08:00+02:00 - 2026-05-03T13:23:34+02:00

---

## Summary

- **Total Issues Found**: 4
- **Critical Issues**: 1
- **High Priority Issues**: 1
- **Medium Priority Issues**: 2
- **Low Priority Issues**: 0
- **Test Coverage**: Targeted backend ingress and sizing regressions (`php -l` plus two focused PHP harnesses)

---

## Critical Issues (Blocks Phase Transition)

| Issue | Component | Root Cause | Impact | Blocker | Corrective Action |
|-------|-----------|-----------|--------|---------|-----------------|
| MT5 snapshot ingress accepted unauthenticated writes | WordPress REST MT5 snapshot route | `POST /snapshot` was registered public and the handler trusted `get_current_user_id()` without an in-method permission guard | EA posts could succeed while persisting under user `0`, breaking backend authority and making the dashboard silently miss live MT5 data | No after patch | Required authenticated route registration and added a defensive auth check inside `post_snapshot()` |

---

## High Priority Issues (Slows Progress)

| Issue | Component | Root Cause | Impact | Blocker | Corrective Action |
|-------|-----------|-----------|--------|---------|-----------------|
| MT5 snapshot rows lost canonical freshness/state truth | Backend snapshot persistence | `post_snapshot()` never wrote the snapshot `state`, and it stored `updated_at` from receipt time instead of the MT5 quote timestamp | Fresh MT5 prices could surface as `offline`, and state-only MT5 updates risked faking quote recency | No after patch | Persisted normalized MT5 freshness into `state`, parsed MT5 timestamps into MySQL time, and preserved the last quote timestamp during state-only transitions |

---

## Parity Drift Alerts

| Engine | Previous % | Current % | Trend | Status | Action |
|--------|-----------|----------|-------|--------|--------|
| Freshness / ingress (Phase 0) | N/A | 100% on covered MT5 auth/state/timestamp cases | Improving | PASS | Run live staging disconnect/reconnect drill |
| Fib (Phase 4) | N/A | N/A | Stable | PENDING | No fib code delta in this run |
| Regime (Phase 5) | N/A | N/A | Stable | PENDING | No regime code delta in this run |
| Signal (Phase 6) | 100% on covered pip-value conversion cases | 100% on covered pip-value conversion cases | Stable | PASS | Keep existing sizing parity harness in CI rotation |

---

## Test Failure Summary

| Test | Phase | Status | Error | Frequency |
|------|-------|--------|-------|-----------|
| PHP syntax check (`php -l`) | 0 | PASS | None | Once |
| MT5 snapshot contract harness | 0 | PASS | None | Once |
| Pip-value regression harness | 0 / 6 | PASS | None | Once |
| Live MT5 staging reconnect drill | 0 | PENDING | Not executed in this automation run | Not run |
| Long-run refresh soak (24h/72h) | 0 | PENDING | Not executed in this automation run | Not run |

---

## Blocker Assessment

**Blocks Current Phase**: No after patch  
**Blocks Phase N+1 Transition**: Yes  
**Timeline Impact**: Verification dependent  
**Risk Level**: HIGH

The confirmed backend ingress defects are patched, but migration progression still requires live MT5 staging evidence and longer freshness validation.

---

## Recommended Priority Order

1. Deploy the backend plugin patch to staging with authenticated MT5 EA credentials.
2. Force an MT5 disconnect/reconnect drill and confirm `offline -> live` transitions without timestamp spoofing.
3. Run 24h refresh/stale soak checks against the active backend.
4. Review MT5 multi-symbol hydration behavior on the terminal side before expanding the watchlist.

---

## Verification Criteria for Fix

- [x] Code change deployed locally
- [x] `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php`
- [x] `php wordpress/smc-superfib-sniper/tests/php/test-pip-value-parity.php`
- [x] Regression artifact written to `.github/migration/test-logs/phase-0-mt5-ingress-2026-05-03.log`
- [ ] Live staging MT5 snapshot confirms authenticated writes land under the intended user
- [ ] Staging disconnect/reconnect confirms `updated_at` remains quote-time anchored
- [ ] 24h/72h soak clears residual fake-live risk

---

## Confirmed Problems

### Critical

- Backend MT5 ingress in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` allowed unauthenticated `POST /snapshot` requests even though the payload is user-scoped and persisted via `get_current_user_id()`.

### High

- MT5 snapshot persistence in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` never populated the `state` column and used backend receipt time instead of MT5 quote time for `updated_at`.

### Medium

- `get_market_data_authority()` enumerated `snapshot['symbols']`, but engine snapshots only expose `prices` and `meta.watchlist`, so the all-symbol authority audit path returned an empty result set.
- `wordpress/smc-superfib-sniper/tests/php/test-pip-value-parity.php` lacked a `plugin_dir_path()` stub, so the regression harness could not execute in the standalone PHP environment used by this automation.

---

## Surgical Fixes Applied

- Updated `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` so `POST /snapshot` now requires authenticated permission at both the route layer and inside `post_snapshot()`.
- Added MT5 freshness-to-dashboard state normalization and timestamp parsing helpers in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`.
- Hardened `post_snapshot()` so tick-bearing MT5 payloads persist canonical `state` and MT5 quote time, while freshness-only payloads degrade state without rewriting `updated_at`.
- Fixed the all-watchlist authority path in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` to enumerate the configured watchlist instead of a nonexistent snapshot field.
- Added `wordpress/smc-superfib-sniper/tests/php/test-mt5-snapshot-contract.php` to lock auth, timestamp, state-only refresh, and authority endpoint behavior.
- Hardened `wordpress/smc-superfib-sniper/tests/php/test-pip-value-parity.php` so it can run outside WordPress in the automation harness.

---

## Parity Verification Results

- Freshness parity: Covered MT5 ingress contract cases passed 4/4. Auth, state mapping, quote-time persistence, and watchlist authority enumeration now match backend truth expectations.
- Fib parity: Not re-run in this scan. No fib code delta detected.
- Regime parity: Not re-run in this scan. No regime code delta detected.
- Signal parity: Existing pip-value conversion coverage remains green at 7/7.

---

## Remaining Risks

- This run did not exercise a live MT5 terminal or a real WordPress auth chain, so staging verification is still required.
- The MT5 EA still warrants a separate review for multi-symbol hydration behavior when attached to a single chart and relying on terminal-side symbol availability.
- No 24h/72h refresh soak evidence was produced in this run.

---

## Regression Checklist

- [x] Backend plugin PHP syntax check
- [x] MT5 snapshot contract regression harness
- [x] Pip-value parity regression harness
- [ ] Live MT5 authenticated ingress check
- [ ] Disconnect/reconnect stale-state verification
- [ ] 24h refresh loop soak
- [ ] 72h stale-state / reconnect soak

---

## Safe Deployment Order

1. Deploy the plugin patch to staging.
2. Reconfigure or confirm MT5 EA authentication and post one controlled snapshot.
3. Verify the snapshot lands under the correct user and surfaces as `live` only when the MT5 quote timestamp is fresh.
4. Trigger a state-only `DISCONNECTED` update and confirm the last quote timestamp does not move.
5. Run the extended freshness soak before production promotion.

---

## Do Not Touch List

- `determine_engine_blocker()` freshness gating without a separate stale-truth review
- `fetch_quote()` and `fetch_candles()` upstream rate-limit/auth sequencing
- Trade execution authorization in `post_execute_signals()`
- MT5 symbol normalization / broker-symbol mapping without a dedicated terminal parity pass

---

## Attachments

- Test log: `.github/migration/test-logs/phase-0-mt5-ingress-2026-05-03.log`
- Freshness audit: `.github/migration/audits/phase-0-freshness-parity-2026-05-03.md`
- Existing signal parity artifact revalidated by harness: `.github/migration/audits/phase-6-signal-parity-2026-05-03.md`
