# SMC SuperFib Dashboard

WordPress plugin for the SMC SuperFib trading dashboard and signal-processing workflow. It combines:

- A custom frontend dashboard served from a plugin HTML template
- A REST API for webhook ingestion, live signal state, user state, and execution blueprints
- A browser-side signal engine that computes regimes and qualifying setups
- A PHP execution engine that converts READY signals into risk-sized trade queue blueprints
- Broker report and history imports for account analytics, baselining, and trade reconciliation

The plugin header identifies the main plugin as `Sniper Webhook` version `12.0.9.1`.

## What The Codebase Does

At a high level, the system works like this:

1. Trading signals, regimes, snapshots, and price updates are posted into WordPress through `/wp-json/sniper/v1/...` endpoints.
2. The plugin stores live instrument state in WordPress options and user-specific state in user meta.
3. Visiting `/dashboard/` serves `templates/dashboard-ui.html`, injects WordPress context into `window.SNIPER`, and loads the dashboard JavaScript.
4. The frontend pulls live data, accepts broker workbook uploads, computes trading signals in the browser using Twelve Data candles, and syncs user state back to WordPress.
5. READY signals are posted to the execution engine, which calculates ladder entries, lot sizing, SL pips, USC/ZAR risk, and drawdown impact before saving the resulting trade queue.

## Repository Layout

```text
.
|-- sniper-webhook.php
|-- sniper-execution-engine.php
|-- sniper-dashboard-data.js
|-- SMC_SuperFib_v10.16.1.pine
|-- templates/
|   `-- dashboard-ui.html
`-- assets/
    |-- css/
    |   `-- style.css
    `-- js/
        |-- sniper-dashboard-core.js
        |-- sniper-dashboard-planner.js
        `-- sniper-dashboard.js
```

## Core Components

### `sniper-webhook.php`

Main WordPress plugin entry point. It is responsible for:

- Defining plugin paths and URLs
- Enqueuing frontend styles
- Registering all REST routes under `sniper/v1`
- Validating incoming secrets and logged-in user access
- Managing the persistent live signal store in WordPress options
- Loading the execution engine from `sniper-execution-engine.php`
- Serving the dashboard template on the `/dashboard/` page
- Injecting runtime config into `window.SNIPER`
- Registering shortcodes for dashboard, home, account, and login pages
- Creating site pages and a navigation menu on plugin activation
- Exposing admin settings for webhook secrets, backend secret, Twelve Data API key, and allowed CORS origins

### `sniper-execution-engine.php`

Execution and risk-sizing layer loaded by the main plugin. It handles:

- User risk profile persistence
- User trade queue persistence
- Lot sizing and pip-value calculations
- 3-stage ladder entry construction
- USC and ZAR risk breakdowns
- drawdown-cap validation
- Blueprint generation for READY signals received from the frontend engine

The execution engine comment block documents these routes:

- `GET /sniper/v1/user/risk-profile`
- `POST /sniper/v1/user/risk-profile`
- `GET /sniper/v1/user/trade-queue`
- `POST /sniper/v1/user/trade-queue`
- `POST /sniper/v1/user/execute-signals`

### `templates/dashboard-ui.html`

Static HTML shell for the authenticated dashboard. The page includes sections for:

- Signal Plan
- Live Radar
- Charts
- Level Log
- Analytics
- Book
- Pending Orders
- Progress
- Account pulse and upload actions
- Computed signals and trade queue

### `sniper-dashboard-data.js`

Browser-side indicator parity and signal helper module. It computes fib anchors, session groupings, regime/gate context, and canonical signal data used by the dashboard runtime and planner.

### `assets/js/sniper-dashboard-core.js`

Main frontend runtime that drives the dashboard application. Important behaviors include:

- Authenticated REST calls using the injected WordPress nonce
- Local persistence with `localStorage`
- Cloud sync for user trades, account state, settings, risk profile, and trade queue
- Live signal rendering and ranking
- Browser-side signal engine using Twelve Data candles
- Posting engine results back to the backend
- Posting READY signals to the execution engine
- Parsing broker report and history workbooks via SheetJS/XLSX
- Analytics, progress tracking, trade-book rendering, and export helpers

### `assets/js/sniper-dashboard-planner.js`

Planner rendering module used by the Signal Plan view before the legacy core fallback is considered.

### `assets/css/style.css`

The full dashboard design system and page styling used by the dashboard, home, account, and login surfaces.

## WordPress Pages Created On Activation

On activation the plugin creates these pages if they do not already exist:

- `/home/` using `[sniper_home]`
- `/dashboard/` using `[sniper_dashboard]`
- `/account/` using `[sniper_account]`
- `/login/` using `[sniper_login]`

It also sets the Home page as the front page and attempts to create a primary navigation menu.

## REST API Surface

Routes registered in the codebase include:

### Public or shared endpoints

- `POST /sniper/v1/regime`
- `GET /sniper/v1/regimes`
- `POST /sniper/v1/signal`
- `GET /sniper/v1/snapshot`
- `POST /sniper/v1/snapshot`
- `GET /sniper/v1/live-signals`
- `GET /sniper/v1/ladders`
- `GET /sniper/v1/session`
- `POST /sniper/v1/engine-batch` ← public / Pine webhook
- `POST /sniper/v1/user/engine-batch` ← JS engine (authenticated)
- `POST /sniper/v1/user/market-data` ← JS price fetcher (authenticated)

### Authenticated user endpoints

- `GET|POST /sniper/v1/user/trades`
- `GET|POST /sniper/v1/user/account`
- `GET|POST /sniper/v1/user/settings`
- `GET|POST /sniper/v1/user/risk-profile`
- `GET|POST /sniper/v1/user/trade-queue`
- `POST /sniper/v1/user/execute-signals`

## Data Storage Model

The project uses both WordPress options and user meta:

- WordPress options store global, shared state such as live signals, saved regimes, secrets, allowed origins, and the Twelve Data key
- User meta stores per-user trades, account snapshots, settings, risk profile, and trade queue
- The frontend also caches working state in `localStorage` for responsiveness and continuity between refreshes

## Dashboard Workflow

### 1. Install and activate the plugin

Place the project in `wp-content/plugins/`, then activate it in WordPress.

### 2. Configure plugin settings

In WordPress admin under `Settings -> SMC SuperFIB`, configure:

- Webhook secret
- Backend secret for engine/price posts, if you want it separate from the main secret
- Twelve Data API key
- Allowed CORS origins

### 3. Visit `/dashboard/`

The plugin intercepts the dashboard page and serves `templates/dashboard-ui.html`. During response generation it injects:

- REST base URL
- WP REST nonce
- site base URL
- current user context
- active fib timeframe

Webhook secrets, backend engine secrets, and the Twelve Data API key remain server-side in WordPress options.

### 4. Upload broker data

The frontend supports:

- Report workbook upload for account state, baseline, positions, and pending orders
- History workbook upload for matched closes and closed-trade analytics

The report parser expects IFX-style Excel workbooks and uses the first sheet for import.

### 5. Compute and sync signals

If a Twelve Data key is present, the browser-side engine:

- fetches prices and candles
- detects regime, sweep, MSS, and sequence state
- renders computed signals
- posts engine results back to the backend
- submits READY signals to the execution engine for blueprint generation

### 6. Review the trade queue

The execution engine returns blueprints with:

- signal identity
- direction and regime
- three ladder entries
- stop loss and take-profit placeholders
- risk breakdown per stage
- total USC/ZAR exposure
- drawdown impact checks

These are saved to the authenticated user's trade queue and rendered back in the dashboard.

## Browser And External Dependencies

This plugin depends on:

- WordPress REST API and authenticated nonce-based requests
- Google Fonts for `Inter` and `JetBrains Mono`
- [SheetJS](https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js) for Excel parsing
- Twelve Data for candle/price-driven signal computation

## Test Harness

The repo now includes a local harness for:

- Pine F1/F2/F3 parity and source-wiring checks
- JS fib-anchor parity checks
- browser-coupled dashboard smoke checks
- PHP execution-engine checks

Primary entrypoints:

- `powershell -ExecutionPolicy Bypass -File .\scripts\run-tests.ps1`
- `npm run test:pine`
- `npm run test:js`
- `npm run test:browser`
- `npm run test:php`

The Pine suite is a source-aware parity harness. It does not execute TradingView itself locally, but it does:

- run the audited F1/F2/F3 anchor math against shared fixtures independently of the dashboard engine
- assert Pine source wiring for timeframe mapping, session-slot assignment, F2 branch logic, and draw-path formulas
- gate dashboard parity so Pine and browser-side anchors cannot drift silently

PHP tests require a CLI path to be configured first:

- set `PHP_CLI_PATH`
- or create `tests/php/php-cli-path.txt`

Example:

```powershell
$env:PHP_CLI_PATH = "C:\php\php.exe"
```

## Operational Notes

- The dashboard is login-protected. Unauthenticated users are redirected to the login flow.
- The plugin overrides login-related UX so `/login/` behaves like a branded app page.
- The live signal store is intentionally persistent and uses WordPress options instead of transients.
- The JS runtime is large and stateful; local storage is part of the intended architecture, not just a cache.
- The execution engine uses a small pip-value map and defaults to `0.10` when a pair is not explicitly listed.
- The code currently contains a fallback default webhook secret in PHP. Change secrets in admin before using this in any real environment.
- Several source files show mojibake or encoding artifacts in comments and some UI strings. The runtime logic is still readable, but normalizing file encoding to UTF-8 would be a worthwhile cleanup.

## Development Notes

- Main plugin file: [`sniper-webhook.php`](./sniper-webhook.php)
- Execution engine: [`sniper-execution-engine.php`](./sniper-execution-engine.php)
- Dashboard template: [`templates/dashboard-ui.html`](./templates/dashboard-ui.html)
- Frontend runtime: [`assets/js/sniper-dashboard.js`](./assets/js/sniper-dashboard.js)
- Styling: [`assets/css/style.css`](./assets/css/style.css)

If you extend the plugin, the main architectural rule to keep in mind is that the frontend risk logic and the PHP execution risk logic are intended to stay aligned. The JS file contains sizing helpers, and the PHP execution engine contains mirrored calculations for server-authoritative blueprints.
