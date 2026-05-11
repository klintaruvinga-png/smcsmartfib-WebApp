# Bug Sweep Report — 2026-05-11 — Workflow State JSON Corruption

**Workflow ID:** pipeline-hardening-2026-05-11
**System:** Pipeline automation — `.smc-workflow-state.json`
**Operator:** Claude Code (claude-sonnet-4-6)
**Discovered:** 2026-05-11 during tunnel verification scan
**Status:** FIXED — regression guard added to `scripts/pipeline-watcher.js`

---

## Executive Summary

| Item | Status |
|---|---|
| Overall pipeline health | STABLE after fix |
| Root cause | Trailing XML garbage appended to `.smc-workflow-state.json` |
| Impact | Watcher stalled in parse-error loop; `PLANNING` state never advanced |
| Fix applied | `readState()` self-repair guard in `pipeline-watcher.js` |
| Regression guard added | YES — auto-truncates and rewrites on trailing-garbage corruption |
| Future scan signal | `"Workflow state self-repaired"` in pipeline-runner.log |

---

## Confirmed Problem

### BUG-001 — Workflow State JSON Corrupted by Trailing XML Garbage (FIXED)

| Field | Value |
|---|---|
| Severity | HIGH |
| System | Pipeline watcher / workflow state |
| File | `.smc-workflow-state.json` |
| Status | FIXED — self-repair guard added |

**Description:** `.smc-workflow-state.json` contained valid JSON followed by XML/tool-call
artefact content (`</content><parameter name="filePath">...`) appended after the closing `}`.
Node's `JSON.parse()` threw `SyntaxError: Unexpected non-whitespace character after JSON at
position 284 (line 7 column 2)` on every poll cycle. `readState()` returned `null`, so
`evaluatePipeline()` exited immediately — the `PLANNING` state was never acted on and the
pipeline stalled indefinitely while the watcher continued running.

**Root cause:** An AI-assisted write to the state file included trailing XML markup (tool-call
wrapper content) that was not stripped before writing. The file write succeeded, so no error
was surfaced at write time. All subsequent reads silently failed.

**How it was detected:** Manual log scan showed repeated
`Invalid workflow state file: Unexpected non-whitespace character after JSON at position 284`
entries with no `PLANNING detected` follow-up, confirming the watcher was polling but not
advancing. File inspection confirmed garbage bytes after the closing `}`.

**Impact:** Pipeline stalled at `PLANNING` state. Claude plan hardening never triggered.
No automation steps could proceed. The watcher process remained alive and appeared healthy.

**Fix applied:** Added self-repair logic to `readState()` in `scripts/pipeline-watcher.js`.
After a `JSON.parse` failure the function now:
1. Re-reads the raw file
2. Finds the last `}` character
3. Truncates everything after it and attempts a second `JSON.parse`
4. If successful: logs `Workflow state self-repaired: removed N bytes of trailing garbage`,
   overwrites the file with clean JSON via `writeJson()`, and returns the recovered state
5. If the second parse also fails: logs `Workflow state file is unrecoverable — manual
   intervention required` and returns `null` (existing behaviour)

**Files changed:** `scripts/pipeline-watcher.js` — `readState()` function only.

---

## Regression Scan Signals

Future bug and regression scans should watch for these log patterns in `reports/pipeline-runner.log`:

| Log line | Meaning | Action |
|---|---|---|
| `Invalid workflow state file: Unexpected non-whitespace character after JSON at position N` | Trailing garbage corruption | Check if followed by `self-repaired` line; if not, inspect file manually |
| `Workflow state self-repaired: removed N bytes of trailing garbage` | Auto-repair fired and succeeded | Informational — log the occurrence, investigate write source |
| `Workflow state file is unrecoverable` | Corruption too severe for auto-repair | Manual intervention required — restore from archive or reset to IDLE |
| `PLANNING detected - running Claude plan hardening` absent after `PLANNING` state set | Watcher stalled, state not being evaluated | Check for repeated `Invalid workflow state file` entries above |
| `WARNING: Claude CLI health check failed` | Claude CLI unreachable at watcher startup | Transient network: verify with `claude --version`; if persistent, reinstall/reauth |

---

## Regression Checklist (future scans must verify)

- [ ] `.smc-workflow-state.json` parses as valid JSON with `node -e "JSON.parse(require('fs').readFileSync('.smc-workflow-state.json','utf8'))"`
- [ ] After any AI-assisted write to `.smc-workflow-state.json`, file contains no content after the closing `}`
- [ ] `pipeline-runner.log` shows `PLANNING detected` within one poll cycle (≤5 s) of state being set to `PLANNING`
- [ ] No repeated `Invalid workflow state file` entries spanning more than one watcher restart
- [ ] `Workflow state self-repaired` log line triggers a review of what tool or process wrote the file

---

## Prevention Guidance

The corruption pattern (trailing XML `</content><parameter ...>` markup) originates from
AI tool-call output being written directly to the file rather than through a sanitised
code path. Prevention measures:

1. **Always write `.smc-workflow-state.json` via `writeJson(STATE_FILE, object)`** — never
   via raw string concatenation, template literals, or direct file writes from AI output.
2. **Validate after every write** — any code path that updates the state file should call
   `readJson(STATE_FILE)` immediately after to confirm the round-trip parses correctly.
3. **The self-repair guard in `readState()` is a last-resort recovery** — it is not a
   substitute for preventing the corruption at write time.

---

## Parity Impact

| Layer | Impact |
|---|---|
| Pine trading formulas | None |
| MT5 / EA ingestion | None |
| Backend PHP | None |
| Dashboard frontend | None |
| Pipeline automation | Fix applied — watcher now self-heals on this corruption class |

## Do Not Touch

- Pine scripts
- MT5 EA source
- WordPress PHP plugin files
- Frontend signal rendering
- Any existing `writeJson()` call sites (the fix is read-side only)
