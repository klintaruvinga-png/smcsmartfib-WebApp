# Bug Sweep Report

## Scope

- Issue: Admin UI polish for baseline/checkpoint distinction, header age visibility, print/export evidence preservation, and operator-facing soak report failure messaging.
- Route: `src/routes/admin.tsx`
- Date: 2026-05-12

## Runtime integrity sweep

- Confirmed the soak workspace still treats backend health and soak report payloads as read-only backend-owned inputs.
- Confirmed `AuthError` redirect handling remains unchanged on initial load and refresh paths.
- Confirmed baseline capture locking logic remains intact when a baseline snapshot already exists.
- Confirmed checkpoint snapshot creation still routes through the existing backend checkpoint API and refresh path.

## Changes reviewed

- Strengthened baseline/checkpoint status cards with existing Lucide icons and inline badges while preserving the existing 6-card grid.
- Promoted age/capture timing into `HealthCard` header metadata for baseline and checkpoint-related cards.
- Hardened `@media print` rules so `soak-report-print-*` evidence blocks render as explicit block/grid containers and keep headings attached to content.
- Replaced generic soak report failure copy with structured operator-facing messaging that surfaces the failure source, HTTP status, parsed error code when available, and next action guidance.

## Regression checks completed

- `npx vitest run --environment jsdom src/routes/-admin.test.tsx`
- `npx eslint src/routes/admin.tsx src/routes/-admin.test.tsx`
- `npm run build`

## Residual risks

- Browser print preview was not visually verified in-session because the browser automation runtime required by the bundled browser plugin is not exposed here.
- Forced live `/admin/soak-report` network failure was validated through unit coverage rather than an interactive browser session for the same reason.

## Recommended manual follow-up

- Open `/admin/soak-report` and confirm baseline/checkpoint cards remain aligned in the 6-column grid at desktop width.
- Open browser print preview and confirm soak summary, baseline snapshot, checkpoint history, and manual evidence sections remain visible with attached headings.
- Force a `/admin/soak-report` API failure in the browser and confirm the operator-facing message shows source, HTTP status/error code, and retry guidance.
