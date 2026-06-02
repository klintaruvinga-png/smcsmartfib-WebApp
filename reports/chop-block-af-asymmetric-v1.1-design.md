# Chop Block AF Asymmetric Patch v1.1

## Objective
Apply the asymmetric AF equilibrium rule in `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` while preserving backend signal truth.

## Constraints
- Backend remains the source of truth for readiness, gate state, blocker reason, and verdict grade.
- AF-only equilibrium is contextual only: no chop penalty and no blocker.
- SF equilibrium still applies the execution chop penalty.
- Dual SF+AF equilibrium is a hard block only when structural confluence is below 3.

## Chosen Approach
Apply the provided patch surgically to the existing anchor-chop path, then harden the deferred resolution by downgrading status to `ARMED` when the post-confluence dual-anchor block resolves true.

This preserves the patch intent while avoiding a split state where the gate reports blocked but the signal status remains `READY`.

## Acceptance Criteria
- AF-only equilibrium sets `anchorChop` to `AF-ctx` and does not reduce verdict score.
- SF-only equilibrium keeps the existing score penalty.
- Dual-anchor equilibrium with structural score below 3 returns `ANCHOR_CHOP_BLOCKED`, blocked gate reason, and `ARMED` status.
- Dual-anchor equilibrium with structural score at least 3 passes the gate and caps verdict at `A`.

## Regression Checks
- PHP syntax check passes for the plugin file.
- No other `verdict()` call sites require update because the new parameter defaults to `false`.
- Diff remains scoped to the plugin file plus this design note.
