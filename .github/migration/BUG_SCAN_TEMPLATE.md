# Bug Scan Report — Phase [X]

**Report Date**: YYYY-MM-DD  
**Phase**: [Phase number and name]  
**Scanner**: [Automated tool name]  
**Scan Duration**: [Start–End time]

---

## Summary

- **Total Issues Found**: [#]
- **Critical Issues**: [#] ⛔
- **High Priority Issues**: [#] ⚠️
- **Medium Priority Issues**: [#] ⚠️
- **Low Priority Issues**: [#] ℹ️
- **Test Coverage**: [X]%

---

## Critical Issues (Blocks Phase Transition)

| Issue | Component | Root Cause | Impact | Blocker | Corrective Action |
|-------|-----------|-----------|--------|---------|-----------------|
| Stale-loop deadlock detected | Backend freshness engine | [description] | Refresh freezes; frozen live state | ✓ Yes | [action + ETA] |
| [Issue 2] | [component] | [root cause] | [impact] | Yes/No | [action] |

---

## High Priority Issues (Slows Progress)

| Issue | Component | Root Cause | Impact | Blocker | Corrective Action |
|-------|-----------|-----------|--------|---------|-----------------|
| Timestamp corruption on market-open | Pine webhook handler | [description] | False LIVE states sporadically | No | [action] |
| [Issue 2] | [component] | [root cause] | [impact] | Yes/No | [action] |

---

## Parity Drift Alerts

| Engine | Previous % | Current % | Trend | Status | Action |
|--------|-----------|----------|-------|--------|--------|
| Fib (Phase 4) | [X]% | [Y]% | ↑ ↔ ↓ | [PASS/FAIL] | [if drift, action needed] |
| Regime (Phase 5) | [X]% | [Y]% | ↑ ↔ ↓ | [PASS/FAIL] | [if drift, action needed] |
| Signal (Phase 6) | [X]% | [Y]% | ↑ ↔ ↓ | [PASS/FAIL] | [if drift, action needed] |

---

## Test Failure Summary

| Test | Phase | Status | Error | Frequency |
|------|-------|--------|-------|-----------|
| 72h refresh stability | 0 | ✗ FAIL | Stale loop after 48h | Intermittent |
| Market-open session | 0 | ✗ FAIL | Timestamp off by ±2s | Consistent |

---

## Blocker Assessment

**Blocks Current Phase**: Yes/No  
**Blocks Phase N+1 Transition**: Yes/No  
**Timeline Impact**: +[X] days if unresolved  
**Risk Level**: CRITICAL / HIGH / MEDIUM

---

## Recommended Priority Order

1. [Issue 1 - CRITICAL - Est. 2 days]
2. [Issue 2 - HIGH - Est. 1 day]
3. [Issue 3 - MEDIUM - Est. 4 hours]

---

## Verification Criteria for Fix

For each issue above:
- [ ] Code change deployed
- [ ] Test re-run passed
- [ ] No regression introduced
- [ ] Parity re-validated (if parity issue)
- [ ] Artifact stored in test-logs

---

## Attachments

- Detailed error logs: [link or filename]
- Stack traces: [link or filename]
- Comparison output (if parity issue): [link or filename]
- Failed test output: [link or filename]
