# Issue summary

Stopped — the runtime context requests a soakType/soakPurpose implementation, but the attached implementation contract and research artifacts are for an unrelated crypto weekend session-classification defect, and that contract also requires human broker confirmation before any MT5 code change.

# Root cause implemented

Not implemented — Codex stopped before code changes. The provided contract is internally mismatched and explicitly blocks the MT5 patch until a human verifies broker weekend crypto behavior.

# Exact files changed

None — no files changed.

# Tests run

None — stopped before code changes.

# Reports generated

None — stopped before code changes.

# Remaining risks

The task cannot be safely implemented from the provided artifacts because the verified contract does not match the runtime issue, and applying the MT5 crypto patch without broker confirmation would risk weakening stale-data protections and backend authority.

# Any contract ambiguities resolved during implementation

Resolved to stop rather than patch: when runtime context and the attached contract diverged, I treated the mismatch plus the contract’s hard precondition as a blocker requiring the mandated stop report.
