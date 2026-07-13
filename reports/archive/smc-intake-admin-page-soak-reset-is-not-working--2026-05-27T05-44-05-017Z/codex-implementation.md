# Issue summary

Stopped — the contract assumes a missing code-level route registration fix, but this repository already registers `DELETE /sniper/v1/admin/soak-reset` unconditionally while the live WordPress REST index still does not expose that route.

# Root cause implemented

Not implemented — Codex stopped before code changes. The checked-in backend already hooks `register_routes` on `rest_api_init` without an admin/capability guard, and the live backend at `https://trader.stokvelsociety.co.za/wp-json/sniper/v1` still omits `/admin/soak-reset`, which indicates deployment/runtime drift rather than a patchable source defect in this repo.

# Exact files changed

None — no files changed.

# Tests run

None — stopped before code changes.

# Reports generated

None — stopped before code changes.

# Remaining risks

The active WordPress instance is not serving the soak-reset route even though the repo already contains it, so the real blocker is likely an undeployed plugin build, a different plugin copy, or another runtime/environment mismatch outside this repository.

# Any contract ambiguities resolved during implementation

The smallest safe resolution was to treat this as a contract/repository conflict: the required backend hook fix is already present in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`, the remote namespace index still excludes `/admin/soak-reset`, and changing local source further would not logically restore the missing live route.
