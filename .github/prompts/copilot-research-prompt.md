# SMC SuperFIB - Issue Research Request

## Automation contract
- The upstream caller must replace the literal token `[[ISSUE_INPUT]]` with the raw issue text before this prompt is sent.
- Recommended chat callsign: start the message with `SMC_ISSUE:` and treat everything after that prefix as the issue payload to inject into `[[ISSUE_INPUT]]`.
- If `[[ISSUE_INPUT]]` is still present, stop and return: `Missing issue payload`.

## Stack context
- Monorepo: MT5 EA + WordPress/PHP backend + dashboard frontend
- Active migration: Pine Script -> MT5-native
- Current board state: Phase 0 stabilization is still in progress
- Critical systems: price engine, refresh engine, signal engine, regime engine, fib parity, MT5 authority handoff

## Your role
You are a senior repository analyst.
Do not propose code changes yet.
Do not write implementation steps.
Your only job is to produce a structured research report grounded in repository evidence.

## Operating constraints
- Backend and MT5 authority are the source of truth unless proven otherwise.
- Treat stale-data failures, false LIVE states, parity drift, and frontend/backend signal mismatches as serious defects.
- Preserve Pine authority assumptions unless parity corruption is explicitly demonstrated.
- Distinguish clearly between confirmed findings and hypotheses.
- If evidence is missing, say `Unconfirmed` instead of inventing detail.

## Issue to investigate
[[ISSUE_INPUT]]

## Required output
Produce a clean markdown document with exactly the sections below and no prose outside them.

### 1. Issue classification
- Severity: CRITICAL / HIGH / MEDIUM / LOW
- Category: runtime-bug / wiring / data-contract / stale-data / signal-integrity / parity-drift / dead-code / migration-governance
- Layer(s) affected: MT5 / PHP-backend / REST-API / Dashboard-JS / Pine / CSS / workflow
- Phase impact: Phase 0 / Phase 1 / Phase 2 / Phase 3 / Phase 4 / Phase 5 / Phase 6 / Phase 7+ / Cross-phase

### 2. Confirmed evidence
- What is directly supported by repository evidence
- Exact files, functions, selectors, endpoints, or contracts involved
- Any logs, report files, or migration artifacts that materially support the finding

### 3. Root cause hypothesis
- Most likely root cause
- Why that root cause best fits the evidence
- What likely triggered or surfaced the issue
- Mark each sub-point as `Confirmed` or `Hypothesis`

### 4. Blast radius
- Every file likely affected, using exact repository paths when known
- Every system that reads from or writes to the broken component
- Every parity surface at risk: Pine <-> Backend <-> Dashboard <-> MT5
- Any stale-state, cache, sequencing, or authority-boundary risks

### 5. Regression surface
- What currently working behavior could break if patched incorrectly
- Existing guards, stale-data protections, or validation paths that must not be weakened
- Tests, audits, or reports that appear to cover this area today

### 6. Fix strategy options
- Strategy A: smallest plausible fix
- Strategy B: broader structural fix if the smallest fix is unsafe
- Recommended: choose one and explain why
- Do not write implementation code

### 7. Risk flags
- High-risk system involved: Yes/No and why
- Requires parity re-validation: Yes/No and which engine
- Migration-blocking: Yes/No and which phase gate is affected
- Human review required before merge: Yes/No and why

### 8. Handoff package
- Epicentre files to inspect first
- Inputs Codex must verify before planning
- Open unknowns that could invalidate the current hypothesis
