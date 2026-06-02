# SMC SuperFIB Dashboard

SMC SuperFIB is a trading dashboard stack for SuperFIB signal review, backend-confirmed execution workflows, and MT5-connected market-state visibility.

## Version tracks

- Stack version: `v13.1.0`
- Pine indicator version: `v13.1.3`

The dashboard stack and the TradingView Pine indicator ship on separate version tracks. Pine is intentionally ahead and is not changed by this repository patch.

## Components

- Dashboard: TanStack/Vite frontend in `src/`
- WordPress plugin: REST backend in `wordpress/smc-superfib-sniper/`
- Pine indicator: TradingView study in `SMC_SuperFib_v13.1.3.pine`
- MT5 EA: market-stream and execution counterpart under `mt5/`

## Setup pointers

- Frontend package metadata lives in `package.json`
- Dashboard UI version label is defined in `src/lib/version.ts`
- WordPress plugin install and runtime notes are in `wordpress/smc-superfib-sniper/README.md`
- Frontend and backend environment specifics should be taken from the active deployment configuration for this repo
