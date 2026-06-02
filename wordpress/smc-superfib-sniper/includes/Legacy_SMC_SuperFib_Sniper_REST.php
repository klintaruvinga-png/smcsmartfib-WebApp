<?php
if (!defined('ABSPATH')) {
    exit;
}

require_once dirname(__DIR__) . '/class-market-data-service.php';

final class SMC_SuperFib_Sniper_REST {
    const VERSION = '13.0.3';
    const NAMESPACE = 'sniper/v1';
    const TWELVE_PROVIDER = 'twelve_data';
    const ENGINE_SNAPSHOT_MIN_REFRESH_INTERVAL_SEC = 2;
    // Governance signoff: 2026-05-22. Authorized decision-maker approval recorded.
    // Definition: a calendar day (UTC) is active when at least one completed engine run
    // is persisted in the engine_runs table for the user on that date.
    // Backfill: all historical engine_runs records are included in streak computation.
    const ACTIVE_DAY_DEFINITION = 'CALENDAR_DAY_WITH_ANY_COMPLETED_ENGINE_RUN';

    private $ratios = array(-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300);
    private $fib_context_symbol = '';
    private $fib_context_timeframe = '';
    private $fib_context_tf_seconds = 0;

    public static function boot() {
        $instance = new self();
        add_action('rest_api_init', array($instance, 'register_routes'));
        add_action('init', array(__CLASS__, 'ensure_display_signals_table'), 1);
        
        // Send CORS headers on all REST responses (success, error, auth failure, etc)
        add_filter('rest_post_dispatch', function($response, $server, $request) {
            $allowed = \SMC\SuperFib\Rest\Cors::get_allowed_origins();
            $origin  = isset($_SERVER['HTTP_ORIGIN']) ? sanitize_text_field(wp_unslash($_SERVER['HTTP_ORIGIN'])) : '';
            if ($origin && \SMC\SuperFib\Rest\Cors::is_allowed_origin($origin, $allowed)) {
                \SMC\SuperFib\Rest\Cors::send_cors_headers_for_origin($origin);
            }
            return $response;
        }, 10, 3);
        
        add_filter('rest_pre_serve_request', function($value) {
            $allowed = \SMC\SuperFib\Rest\Cors::get_allowed_origins();
            $origin  = isset($_SERVER['HTTP_ORIGIN']) ? sanitize_text_field(wp_unslash($_SERVER['HTTP_ORIGIN'])) : '';
            if ($origin && \SMC\SuperFib\Rest\Cors::is_allowed_origin($origin, $allowed)) {
                \SMC\SuperFib\Rest\Cors::send_cors_headers_for_origin($origin);
            }
            return $value;
        }, 15);

        // Early preflight handler: send CORS headers for OPTIONS before WordPress performs routing.
        add_action('init', function() {
            \SMC\SuperFib\Rest\Cors::handle_options_preflight_request();
        }, 0);

        // Regression guard: Validate CORS configuration consistency on every boot.
        // Non-fatal: logs a warning but never blocks plugin load.
        if (!\SMC\SuperFib\Rest\Cors::validate_cors_origins_consistency()) {
            error_log('SMC SuperFIB: CORS configuration inconsistency detected. Check allowed origins for protocol prefix or duplicate entries.');
        }

        // Respond to CORS preflight (OPTIONS) requests before WordPress processes them.
        // Without this, the browser's preflight check silently fails and blocks POST/DELETE.
        add_action('wp_loaded', function() {
            if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
                // Check if this is a request to our REST API
                $request_uri = $_SERVER['REQUEST_URI'] ?? '';
                if (strpos($request_uri, '/wp-json/sniper/v1/') !== false) {
                    $allowed = \SMC\SuperFib\Rest\Cors::get_allowed_origins();
                    $origin  = $_SERVER['HTTP_ORIGIN'] ?? '';
                    if ($origin && \SMC\SuperFib\Rest\Cors::is_allowed_origin($origin, $allowed)) {
                        \SMC\SuperFib\Rest\Cors::send_cors_headers_for_origin($origin);
                        header('Access-Control-Max-Age: 86400');
                        header('Content-Length: 0');
                        http_response_code(204);
                        exit;
                    }
                }
            }
        }, 1); // Priority 1 — runs before anything else touches the response

        // Ensure authenticated dashboard/front-end app scripts have REST bootstrap data.
        // This is a safe fallback when the active JS bundle is manually inserted or
        // when the app uses a custom script handle and wpApiSettings was not localized.
        add_action('wp_enqueue_scripts', array(__CLASS__, 'enqueue_rest_api_settings'));
        add_action('admin_enqueue_scripts', array(__CLASS__, 'enqueue_rest_api_settings'));

        // WP-Cron: prune engine_runs and audit_events daily to prevent unbounded table growth.
        // During Phase 0 soak, these tables accumulate heartbeat rows on every engine tick.
        add_action('smc_sf_prune_tables', array(__CLASS__, 'prune_old_table_rows'));
        if (!wp_next_scheduled('smc_sf_prune_tables')) {
            wp_schedule_event(time(), 'daily', 'smc_sf_prune_tables');
        }

        // Phase 5B: refresh fundamental bias every 30 min (uses Twelve Data free tier).
        // IMPORTANT: the cron_schedules filter MUST be registered before wp_next_scheduled /
        // wp_schedule_event so WordPress knows the 'twicehourly' interval when it validates
        // the recurrence. Registering it afterwards (as was done previously) leaves the
        // interval unknown at schedule time, causing WordPress to silently skip scheduling.
        add_filter('cron_schedules', array(__CLASS__, 'add_twicehourly_cron_schedule'));
        add_action('smc_sf_refresh_fundamentals', array($instance, 'cron_refresh_fundamentals'));
        if (!wp_next_scheduled('smc_sf_refresh_fundamentals')) {
            wp_schedule_event(time(), 'twicehourly', 'smc_sf_refresh_fundamentals');
        }
    }

    public static function add_twicehourly_cron_schedule($schedules) {
        if (!isset($schedules['twicehourly'])) {
            $schedules['twicehourly'] = array(
                'interval' => 1800,
                'display'  => __('Twice Hourly'),
            );
        }
        return $schedules;
    }

    // Cron callback: refresh fundamentals for all users who have a TD key configured.
    public function cron_refresh_fundamentals() {
        global $wpdb;

        $users = $wpdb->get_col(
            "SELECT DISTINCT user_id FROM {$wpdb->prefix}smc_sf_integrations WHERE provider = 'twelve_data' AND key_status = 'ok'"
        );

        foreach ((array) $users as $user_id) {
            $td_key = $this->get_twelve_key((int) $user_id);
            if (!$td_key) continue;
            $ingested = $this->ingest_economic_calendar($td_key);
            error_log(sprintf('[SMC_SF] cron fundamentals user_id=%d ingested=%d', (int) $user_id, $ingested));
        }

        // Bias recomputed once after all user calendars ingested (data is global by currency).
        $this->recompute_fundamental_bias();
    }

    public static function enqueue_rest_api_settings() {
        if (!is_user_logged_in()) {
            return;
        }

        $rest_api_settings = array(
            'root'  => esc_url_raw(rest_url()),
            'nonce' => wp_create_nonce('wp_rest'),
        );

        wp_register_script(
            'smc-superfib-sniper-rest-bootstrap',
            false,
            array('wp-api'),
            self::VERSION,
            true
        );

        wp_enqueue_script('smc-superfib-sniper-rest-bootstrap');

        wp_add_inline_script(
            'smc-superfib-sniper-rest-bootstrap',
            'window.wpApiSettings = Object.assign({}, window.wpApiSettings || {}, ' . wp_json_encode($rest_api_settings) . ');'
            . 'window.SNIPER = Object.assign({}, window.SNIPER || {}, { root: ' . wp_json_encode($rest_api_settings['root']) . ', nonce: ' . wp_json_encode($rest_api_settings['nonce']) . ' });',
            'before'
        );
    }

    public static function prune_old_table_rows(): void {
        global $wpdb;
        // engine_runs: heartbeat + completion rows accumulate on every engine tick — keep 7 days
        $wpdb->query($wpdb->prepare(
            "DELETE FROM `{$wpdb->prefix}smc_sf_engine_runs` WHERE created_at < %s",
            gmdate('Y-m-d H:i:s', strtotime('-7 days'))
        ));
        // audit_events: diagnostic traces — keep 14 days for post-mortem analysis
        $wpdb->query($wpdb->prepare(
            "DELETE FROM `{$wpdb->prefix}smc_sf_audit_events` WHERE created_at < %s",
            gmdate('Y-m-d H:i:s', strtotime('-14 days'))
        ));
        error_log('[PHASE0_SOAK] smc_sf_prune_tables: pruned engine_runs (>7d) and audit_events (>14d)');
    }

    public static function activate() {
        return \SMC\SuperFib\Database\Schema::activate();
    }

    public static function deactivate(): void {
        \SMC\SuperFib\Database\Schema::deactivate();
    }

    public static function ensure_display_signals_table() {
        return \SMC\SuperFib\Database\Schema::ensure_display_signals_table();
    }

    private static function get_display_signals_table_sql(string $charset): string {
        return \SMC\SuperFib\Database\Schema::get_display_signals_table_sql($charset);
    }

    public static function ensure_bridge_tables() {
        return \SMC\SuperFib\Database\Schema::ensure_bridge_tables();
    }

    private static function ensure_trade_telemetry_tables() {
        return \SMC\SuperFib\Database\Schema::ensure_trade_telemetry_tables();
    }

    private static function get_regime_snapshots_table_sql(string $charset): string {
        return \SMC\SuperFib\Database\Schema::get_regime_snapshots_table_sql($charset);
    }

    private static function ensure_regime_snapshots_table() {
        return \SMC\SuperFib\Database\Schema::ensure_regime_snapshots_table();
    }

    private static function ensure_soak_tables() {
        return \SMC\SuperFib\Database\Schema::ensure_soak_tables();
    }

    public function register_routes() {
        return \SMC\SuperFib\Rest\Routes::register_routes($this);
    }

    private function route($path, $methods, $callback, $auth_required) {
        register_rest_route(self::NAMESPACE, $path, array(
            'methods' => $methods,
            'callback' => array($this, $callback),
            'permission_callback' => $auth_required ? array($this, 'permission_user') : '__return_true',
        ));
    }

    public function permission_user() {
        return \SMC\SuperFib\Rest\Permissions::permission_user();
    }

    public function permission_admin() {
        return \SMC\SuperFib\Rest\Permissions::permission_admin();
    }

    public function permission_ea_market_stream(WP_REST_Request $request) {
        return \SMC\SuperFib\Rest\Permissions::permission_ea_market_stream($request);
    }

    public function permission_ea_bridge(WP_REST_Request $request) {
        return \SMC\SuperFib\Rest\Permissions::permission_ea_bridge($request);
    }

    private function get_ea_api_key(WP_REST_Request $request): string
    {
        return \SMC\SuperFib\Rest\Permissions::get_ea_api_key($request);
    }

    public function ea_request_value(WP_REST_Request $request, array $payload, $key, $default = null) {
        return \SMC\SuperFib\Rest\Permissions::ea_request_value($request, $payload, $key, $default);
    }

    public function resolve_ea_user_id(): int
    {
        return \SMC\SuperFib\Rest\Permissions::resolve_ea_user_id();
    }

    private static function is_allowed_origin($origin, $allowed) {
        return \SMC\SuperFib\Rest\Cors::is_allowed_origin($origin, $allowed);
    }

    private static function get_allowed_origins() {
        return \SMC\SuperFib\Rest\Cors::get_allowed_origins();
    }

    private static function get_cors_allowed_headers() {
        return \SMC\SuperFib\Rest\Cors::get_cors_allowed_headers();
    }

    private static function send_cors_headers_for_origin($origin) {
        return \SMC\SuperFib\Rest\Cors::send_cors_headers_for_origin($origin);
    }

    private static function handle_options_preflight_request() {
        return \SMC\SuperFib\Rest\Cors::handle_options_preflight_request();
    }

    /**
     * Regression guard: Ensure CORS allowed origins are consistently defined.
     * This prevents future CORS issues from protocol prefix mismatches.
     */
    private static function validate_cors_origins_consistency() {
        return \SMC\SuperFib\Rest\Cors::validate_cors_origins_consistency();
    }

    public function get_session() {
        // PARITY NOTE (MT5 migration): This endpoint returns SMC killzone windows, NOT full
        // session hours. The MT5 SessionManager.mqh uses full sessions (London 07-15, NY 12-20)
        // for market-open detection and freshness state transitions. The killzone windows here
        // (London 07-11, NY 12-16) are intentional for signal-entry timing display only and
        // do NOT affect engine or freshness authority logic. This gap is tracked as a known
        // display-only parity divergence in the migration audit.
        $hour = (int) gmdate('H');
        if ($hour >= 7 && $hour < 11) {
            $name = 'London';
            $open = '07:00';
            $close = '11:00';
        } elseif ($hour >= 12 && $hour < 16) {
            $name = 'New York';
            $open = '12:00';
            $close = '16:00';
        } elseif ($hour >= 16 && $hour < 17) {
            $name = 'London Close';
            $open = '16:00';
            $close = '17:00';
        } else {
            $name = 'Off killzone';
            $open = null;
            $close = null;
        }

        return rest_ensure_response(array(
            'name' => $name,
            'openUtc' => $open,
            'closeUtc' => $close,
            'state' => $open ? 'live' : 'stale',
        ));
    }

    public function get_health() {
        return $this->health_service()->get_health();
    }

    public function get_admin_health() {
        return $this->health_service()->get_admin_health();
    }

    public function get_health_payload_for_user($user_id) {
        return $this->health_service()->get_health_payload_for_user($user_id);
    }

    private function health_service() {
        return new \SMC\SuperFib\Service\HealthService($this);
    }

    private function soak_service() {
        return new \SMC\SuperFib\Service\SoakService($this);
    }

    public function get_soak_report() {
        return $this->soak_service()->get_soak_report();
    }

    public function upsert_soak_evidence(WP_REST_Request $request) {
        return $this->soak_service()->upsert_soak_evidence($request);
    }

    public function create_soak_checkpoint(WP_REST_Request $request) {
        return $this->soak_service()->create_soak_checkpoint($request);
    }

    public function reset_soak(WP_REST_Request $request) {
        return $this->soak_service()->reset_soak($request);
    }


    public function get_user_settings() {
        return $this->settings_service()->get_user_settings();
    }

    public function post_user_settings(WP_REST_Request $request) {
        return $this->settings_service()->post_user_settings($request);
    }

    public function post_twelve_data_key(WP_REST_Request $request) {
        return $this->settings_service()->post_twelve_data_key($request);
    }

    public function delete_twelve_data_key() {
        return $this->settings_service()->delete_twelve_data_key();
    }

    public function get_instruments() {
        return $this->settings_service()->get_instruments();
    }

    public function get_user_watchlist() {
        return $this->settings_service()->get_user_watchlist();
    }

    public function post_user_watchlist(WP_REST_Request $request) {
        return $this->settings_service()->post_user_watchlist($request);
    }

    public function post_watchlist_add(WP_REST_Request $request) {
        return $this->settings_service()->post_watchlist_add($request);
    }

    public function post_watchlist_remove(WP_REST_Request $request) {
        return $this->settings_service()->post_watchlist_remove($request);
    }

    public function get_user_risk_profile() {
        return $this->settings_service()->get_user_risk_profile();
    }

    public function post_user_risk_profile(WP_REST_Request $request) {
        return $this->settings_service()->post_user_risk_profile($request);
    }

    public function get_snapshot() {
        return $this->snapshot_service()->get_snapshot();
    }

    // MT5 webhook — process and store market data from MT5 EA
    public function post_snapshot(WP_REST_Request $request) {
        return $this->snapshot_service()->post_snapshot($request);
    }

    private function snapshot_service() {
        return new \SMC\SuperFib\Service\SnapshotService($this);
    }

    private function engine_service() {
        return new \SMC\SuperFib\Service\EngineService($this);
    }

    private function user_service() {
        return new \SMC\SuperFib\Service\UserService($this);
    }

    private function settings_service() {
        return new \SMC\SuperFib\Service\SettingsService($this);
    }

    private function market_data_service() {
        return new \SMC\SuperFib\Service\MarketDataService($this);
    }

    private function ea_service() {
        return new \SMC\SuperFib\Service\EAService($this);
    }

    private function fundamentals_service() {
        return new \SMC\SuperFib\Service\FundamentalsService($this);
    }

    public function normalize_phase3_market_stream_payload(array $payload): array
    {
        if (!isset($payload['candle']) && $this->has_any_phase3_candle_alias($payload, 'candle_')) {
            $payload['candle'] = array(
                'time' => $payload['candle_time'] ?? null,
                'open' => $payload['candle_open'] ?? null,
                'high' => $payload['candle_high'] ?? null,
                'low' => $payload['candle_low'] ?? null,
                'close' => $payload['candle_close'] ?? null,
                'volume' => $payload['candle_volume'] ?? null,
            );
        }

        if (!isset($payload['candle_m15']) && $this->has_any_phase3_candle_alias($payload, 'candle_m15_')) {
            $payload['candle_m15'] = array(
                'time' => $payload['candle_m15_time'] ?? null,
                'open' => $payload['candle_m15_open'] ?? null,
                'high' => $payload['candle_m15_high'] ?? null,
                'low' => $payload['candle_m15_low'] ?? null,
                'close' => $payload['candle_m15_close'] ?? null,
                'volume' => $payload['candle_m15_volume'] ?? null,
            );
        }

        if (isset($payload['candle']) && is_array($payload['candle'])) {
            if (isset($payload['candle']['tick_volume']) && !isset($payload['candle']['volume'])) {
                $payload['candle']['volume'] = $payload['candle']['tick_volume'];
            }
            if (isset($payload['candle']['time']) && !isset($payload['candle']['timestamp'])) {
                $payload['candle']['timestamp'] = $payload['candle']['time'];
            }
        }

        if (isset($payload['candle_m15']) && is_array($payload['candle_m15'])) {
            if (isset($payload['candle_m15']['tick_volume']) && !isset($payload['candle_m15']['volume'])) {
                $payload['candle_m15']['volume'] = $payload['candle_m15']['tick_volume'];
            }
            if (isset($payload['candle_m15']['time']) && !isset($payload['candle_m15']['timestamp'])) {
                $payload['candle_m15']['timestamp'] = $payload['candle_m15']['time'];
            }
        }

        return $payload;
    }

    private function has_any_phase3_candle_alias(array $payload, $prefix): bool
    {
        foreach (array('time', 'open', 'high', 'low', 'close', 'volume') as $suffix) {
            if (array_key_exists($prefix . $suffix, $payload)) {
                return true;
            }
        }

        return false;
    }

    public function is_phase3_market_stream_payload(array $payload): bool
    {
        foreach (array('candle_m15', 'candle_m15_open', 'candle_m15_time') as $key) {
            if (array_key_exists($key, $payload)) {
                return true;
            }
        }

        return false;
    }

    public function normalize_mt5_freshness_value($freshness): string
    {
        $value = strtoupper(trim((string) $freshness));
        $allowed = array('LIVE', 'DELAYED', 'STALE', 'CLOSED', 'DISCONNECTED');
        return in_array($value, $allowed, true) ? $value : '';
    }

    public function normalize_mt5_session_value($session): string
    {
        $value = trim((string) $session);
        if ($value === '') {
            return '';
        }

        $upper = strtoupper(str_replace(array('-', ' '), '_', $value));
        $map = array(
            'SYDNEY' => 'Sydney',
            'TOKYO' => 'Tokyo',
            'ASIAN' => 'Tokyo',
            'LONDON' => 'London',
            'NEW_YORK' => 'New York',
            'NEWYORK' => 'New York',
            'OVERLAP' => 'Overlap',
            'CLOSED' => 'Closed',
            'WEEKEND' => 'Closed',
        );

        return $map[$upper] ?? '';
    }

    public function validate_phase3_market_stream_payload(array $payload): array
    {
        $timestamp_raw = !empty($payload['quote_time'])
            ? $payload['quote_time']
            : (!empty($payload['timestamp']) ? $payload['timestamp'] : null);

        if ($timestamp_raw === null || $timestamp_raw === '') {
            return array('field' => 'timestamp', 'message' => 'timestamp or quote_time is required for Phase 3 payloads.');
        }

        foreach (array('bid', 'ask', 'spread') as $field) {
            if (!array_key_exists($field, $payload) || $payload[$field] === '' || $payload[$field] === null) {
                return array('field' => $field, 'message' => $field . ' is required for Phase 3 payloads.');
            }
        }

        if ($this->normalize_mt5_freshness_value($payload['freshness'] ?? '') === '') {
            return array('field' => 'freshness', 'message' => 'freshness is required and must be a valid MT5 freshness state.');
        }

        if ($this->normalize_mt5_session_value($payload['session'] ?? '') === '') {
            return array('field' => 'session', 'message' => 'session is required and must be a valid MT5 session name.');
        }

        $has_m1_candle = array_key_exists('candle', $payload) || $this->has_any_phase3_candle_alias($payload, 'candle_');
        $has_m15_candle = array_key_exists('candle_m15', $payload) || $this->has_any_phase3_candle_alias($payload, 'candle_m15_');

        $required_candles = array();
        if ($has_m1_candle || !$has_m15_candle) {
            $required_candles['candle'] = 'M1';
        }
        if ($has_m15_candle) {
            $required_candles['candle_m15'] = 'M15';
        }

        foreach ($required_candles as $key => $label) {
            if (!isset($payload[$key]) || !is_array($payload[$key])) {
                return array('field' => $key, 'message' => $key . ' is required for Phase 3 payloads.');
            }

            foreach (array('time', 'open', 'high', 'low', 'close', 'volume') as $field) {
                if (!array_key_exists($field, $payload[$key]) || $payload[$key][$field] === '' || $payload[$key][$field] === null) {
                    return array('field' => $key . '.' . $field, 'message' => $label . ' candle field ' . $field . ' is required.');
                }
            }
        }

        return array();
    }

    public function get_market_data_authority(WP_REST_Request $request) {
        return $this->market_data_service()->get_market_data_authority($request);
    }

    public function get_authority_diagnostics(WP_REST_Request $request) {
        return $this->market_data_service()->get_authority_diagnostics($request);
    }

    /**
     * MT5 EA market data ingestion endpoint
     * Accepts live price snapshots and OHLC candles from MT5 Expert Advisor
     *
     * Canonical payload (published REST contract):
     * {
     *   "user_id": 1,
     *   "symbol": "EURUSD",
     *   "timeframe": "M1",
     *   "source": "MT5",
     *   "server_time": "2026-05-11T12:32:10Z",
     *   "quote_time": "2026-05-11T12:32:09Z",   <- tick timestamp (also accepted as "timestamp")
     *   "bid": 1.08521,
     *   "ask": 1.08534,
     *   "spread": 1.3,
     *   "candles": [                              <- array form; also accepted as "candle" (single object)
     *     { "time": "...", "open": ..., "high": ..., "low": ..., "close": ..., "tick_volume": 123 }
     *   ]
     * }
     *
     * Legacy EA format (MQL5 SMC_MarketDataEA.mq5):
     *   "timestamp"  instead of "quote_time"
     *   "candle"     single M1 object (also "candle_m15" for M15)
     *   "freshness"  LIVE|STALE|CLOSED|DISCONNECTED
     *   "session"    London|New York|etc.
     *
     * Both formats are accepted. quote_time takes precedence over timestamp when both present.
     * candles[0] is used as M1 when candle object is absent.
     */
    public function post_ea_market_stream(WP_REST_Request $request) {
        return $this->ea_service()->post_ea_market_stream($request);
    }

    public function post_ea_heartbeat(WP_REST_Request $request) {
        return $this->ea_service()->post_ea_heartbeat($request);
    }

    public function post_ea_account_sync(WP_REST_Request $request) {
        return $this->ea_service()->post_ea_account_sync($request);
    }

    public function post_ea_symbol_sync(WP_REST_Request $request) {
        return $this->ea_service()->post_ea_symbol_sync($request);
    }

    public function get_ea_license_check(WP_REST_Request $request) {
        return $this->ea_service()->get_ea_license_check($request);
    }

    public function post_ea_signal_candidates(WP_REST_Request $request) {
        return $this->ea_service()->post_ea_signal_candidates($request);
    }

    public function get_ea_execution_queue(WP_REST_Request $request) {
        return $this->ea_service()->get_ea_execution_queue($request);
    }

    public function post_ea_execution_ack(WP_REST_Request $request) {
        return $this->ea_service()->post_ea_execution_ack($request);
    }

    // ---- Phase 4: POST /ea/fib-levels ----
    public function post_ea_fib_levels(WP_REST_Request $request) {
        return $this->ea_service()->post_ea_fib_levels($request);
    }

    // ---- Phase 4: GET /market-data/fib-levels ----
    public function get_market_data_fib_levels(WP_REST_Request $request) {
        return $this->market_data_service()->get_market_data_fib_levels($request);
    }

    // =========================================================================
    // Phase 5: Regime & Chop Engine handlers
    // =========================================================================

    // POST /ea/regime-snapshot — ingest regime batch from MT5 EA.
    // Payload: { regimes: [ { user_id, symbol, htf_bias, ltf_regime,
    //                         chop_score, ema20_d1, atr14_h1,
    //                         htf_bias_high, htf_bias_low }, ... ] }
    public function post_ea_regime_snapshot(WP_REST_Request $request) {
        return $this->ea_service()->post_ea_regime_snapshot($request);
    }

    // GET /market-data/regime?symbol=EURUSD — retrieve regime snapshot for dashboard.
    // Optional: omit symbol to return all symbols for the user.
    public function get_market_data_regime(WP_REST_Request $request) {
        return $this->market_data_service()->get_market_data_regime($request);
    }

    // =========================================================================
    // Phase 5B: Fundamentals Regime Feed handlers
    // =========================================================================

    // POST /fundamentals/refresh — pull economic calendar from Twelve Data,
    // score events, recompute composite bias per currency.
    public function post_fundamentals_refresh(WP_REST_Request $request) {
        return $this->fundamentals_service()->post_fundamentals_refresh($request);
    }

    // GET /fundamentals/bias?currency=USD — retrieve composite bias per currency.
    // Returns all currencies if no filter provided.
    public function get_fundamentals_bias(WP_REST_Request $request) {
        return $this->fundamentals_service()->get_fundamentals_bias($request);
    }

    private function format_bias_row(array $row) {
        return array(
            'currency'       => $row['currency'],
            'compositeScore' => (float) $row['composite_score'],
            'category'       => $row['category'],
            'eventCount'     => (int) $row['event_count'],
            'computedAt'     => $this->to_iso((string) $row['computed_at']),
            'expiresAt'      => $this->to_iso((string) $row['expires_at']),
        );
    }

    // Pull economic calendar from Twelve Data /economic_calendar and score events.
    // Returns count of new/updated events inserted.
    private function ingest_economic_calendar($td_key) {
        global $wpdb;

        // Fetch the next 7 days of events (within the API free tier).
        $start = gmdate('Y-m-d');
        $end   = gmdate('Y-m-d', strtotime('+7 days'));
        $url   = "https://api.twelvedata.com/economic_calendar?start_date={$start}&end_date={$end}&apikey={$td_key}";

        $response = wp_remote_get($url, array('timeout' => 15));
        if (is_wp_error($response)) {
            error_log('[SMC_SF] fundamentals: TD calendar fetch error: ' . $response->get_error_message());
            return 0;
        }

        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);

        if (!is_array($data) || empty($data['result']) || !is_array($data['result'])) {
            error_log('[SMC_SF] fundamentals: TD calendar unexpected response: ' . substr($body, 0, 200));
            return 0;
        }

        $table   = $wpdb->prefix . 'smc_sf_fundamental_events';
        $written = 0;

        foreach ($data['result'] as $event) {
            if (!isset($event['currency'], $event['date'])) {
                continue;
            }

            $currency   = preg_replace('/[^A-Z]/', '', strtoupper(sanitize_text_field((string) $event['currency'])));
            $event_date = sanitize_text_field((string) $event['date']);
            $event_name = sanitize_text_field((string) ($event['event'] ?? 'Unknown'));
            $event_type = $this->classify_event_type($event_name);
            $actual     = isset($event['actual'])   && is_numeric($event['actual'])   ? (float) $event['actual']   : null;
            $forecast   = isset($event['estimate'])  && is_numeric($event['estimate'])  ? (float) $event['estimate']  : null;
            $previous   = isset($event['previous']) && is_numeric($event['previous']) ? (float) $event['previous'] : null;
            $raw_score  = $this->score_fundamental_event($event_type, $actual, $forecast, $previous);

            if (strlen($currency) < 2 || strlen($currency) > 8) {
                continue;
            }

            $result = $wpdb->replace(
                $table,
                array(
                    'currency'   => $currency,
                    'event_type' => $event_type,
                    'event_name' => substr($event_name, 0, 128),
                    'event_date' => substr($event_date, 0, 10),
                    'actual'     => $actual,
                    'forecast'   => $forecast,
                    'previous'   => $previous,
                    'raw_score'  => $raw_score,
                    'source'     => 'twelve_data',
                    'created_at' => $this->now_mysql(),
                ),
                array('%s', '%s', '%s', '%s',
                      $actual   !== null ? '%f' : 'NULL',
                      $forecast !== null ? '%f' : 'NULL',
                      $previous !== null ? '%f' : 'NULL',
                      '%f', '%s', '%s')
            );

            if ($result !== false) {
                $written++;
            }
        }

        return $written;
    }

    // Classify event name into a canonical event_type slug.
    private function classify_event_type($event_name) {
        $name = strtolower($event_name);
        if (strpos($name, 'cpi') !== false || strpos($name, 'inflation') !== false) return 'cpi';
        if (strpos($name, 'interest rate') !== false || strpos($name, 'rate decision') !== false) return 'rate_decision';
        if (strpos($name, 'nonfarm') !== false || strpos($name, 'non-farm') !== false || strpos($name, 'nfp') !== false) return 'nfp';
        if (strpos($name, 'gdp') !== false) return 'gdp';
        if (strpos($name, 'unemployment') !== false || strpos($name, 'jobless') !== false) return 'unemployment';
        if (strpos($name, 'pmi') !== false) return 'pmi';
        if (strpos($name, 'retail sales') !== false) return 'retail_sales';
        if (strpos($name, 'trade balance') !== false) return 'trade_balance';
        return 'other';
    }

    // Score a fundamental event: returns -2.0 to +2.0.
    // Positive = bullish for currency. Negative = bearish.
    private function score_fundamental_event($event_type, $actual, $forecast, $previous) {
        if ($event_type === 'rate_decision') {
            // Rate hike = bullish (+1), cut = bearish (-1), hold = neutral (0).
            if ($actual !== null && $previous !== null) {
                if ($actual > $previous) return 1.0;
                if ($actual < $previous) return -1.0;
            }
            return 0.0;
        }

        // For data releases: score by surprise magnitude relative to forecast.
        if ($actual === null || $forecast === null || abs($forecast) < 1e-9) {
            return 0.0;
        }

        $surprise = ($actual - $forecast) / abs($forecast);

        // Map surprise to -2..+2 scale.
        // Nonfarm payrolls and unemployment have inverted polarity for some directions:
        // unemployment: higher = bearish, NFP: higher = bullish.
        $polarity = ($event_type === 'unemployment') ? -1.0 : 1.0;
        $scored   = $surprise * $polarity;

        if ($scored >= 0.10)  return 2.0;
        if ($scored >= 0.03)  return 1.0;
        if ($scored <= -0.10) return -2.0;
        if ($scored <= -0.03) return -1.0;
        return 0.0;
    }

    // Recompute composite bias per currency from recent events with time decay.
    // Events older than 30 days → 0.25x weight; older than 90 days → excluded.
    // Returns count of currencies updated.
    private function recompute_fundamental_bias() {
        global $wpdb;

        $events_table = $wpdb->prefix . 'smc_sf_fundamental_events';
        $bias_table   = $wpdb->prefix . 'smc_sf_fundamental_bias';
        $cutoff_90d   = gmdate('Y-m-d', strtotime('-90 days'));
        $cutoff_30d   = gmdate('Y-m-d', strtotime('-30 days'));

        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT currency, event_date, raw_score FROM {$events_table} WHERE event_date >= %s ORDER BY currency, event_date DESC",
            $cutoff_90d
        ), ARRAY_A);

        // Aggregate per currency.
        $aggregated = array();
        foreach ((array) $rows as $row) {
            $cur   = $row['currency'];
            $date  = $row['event_date'];
            $score = (float) $row['raw_score'];
            $weight = ($date < $cutoff_30d) ? 0.25 : 1.0;

            if (!isset($aggregated[$cur])) {
                $aggregated[$cur] = array('sum' => 0.0, 'count' => 0);
            }
            $aggregated[$cur]['sum']   += $score * $weight;
            $aggregated[$cur]['count'] += 1;
        }

        $updated = 0;
        $now     = $this->now_mysql();
        $expires = gmdate('Y-m-d H:i:s', strtotime('+30 minutes'));

        foreach ($aggregated as $currency => $data) {
            $composite = $data['count'] > 0 ? ($data['sum'] / $data['count']) : 0.0;
            $composite = max(-2.0, min(2.0, $composite));

            $category = 'NEUTRAL';
            if ($composite >= 0.5)  $category = 'BULLISH';
            if ($composite <= -0.5) $category = 'BEARISH';

            $wpdb->replace(
                $bias_table,
                array(
                    'currency'        => $currency,
                    'composite_score' => round($composite, 2),
                    'category'        => $category,
                    'event_count'     => $data['count'],
                    'computed_at'     => $now,
                    'expires_at'      => $expires,
                ),
                array('%s', '%f', '%s', '%d', '%s', '%s')
            );
            $updated++;
        }

        return $updated;
    }

    // =========================================================================
    // Phase 6: Signal Engine Dual-Run handlers
    // =========================================================================

    // Direct route logic is delegated to EAService.

    public function find_latest_mt5_candidate_for_range(int $user_id, string $symbol, ?string $direction, string $fib_family, ?float $fib_ratio, ?float $fib_level) {
        global $wpdb;

        if ($fib_family === '' || $fib_ratio === null || $fib_level === null) {
            return null;
        }

        $price_tolerance = $this->get_mt5_candidate_price_tolerance($symbol);
        $min_fib_level = $fib_level - $price_tolerance;
        $max_fib_level = $fib_level + $price_tolerance;

        $query = "SELECT * FROM {$this->table('mt5_signal_candidates')}
             WHERE user_id = %d AND symbol = %s AND fib_family = %s AND fib_ratio = %f
               AND fib_level IS NOT NULL AND fib_level BETWEEN %f AND %f";
        $params = array(
            $user_id,
            $symbol,
            $fib_family,
            $fib_ratio,
            $min_fib_level,
            $max_fib_level
        );

        if ($direction !== null) {
            $query .= " AND direction = %s";
            $params[] = $direction;
        }

        $query .= "
             ORDER BY created_at DESC LIMIT 1";
        $row = $wpdb->get_row($wpdb->prepare($query, ...$params), ARRAY_A);

        return is_array($row) ? $row : null;
    }

    public function get_mt5_candidate_lifecycle_state(int $user_id, string $symbol, string $direction, array $prior_candidate): array {
        $price_tolerance = $this->get_mt5_candidate_price_tolerance($symbol);

        foreach ($this->read_trade_positions($user_id) as $position) {
            if (!$this->candidate_matches_trade_record($prior_candidate, $position, $price_tolerance)) {
                continue;
            }

            if (($position['freshness'] ?? '') !== 'live') {
                return array(
                    'state' => 'LIFECYCLE_UNRESOLVED',
                    'reason' => 'matching_open_position_not_live',
                    'matched_id' => (string) ($position['position_id'] ?? ''),
                );
            }

            return array(
                'state' => 'ACTIVE_OPEN_POSITION',
                'reason' => 'matching_open_position',
                'matched_id' => (string) ($position['position_id'] ?? ''),
            );
        }

        foreach ($this->read_trade_orders($user_id) as $order) {
            if (!$this->candidate_matches_trade_record($prior_candidate, $order, $price_tolerance)) {
                continue;
            }

            if (($order['freshness'] ?? '') !== 'live') {
                return array(
                    'state' => 'LIFECYCLE_UNRESOLVED',
                    'reason' => 'matching_pending_order_not_live',
                    'matched_id' => (string) ($order['order_id'] ?? ''),
                );
            }

            return array(
                'state' => 'ACTIVE_PENDING_ORDER',
                'reason' => 'matching_pending_order',
                'matched_id' => (string) ($order['order_id'] ?? ''),
            );
        }

        $cached_price = $this->get_cached_price($user_id, $symbol, $this->get_settings($user_id)['staleThresholdSec']);
        if (!is_array($cached_price) || ($cached_price['state'] ?? '') !== 'live') {
            return array(
                'state' => 'LIFECYCLE_UNRESOLVED',
                'reason' => 'snapshot_not_live',
            );
        }

        $entry_price = isset($prior_candidate['entry_price']) && is_numeric($prior_candidate['entry_price']) ? (float) $prior_candidate['entry_price'] : 0.0;
        $sl_price = isset($prior_candidate['sl_price']) && is_numeric($prior_candidate['sl_price']) ? (float) $prior_candidate['sl_price'] : null;
        $entry_reference_price = $direction === 'LONG'
            ? (float) ($cached_price['ask'] ?? 0.0)
            : (float) ($cached_price['bid'] ?? 0.0);
        $stop_reference_price = $direction === 'LONG'
            ? (float) ($cached_price['bid'] ?? 0.0)
            : (float) ($cached_price['ask'] ?? 0.0);

        if ($entry_price <= 0 || $entry_reference_price <= 0 || $stop_reference_price <= 0) {
            return array(
                'state' => 'LIFECYCLE_UNRESOLVED',
                'reason' => 'snapshot_prices_missing',
            );
        }

        if (!$this->has_directional_price_crossed($direction, $entry_reference_price, $entry_price)) {
            return array(
                'state' => 'ACTIVE_PRE_ENTRY',
                'reason' => 'entry_not_crossed',
            );
        }

        if ($this->has_directional_price_crossed($direction, $stop_reference_price, $sl_price, true)) {
            return array(
                'state' => 'INACTIVE_STOPPED_OUT',
                'reason' => 'stop_loss_crossed',
            );
        }

        if (strtoupper((string) ($prior_candidate['direction'] ?? '')) !== $direction) {
            return array(
                'state' => 'INACTIVE_DIRECTION_FLIP_UNCONFIRMED',
                'reason' => 'opposite_direction_same_fib_unconfirmed',
            );
        }

        return array(
            'state' => 'INACTIVE_ENTRY_PASSED',
            'reason' => 'entry_crossed_without_matching_trade',
        );
    }

    private function candidate_matches_trade_record(array $candidate, array $trade_record, float $price_tolerance): bool {
        $candidate_symbol = $this->map_symbol_aliases((string) ($candidate['symbol'] ?? ''));
        $trade_symbol = $this->map_symbol_aliases((string) (($trade_record['normalized_symbol'] ?? '') !== '' ? $trade_record['normalized_symbol'] : ($trade_record['symbol'] ?? '')));

        if ($candidate_symbol === '' || $candidate_symbol !== $trade_symbol) {
            return false;
        }

        if (strtoupper((string) ($candidate['direction'] ?? '')) !== strtoupper((string) ($trade_record['direction'] ?? ''))) {
            return false;
        }

        $price_checks = array(
            array('candidate' => 'entry_price', 'trade' => 'entry_price'),
            array('candidate' => 'sl_price', 'trade' => 'sl'),
            array('candidate' => 'tp_price', 'trade' => 'tp'),
        );

        foreach ($price_checks as $check) {
            $candidate_field = $check['candidate'];
            $trade_field = $check['trade'];
            if (!isset($candidate[$candidate_field]) || !is_numeric($candidate[$candidate_field])) {
                continue;
            }

            $candidate_price = (float) $candidate[$candidate_field];
            if ($candidate_price <= 0) {
                continue;
            }

            $trade_price = isset($trade_record[$trade_field]) && is_numeric($trade_record[$trade_field]) ? (float) $trade_record[$trade_field] : 0.0;
            if ($trade_price <= 0 || abs($candidate_price - $trade_price) > $price_tolerance) {
                return false;
            }
        }

        return true;
    }

    private function has_directional_price_crossed(string $direction, float $reference_price, ?float $level, bool $adverse = false): bool {
        if ($reference_price <= 0 || $level === null || $level <= 0) {
            return false;
        }

        if ($adverse) {
            return $direction === 'LONG'
                ? $reference_price <= $level
                : $reference_price >= $level;
        }

        return $direction === 'LONG'
            ? $reference_price >= $level
            : $reference_price <= $level;
    }

    private function get_mt5_candidate_price_tolerance(string $symbol): float {
        $spec = $this->get_instrument_spec($symbol);
        if (is_array($spec) && isset($spec['pip_size']) && (float) $spec['pip_size'] > 0) {
            return (float) $spec['pip_size'];
        }

        return strpos($symbol, 'JPY') !== false ? 0.01 : 0.0001;
    }

    // Determine pine_match classification by comparing MT5 candidate against
    // existing Pine-sourced signals in smc_sf_signals.
    // Returns: EXACT / DRIFT / MISMATCH / NO_PINE
    public function classify_signal_drift($user_id, $symbol, $direction, $mt5_entry, &$drift_pips = null) {
        global $wpdb;
        $drift_pips = null;

        $pine_signal = $wpdb->get_row($wpdb->prepare(
            "SELECT direction, engine FROM {$this->table('signals')} WHERE user_id = %d AND symbol = %s AND status != 'CLOSED' ORDER BY created_at DESC LIMIT 1",
            $user_id, $symbol
        ), ARRAY_A);

        if (!$pine_signal) {
            return 'NO_PINE';
        }

        // Extract Pine entry price from engine JSON to compute drift.
        $engine = json_decode((string) ($pine_signal['engine'] ?? '{}'), true);
        $pine_entry = isset($engine['ltfLevel']['price']) ? (float) $engine['ltfLevel']['price'] : null;

        if ($pine_signal['direction'] !== $direction) {
            if ($pine_entry !== null && $pine_entry > 0) {
                $pip_size   = (strpos($symbol, 'JPY') !== false) ? 0.01 : 0.0001;
                $drift_pips = abs($mt5_entry - $pine_entry) / $pip_size;
            }
            return 'MISMATCH';
        }

        if ($pine_entry === null || $pine_entry <= 0) {
            return 'DRIFT'; // direction matches but can't compute exact price drift
        }

        // Drift in pips: tolerate ≤ 20 pips for EXACT, up to 100 for DRIFT.
        $pip_size   = (strpos($symbol, 'JPY') !== false) ? 0.01 : 0.0001;
        $drift_pips = abs($mt5_entry - $pine_entry) / $pip_size;

        if ($drift_pips <= 20.0)  return 'EXACT';
        if ($drift_pips <= 100.0) return 'DRIFT';
        return 'MISMATCH';
    }

    // GET /market-data/signal-drift — drift analysis report for dashboard.
    // Shows MT5 vs Pine signal comparison for Phase 6 parity tracking.
    public function get_market_data_signal_drift(WP_REST_Request $request) {
        global $wpdb;

        $user_id = get_current_user_id();
        $table   = $wpdb->prefix . 'smc_sf_mt5_signal_candidates';

        // Last 200 candidates, newest first.
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT symbol, direction, status, verdict, entry_price, sl_price, tp_price,
                    fib_ratio, htf_bias, ltf_regime, confidence, pine_match, drift_pips, created_at
             FROM {$table} WHERE user_id = %d ORDER BY created_at DESC LIMIT 200",
            $user_id
        ), ARRAY_A);

        // Aggregate parity stats.
        $total    = count($rows);
        $exact    = 0; $drift = 0; $mismatch = 0; $no_pine = 0;
        foreach ((array) $rows as $r) {
            switch ($r['pine_match']) {
                case 'EXACT':    $exact++;    break;
                case 'DRIFT':    $drift++;    break;
                case 'MISMATCH': $mismatch++; break;
                default:         $no_pine++;  break;
            }
        }

        $parity_pct = ($total > 0 && ($total - $no_pine) > 0)
            ? round(($exact / ($total - $no_pine)) * 100, 1)
            : null;

        $candidates = array();
        foreach ((array) $rows as $r) {
            $candidates[] = array(
                'symbol'      => $r['symbol'],
                'direction'   => $r['direction'],
                'status'      => $r['status'],
                'verdict'     => $r['verdict'],
                'entryPrice'  => (float) $r['entry_price'],
                'slPrice'     => $r['sl_price'] !== null ? (float) $r['sl_price'] : null,
                'tpPrice'     => $r['tp_price'] !== null ? (float) $r['tp_price'] : null,
                'fibRatio'    => $r['fib_ratio'] !== null ? (float) $r['fib_ratio'] : null,
                'htfBias'     => $r['htf_bias'],
                'ltfRegime'   => $r['ltf_regime'],
                'confidence'  => (float) $r['confidence'],
                'pineMatch'   => $r['pine_match'],
                'driftPips'   => $r['drift_pips'] !== null ? (float) $r['drift_pips'] : null,
                'createdAt'   => $this->to_iso((string) $r['created_at']),
            );
        }

        return $this->no_cache_response(array(
            'ok'          => true,
            'parity' => array(
                'total'      => $total,
                'exact'      => $exact,
                'drift'      => $drift,
                'mismatch'   => $mismatch,
                'no_pine'    => $no_pine,
                'parity_pct' => $parity_pct,
                'gate_target' => 95.0,
                'gate_status' => ($parity_pct !== null && $parity_pct >= 95.0) ? 'PASS' : 'PENDING',
            ),
            'candidates'  => $candidates,
        ));
    }

    // Risk guardrails validated here before the request enters the queue.
    public function post_user_execution_request(WP_REST_Request $request) {
        global $wpdb;

        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            return new WP_Error('invalid_payload', 'JSON body required', array('status' => 400));
        }

        $user_id = get_current_user_id();

        // Phase 6 gate.
        if (!$this->is_phase6_gate_cleared($user_id)) {
            return new WP_Error('phase6_gate', 'Execution is gated behind Phase 6 parity ≥ 95%', array('status' => 403));
        }

        $signal_id  = sanitize_text_field((string) ($payload['signal_id']  ?? ''));
        $symbol     = preg_replace('/[^A-Z0-9]/', '', strtoupper(sanitize_text_field((string) ($payload['symbol'] ?? ''))));
        $direction  = strtoupper(sanitize_text_field((string) ($payload['direction'] ?? '')));
        $order_type = strtoupper(sanitize_text_field((string) ($payload['order_type'] ?? 'MARKET')));
        $lots       = isset($payload['lots']) && is_numeric($payload['lots']) ? (float) $payload['lots'] : 0.0;
        $entry      = isset($payload['entry_price']) && is_numeric($payload['entry_price']) ? (float) $payload['entry_price'] : null;
        $sl         = isset($payload['sl_price']) && is_numeric($payload['sl_price']) ? (float) $payload['sl_price'] : null;
        $tp         = isset($payload['tp_price']) && is_numeric($payload['tp_price']) ? (float) $payload['tp_price'] : null;

        // Guardrail 1: SL is mandatory.
        if ($sl === null || $sl <= 0) {
            return new WP_Error('sl_required', 'sl_price is required for all execution requests', array('status' => 422));
        }

        // Guardrail 2: valid direction.
        if (!in_array($direction, array('LONG', 'SHORT'), true)) {
            return new WP_Error('invalid_direction', 'direction must be LONG or SHORT', array('status' => 422));
        }

        // Guardrail 3: lots > 0.
        if ($lots <= 0.0 || $lots > 10.0) {
            return new WP_Error('invalid_lots', 'lots must be between 0.01 and 10.0', array('status' => 422));
        }

        $table = $wpdb->prefix . 'smc_sf_execution_audit';
        $now   = $this->now_mysql();

        $result = $wpdb->insert(
            $table,
            array(
                'user_id'          => $user_id,
                'signal_id'        => $signal_id !== '' ? $signal_id : null,
                'symbol'           => $symbol,
                'direction'        => $direction,
                'order_type'       => $order_type,
                'lots'             => $lots,
                'entry_price'      => $entry,
                'sl_price'         => $sl,
                'tp_price'         => $tp,
                'status'           => 'PENDING',
                'risk_check_passed' => 1,
                'requested_at'     => $now,
                'created_at'       => $now,
            ),
            array('%d', '%s', '%s', '%s', '%s', '%f',
                  $entry !== null ? '%f' : 'NULL', '%f',
                  $tp    !== null ? '%f' : 'NULL',
                  '%s', '%d', '%s', '%s')
        );

        $this->audit($user_id, 'execution.request.created', array(
            'signal_id' => $signal_id, 'symbol' => $symbol,
            'direction' => $direction, 'lots' => $lots,
        ));

        return rest_ensure_response(array(
            'ok'         => $result !== false,
            'request_id' => $wpdb->insert_id,
        ));
    }

    // GET /user/execution-audit — return execution audit trail for dashboard.
    public function get_user_execution_audit(WP_REST_Request $request) {
        global $wpdb;

        $user_id = get_current_user_id();
        $limit   = min(200, max(1, (int) ($request->get_param('limit') ?? 50)));
        $table   = $wpdb->prefix . 'smc_sf_execution_audit';

        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT id, signal_id, symbol, direction, order_type, lots, entry_price, sl_price, tp_price,
                    mt5_ticket, status, reject_reason, risk_check_passed, requested_at, executed_at, ack_at
             FROM {$table} WHERE user_id = %d ORDER BY requested_at DESC LIMIT %d",
            $user_id, $limit
        ), ARRAY_A);

        $records = array();
        foreach ((array) $rows as $r) {
            $records[] = array(
                'id'              => (int) $r['id'],
                'signalId'        => $r['signal_id'],
                'symbol'          => $r['symbol'],
                'direction'       => $r['direction'],
                'orderType'       => $r['order_type'],
                'lots'            => (float) $r['lots'],
                'entryPrice'      => $r['entry_price'] !== null ? (float) $r['entry_price'] : null,
                'slPrice'         => $r['sl_price']    !== null ? (float) $r['sl_price']    : null,
                'tpPrice'         => $r['tp_price']    !== null ? (float) $r['tp_price']    : null,
                'mt5Ticket'       => $r['mt5_ticket']  !== null ? (int)   $r['mt5_ticket']  : null,
                'status'          => $r['status'],
                'rejectReason'    => $r['reject_reason'],
                'riskCheckPassed' => (bool) $r['risk_check_passed'],
                'requestedAt'     => $this->to_iso((string) $r['requested_at']),
                'executedAt'      => $r['executed_at'] ? $this->to_iso((string) $r['executed_at']) : null,
                'ackAt'           => $r['ack_at']      ? $this->to_iso((string) $r['ack_at'])      : null,
            );
        }

        return rest_ensure_response(array(
            'ok'      => true,
            'records' => $records,
        ));
    }

    // Check if Phase 6 parity gate is cleared (>= 95% parity in signal drift table).
    public function is_phase6_gate_cleared($user_id) {
        global $wpdb;

        $table = $wpdb->prefix . 'smc_sf_mt5_signal_candidates';

        // Count only comparable rows (EXACT / DRIFT / MISMATCH) — rows where a Pine
        // signal exists for the same symbol so a meaningful parity judgement can be made.
        // NO_PINE rows are excluded from both the minimum-sample check and the parity ratio
        // because they carry no signal quality information about MT5 vs Pine agreement.
        // Counting IS NOT NULL (which includes NO_PINE) was the pre-fix bug: it let many
        // NO_PINE rows pad the sample to ≥50 while the actual comparable set was tiny,
        // enabling the Phase 7 execution gate to clear prematurely.
        $comparable = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$table} WHERE user_id = %d AND pine_match NOT IN ('NO_PINE') AND pine_match IS NOT NULL",
            $user_id
        ));

        if ($comparable < 50) {
            // Not enough comparable MT5↔Pine pairs yet — keep gate closed.
            return false;
        }

        $exact = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$table} WHERE user_id = %d AND pine_match = 'EXACT'",
            $user_id
        ));

        $parity_pct = ($exact / $comparable) * 100.0;
        return $parity_pct >= 95.0;
    }

    // =========================================================================
    // Phase 8: Semi-Automation Approval Queue handlers
    // =========================================================================

    // GET /user/approval-queue — return pending signal approvals.
    public function get_user_approval_queue(WP_REST_Request $request) {
        global $wpdb;

        $user_id = get_current_user_id();
        $status  = sanitize_text_field((string) ($request->get_param('status') ?? 'PENDING'));
        $table   = $wpdb->prefix . 'smc_sf_approval_queue';

        // Expire old pending items automatically.
        $wpdb->query($wpdb->prepare(
            "UPDATE {$table} SET status = 'EXPIRED' WHERE user_id = %d AND status = 'PENDING' AND expires_at < %s",
            $user_id, $this->now_mysql()
        ));

        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT id, signal_id, signal_data, regime_data, fundamental_data, risk_data,
                    status, operator_note, created_at, reviewed_at, expires_at
             FROM {$table} WHERE user_id = %d AND status = %s ORDER BY created_at DESC LIMIT 50",
            $user_id, $status
        ), ARRAY_A);

        $items = array();
        foreach ((array) $rows as $r) {
            $items[] = array(
                'id'              => $r['id'],
                'signalId'        => $r['signal_id'],
                'signal'          => json_decode((string) $r['signal_data'], true),
                'regime'          => $r['regime_data']      ? json_decode((string) $r['regime_data'], true) : null,
                'fundamentals'    => $r['fundamental_data'] ? json_decode((string) $r['fundamental_data'], true) : null,
                'risk'            => $r['risk_data']        ? json_decode((string) $r['risk_data'], true) : null,
                'status'          => $r['status'],
                'operatorNote'    => $r['operator_note'],
                'createdAt'       => $this->to_iso((string) $r['created_at']),
                'reviewedAt'      => $r['reviewed_at'] ? $this->to_iso((string) $r['reviewed_at']) : null,
                'expiresAt'       => $this->to_iso((string) $r['expires_at']),
            );
        }

        return rest_ensure_response(array(
            'ok'    => true,
            'items' => $items,
        ));
    }

    // POST /user/approval-queue/review — approve or reject a queued signal.
    public function post_approval_queue_review(WP_REST_Request $request) {
        global $wpdb;

        $payload = $request->get_json_params();
        if (!is_array($payload) || empty($payload['id'])) {
            return new WP_Error('invalid_payload', 'id required', array('status' => 400));
        }

        $user_id  = get_current_user_id();
        $id       = sanitize_text_field((string) $payload['id']);
        $decision = strtoupper(sanitize_text_field((string) ($payload['decision'] ?? '')));
        $note     = sanitize_text_field((string) ($payload['note'] ?? ''));

        if (!in_array($decision, array('APPROVED', 'REJECTED'), true)) {
            return new WP_Error('invalid_decision', 'decision must be APPROVED or REJECTED', array('status' => 422));
        }

        $table = $wpdb->prefix . 'smc_sf_approval_queue';

        $updated = $wpdb->update(
            $table,
            array(
                'status'        => $decision,
                'operator_note' => substr($note, 0, 512),
                'reviewed_at'   => $this->now_mysql(),
            ),
            array('id' => $id, 'user_id' => $user_id, 'status' => 'PENDING'),
            array('%s', '%s', '%s'),
            array('%s', '%d', '%s')
        );

        $this->audit($user_id, 'approval_queue.reviewed', array(
            'id' => $id, 'decision' => $decision,
        ));

        return rest_ensure_response(array(
            'ok'      => $updated !== false && $updated > 0,
            'updated' => (int) $updated,
        ));
    }

    // =========================================================================
    // Phase 9: SaaS & Licensing System handlers
    // =========================================================================

    // GET /user/license — return current license tier for the requesting user.
    public function get_user_license(WP_REST_Request $request) {
        global $wpdb;

        $user_id = get_current_user_id();
        $table   = $wpdb->prefix . 'smc_sf_license_tiers';

        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT tier, max_symbols, max_ea_sessions, execution_enabled, api_access_enabled, expires_at, updated_at
             FROM {$table} WHERE user_id = %d",
            $user_id
        ), ARRAY_A);

        // Return a default free-tier record if none exists yet.
        if (!$row) {
            return rest_ensure_response(array(
                'ok'     => true,
                'source' => 'default',
                'license' => array(
                    'tier'              => 'Basic',
                    'maxSymbols'        => 5,
                    'maxEaSessions'     => 1,
                    'executionEnabled'  => false,
                    'apiAccessEnabled'  => false,
                    'expiresAt'         => null,
                    'updatedAt'         => null,
                ),
            ));
        }

        $expired = $row['expires_at'] && strtotime($row['expires_at']) < time();

        return rest_ensure_response(array(
            'ok'     => true,
            'source' => 'db',
            'license' => array(
                'tier'              => $expired ? 'Basic' : $row['tier'],
                'maxSymbols'        => $expired ? 5  : (int)  $row['max_symbols'],
                'maxEaSessions'     => $expired ? 1  : (int)  $row['max_ea_sessions'],
                'executionEnabled'  => $expired ? false : (bool) $row['execution_enabled'],
                'apiAccessEnabled'  => $expired ? false : (bool) $row['api_access_enabled'],
                'expiresAt'         => $row['expires_at'] ? $this->to_iso((string) $row['expires_at']) : null,
                'updatedAt'         => $row['updated_at'] ? $this->to_iso((string) $row['updated_at']) : null,
                'expired'           => $expired,
            ),
        ));
    }

    // POST /admin/license/set-tier — set license tier for a user (admin only).
    public function post_admin_set_license_tier(WP_REST_Request $request) {
        global $wpdb;

        $payload = $request->get_json_params();
        if (!is_array($payload) || !isset($payload['user_id'], $payload['tier'])) {
            return new WP_Error('invalid_payload', 'user_id and tier required', array('status' => 400));
        }

        $target_user  = (int) $payload['user_id'];
        $tier         = sanitize_text_field((string) $payload['tier']);
        $valid_tiers  = array('Basic', 'Pro', 'Elite', 'Institutional');

        if (!in_array($tier, $valid_tiers, true)) {
            return new WP_Error('invalid_tier', 'tier must be one of: ' . implode(', ', $valid_tiers), array('status' => 422));
        }

        $tier_config = array(
            'Basic'         => array('max_symbols' => 5,  'max_ea_sessions' => 1, 'execution' => 0, 'api' => 0),
            'Pro'           => array('max_symbols' => 15, 'max_ea_sessions' => 2, 'execution' => 0, 'api' => 0),
            'Elite'         => array('max_symbols' => 30, 'max_ea_sessions' => 3, 'execution' => 1, 'api' => 0),
            'Institutional' => array('max_symbols' => 60, 'max_ea_sessions' => 5, 'execution' => 1, 'api' => 1),
        );

        $cfg     = $tier_config[$tier];
        $expires = isset($payload['expires_at']) ? sanitize_text_field((string) $payload['expires_at']) : null;
        $now     = $this->now_mysql();
        $table   = $wpdb->prefix . 'smc_sf_license_tiers';

        $wpdb->replace(
            $table,
            array(
                'user_id'           => $target_user,
                'tier'              => $tier,
                'max_symbols'       => $cfg['max_symbols'],
                'max_ea_sessions'   => $cfg['max_ea_sessions'],
                'execution_enabled' => $cfg['execution'],
                'api_access_enabled' => $cfg['api'],
                'expires_at'        => $expires,
                'created_at'        => $now,
                'updated_at'        => $now,
            ),
            array('%d', '%s', '%d', '%d', '%d', '%d', '%s', '%s', '%s')
        );

        $this->audit(get_current_user_id(), 'license.tier.set', array(
            'target_user' => $target_user, 'tier' => $tier, 'expires_at' => $expires,
        ));

        return rest_ensure_response(array(
            'ok'          => true,
            'user_id'     => $target_user,
            'tier'        => $tier,
            'expires_at'  => $expires,
        ));
    }

    public function insert_engine_heartbeat($user_id, array $summary) {
        global $wpdb;

        $wpdb->insert(
            $this->table('engine_runs'),
            array(
                'user_id' => $user_id,
                'status' => 'heartbeat',
                'summary' => wp_json_encode($summary),
                'created_at' => $this->now_mysql(),
            ),
            array('%d', '%s', '%s', '%s')
        );
    }

    public function ea_identity_key($account_id, $terminal_id) {
        $account_fragment = $account_id !== '' ? $account_id : 'unknown-account';
        $terminal_fragment = $terminal_id !== '' ? $terminal_id : 'unknown-terminal';
        return $account_fragment . '|' . $terminal_fragment;
    }

    public function sanitize_ea_text($value, $max_length = 128) {
        $clean = sanitize_text_field((string) $value);
        return substr($clean, 0, $max_length);
    }

    public function sanitize_ea_number($value, $fallback = 0.0) {
        return is_numeric($value) ? (float) $value : (float) $fallback;
    }

    public function sanitize_ea_int($value, $fallback = 0) {
        return is_numeric($value) ? (int) $value : (int) $fallback;
    }

    public function sanitize_ea_bool($value) {
        if (is_bool($value)) {
            return $value;
        }
        if (is_numeric($value)) {
            return ((int) $value) === 1;
        }

        $normalized = strtolower(trim((string) $value));
        return in_array($normalized, array('1', 'true', 'yes', 'on', 'connected', 'live'), true);
    }

    public function normalize_symbol_sync_payload(WP_REST_Request $request, array $payload) {
        $symbols = $this->ea_request_value($request, $payload, 'symbols', array());
        if (is_array($symbols) && isset($symbols['broker_symbol'])) {
            return array($symbols);
        }
        if (is_array($symbols)) {
            return array_values(array_filter($symbols, 'is_array'));
        }

        if (isset($payload['broker_symbol']) || $request->get_param('broker_symbol') !== null) {
            return array(array(
                'broker_symbol' => $this->ea_request_value($request, $payload, 'broker_symbol', ''),
                'normalized_symbol' => $this->ea_request_value($request, $payload, 'normalized_symbol', ''),
                'base_symbol' => $this->ea_request_value($request, $payload, 'base_symbol', ''),
                'visible' => $this->ea_request_value($request, $payload, 'visible', 0),
                'selected' => $this->ea_request_value($request, $payload, 'selected', 0),
                'digits' => $this->ea_request_value($request, $payload, 'digits', 0),
                'point' => $this->ea_request_value($request, $payload, 'point', 0),
                'contract_size' => $this->ea_request_value($request, $payload, 'contract_size', 0),
                'trade_mode' => $this->ea_request_value($request, $payload, 'trade_mode', ''),
                'min_lot' => $this->ea_request_value($request, $payload, 'min_lot', 0),
                'max_lot' => $this->ea_request_value($request, $payload, 'max_lot', 0),
                'lot_step' => $this->ea_request_value($request, $payload, 'lot_step', 0),
                'spread' => $this->ea_request_value($request, $payload, 'spread', 0),
                'currency_profit' => $this->ea_request_value($request, $payload, 'currency_profit', ''),
                'currency_margin' => $this->ea_request_value($request, $payload, 'currency_margin', ''),
            ));
        }

        return array();
    }

    public function build_symbol_sync_record(WP_REST_Request $request, array $payload, array $symbol_payload, $user_id, $seen_at) {
        $account_id = $this->sanitize_ea_text(
            array_key_exists('account_id', $symbol_payload) ? $symbol_payload['account_id'] : $this->ea_request_value($request, $payload, 'account_id', ''),
            64
        );
        $terminal_id = $this->sanitize_ea_text(
            array_key_exists('terminal_id', $symbol_payload) ? $symbol_payload['terminal_id'] : $this->ea_request_value($request, $payload, 'terminal_id', ''),
            96
        );
        $broker_symbol = $this->sanitize_ea_text($symbol_payload['broker_symbol'] ?? '', 96);
        $normalized_symbol = $this->sanitize_ea_text($symbol_payload['normalized_symbol'] ?? '', 64);

        if ($broker_symbol === '' || $normalized_symbol === '') {
            return new WP_Error('smc_sf_symbol_sync_symbol_invalid', 'broker_symbol and normalized_symbol are required for symbol sync.', array('status' => 400));
        }

        return array(
            'user_id' => $user_id,
            'account_id' => $account_id,
            'terminal_id' => $terminal_id,
            'broker' => $this->sanitize_ea_text(
                array_key_exists('broker', $symbol_payload) ? $symbol_payload['broker'] : $this->ea_request_value($request, $payload, 'broker', ''),
                96
            ),
            'broker_server' => $this->sanitize_ea_text(
                array_key_exists('broker_server', $symbol_payload) ? $symbol_payload['broker_server'] : $this->ea_request_value($request, $payload, 'broker_server', ''),
                128
            ),
            'broker_symbol' => $broker_symbol,
            'normalized_symbol' => $normalized_symbol,
            'base_symbol' => $this->sanitize_ea_text($symbol_payload['base_symbol'] ?? $normalized_symbol, 64),
            'visible' => $this->sanitize_ea_bool($symbol_payload['visible'] ?? false) ? 1 : 0,
            'selected' => $this->sanitize_ea_bool($symbol_payload['selected'] ?? false) ? 1 : 0,
            'digits' => $this->sanitize_ea_int($symbol_payload['digits'] ?? 0),
            'point' => $this->sanitize_ea_number($symbol_payload['point'] ?? 0),
            'contract_size' => $this->sanitize_ea_number($symbol_payload['contract_size'] ?? 0),
            'trade_mode' => $this->sanitize_ea_text($symbol_payload['trade_mode'] ?? '', 64),
            'min_lot' => $this->sanitize_ea_number($symbol_payload['min_lot'] ?? 0),
            'max_lot' => $this->sanitize_ea_number($symbol_payload['max_lot'] ?? 0),
            'lot_step' => $this->sanitize_ea_number($symbol_payload['lot_step'] ?? 0),
            'spread' => $this->sanitize_ea_number($symbol_payload['spread'] ?? 0),
            'currency_profit' => $this->sanitize_ea_text($symbol_payload['currency_profit'] ?? '', 32),
            'currency_margin' => $this->sanitize_ea_text($symbol_payload['currency_margin'] ?? '', 32),
            'last_seen_at' => $seen_at,
            'created_at' => $this->now_mysql(),
            'updated_at' => $this->now_mysql(),
            'raw_json' => wp_json_encode($symbol_payload),
        );
    }

    public function resolve_ea_license_status(array $blob, $account_id, $terminal_id) {
        $allowed = true;
        $status = 'active';
        $reason = null;
        $plan = 'internal';

        $bridge = isset($blob['eaBridge']) && is_array($blob['eaBridge']) ? $blob['eaBridge'] : array();
        $account_key = $this->ea_identity_key($account_id, $terminal_id);
        $account_record = isset($bridge['accounts'][$account_key]) && is_array($bridge['accounts'][$account_key]) ? $bridge['accounts'][$account_key] : array();
        $license = isset($bridge['license']) && is_array($bridge['license']) ? $bridge['license'] : array();

        if (array_key_exists('plan', $license) && $license['plan'] !== '') {
            $plan = $this->sanitize_ea_text($license['plan'], 64);
        }
        if (array_key_exists('plan', $account_record) && $account_record['plan'] !== '') {
            $plan = $this->sanitize_ea_text($account_record['plan'], 64);
        }

        if ((array_key_exists('allowed', $license) && !$this->sanitize_ea_bool($license['allowed']))
            || (array_key_exists('allowed', $account_record) && !$this->sanitize_ea_bool($account_record['allowed']))) {
            $allowed = false;
            $status = 'disabled';
        }

        if (isset($license['status']) && $license['status'] !== '') {
            $status = $this->sanitize_ea_text($license['status'], 32);
        }
        if (isset($account_record['status']) && $account_record['status'] !== '') {
            $status = $this->sanitize_ea_text($account_record['status'], 32);
        }

        if (!$allowed) {
            if (!empty($account_record['reason'])) {
                $reason = $this->sanitize_ea_text($account_record['reason'], 191);
            } elseif (!empty($license['reason'])) {
                $reason = $this->sanitize_ea_text($license['reason'], 191);
            } else {
                $reason = 'EA access disabled for this account';
            }
        }

        return array(
            'allowed' => $allowed,
            'status' => $status,
            'reason' => $reason,
            'plan' => $plan,
        );
    }

    /**
     * Insert or update MT5 price snapshot
     * Regression guard: Atomic operation with proper source tagging
     */
    public function upsert_mt5_snapshot($user_id, $symbol, $bid, $ask, $updated_at = null, $freshness = '') {
        global $wpdb;

        $mid = ($bid + $ask) / 2;
        $spec = $this->get_instrument_spec($symbol);
        $pip_size = isset($spec['pip_size']) && (float) $spec['pip_size'] > 0 ? (float) $spec['pip_size'] : 0.0001;
        $spread = ($ask - $bid) / $pip_size; // Convert to pips using per-instrument pip size
        // FIXED: Preserve broker timestamp for accurate staleness detection.
        // Delayed packets (up to 300s old) are accepted but must reflect their true age
        // to prevent stale data from appearing fresh and bypassing Twelve Data fallback.
        if ($updated_at === null) {
            $updated_at = $this->now_mysql(); // Fallback to server time if no timestamp provided
        }

        $change_pct_1d = $this->mt5_change_pct_1d($user_id, $symbol, $bid);
        $snapshot_state = $freshness !== ''
            ? $this->mt5_freshness_to_snapshot_state($freshness)
            : 'live';

        $result = $wpdb->replace(
            $this->table('snapshots'),
            array(
                'user_id' => $user_id,
                'symbol' => $symbol,
                'bid' => $bid,
                'ask' => $ask,
                'mid' => $mid,
                'spread' => $spread,
                'change_pct_1d' => $change_pct_1d,
                'source' => 'mt5',
                'state' => $snapshot_state,
                'updated_at' => $updated_at
            ),
            array('%d', '%s', '%f', '%f', '%f', '%d', '%f', '%s', '%s', '%s')
        );

        return $result !== false;
    }

    private function mt5_change_pct_1d($user_id, $symbol, $current_bid) {
        global $wpdb;

        $day_open = $wpdb->get_var($wpdb->prepare(
            "SELECT open FROM {$this->table('candles')}
             WHERE user_id = %d AND symbol = %s AND source = 'mt5'
               AND timeframe = '1min' AND candle_time >= %s
             ORDER BY candle_time ASC LIMIT 1",
            $user_id,
            $symbol,
            gmdate('Y-m-d') . ' 00:00:00'
        ));

        $day_open = (float) $day_open;
        if ($day_open <= 0 || (float) $current_bid <= 0) {
            return 0;
        }

        return round((((float) $current_bid - $day_open) / $day_open) * 100, 4);
    }

    /**
     * Insert MT5 candle data
     * Regression guard: Atomic operation with proper source tagging
     */
    public function insert_mt5_candle($user_id, $symbol, $timeframe, $candle, $stream_timestamp = null, $max_age_sec = 180) {
        global $wpdb;

        // Parse timestamp to MySQL format
        $candle_time = gmdate('Y-m-d H:i:s', strtotime($candle['time']));
        if ($stream_timestamp && strtotime($candle['time']) >= strtotime($stream_timestamp)) {
            error_log("CANDLE CHECK: candle_time={$candle['time']} | stream={$stream_timestamp}");
            error_log("CANDLE REJECTED: {$symbol} | candle_time={$candle['time']} >= stream={$stream_timestamp}");
            $this->audit($user_id, 'ea.market_stream.open_or_future_candle_rejected', array(
                'symbol' => $symbol,
                'timeframe' => $timeframe,
                'candle_time' => $candle['time'],
                'stream_timestamp' => $stream_timestamp,
            ));
            return false;
        }

        if ($stream_timestamp) {
            $candle_ts = strtotime($candle['time']);
            $stream_ts = strtotime($stream_timestamp);
            if ($candle_ts !== false && $stream_ts !== false) {
                $age_seconds = $stream_ts - $candle_ts;
                // HARDENING: M1 candles are already 60s old by design (closed bar).
                // Raise threshold to 180s (60s natural lag + 120s broker-jitter headroom).
                // For M15 candles we pass a larger limit because a closed bar is naturally 15-30 minutes old.
                // REGRESSION: Log via audit() not just error_log() so rejections are visible.
                if ($age_seconds > $max_age_sec) {
                    error_log("STALE REJECTED: {$symbol} | age={$age_seconds}s | candle={$candle['time']} | stream={$stream_timestamp}");
                    $this->audit($user_id, 'ea.market_stream.stale_candle_rejected', array(
                        'symbol' => $symbol,
                        'timeframe' => $timeframe,
                        'candle_time' => $candle['time'],
                        'stream_timestamp' => $stream_timestamp,
                        'age_seconds' => $age_seconds,
                    ));
                    return false;
                }
            }
        }

        $result = $wpdb->replace(
            $this->table('candles'),
            array(
                'user_id' => $user_id,
                'symbol' => $symbol,
                'timeframe' => $timeframe,
                'candle_time' => $candle_time,
                'open' => (float) $candle['open'],
                'high' => (float) $candle['high'],
                'low' => (float) $candle['low'],
                'close' => (float) $candle['close'],
                'volume' => (string) $this->guard_tick_volume($user_id, $symbol, $candle['volume'] ?? 0),
                'source' => 'mt5',
                'created_at' => $this->now_mysql()
            ),
            array('%d', '%s', '%s', '%s', '%f', '%f', '%f', '%f', '%s', '%s', '%s')
        );

        return $result !== false;
    }

    /**
     * Clamp tick_volume to a non-negative integer.
     * Non-numeric types (arrays, objects) are rejected: PHP's (int) cast silently
     * coerces non-empty arrays/objects to 1, bypassing the negative-volume guard.
     * Negative or non-numeric values are audited and clamped to 0.
     * Volume is display-only and does not affect signal computation.
     */
    private function guard_tick_volume($user_id, $symbol, $raw_volume): int {
        if (!is_numeric($raw_volume)) {
            $this->audit($user_id, 'ea.market_stream.invalid_tick_volume', array(
                'symbol'     => $symbol,
                'raw_volume' => $raw_volume,
                'clamped_to' => 0,
                'reason'     => 'non_numeric_type',
            ));
            return 0;
        }
        $volume = (int) $raw_volume;
        if ($volume < 0) {
            $this->audit($user_id, 'ea.market_stream.invalid_tick_volume', array(
                'symbol'     => $symbol,
                'raw_volume' => $raw_volume,
                'clamped_to' => 0,
                'reason'     => 'negative_volume',
            ));
            return 0;
        }
        return $volume;
    }

    /**
     * Validate OHLC ordering: high >= max(open,close), low <= min(open,close).
     * Returns false if the candle is logically inconsistent and should be rejected.
     */
    public function validate_ohlc(array $candle): bool {
        $open  = (float) $candle['open'];
        $high  = (float) $candle['high'];
        $low   = (float) $candle['low'];
        $close = (float) $candle['close'];
        return $high >= max($open, $close) && $low <= min($open, $close);
    }

    public function get_regimes() {
        return $this->engine_service()->get_regimes();
    }

    // Pine webhook stub — intentionally audit-only until Pine alert integration is implemented.
    public function post_regime(WP_REST_Request $request) {
        return $this->engine_service()->post_regime($request);
    }

    public function get_live_signals(WP_REST_Request $request = null) {
        return $this->engine_service()->get_live_signals($request);
    }

    // Pine webhook stub — intentionally audit-only until Pine alert integration is implemented.
    public function post_signal(WP_REST_Request $request) {
        return $this->engine_service()->post_signal($request);
    }

    public function get_ladders(WP_REST_Request $request) {
        return $this->engine_service()->get_ladders($request);
    }

    public function get_chart_snapshot(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $symbol = strtoupper(sanitize_text_field($request->get_param('symbol') ?: 'GBPUSD'));
        $timeframe = sanitize_text_field($request->get_param('timeframe') ?: '15min');
        $chart_candle_limit = 120;
        $fib_candle_limit = max($chart_candle_limit, $this->fib_history_window_size($timeframe));
        $candles = $this->fetch_candles($user_id, $symbol, $timeframe, $fib_candle_limit);
        $chart_candles = count($candles) > $chart_candle_limit
            ? array_slice($candles, -1 * $chart_candle_limit)
            : $candles;
        $state = 'offline';
        $updated_at = null;
        if (!empty($chart_candles)) {
            $last_candle = end($chart_candles);
            $updated_at = isset($last_candle['time']) ? $last_candle['time'] : null;
            $state = $this->is_chart_candle_fresh($last_candle['time'] ?? null, $timeframe) ? 'live' : 'stale';
        } else {
            $state = $this->get_twelve_key_status($user_id) === 'ok' ? 'stale' : 'blocked';
        }
        $this->fib_context_symbol = $symbol;
        $this->fib_context_timeframe = $timeframe;
        $this->fib_context_tf_seconds = max(60, (int) $this->timeframe_seconds($timeframe));
        $levels = $this->fib_levels_from_candles($candles);

        return $this->no_cache_response(array(
            'symbol' => $symbol,
            'timeframe' => $timeframe,
            'candles' => $chart_candles,
            'fibLevels' => $levels['LTF_SF'],
            'LTF_SF' => $levels['LTF_SF'],
            'HTF_AF' => $levels['HTF_AF'],
            'updatedAt' => $updated_at,
            'state' => $state,
        ));
    }

    public function post_user_market_data(WP_REST_Request $request) {
        return $this->user_service()->post_user_market_data($request);
    }

    public function get_user_trades() {
        return $this->user_service()->get_user_trades();
    }

    public function get_account_telemetry() {
        return $this->user_service()->get_account_telemetry();
    }

    public function get_positions() {
        return $this->user_service()->get_positions();
    }

    public function get_orders() {
        return $this->user_service()->get_orders();
    }

    // Audit-only stub — does not process payload; trade state is sourced from MT4/MT5 bridge.
    public function post_user_trades(WP_REST_Request $request) {
        return $this->user_service()->post_user_trades($request);
    }

    public function get_user_account() {
        return $this->user_service()->get_user_account();
    }

    public function get_user_progress() {
        return $this->user_service()->get_user_progress();
    }

    public function post_user_account(WP_REST_Request $request) {
        return $this->user_service()->post_user_account($request);
    }

    public function get_user_trade_queue() {
        return $this->user_service()->get_user_trade_queue();
    }

    public function post_user_trade_queue(WP_REST_Request $request) {
        return $this->user_service()->post_user_trade_queue($request);
    }

    public function post_execute_signals(WP_REST_Request $request) {
        return $this->engine_service()->post_execute_signals($request);
    }

    public function post_engine_batch(WP_REST_Request $request) {
        return $this->engine_service()->post_engine_batch($request);
    }

    private function run_engine_for_symbols($user_id, $symbols, $prices, $force = false) {
        global $wpdb;
        $symbols_sorted = $symbols;
        sort($symbols_sorted);

        $price_fingerprint = array();
        foreach ($symbols_sorted as $symbol) {
            $price = $this->find_price($prices, $symbol);
            $price_fingerprint[$symbol] = array(
                'mid' => isset($price['mid']) ? (float) $price['mid'] : null,
                'updatedAt' => isset($price['updatedAt']) ? $price['updatedAt'] : null,
                'state' => isset($price['state']) ? $price['state'] : null,
            );
        }

        $transient_key = 'smc_engine_run_' . $user_id . '_' . md5(wp_json_encode(array(
            'symbols' => $symbols_sorted,
            'prices' => $price_fingerprint,
        )));
        // HARDENING: Skip transient cache when a forced refresh is requested so that
        // post_engine_batch() always produces a freshly computed engine result, not the
        // 5-second-old cached snapshot that was present before quote/candle transients
        // were cleared.
        $cached = get_transient($transient_key);
        if (!$force && is_array($cached)) {
            return $cached;
        }

        $regimes = array();
        $gates = array();
        $signals = array();
        $plans = array();
        $diagnostics = array();
        $engine_stale_threshold_sec = (int) $this->get_settings($user_id)['staleThresholdSec'];

        foreach ($symbols as $symbol) {
            $price = $this->find_price($prices, $symbol);

            $price_source = is_array($price) ? ($price['source'] ?? 'unknown') : 'unknown';
            $price_state = is_array($price) ? ($price['state'] ?? 'offline') : 'offline';
            $price_age = is_array($price) && isset($price['age_sec'])
                ? (int) $price['age_sec']
                : (is_array($price) && isset($price['updatedAt']) ? $this->iso_age_sec($price['updatedAt']) : PHP_INT_MAX);

            if ($price_source !== 'mt5' || $price_state !== 'live' || $price_age > $engine_stale_threshold_sec) {
                error_log(sprintf(
                    '[engine_guard] skipped %s | source=%s state=%s age=%ds',
                    $symbol,
                    (string) $price_source,
                    (string) $price_state,
                    (int) $price_age
                ));
                $regimes[] = array(
                    'symbol' => $symbol,
                    'bias' => 'RANGING',
                    'chop' => 1,
                    'nearestFib' => null,
                    'updatedAt' => gmdate('c'),
                    'state' => 'stale',
                );
                $gates[] = array(
                    'symbol' => $symbol,
                    'allow' => 'BLOCKED',
                    'reason' => 'price_not_mt5_fresh',
                    'state' => 'stale',
                );
                $diagnostics[] = array(
                    'symbol' => $symbol,
                    'priceState' => $price_state,  // Trust backend's live/stale state; don't override to stale
                    'candleState' => 'not_checked',
                    'lastPriceAt' => is_array($price) ? ($price['updatedAt'] ?? null) : null,
                    'lastCandleAt' => null,
                    'candleCount' => 0,
                    'engineBlocker' => 'PRICE_NOT_MT5_FRESH',
                );
                continue;
            }

            $state = $this->build_symbol_state($user_id, $symbol, $price);
            $regimes[] = $state['regime'];
            $gates[] = $state['gate'];
            if (!empty($state['diagnostic'])) {
                $diagnostics[] = $state['diagnostic'];
            }

            if ($state['signal']) {
                $signals[] = $state['signal'];
            }

            if ($state['plan']) {
                $plans[] = $state['plan'];
            }
        }

        $wpdb->insert(
            $this->table('engine_runs'),
            array(
                'user_id' => $user_id,
                'status' => 'complete',
                'summary' => wp_json_encode(array('symbols' => $symbols, 'signals' => count($signals))),
                'created_at' => $this->now_mysql(),
            ),
            array('%d', '%s', '%s', '%s')
        );

        $this->reconcile_live_signal_board((int) $user_id, $symbols, $signals, $diagnostics);
        $display_signals = $this->read_live_signal_board((int) $user_id, $symbols, $this->resolve_signal_board_size((int) $user_id));

        // CRITICAL: Rekey plan signalIds to match the display-board signal ids.
        // build_trade_plan() sets signalId = raw engine signal['id'] (sig-HASH).
        // When a signal is an UPDATE of an existing display_signals row, the display
        // board returns the ORIGINAL sig-HASH (set at first insert), not the freshly
        // computed one from the current engine run.
        // The frontend matches: laddersBySignalId.get(signal.id) where signal.id is
        // the display-board id. If the display row was promoted in a prior cycle its
        // id is sig-OLD while the new plan has signalId = sig-NEW => no match => NO BLUEPRINT.
        // Fix: after reconciliation, rekey each plan's signalId to the display-board
        // signal id for the same symbol+direction so the frontend join always resolves.
        $display_id_by_symbol_dir = array();
        foreach ($display_signals as $ds) {
            $ds_key = strtoupper((string) ($ds['symbol'] ?? '')) . '|' . strtoupper((string) ($ds['direction'] ?? ''));
            if ($ds_key !== '|' && !empty($ds['id'])) {
                $display_id_by_symbol_dir[$ds_key] = (string) $ds['id'];
            }
        }
        $rekeyed_plan_ids = array();
        foreach ($plans as &$plan) {
            $plan_key = strtoupper((string) ($plan['symbol'] ?? '')) . '|' . strtoupper((string) ($plan['direction'] ?? ''));
            if (isset($display_id_by_symbol_dir[$plan_key]) && $display_id_by_symbol_dir[$plan_key] !== '') {
                $plan['signalId'] = $display_id_by_symbol_dir[$plan_key];
                $rekeyed_plan_ids[$display_id_by_symbol_dir[$plan_key]] = true;
            }
        }
        unset($plan);

        // Persist only after display-board reconciliation so the database row uses the
        // same signal id that the UI submits to post_execute_signals(). If an updated
        // display-board row kept sig-OLD while the current engine signal is sig-NEW,
        // this replace refreshes the executable plan under sig-OLD instead of leaving
        // execution to miss the row or consume a stale sig-OLD blueprint.
        foreach ($plans as $plan) {
            if (($plan['source'] ?? null) !== 'backend-blueprint') {
                continue;
            }

            $plan_signal_id = (string) ($plan['signalId'] ?? '');
            if ($plan_signal_id === '') {
                continue;
            }

            $wpdb->replace(
                $this->table('trade_plans'),
                array(
                    'signal_id' => $plan_signal_id,
                    'user_id' => $user_id,
                    'plan' => wp_json_encode($plan),
                    'updated_at' => $this->now_mysql(),
                ),
                array('%s', '%d', '%s', '%s')
            );
        }

        // Diagnostic: READY + backendConfirmed must always have a blueprint after rekey.
        // If the rekey still left a READY confirmed signal without a plan it means
        // build_pending_or_confirmed_plan() returned null for a signal that should have
        // produced a backend-blueprint. Log once per signal (throttled) — do not mask
        // NO BLUEPRINT in the frontend.
        foreach ($display_signals as $ds) {
            $ds_status    = strtoupper((string) ($ds['status'] ?? ''));
            $ds_confirmed = (bool) ($ds['backendConfirmed'] ?? false);
            $ds_id        = (string) ($ds['id'] ?? '');

            if ($ds_status === 'READY' && $ds_confirmed && $ds_id !== '' && !isset($rekeyed_plan_ids[$ds_id])) {
                $log_key = 'smc_sf_ready_missing_blueprint_' . (int) $user_id . '_' . md5($ds_id);
                if (!get_transient($log_key)) {
                    error_log(sprintf(
                        '[SMC_SF_SIGNAL_BOARD] ready_missing_blueprint user_id=%d symbol=%s direction=%s signalId=%s engineBlocker=%s entryPrice=%s',
                        (int) $user_id,
                        (string) ($ds['symbol'] ?? ''),
                        (string) ($ds['direction'] ?? ''),
                        $ds_id,
                        (string) ($ds['engineBlocker'] ?? ''),
                        isset($ds['entryPrice']) && is_numeric($ds['entryPrice']) ? (string) ($ds['entryPrice']) : 'missing'
                    ));
                    set_transient($log_key, 1, 300);
                }
            }
        }

        $result = array(
            'regimes' => $regimes,
            'gates' => $gates,
            'signals' => $display_signals,
            // Keep raw engine candidates separate from the display-board projection
            // so cached snapshots cannot be mistaken for fresh promotion input.
            'candidateSignals' => $signals,
            'plans' => $plans,
            'diagnostics' => $diagnostics,
        );
        set_transient($transient_key, $result, 5);

        return $result;
    }

    public function reconcile_live_signal_board(int $user_id, array $symbols, array $signals, array $diagnostics): void {
        global $wpdb;

        $watchlist_lookup = $this->normalize_symbol_lookup($symbols);
        $now = $this->now_mysql();
        $blocked_symbols = $this->extract_blocked_symbols($diagnostics, $watchlist_lookup);

        $active_rows = $this->read_display_signal_rows($user_id, array_keys($watchlist_lookup), true);
        foreach ($active_rows as $row) {
            $row_symbol = preg_replace('/[^A-Z0-9]/', '', strtoupper((string) ($row['symbol'] ?? '')));
            if ($row_symbol === '' || !isset($watchlist_lookup[$row_symbol])) {
                $this->transition_display_signal($user_id, $row, 'INVALIDATED', 'watchlist_removed', null, $now);
                continue;
            }

            $candidate = $this->display_row_to_lifecycle_candidate($row);
            $lifecycle = $this->get_mt5_candidate_lifecycle_state(
                $user_id,
                $row_symbol,
                strtoupper((string) ($row['direction'] ?? 'LONG')),
                $candidate
            );
            $state = (string) ($lifecycle['state'] ?? 'LIFECYCLE_UNRESOLVED');
            if ($state === 'INACTIVE_STOPPED_OUT') {
                $this->transition_display_signal($user_id, $row, 'STOP_HIT', (string) ($lifecycle['reason'] ?? 'stop_loss_crossed'), null, $now);
                continue;
            }
            if (in_array($state, array('ACTIVE_OPEN_POSITION', 'ACTIVE_PENDING_ORDER'), true)) {
                $this->transition_display_signal($user_id, $row, 'FILLED_CONFIRMED', (string) ($lifecycle['reason'] ?? 'matching_trade'), null, $now);
                continue;
            }
            if ($state === 'INACTIVE_ENTRY_PASSED') {
                $this->transition_display_signal($user_id, $row, 'ENTRY_HIT', (string) ($lifecycle['reason'] ?? 'entry_crossed_without_matching_trade'), null, $now);
                continue;
            }
            if (isset($blocked_symbols[$row_symbol])) {
                // Blueprint grace window: hold the signal as STALE_HELD with execution disabled
                // for up to 300 s after the last confirmed blueprint, absorbing brief feed gaps.
                $blueprint_grace_sec = 300; // 5 minutes
                $last_blueprint_at   = $row['last_blueprint_at'] ?? null;
                $within_grace        = !empty($last_blueprint_at)
                    && (strtotime($now) - strtotime((string) $last_blueprint_at)) <= $blueprint_grace_sec;

                if ($within_grace && strtoupper((string) ($row['lifecycle_state'] ?? '')) !== 'STALE_HELD') {
                    $held_engine = json_decode((string) ($row['engine'] ?? '{}'), true);
                    if (!is_array($held_engine)) {
                        $held_engine = array();
                    }
                    $held_engine['graceHold']       = true;
                    $held_engine['graceHoldReason'] = (string) ($blocked_symbols[$row_symbol]['engineBlocker'] ?? 'stale_data');
                    $wpdb->update(
                        $this->table('display_signals'),
                        array(
                            'lifecycle_state'  => 'STALE_HELD',
                            'last_evaluated_at' => $now,
                            'engine'           => wp_json_encode($held_engine),
                        ),
                        array('id' => (string) ($row['id'] ?? ''), 'user_id' => $user_id)
                    );
                    $this->audit($user_id, 'display_signal.grace_hold_entered', array(
                        'id'               => (string) ($row['id'] ?? ''),
                        'symbol'           => $row_symbol,
                        'reason'           => $held_engine['graceHoldReason'],
                        'last_blueprint_at' => $last_blueprint_at,
                        'grace_window_sec' => $blueprint_grace_sec,
                    ));
                    continue;
                }

                // No confirmed blueprint within grace window — standard STALE_HELD transition.
                $this->transition_display_signal($user_id, $row, 'STALE_HELD', (string) ($blocked_symbols[$row_symbol]['engineBlocker'] ?? 'stale_data'), null, $now);
                continue;
            }
            if (strtoupper((string) ($row['lifecycle_state'] ?? '')) === 'STALE_HELD') {
                // On recovery: strip graceHold flag from engine JSON before re-activating.
                $restored_engine = json_decode((string) ($row['engine'] ?? '{}'), true);
                if (is_array($restored_engine) && !empty($restored_engine['graceHold'])) {
                    unset($restored_engine['graceHold'], $restored_engine['graceHoldReason']);
                    $wpdb->update(
                        $this->table('display_signals'),
                        array('engine' => wp_json_encode($restored_engine)),
                        array('id' => (string) ($row['id'] ?? ''), 'user_id' => $user_id)
                    );
                }
                $this->transition_display_signal($user_id, $row, 'DISPLAY_ACTIVE', 'fresh_data_restored', null, $now);
                continue;
            }
            if (!empty($row['expires_at']) && strcmp((string) $row['expires_at'], $now) < 0) {
                $this->transition_display_signal($user_id, $row, 'EXPIRED', 'ttl_exceeded', null, $now);
            }
        }

        $active_rows = $this->read_display_signal_rows($user_id, array_keys($watchlist_lookup), true);
        $promotion_family_rows = $this->read_display_signal_rows($user_id, array_keys($watchlist_lookup), true, true);
        foreach ($signals as $signal) {
            if (!is_array($signal) || !$this->is_display_signal_eligible($signal, $watchlist_lookup)) {
                continue;
            }
            $symbol = preg_replace('/[^A-Z0-9]/', '', strtoupper((string) ($signal['symbol'] ?? '')));
            if ($symbol === '' || isset($blocked_symbols[$symbol])) {
                continue;
            }

            $candidate = $this->hydrate_display_signal_candidate($user_id, $signal);
            if ($candidate === null) {
                error_log(sprintf(
                    '[SMC_SF_SIGNAL_BOARD] hydrate_drop user_id=%d symbol=%s direction=%s status=%s entryPrice=%s engineBlocker=%s',
                    (int) $user_id,
                    (string) ($signal['symbol'] ?? ''),
                    (string) ($signal['direction'] ?? ''),
                    (string) ($signal['status'] ?? ''),
                    isset($signal['entryPrice']) ? (string) $signal['entryPrice'] : 'missing',
                    (string) ($signal['engineBlocker'] ?? '')
                ));
                continue;
            }

            $status = strtoupper((string) ($candidate['status'] ?? ''));
            // INVARIANT: READY on the display board means backend-confirmed and executable.
            // If the engine computed READY but backendConfirmed=false (e.g. brief PRICE_STALE
            // or stale candles at snapshot time), demote to ARMED for board storage so the
            // frontend never sees READY + unconfirmed blueprint.
            if ($status === 'READY' && !(bool) ($signal['backendConfirmed'] ?? false)) {
                $status = 'ARMED';
                $candidate['status'] = 'ARMED';
            }
            $quality_score = $this->compute_display_signal_quality_score($candidate, $signal);
            if ($status === 'READY' && $quality_score < 300) {
                continue;
            }
            if ($status === 'ARMED' && !$this->armed_signal_confirmed($user_id, $candidate, $signal, $now)) {
                continue;
            }

            $family_key = $this->compute_signal_family_key($user_id, $candidate, $signal);
            $existing_same_family = $this->find_display_row_by_family($promotion_family_rows, $family_key);
            if ($existing_same_family !== null) {
                if ($this->is_terminal_display_lifecycle_state((string) ($existing_same_family['lifecycle_state'] ?? ''))) {
                    continue;
                }
                $existing_score = (float) ($existing_same_family['quality_score'] ?? 0);
                if ($quality_score >= $existing_score || ($quality_score - $existing_score) >= 50) {
                    $this->upsert_display_signal_row($user_id, $signal, $candidate, $family_key, $quality_score, $existing_same_family, $now);
                    $active_rows = $this->read_display_signal_rows($user_id, array_keys($watchlist_lookup), true);
                    $promotion_family_rows = $this->read_display_signal_rows($user_id, array_keys($watchlist_lookup), true, true);
                }
                continue;
            }

            $same_direction_row = $this->find_display_row_by_symbol_direction($active_rows, $symbol, strtoupper((string) ($candidate['direction'] ?? '')), true);
            if ($same_direction_row !== null && $quality_score < ((float) ($same_direction_row['quality_score'] ?? 0) + 50)) {
                continue;
            }

            $opposite_row = $this->find_display_row_by_symbol_direction($active_rows, $symbol, strtoupper((string) ($candidate['direction'] ?? '')), false);
            if ($opposite_row !== null) {
                $opposite_lifecycle = strtoupper((string) ($opposite_row['lifecycle_state'] ?? ''));
                $opposite_is_stale = $opposite_lifecycle === 'STALE_HELD';
                // READY signals can displace a weaker opposite row (quality + 150 threshold).
                // WATCH/ARMED signals cannot displace an active opposite row — but if the
                // opposite row is STALE_HELD it is no longer actively executable, so allow
                // the new direction signal to be promoted alongside it.
                if ($status === 'READY' && $quality_score < ((float) ($opposite_row['quality_score'] ?? 0) + 150)) {
                    continue;
                }
                if ($status !== 'READY' && !$opposite_is_stale) {
                    continue;
                }
            }

            $inserted_id = $this->upsert_display_signal_row($user_id, $signal, $candidate, $family_key, $quality_score, null, $now);
            if ($same_direction_row !== null) {
                $this->transition_display_signal($user_id, $same_direction_row, 'REPLACED', 'better_same_direction_signal', $inserted_id, $now);
            }
            if ($opposite_row !== null) {
                $this->transition_display_signal($user_id, $opposite_row, 'REPLACED', 'stronger_opposing_signal', $inserted_id, $now);
            }
            $active_rows = $this->read_display_signal_rows($user_id, array_keys($watchlist_lookup), true);
            $promotion_family_rows = $this->read_display_signal_rows($user_id, array_keys($watchlist_lookup), true, true);
        }
    }

    private function normalize_symbol_lookup(array $symbols): array {
        $lookup = array();
        foreach ($symbols as $symbol) {
            $normalized = preg_replace('/[^A-Z0-9]/', '', strtoupper((string) $symbol));
            if ($normalized !== '') {
                $lookup[$normalized] = true;
            }
        }
        return $lookup;
    }

    private function extract_blocked_symbols(array $diagnostics, array $watchlist_lookup): array {
        $blocked = array();
        foreach ($diagnostics as $diagnostic) {
            if (!is_array($diagnostic) || empty($diagnostic['symbol'])) {
                continue;
            }
            $symbol = preg_replace('/[^A-Z0-9]/', '', strtoupper((string) $diagnostic['symbol']));
            if ($symbol === '' || !isset($watchlist_lookup[$symbol])) {
                continue;
            }
            $engine_blocker = strtoupper((string) ($diagnostic['engineBlocker'] ?? 'OK'));
            $price_state = strtolower((string) ($diagnostic['priceState'] ?? 'live'));
            $candle_state = strtolower((string) ($diagnostic['candleState'] ?? 'live'));
            if ($engine_blocker !== 'OK' || $price_state !== 'live' || in_array($candle_state, array('stale', 'offline', 'missing', 'closed_session'), true)) {
                $blocked[$symbol] = array(
                    'engineBlocker' => $engine_blocker !== '' ? $engine_blocker : 'UNKNOWN',
                    'priceState' => $price_state !== '' ? $price_state : 'unknown',
                    'candleState' => $candle_state !== '' ? $candle_state : 'unknown',
                );
            }
        }
        return $blocked;
    }

    private function hydrate_display_signal_candidate(int $user_id, array $signal): ?array {
        global $wpdb;
        $symbol = preg_replace('/[^A-Z0-9]/', '', strtoupper((string) ($signal['symbol'] ?? '')));
        $direction = strtoupper((string) ($signal['direction'] ?? ''));
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$this->table('mt5_signal_candidates')} WHERE user_id = %d",
            $user_id
        ), ARRAY_A);
        $latest = null;
        foreach ((array) $rows as $row) {
            if (($row['symbol'] ?? '') !== $symbol || strtoupper((string) ($row['direction'] ?? '')) !== $direction) {
                continue;
            }
            if ($latest === null || strcmp((string) ($row['created_at'] ?? ''), (string) ($latest['created_at'] ?? '')) > 0) {
                $latest = $row;
            }
        }
        if (!is_array($latest)) {
            $entry = isset($signal['entryPrice']) && is_numeric($signal['entryPrice']) ? (float) $signal['entryPrice'] : 0.0;
            if ($entry <= 0) {
                return null;
            }
            return array(
                'id' => (string) ($signal['id'] ?? ''),
                'symbol' => $symbol,
                'direction' => $direction,
                'status' => strtoupper((string) ($signal['status'] ?? '')),
                'verdict' => strtoupper((string) ($signal['verdict'] ?? 'C')),
                'entry_price' => $entry,
                'sl_price' => isset($signal['slPrice']) && is_numeric($signal['slPrice']) ? (float) $signal['slPrice'] : null,
                'tp_price' => isset($signal['tpPrice']) && is_numeric($signal['tpPrice']) ? (float) $signal['tpPrice'] : null,
                'fib_family' => (string) (($signal['engine']['firstReactionFamily'] ?? null) ?: 'backend'),
                'fib_ratio' => null,
                'confidence' => 0.0,
                'pine_match' => null,
                'htf_bias' => (string) ($signal['engine']['htfBias'] ?? ''),
                'created_at' => $this->normalize_market_timestamp($signal['createdAt'] ?? null, $this->now_mysql()),
            );
        }
        $latest['status'] = strtoupper((string) ($signal['status'] ?? ($latest['status'] ?? '')));
        $latest['verdict'] = strtoupper((string) ($signal['verdict'] ?? ($latest['verdict'] ?? 'C')));
        return $latest;
    }

    private function armed_signal_confirmed(int $user_id, array $candidate, array $signal, string $now): bool {
        // Match the anchor used by compute_signal_family_key() so each display
        // family, including same-day engine anchorSessionId variants, gets an
        // independent confirmation counter before the family key is computed.
        $engine = is_array($signal['engine'] ?? null) ? $signal['engine'] : array();
        $fallback_anchor = date('Ymd', strtotime((string) ($candidate['created_at'] ?? $now)));
        $anchor = (string) ($engine['anchorSessionId'] ?? ($engine['anchorSession'] ?? $fallback_anchor));
        $family_parts = array(
            $user_id,
            preg_replace('/[^A-Z0-9]/', '', strtoupper((string) ($candidate['symbol'] ?? ''))),
            strtoupper((string) ($candidate['direction'] ?? '')),
            (string) ($candidate['fib_family'] ?? 'backend'),
            is_numeric($candidate['fib_ratio'] ?? null) ? number_format((float) $candidate['fib_ratio'], 4, '.', '') : 'na',
            $anchor,
        );
        $key = 'smc_sf_armed_confirm_' . $user_id . '_' . md5(implode('|', $family_parts));
        $state = get_transient($key);
        $count = is_array($state) ? (int) ($state['count'] ?? 0) : 0;
        $count++;
        set_transient($key, array('count' => $count, 'lastSeenAt' => $now), 300);
        return $count >= 2;
    }

    private function compute_signal_family_key(int $user_id, array $candidate, array $signal): string {
        $engine = is_array($signal['engine'] ?? null) ? $signal['engine'] : array();
        $anchor = (string) ($engine['anchorSessionId'] ?? ($engine['anchorSession'] ?? date('Ymd', strtotime((string) ($candidate['created_at'] ?? $this->now_mysql())))));
        $parts = array(
            $user_id,
            preg_replace('/[^A-Z0-9]/', '', strtoupper((string) ($candidate['symbol'] ?? ''))),
            strtoupper((string) ($candidate['direction'] ?? '')),
            (string) (($candidate['fib_family'] ?? '') ?: ($engine['firstReactionFamily'] ?? 'backend')),
            is_numeric($candidate['fib_ratio'] ?? null) ? number_format((float) $candidate['fib_ratio'], 4, '.', '') : 'na',
            $anchor,
        );
        return substr(hash('sha256', implode('|', $parts)), 0, 64);
    }

    private function compute_display_signal_quality_score(array $candidate, array $signal): float {
        $verdict_scores = array('A+' => 400, 'A' => 300, 'B' => 200, 'C' => 100);
        $status_scores = array('READY' => 120, 'ARMED' => 70, 'WATCH' => 20);
        $engine = is_array($signal['engine'] ?? null) ? $signal['engine'] : array();
        $score = (float) ($verdict_scores[strtoupper((string) ($candidate['verdict'] ?? 'C'))] ?? 100);
        $score += (float) ($status_scores[strtoupper((string) ($candidate['status'] ?? 'WATCH'))] ?? 0);
        $score += max(0.0, min(1.0, (float) ($candidate['confidence'] ?? 0.0))) * 100.0;
        foreach (array('sweep', 'mss') as $key) {
            if (strtoupper((string) ($engine[$key] ?? '')) === 'PRESENT') {
                $score += 25.0;
            }
        }
        if (in_array(strtoupper((string) ($engine['displacement'] ?? '')), array('CLEAN', 'STRONG'), true)) {
            $score += 25.0;
        }
        $direction = strtoupper((string) ($candidate['direction'] ?? ''));
        $htf_bias = strtoupper((string) ($engine['htfBias'] ?? ($candidate['htf_bias'] ?? '')));
        if (($direction === 'LONG' && $htf_bias === 'BULL') || ($direction === 'SHORT' && $htf_bias === 'BEAR')) {
            $score += 80.0;
        }
        $pd_state = strtoupper((string) ($engine['pdState'] ?? ''));
        if (($direction === 'LONG' && $pd_state === 'DISCOUNT') || ($direction === 'SHORT' && $pd_state === 'PREMIUM')) {
            $score += 60.0;
        }
        switch (strtoupper((string) ($candidate['pine_match'] ?? ''))) {
            case 'EXACT': $score += 100.0; break;
            case 'DRIFT': $score += 30.0; break;
            case 'MISMATCH': $score -= 150.0; break;
        }
        if (strtoupper((string) ($signal['engineBlocker'] ?? ($engine['engineBlocker'] ?? 'OK'))) !== 'OK') {
            $score -= 300.0;
        }
        $chop = isset($engine['candleChop']) && is_numeric($engine['candleChop']) ? (float) $engine['candleChop'] : null;
        if ($chop !== null && $chop >= 0.7) {
            $score -= 150.0;
        } elseif ($chop !== null && $chop >= 0.55) {
            $score -= 50.0;
        }
        return round($score, 4);
    }

    private function read_display_signal_rows(int $user_id, array $symbols, bool $include_terminal = false, bool $include_closed_terminal = false): array {
        global $wpdb;
        self::ensure_display_signals_table();
        $lookup = $this->normalize_symbol_lookup($symbols);
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$this->table('display_signals')} WHERE user_id = %d",
            $user_id
        ), ARRAY_A);
        $allowed_states = $include_terminal
            ? array('DISPLAY_ACTIVE', 'STALE_HELD', 'ENTRY_HIT', 'FILLED_CONFIRMED')
            : array('DISPLAY_ACTIVE', 'STALE_HELD');
        if ($include_closed_terminal) {
            $allowed_states = array_merge($allowed_states, array('STOP_HIT', 'REPLACED', 'EXPIRED', 'INVALIDATED'));
        }
        $out = array();
        foreach ((array) $rows as $row) {
            $symbol = preg_replace('/[^A-Z0-9]/', '', strtoupper((string) ($row['symbol'] ?? '')));
            if (!empty($lookup) && !isset($lookup[$symbol])) {
                continue;
            }
            if (!in_array(strtoupper((string) ($row['lifecycle_state'] ?? '')), $allowed_states, true)) {
                continue;
            }
            $out[] = $row;
        }
        return $out;
    }

    private function find_display_row_by_family(array $rows, string $family_key): ?array {
        foreach ($rows as $row) {
            if ((string) ($row['signal_family_key'] ?? '') === $family_key) {
                return $row;
            }
        }
        return null;
    }

    private function find_display_row_by_symbol_direction(array $rows, string $symbol, string $direction, bool $same): ?array {
        foreach ($rows as $row) {
            if (strtoupper((string) ($row['symbol'] ?? '')) !== $symbol) {
                continue;
            }
            $row_direction = strtoupper((string) ($row['direction'] ?? ''));
            if (($same && $row_direction === $direction) || (!$same && $row_direction !== $direction)) {
                return $row;
            }
        }
        return null;
    }

    private function is_terminal_display_lifecycle_state(string $state): bool {
        return in_array(strtoupper($state), array('ENTRY_HIT', 'FILLED_CONFIRMED', 'STOP_HIT', 'REPLACED', 'EXPIRED', 'INVALIDATED'), true);
    }

    private function upsert_display_signal_row(int $user_id, array $signal, array $candidate, string $family_key, float $quality_score, ?array $existing, string $now): string {
        global $wpdb;
        self::ensure_display_signals_table();
        if ($existing !== null && $this->is_terminal_display_lifecycle_state((string) ($existing['lifecycle_state'] ?? ''))) {
            return (string) ($existing['id'] ?? '');
        }
        $source_signal_id = trim((string) ($signal['id'] ?? ''));
        $source_candidate_id = trim((string) ($candidate['id'] ?? ''));
        if ($source_signal_id === '') {
            $source_signal_id = $source_candidate_id;
        }
        $id = $existing !== null ? (string) $existing['id'] : $source_signal_id;
        if ($id === '') {
            $id = 'disp-' . substr(hash('sha256', $family_key), 0, 18);
        }
        $engine = is_array($signal['engine'] ?? null) ? $signal['engine'] : array();
        if (!isset($engine['engineBlocker'])) {
            $engine['engineBlocker'] = (string) ($signal['engineBlocker'] ?? 'OK');
        }
        $row = array(
            'id' => $id,
            'user_id' => $user_id,
            'symbol' => preg_replace('/[^A-Z0-9]/', '', strtoupper((string) ($candidate['symbol'] ?? ''))),
            'direction' => strtoupper((string) ($candidate['direction'] ?? '')),
            'lifecycle_state' => 'DISPLAY_ACTIVE',
            'status' => strtoupper((string) ($candidate['status'] ?? '')),
            'verdict' => strtoupper((string) ($candidate['verdict'] ?? 'C')),
            'quality_score' => $quality_score,
            'signal_family_key' => $family_key,
            'entry_price' => (float) ($candidate['entry_price'] ?? 0),
            'sl_price' => isset($candidate['sl_price']) && is_numeric($candidate['sl_price']) ? (float) $candidate['sl_price'] : null,
            'tp_price' => isset($candidate['tp_price']) && is_numeric($candidate['tp_price']) ? (float) $candidate['tp_price'] : null,
            'source_candidate_id' => (string) ($candidate['id'] ?? ($signal['id'] ?? '')),
            'source' => 'backend',
            'entry_hit_at' => $existing['entry_hit_at'] ?? null,
            'stop_hit_at' => $existing['stop_hit_at'] ?? null,
            'replaced_by' => null,
            'invalidated_at' => null,
            'invalidation_reason' => null,
            'first_seen_at' => $existing['first_seen_at'] ?? $now,
            'last_confirmed_at' => $now,
            'backend_confirmed' => (int) (strtoupper((string) ($candidate['status'] ?? '')) === 'READY'
                && (bool) ($signal['backendConfirmed'] ?? false)),
            'last_blueprint_at' => (bool) ($signal['backendConfirmed'] ?? false)
                ? $now
                : ($existing['last_blueprint_at'] ?? null),
            'last_evaluated_at' => $now,
            'expires_at' => gmdate('Y-m-d H:i:s', strtotime($now . ' +4 hours')),
            'confluence' => wp_json_encode(is_array($signal['confluence'] ?? null) ? $signal['confluence'] : array()),
            'engine' => wp_json_encode($engine),
        );
        $wpdb->replace($this->table('display_signals'), $row);
        $this->audit($user_id, $existing === null ? 'display_signal.promoted' : 'display_signal.upgraded', array(
            'id' => $id,
            'symbol' => $row['symbol'],
            'direction' => $row['direction'],
            'quality_score' => $quality_score,
            'signal_family_key' => $family_key,
        ));
        return $id;
    }

    private function transition_display_signal(int $user_id, array $row, string $state, string $reason, ?string $replaced_by, string $now): void {
        global $wpdb;
        self::ensure_display_signals_table();
        $data = array(
            'lifecycle_state' => $state,
            'last_evaluated_at' => $now,
        );
        if ($state === 'ENTRY_HIT' && empty($row['entry_hit_at'])) {
            $data['entry_hit_at'] = $now;
        }
        if ($state === 'STOP_HIT') {
            $data['stop_hit_at'] = $now;
        }
        if (in_array($state, array('STOP_HIT', 'REPLACED', 'EXPIRED', 'INVALIDATED'), true)) {
            $data['invalidated_at'] = $now;
            $data['invalidation_reason'] = $reason;
        }
        if ($replaced_by !== null) {
            $data['replaced_by'] = $replaced_by;
        }
        $wpdb->update($this->table('display_signals'), $data, array('id' => (string) ($row['id'] ?? ''), 'user_id' => $user_id));
        $this->audit($user_id, 'display_signal.lifecycle_transition', array(
            'id' => (string) ($row['id'] ?? ''),
            'symbol' => (string) ($row['symbol'] ?? ''),
            'state' => $state,
            'reason' => $reason,
            'replaced_by' => $replaced_by,
        ));
    }

    private function display_row_to_lifecycle_candidate(array $row): array {
        return array(
            'id' => (string) ($row['source_candidate_id'] ?? $row['id'] ?? ''),
            'symbol' => (string) ($row['symbol'] ?? ''),
            'direction' => strtoupper((string) ($row['direction'] ?? '')),
            'entry_price' => (float) ($row['entry_price'] ?? 0),
            'sl_price' => isset($row['sl_price']) && is_numeric($row['sl_price']) ? (float) $row['sl_price'] : null,
            'tp_price' => isset($row['tp_price']) && is_numeric($row['tp_price']) ? (float) $row['tp_price'] : null,
        );
    }

    private function is_display_signal_eligible(array $signal, array $watchlist_lookup): bool {
        $symbol = preg_replace('/[^A-Z0-9]/', '', strtoupper((string) ($signal['symbol'] ?? '')));
        if ($symbol === '' || !isset($watchlist_lookup[$symbol])) {
            return false;
        }

        $status = strtoupper((string) ($signal['status'] ?? ''));
        if (!in_array($status, array('ARMED', 'READY', 'WATCH'), true)) {
            return false;
        }

        if (($signal['computedBy'] ?? null) !== 'backend') {
            return false;
        }

        // Engine blocker controls execution eligibility, not board visibility.
        // A signal with a blocker (e.g. PRICE_NOT_MT5_FRESH, AOV_EQUILIBRIUM_ZONE) should
        // still be promoted to the display board so Signal Engine and Plan pages show the
        // symbol with its correct blocked/watching state. canExecuteSignal is enforced by
        // the frontend using backendConfirmed and the execution endpoint independently.
        return true;
    }

    public function read_live_signal_board(int $user_id, array $symbols, ?int $board_size = null): array {
        $rows = $this->read_display_signal_rows($user_id, $symbols, false);
        usort($rows, function ($a, $b) {
            $score_cmp = ((float) ($b['quality_score'] ?? 0)) <=> ((float) ($a['quality_score'] ?? 0));
            if ($score_cmp !== 0) {
                return $score_cmp;
            }
            $updated_cmp = strcmp((string) ($b['last_confirmed_at'] ?? ''), (string) ($a['last_confirmed_at'] ?? ''));
            if ($updated_cmp !== 0) {
                return $updated_cmp;
            }
            return strcmp((string) ($a['id'] ?? ''), (string) ($b['id'] ?? ''));
        });
        if ($board_size !== null) {
            $rows = array_slice($rows, 0, max(1, min(10, $board_size)));
        }
        return array_values(array_map(function ($row) {
            return $this->signal_row_to_candidate($row);
        }, $rows));
    }

    public function count_live_signal_board(int $user_id, array $symbols): int {
        return count($this->read_display_signal_rows($user_id, $symbols, false));
    }

    private function signal_row_to_candidate(array $row): array {
        $confluence = json_decode((string) ($row['confluence'] ?? ''), true);
        if (!is_array($confluence)) {
            $confluence = array();
        }
        $engine = json_decode((string) ($row['engine'] ?? ''), true);
        if (!is_array($engine)) {
            $engine = array();
        }
        $engine_blocker = strtoupper((string) ($engine['engineBlocker'] ?? 'OK'));
        $lifecycle_state = strtoupper((string) ($row['lifecycle_state'] ?? 'DISPLAY_ACTIVE'));

        return array(
            'id' => (string) ($row['id'] ?? ''),
            'symbol' => (string) ($row['symbol'] ?? ''),
            'direction' => strtoupper((string) ($row['direction'] ?? 'LONG')),
            'status' => strtoupper((string) ($row['status'] ?? 'ARMED')),
            'confluence' => array_values($confluence),
            'verdict' => strtoupper((string) ($row['verdict'] ?? 'C')),
            'computedBy' => 'backend',
            'backendConfirmed' => (bool) ((int) ($row['backend_confirmed'] ?? 0)),
            'engineBlocker' => $engine_blocker,
            'createdAt' => $this->to_iso((string) ($row['first_seen_at'] ?? '')),
            'qualityScore' => (float) ($row['quality_score'] ?? 0),
            'lifecycleState' => $lifecycle_state,
            'signalFamilyKey' => (string) ($row['signal_family_key'] ?? ''),
            'entryPrice' => (float) ($row['entry_price'] ?? 0),
            'slPrice' => isset($row['sl_price']) && is_numeric($row['sl_price']) ? (float) $row['sl_price'] : null,
            'tpPrice' => isset($row['tp_price']) && is_numeric($row['tp_price']) ? (float) $row['tp_price'] : null,
            'validity' => array(
                'state' => $lifecycle_state,
                'entryHitAt' => !empty($row['entry_hit_at']) ? $this->to_iso((string) $row['entry_hit_at']) : null,
                'stopHitAt' => !empty($row['stop_hit_at']) ? $this->to_iso((string) $row['stop_hit_at']) : null,
                'invalidationReason' => (string) ($row['invalidation_reason'] ?? ''),
            ),
            'persistence' => array(
                'firstSeenAt' => $this->to_iso((string) ($row['first_seen_at'] ?? '')),
                'lastConfirmedAt' => $this->to_iso((string) ($row['last_confirmed_at'] ?? '')),
                'lastEvaluatedAt' => $this->to_iso((string) ($row['last_evaluated_at'] ?? '')),
                'lastBlueprintAt' => !empty($row['last_blueprint_at']) ? $this->to_iso((string) $row['last_blueprint_at']) : null,
                'expiresAt' => !empty($row['expires_at']) ? $this->to_iso((string) $row['expires_at']) : null,
                'replacedBy' => (string) ($row['replaced_by'] ?? ''),
                'staleHeld' => $lifecycle_state === 'STALE_HELD' && !empty($engine['graceHold']),
            ),
            'engine' => $engine,
        );
    }

    private function build_symbol_state($user_id, $symbol, $price) {
        $fib_candle_limit = max(120, $this->fib_history_window_size('15min'));
        $fib_candles = $this->fetch_candles($user_id, $symbol, '15min', $fib_candle_limit);
        $candles = count($fib_candles) > 120 ? array_slice($fib_candles, -120) : $fib_candles;
        $has_key = $this->get_twelve_key_status($user_id) === 'ok';
        $settings = $this->get_settings($user_id);
        $stale_threshold_sec = $settings['staleThresholdSec'];
        $mt5_authority = $this->is_mt5_authoritative($user_id, $symbol);
        $state = ($has_key || $mt5_authority) ? 'stale' : 'blocked';

        if (!$price) {
            // Never synthesize a quote timestamp when no authoritative quote exists.
            $price = array('symbol' => $symbol, 'mid' => 0, 'updatedAt' => null, 'state' => $state);
        }

        // Enforce staleThresholdSec on price freshness using iso_age_sec() — is_stale() appends
        // ' UTC' which breaks strtotime() when the timestamp is already ISO 8601 with timezone.
        if (isset($price['updatedAt']) && $this->iso_age_sec($price['updatedAt']) > $stale_threshold_sec) {
            $price['state'] = 'stale';
        }

        if (count($candles) < 30 || (float) $price['mid'] <= 0) {
            $early_blocker = $this->determine_engine_blocker($user_id, $price, $candles, false, 'WATCH', $symbol);
            $early_gate_reason = ($has_key || $mt5_authority) ? 'insufficient candle history' : 'Twelve Data key missing';
            if ($early_blocker === 'KEY_MISSING' || $early_blocker === 'KEY_INVALID') {
                $early_gate_reason = 'Twelve Data key ' . ($early_blocker === 'KEY_MISSING' ? 'missing' : 'invalid');
            } elseif ($early_blocker === 'RATE_LIMITED') {
                $early_gate_reason = 'Twelve Data rate limited — cooling down';
            } elseif ($early_blocker === 'CANDLES_MISSING') {
                $early_gate_reason = 'no candle history available';
            } elseif ($early_blocker === 'QUOTE_UNAVAILABLE') {
                $early_gate_reason = 'price unavailable';
            }
            return array(
                'regime' => array('symbol' => $symbol, 'bias' => 'RANGING', 'chop' => 1, 'nearestFib' => null, 'updatedAt' => gmdate('c'), 'state' => $state),
                'gate' => array('symbol' => $symbol, 'allow' => 'BLOCKED', 'reason' => $early_gate_reason, 'state' => $state),
                'signal' => null,
                'plan' => null,
                'diagnostic' => array(
                    'symbol' => $symbol,
                    'priceState' => $price['state'] ?? $state,
                    'candleState' => empty($candles) ? 'missing' : 'stale',
                    'lastPriceAt' => $price['updatedAt'] ?? null,
                    'lastCandleAt' => null,
                    'candleCount' => count($candles),
                    'engineBlocker' => $early_blocker,  // CRITICAL: Always include engineBlocker in diagnostic
                ),
            );
        }

        $first = reset($candles);
        $last = end($candles);
        $high = max(array_map(function ($c) { return (float) $c['high']; }, $candles));
        $low = min(array_map(function ($c) { return (float) $c['low']; }, $candles));
        $range = max($high - $low, 0.00000001);
        $close = (float) $last['close'];
        $move = $close - (float) $first['close'];
        $position_ratio = (($high - $close) / $range) * 100;
        $bias = $move > $range * 0.2 ? 'BULL' : ($move < -$range * 0.2 ? 'BEAR' : 'RANGING');
        $chop = round(max(0, min(1, 1 - (abs($move) / $range))), 2);
        $levels = $this->fib_levels($high, $low, 'LTF_SF');
        $this->fib_context_symbol = $symbol;
        $this->fib_context_timeframe = '15min';
        $this->fib_context_tf_seconds = max(60, (int) $this->timeframe_seconds('15min'));
        $authority_levels = $this->fib_levels_from_candles($fib_candles);
        $authority_high = null;
        $authority_low = null;
        foreach ($authority_levels['HTF_AF'] as $level) {
            if ((float) $level['ratio'] === 0.0) {
                $authority_high = (float) $level['price'];
            } elseif ((float) $level['ratio'] === 100.0) {
                $authority_low = (float) $level['price'];
            }
        }
        $authority_range_valid = $authority_high !== null && $authority_low !== null && $authority_high > $authority_low;
        if ($authority_range_valid) {
            $authority_range = $authority_high - $authority_low;
            $authority_mid = $authority_low + ($authority_range * 0.5);
            $authority_eq_buffer = $authority_range * 0.03;
            $pd_state = $close > ($authority_mid + $authority_eq_buffer)
                ? 'PREMIUM'
                : ($close < ($authority_mid - $authority_eq_buffer) ? 'DISCOUNT' : 'EQUILIBRIUM');
        } else {
            $pd_state = $this->pd_state($position_ratio);
        }
        $nearest = $this->nearest_level($levels, $close);
        $sequence = $this->sequence_state($candles);
        $direction = $position_ratio >= 62.5 ? 'LONG' : ($position_ratio <= 25 ? 'SHORT' : ($bias === 'BEAR' ? 'SHORT' : 'LONG'));

        // ── Anchor-based chop (ICT-aligned) ─────────────────────────────────
        // Replaces candle-momentum chop (1 - abs(move)/range).
        // ICT chop = price inside the 37.5–62.5% equilibrium of a structured
        // anchor range, not how directional the last N candles were.
        //
        // SF  = LTF SuperFib composite anchor  (local session)
        // AF  = HTF Authority Fib anchor        (higher-timeframe)
        //
        // Both anchors in equilibrium → HARD BLOCK (dual-anchor chop zone).
        // One anchor in equilibrium   → CAUTION (score penalty only, not block).
        // Neither anchor              → CLEAR.

        $sf_anchor_bounds  = $authority_levels['sf_anchor'] ?? null;
        $af_anchor_bounds  = $authority_levels['af_anchor'] ?? null;
        $sf_position_pct   = null;
        $af_position_pct   = null;

        if ($sf_anchor_bounds && ($sf_anchor_bounds['high'] - $sf_anchor_bounds['low']) > 0) {
            $sf_position_pct = (($sf_anchor_bounds['high'] - $close) /
                                ($sf_anchor_bounds['high'] - $sf_anchor_bounds['low'])) * 100;
        }
        if ($af_anchor_bounds && ($af_anchor_bounds['high'] - $af_anchor_bounds['low']) > 0) {
            $af_position_pct = (($af_anchor_bounds['high'] - $close) /
                                ($af_anchor_bounds['high'] - $af_anchor_bounds['low'])) * 100;
        }

        $sf_in_eq = $sf_position_pct !== null && $sf_position_pct >= 37.5 && $sf_position_pct <= 62.5;
        $af_in_eq = $af_position_pct !== null && $af_position_pct >= 37.5 && $af_position_pct <= 62.5;

        // Dual-anchor equilibrium = structural chop, hard block.
        $anchor_chop_blocked = $sf_in_eq && $af_in_eq;
        // Single-anchor equilibrium = caution, soft penalty.
        $anchor_chop_caution = $sf_in_eq || $af_in_eq;
        $anchor_chop_source  = ($sf_in_eq && $af_in_eq) ? 'SF+AF' : ($sf_in_eq ? 'SF' : ($af_in_eq ? 'AF' : 'none'));

        // f3_chop now reflects anchor position, not candle momentum.
        $f3_chop = $anchor_chop_caution ? 'caution' : 'clear';
        $hta_override = $position_ratio < 0 || $position_ratio > 100;
        $fundamental_bias = $this->get_symbol_fundamental_bias($symbol);
        $fundamental_htf_bias = null;
        $fundamental_htf_category = null;
        $fundamental_htf_opposed = false;
        if (is_array($fundamental_bias)) {
            $fundamental_htf_category = $fundamental_bias['category'] ?? null;
            if ($fundamental_htf_category === 'BULLISH') {
                $fundamental_htf_bias = 'BULL';
            } elseif ($fundamental_htf_category === 'BEARISH') {
                $fundamental_htf_bias = 'BEAR';
            }
            $fundamental_htf_opposed = $fundamental_htf_bias !== null
                && (($fundamental_htf_bias === 'BULL' && $direction === 'SHORT')
                    || ($fundamental_htf_bias === 'BEAR' && $direction === 'LONG'));
        }
        $status = 'WATCH';

        $aov_equilibrium_blocked = $authority_range_valid && $pd_state === 'EQUILIBRIUM';

        if (!$sequence[$direction]['sweep']) {
            $status = 'WATCH';
        } elseif (!$sequence[$direction]['mss']) {
            $status = 'ARMED';
        } elseif ($anchor_chop_blocked) {
            // CRITICAL: Both SF and AF anchors place price in equilibrium (37.5–62.5%).
            // Dual-anchor chop is a hard structural block — no directional basis exists.
            $status = 'ARMED';
        } elseif ($aov_equilibrium_blocked && $chop !== null && $chop >= 0.55) {
            // CRITICAL: HTF authority equilibrium is an aggressive gate only when
            // the market is sufficiently choppy. In low-chop equilibrium, allow
            // the signal to remain in the normal WATCH/READY path instead of
            // forcing ARMED.
            $status = 'ARMED';
        } elseif ($sequence[$direction]['displacement'] === 'weak') {
            $status = 'ARMED';
        } elseif ($fundamental_htf_opposed) {
            // CRITICAL: Fundamental HTF bias opposes the signal direction.
            // Do not allow a counter-bias setup to reach READY.
            $status = 'ARMED';
        } else {
            $status = 'READY';
        }

        $entry_ratio = $direction === 'LONG' ? 62.5 : 25;
        $stop_ratio = $direction === 'LONG' ? 75 : 0;
        $entry_price = $this->price_for_ratio($high, $low, $entry_ratio);
        $stop_price = $this->price_for_ratio($high, $low, $stop_ratio);
        $tp1_price = $this->price_for_ratio($high, $low, 50);
        $risk_unit = max(abs($entry_price - $stop_price), 0.00000001);
        $tp1_rr = round(abs($tp1_price - $entry_price) / $risk_unit, 2);
        if ($status === 'READY' && $tp1_rr < 1.0) {
            $status = 'ARMED';
        }

        // Preserve the structural engine status before MT5 lifecycle throttling.
        // Pending blueprints are only safe when lifecycle handling is the reason
        // a READY setup was downgraded; structurally ARMED setups must remain
        // planless even if the lifecycle lookup reports an ACTIVE_PRE_ENTRY or
        // repeated READY candidate.
        $pre_lifecycle_status = $status;

        $lifecycle_diagnostic = null;
        $prior_candidate = $this->find_latest_mt5_candidate_for_range(
            $user_id,
            $symbol,
            $direction,
            'LTF_SF',
            isset($nearest['ratio']) ? (float) $nearest['ratio'] : null,
            isset($nearest['price']) ? (float) $nearest['price'] : null
        );

        if (is_array($prior_candidate)) {
            $lifecycle = $this->get_mt5_candidate_lifecycle_state($user_id, $symbol, $direction, $prior_candidate);
            $lifecycle_state = (string) ($lifecycle['state'] ?? 'LIFECYCLE_UNRESOLVED');
            $lifecycle_reason = (string) ($lifecycle['reason'] ?? '');
            $prior_candidate_status = strtoupper((string) ($prior_candidate['status'] ?? ''));
            $prior_candidate_is_ready = $prior_candidate_status === 'READY';
            $lifecycle_diagnostic = array(
                'state' => $lifecycle_state,
                'reason' => $lifecycle_reason,
                'candidateId' => (string) ($prior_candidate['id'] ?? ''),
                'candidateDirection' => strtoupper((string) ($prior_candidate['direction'] ?? '')),
                'priorCandidateStatus' => $prior_candidate_status,
            );

            if (in_array($lifecycle_state, array('ACTIVE_OPEN_POSITION', 'ACTIVE_PENDING_ORDER'), true)) {
                $status = 'WATCH';
            } elseif ($lifecycle_state === 'ACTIVE_PRE_ENTRY' && $status === 'READY') {
                $status = 'ARMED';
            } elseif ($status === 'READY' && $prior_candidate_is_ready) {
                // Suppress repeated READY signals for the same MT5 candidate range.
                $status = 'ARMED';
            }
        }

        $confluence = array('HTA_SF', 'LTF_SF');
        if ($sequence[$direction ?: 'LONG']['sweep']) {
            $confluence[] = 'sweep';
        }
        if ($sequence[$direction ?: 'LONG']['mss']) {
            $confluence[] = 'MSS';
        }
        if ($f3_chop === 'clear') {
            $confluence[] = 'F3-clear';
        }
        if ($hta_override) {
            $confluence[] = 'HTA-override';
        }

        $last_candle    = !empty($candles) ? end($candles) : null;
        $price_is_live  = isset($price['state']) && $price['state'] === 'live';
        $candle_age_sec = $last_candle ? (time() - strtotime($last_candle['time'])) : PHP_INT_MAX;
        $candles_fresh  = $last_candle && $candle_age_sec <= 7200;
        $is_equity_off_session = $this->is_equity_index_off_session($symbol);
        $data_live      = !$is_equity_off_session && $price_is_live && $candles_fresh;
        $symbol_state   = $is_equity_off_session ? 'closed_session' : ($data_live ? 'live' : 'stale');
        $candle_state   = empty($candles) ? 'missing' : ($is_equity_off_session ? 'closed_session' : ($candles_fresh ? 'live' : 'stale'));

        // CRITICAL HARDENING: Block gate when chop >= 0.7 (F3 caution zone).
        // SMC methodology requires no entries in high-chop equilibrium; this was
        // missing from the live backend while the mock data showed BLOCKED correctly.
        if ($aov_equilibrium_blocked) {
            $gate = array(
                'symbol' => $symbol,
                'allow'  => 'BLOCKED',
                'reason' => 'AOV_EQUILIBRIUM_ZONE',
                'state'  => $symbol_state,
            );
        } elseif ($anchor_chop_blocked) {
            $gate = array(
                'symbol' => $symbol,
                'allow'  => 'BLOCKED',
                'reason' => 'SF+AF dual equilibrium — anchor chop zone',
                'state'  => $symbol_state,
            );
        } else {
            $gate = array(
                'symbol' => $symbol,
                'allow'  => $direction === 'LONG' ? 'BUY' : 'SELL',
                'state'  => $symbol_state,
            );
        }

        $regime = array(
            'symbol'          => $symbol,
            'bias'            => $bias,
            'chop'            => $chop,           // kept as diagnostic (candle-derived)
            'anchorChop'      => $anchor_chop_source,
            'sfPosition'      => $sf_position_pct !== null ? round($sf_position_pct, 1) : null,
            'afPosition'      => $af_position_pct !== null ? round($af_position_pct, 1) : null,
            'nearestFib'      => $nearest ? $nearest['price'] : null,
            'updatedAt'       => gmdate('c'),
            'state'           => $symbol_state,
        );

        $ltf_level = $this->execution_level($levels, $direction);

        // A signal may only be backend-confirmed when the price feed is live AND candles are
        // fresh (last candle no older than 2 hours — two 15-min bars worth of normal delay plus
        // buffer). Stale data can never produce a READY backend-confirmed signal.

        // Anchor the signal identity to the latest analysed candle so the same setup stays stable
        // within one 15m bar, while later intraday setups get a distinct execution queue identity.
        $engine_blocker = $this->determine_engine_blocker($user_id, $price, $candles, $data_live, $status, $symbol, $anchor_chop_blocked, $aov_equilibrium_blocked, $is_equity_off_session, $fundamental_htf_opposed);
        $backend_confirmed = $status === 'READY' && $data_live && $engine_blocker === 'OK';

        $signal_anchor = $last_candle && !empty($last_candle['time']) ? $last_candle['time'] : gmdate('c');
        $signal_id = 'sig-' . substr(md5($user_id . '|' . $symbol . '|' . $direction . '|' . $signal_anchor), 0, 16);
        $signal = array(
            'id' => $signal_id,
            'symbol' => $symbol,
            'direction' => $direction,
            'status' => $status,
            'confluence' => $confluence,
            'verdict' => $this->verdict($status, $confluence, $anchor_chop_caution),
            'computedBy' => 'backend',
            // CRITICAL HARDENING: Never backend-confirm a signal unless status is READY
            // and every hard backend gate is OK. Without this guard,
            // post_execute_signals() would still accept and queue non-READY or
            // gate-blocked signals.
            'backendConfirmed' => $backend_confirmed,
            'engineBlocker' => $engine_blocker,
            'createdAt' => $signal_anchor,
            'entryPrice' => $entry_price,
            'slPrice' => $stop_price,
            'tpPrice' => $tp1_price,
            'engine' => array(
                'htfBias' => $bias === 'RANGING' ? 'TRANSITIONAL' : $bias,
                'fundamentalBias' => $fundamental_htf_category ?? 'NEUTRAL',
                'pdState' => $pd_state,
                'drawOnLiquidity' => $direction === 'LONG' ? 'opposing buy-side liquidity' : 'opposing sell-side liquidity',
                'sweep' => $sequence[$direction]['sweep'] ? 'present' : 'absent',
                'mss' => $sequence[$direction]['mss'] ? 'present' : 'absent',
                'displacement' => $sequence[$direction]['displacement'],
                'htaOverride' => $hta_override,
                'f3Chop' => $f3_chop,
                'anchorChopSource' => $anchor_chop_source,
                'sfPosition' => $sf_position_pct !== null ? round($sf_position_pct, 1) : null,
                'afPosition' => $af_position_pct !== null ? round($af_position_pct, 1) : null,
                'candleChop' => $chop,   // diagnostic only — not used for gating
                'ltfLevel' => $ltf_level,
                'firstReactionFamily' => $hta_override ? 'HTA_SF' : 'LTF_SF',
                'chartState' => 'chart-derived',
                'panelState' => null,
            ),
        );

        $diagnostic = array(
            'symbol' => $symbol,
            'priceState' => $symbol_state,
            'candleState' => $candle_state,
            'lastPriceAt' => $price['updatedAt'] ?? null,
            'lastCandleAt' => $last_candle ? $last_candle['time'] : null,
            'candleCount' => count($candles),
            'engineBlocker' => $engine_blocker,
            'fundamentalBias' => $fundamental_htf_category ?? 'NEUTRAL',
            'lifecycle' => $lifecycle_diagnostic,
        );

        return array(
            'regime' => $regime,
            'gate' => $gate,
            'signal' => $signal,
            'plan' => $this->build_pending_or_confirmed_plan(
                $user_id,
                $signal,
                $high,
                $low,
                $sequence,
                $candles,
                $backend_confirmed,
                $data_live,
                $engine_blocker,
                $lifecycle_diagnostic,
                $pre_lifecycle_status
            ),
            'diagnostic' => $diagnostic,
        );
    }

    private function build_pending_or_confirmed_plan($user_id, $signal, $high, $low, $sequence, $candles, $backend_confirmed, $data_live, $engine_blocker, $lifecycle_diagnostic, $pre_lifecycle_status = null) {
        if ($backend_confirmed === true) {
            return $this->build_trade_plan($user_id, $signal, $high, $low, $sequence, $candles);
        }

        $engine = is_array($signal['engine'] ?? null) ? $signal['engine'] : array();
        $negative_structural_values = array('', '0', 'FALSE', 'NO', 'NONE', 'ABSENT', 'MISSING', 'NULL');
        $sweep_value = strtoupper(trim((string) ($engine['sweep'] ?? '')));
        $mss_value = strtoupper(trim((string) ($engine['mss'] ?? '')));
        $displacement_value = strtolower(trim((string) ($engine['displacement'] ?? '')));
        $has_sweep = !in_array($sweep_value, $negative_structural_values, true);
        $has_mss = !in_array($mss_value, $negative_structural_values, true);
        $has_displacement = in_array($displacement_value, array('clean', 'strong'), true);
        $signal_status = $signal['status'] ?? null;
        $lifecycle_state = is_array($lifecycle_diagnostic) ? ($lifecycle_diagnostic['state'] ?? null) : null;
        $lifecycle_hard_suppressed = in_array($lifecycle_state, array('ACTIVE_OPEN_POSITION', 'ACTIVE_PENDING_ORDER'), true);

        if (
            $backend_confirmed !== false
            || $data_live !== true
            || $engine_blocker !== 'OK'
            || $lifecycle_hard_suppressed
        ) {
            return null;
        }

        if ($signal_status === 'WATCH') {
            $plan = $this->build_trade_plan($user_id, $signal, $high, $low, $sequence, $candles);
            if (!is_array($plan)) {
                return null;
            }

            $plan['source'] = 'watch-blueprint';
            return $plan;
        }

        if (!$has_sweep) {
            return null;
        }

        $plan = $this->build_trade_plan($user_id, $signal, $high, $low, $sequence, $candles);
        if (!is_array($plan)) {
            return null;
        }

        $plan['source'] = 'pending-blueprint';
        return $plan;
    }

    private function build_trade_plan($user_id, $signal, $high, $low, $sequence, $candles) {
        $risk = $this->get_risk_profile($user_id);
        $telemetry = $this->read_account_telemetry((int) $user_id);
        $equity = (float) ($telemetry['equity'] ?? 0);
        $has_live_sizing_equity = ($telemetry['freshness'] ?? 'unavailable') === 'live' && $equity > 0;
        // USC (micro-cent) accounts report equity 100× smaller than USD.
        // Detect from telemetry currency and apply the inverse multiplier so pip_val
        // (always expressed in USD) stays comparable to stage_risk.
        $account_currency = strtoupper((string) ($telemetry['currency'] ?? ''));
        $usc_to_usd_scale = ($account_currency === 'USC') ? 100.0 : 1.0;
        $risk_usc = $has_live_sizing_equity
            ? round($equity * ((float) $risk['perTradePct'] / 100), 2)
            : 0.0;
        $is_long = $signal['direction'] === 'LONG';
        $sym = $signal['symbol'];
        $spec = $this->get_instrument_spec($sym);
        $pip = $spec ? (float) $spec['pip_size'] : 0.0001;
        $pip_val = $spec ? $this->pip_value_per_standard_lot($user_id, $sym, $spec) : 10.0;
        $is_reference_instrument = is_array($spec) && (($spec['type'] ?? '') === 'reference');

        // Compute swings for SL using the candles already fetched by build_symbol_state().
        if (count($candles) >= 35) {
            $prior = array_slice($candles, -35, 25);
            $swing_hi = max(array_map(function ($c) { return (float) $c['high']; }, $prior));
            $swing_lo = min(array_map(function ($c) { return (float) $c['low']; }, $prior));
        } else {
            $swing_hi = $high;
            $swing_lo = $low;
        }
        $sweep_up = $sequence['LONG']['sweep'];
        $sweep_down = $sequence['SHORT']['sweep'];
        // Swing-based SL with instrument-aware buffer (plan-level SL field).
        $sl = $this->get_sl_from_sweep($signal['direction'], $sweep_up, $sweep_down, $swing_hi, $swing_lo, $signal['symbol']);

        // Fib-ratio-based entries, per-stage stops, and differentiated TPs.
        $ratios        = $is_long ? array(62.5, 75, 100)   : array(25, 0, -25);
        $stop_ratios   = $is_long ? array(75, 100, 125)    : array(0, -25, -62.5);
        $target_ratios = $is_long ? array(50, 25, 0)       : array(50, 75, 100);
        $entries = array();
        $stops   = array();
        $tps     = array();
        $lots    = array();
        $ladder  = array();
        $legacy_entry_spread = $this->legacy_stage_entry_spread($spec);

        foreach (array('e1', 'e2', 'e3') as $idx => $stage) {
            $entries[$stage] = $this->price_for_ratio($high, $low, $ratios[$idx]);
            $stops[$stage]   = $this->price_for_ratio($high, $low, $stop_ratios[$idx]);
            $ladder[$stage]  = array('ratio' => $ratios[$idx], 'stopRatio' => $stop_ratios[$idx], 'family' => 'LTF_SF');
        }

        // Restore archived pre-stop re-entry behavior so deeper ladder orders trigger before
        // the prior stage stop is hit, instead of requiring the stop price to trade first.
        $entries['e2'] = $this->legacy_stage_reentry_from_stop($stops['e1'], $signal['direction'], $legacy_entry_spread);
        $entries['e3'] = $this->legacy_stage_reentry_from_stop($stops['e2'], $signal['direction'], $legacy_entry_spread);

        foreach (array('tp1', 'tp2', 'tp3') as $idx => $tp_key) {
            $tps[$tp_key] = $this->price_for_ratio($high, $low, $target_ratios[$idx]);
        }

        // Restore archived stage risk allocation: size each ladder leg against its own SL
        // using the proven 20/30/50 family split without exceeding the family risk budget.
        $risk_alloc = array('e1' => 0.20, 'e2' => 0.30, 'e3' => 0.50);
        foreach (array('e1', 'e2', 'e3') as $stage) {
            if (!$has_live_sizing_equity || $is_reference_instrument) {
                // Reference instruments (for example DXYUSD) may be watched for context,
                // but they do not have executable lot sizing.
                $lots[$stage] = 0.0;
                continue;
            }
            $stop_dist = max(abs($entries[$stage] - $stops[$stage]), $pip);
            $stop_pips = $stop_dist / $pip;
            $stage_risk = $risk_usc * $risk_alloc[$stage];
            // Scale pip_val by usc_to_usd_scale so USC equity is comparable
            // to a USD-denominated pip_val (metals, indices, crypto).
            $pip_val_scaled = $pip_val * $usc_to_usd_scale;
            $raw_lots = $stage_risk / max($stop_pips * $pip_val_scaled, 0.01);
            $stage_lot = floor($raw_lots * 100) / 100;
            $lots[$stage] = $stage_lot >= 0.01 ? round($stage_lot, 2) : 0.0;
        }
        $lots = $this->enforce_progressive_stage_lots($lots);

        $risk_per_unit = max(abs($entries['e1'] - $stops['e1']), 0.00000001);
        $rr = array(
            'tp1' => round(abs($tps['tp1'] - $entries['e1']) / $risk_per_unit, 2),
            'tp2' => round(abs($tps['tp2'] - $entries['e1']) / $risk_per_unit, 2),
            'tp3' => round(abs($tps['tp3'] - $entries['e1']) / $risk_per_unit, 2),
        );

        return array(
            'signalId' => $signal['id'],
            'symbol' => $signal['symbol'],
            'entries' => $entries,
            'sl' => $sl,
            'stops' => $stops,
            'tps' => $tps,
            'rr' => $rr,
            'lotSize' => $lots,
            'ladder' => $ladder,
            'riskUSC' => $risk_usc,
            'riskZAR' => $has_live_sizing_equity ? round($risk_usc * 18.5, 2) : 0.0,
            'drawdownImpactPct' => $has_live_sizing_equity ? round(($risk_usc / $equity) * 100, 4) : 0.0,
            'source' => 'backend-blueprint',
            'executionSource' => 'LTF_SF',
            'ladderId' => md5($signal['id']),
            'direction' => $signal['direction'],
            'stageFills' => array('e1' => false, 'e2' => false, 'e3' => false),
            'state' => $has_live_sizing_equity ? 'ACTIVE' : 'INVALID',
        );
    }

    private function get_sl_from_sweep($direction, $sweep_up, $sweep_down, $swing_hi, $swing_lo, $symbol = null) {
        // 5-pip buffer beyond swing extreme; scale by instrument pip_size so JPY/metal/index
        // pairs don't get a USD-pair-sized buffer that is effectively 0 pips.
        $spec   = $symbol ? $this->get_instrument_spec($symbol) : null;
        $buffer = $spec ? ((float) $spec['pip_size'] * 5) : 0.0005;
        if ($direction === 'LONG') {
            return round($swing_lo - $buffer, 8);
        } else {
            return round($swing_hi + $buffer, 8);
        }
    }

    private function legacy_stage_entry_spread($spec) {
        $pip_size = (is_array($spec) && isset($spec['pip_size']) && (float) $spec['pip_size'] > 0)
            ? (float) $spec['pip_size']
            : 0.0001;

        return $pip_size >= 0.01 ? 0.15 : 0.00015;
    }

    private function legacy_stage_reentry_from_stop($stage_stop, $direction, $spread) {
        $stage_stop = (float) $stage_stop;
        if ($spread <= 0) {
            return round($stage_stop, 8);
        }

        return $direction === 'LONG'
            ? round($stage_stop + $spread, 8)
            : round($stage_stop - $spread, 8);
    }

    private function enforce_progressive_stage_lots(array $lots) {
        $stages = array('e1', 'e2', 'e3');
        for ($idx = count($stages) - 2; $idx >= 0; $idx--) {
            $stage = $stages[$idx];
            $next_stage = $stages[$idx + 1];
            $current = isset($lots[$stage]) ? round((float) $lots[$stage], 2) : 0.0;
            $next = isset($lots[$next_stage]) ? round((float) $lots[$next_stage], 2) : 0.0;

            if ($next <= 0.0) {
                $lots[$stage] = 0.0;
                continue;
            }

            if ($current >= $next) {
                $lots[$stage] = max(0.0, round($next - 0.01, 2));
            }
        }

        return $lots;
    }

    private function pip_value_per_standard_lot($user_id, $symbol, $spec) {
        $fallback = isset($spec['pip_val']) ? (float) $spec['pip_val'] : 10.0;
        if (!is_array($spec) || ($spec['type'] ?? '') !== 'forex') {
            return $fallback;
        }

        $market_mids = $this->market_mids_for_symbol($user_id, $symbol);
        return $this->pip_value_from_market($symbol, $spec, $market_mids);
    }

    private function pip_value_from_market($symbol, $spec, $market_mids) {
        $fallback = isset($spec['pip_val']) ? (float) $spec['pip_val'] : 10.0;
        $contract_size = isset($spec['contract_size']) ? (float) $spec['contract_size'] : 0.0;
        $pip_size = isset($spec['pip_size']) ? (float) $spec['pip_size'] : 0.0;
        if (($spec['type'] ?? '') !== 'forex' || $contract_size <= 0 || $pip_size <= 0) {
            return $fallback;
        }

        $pair = $this->split_symbol_pair($symbol);
        if (!$pair) {
            return $fallback;
        }

        list($base, $quote) = $pair;
        $quote_to_usd = $this->quote_to_usd_rate_from_market($base, $quote, $market_mids);
        if ($quote_to_usd <= 0) {
            return $fallback;
        }

        return round($contract_size * $pip_size * $quote_to_usd, 6);
    }

    private function market_mids_for_symbol($user_id, $symbol) {
        $pair = $this->split_symbol_pair($symbol);
        if (!$pair) {
            return array();
        }

        list($base, $quote) = $pair;
        $refs = array($symbol);
        if ($quote !== 'USD') {
            $refs[] = $quote . 'USD';
            $refs[] = 'USD' . $quote;
        }

        $out = array();
        foreach (array_values(array_unique($refs)) as $ref) {
            $mid = $this->reference_mid($user_id, $ref);
            if ($mid > 0) {
                $out[$ref] = $mid;
            }
        }

        return $out;
    }

    private function quote_to_usd_rate_from_market($base, $quote, $market_mids) {
        if ($quote === 'USD') {
            return 1.0;
        }

        if ($base === 'USD') {
            $pair_mid = $this->reference_mid_from_market($market_mids, $base . $quote);
            return $pair_mid > 0 ? (1.0 / $pair_mid) : 0.0;
        }

        $direct_mid = $this->reference_mid_from_market($market_mids, $quote . 'USD');
        if ($direct_mid > 0) {
            return $direct_mid;
        }

        $inverse_mid = $this->reference_mid_from_market($market_mids, 'USD' . $quote);
        if ($inverse_mid > 0) {
            return 1.0 / $inverse_mid;
        }

        return 0.0;
    }

    private function reference_mid($user_id, $symbol) {
        $quote = $this->fetch_quote($user_id, $symbol);
        if (is_array($quote) && isset($quote['mid']) && (float) $quote['mid'] > 0) {
            return (float) $quote['mid'];
        }

        $cached = $this->get_cached_price($user_id, $symbol);
        if (is_array($cached) && isset($cached['mid']) && (float) $cached['mid'] > 0) {
            $age_sec = $this->iso_age_sec(isset($cached['updatedAt']) ? $cached['updatedAt'] : null);
            $stale_threshold_sec = $this->get_settings($user_id)['staleThresholdSec'];
            if ($age_sec <= $stale_threshold_sec && ($cached['state'] ?? 'stale') === 'live') {
                return (float) $cached['mid'];
            }
        }

        return 0.0;
    }

    private function normalize_symbol_token($symbol) {
        return preg_replace('/[^A-Z0-9]/', '', strtoupper((string) $symbol));
    }

    public function map_symbol_aliases($symbol) {
        static $aliases = array(
            // NAS100 / NASDAQ broker aliases
            'NASDAQ'      => 'NAS100',
            'NASDAQ100'   => 'NAS100',
            'USTECH100'   => 'NAS100',  // "US Tech 100" after space-strip
            'USTECH'      => 'NAS100',
            // US30 / Dow Jones broker aliases
            'WALLSTREET'  => 'US30',    // "Wall Street 30" truncated+stripped
            'WALLSTREET30'=> 'US30',    // "Wall Street 30" full stripped
            'DOW30'       => 'US30',
            'DJ30'        => 'US30',
            // SPX500 / S&P 500 broker aliases
            'USSP500'     => 'SPX500',  // "US SP 500" after space-strip
            'USSP'        => 'SPX500',
            'SPX500'      => 'SPX500',
            'US500'       => 'SPX500',
            'SP500'       => 'SPX500',
            // Metals
            'GOLD'        => 'XAUUSD',
            'SILVER'      => 'XAGUSD',
        );
        $normalized = $this->normalize_symbol_token($symbol);
        return isset($aliases[$normalized]) ? $aliases[$normalized] : $normalized;
    }

    private function reference_mid_from_market($market_mids, $symbol) {
        $key = $this->map_symbol_aliases($symbol);
        return isset($market_mids[$key]) ? (float) $market_mids[$key] : 0.0;
    }

    private function split_symbol_pair($symbol) {
        $key = $this->map_symbol_aliases($symbol);
        if (!preg_match('/^[A-Z]{6}$/', $key)) {
            return null;
        }

        return array(substr($key, 0, 3), substr($key, 3, 3));
    }

    private function sequence_state($candles) {
        $prior = array_slice($candles, -35, 25);
        $recent = array_slice($candles, -10);
        $last = end($candles);
        $prior_high = max(array_map(function ($c) { return (float) $c['high']; }, $prior));
        $prior_low = min(array_map(function ($c) { return (float) $c['low']; }, $prior));
        $recent_high = max(array_map(function ($c) { return (float) $c['high']; }, $recent));
        $recent_low = min(array_map(function ($c) { return (float) $c['low']; }, $recent));
        $recent_without_last = array_slice($recent, 0, -1);
        $internal_high = max(array_map(function ($c) { return (float) $c['high']; }, $recent_without_last));
        $internal_low = min(array_map(function ($c) { return (float) $c['low']; }, $recent_without_last));
        $close = (float) $last['close'];
        $range = max((float) $last['high'] - (float) $last['low'], 0.00000001);
        $body = abs((float) $last['close'] - (float) $last['open']);
        $displacement = $body / $range > 0.65 ? 'strong' : ($body / $range > 0.45 ? 'clean' : ($body / $range > 0.25 ? 'weak' : 'none'));

        return array(
            'LONG' => array(
                'sweep' => $recent_low < $prior_low && $close > $prior_low,
                'mss' => $close > $internal_high && $displacement !== 'none',
                'displacement' => $displacement,
            ),
            'SHORT' => array(
                'sweep' => $recent_high > $prior_high && $close < $prior_high,
                'mss' => $close < $internal_low && $displacement !== 'none',
                'displacement' => $displacement,
            ),
        );
    }

    private function get_symbol_fundamental_bias(string $symbol): ?array {
        $pair = $this->split_symbol_pair($symbol);
        if (!$pair) {
            return null;
        }

        $currency = $pair[0];
        if ($currency === '') {
            return null;
        }

        global $wpdb;
        $table = $wpdb->prefix . 'smc_sf_fundamental_bias';
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT composite_score, category FROM {$table} WHERE currency = %s LIMIT 1",
            $currency
        ), ARRAY_A);

        if (!$row) {
            return null;
        }

        return array(
            'compositeScore' => isset($row['composite_score']) ? (float) $row['composite_score'] : 0.0,
            'category' => isset($row['category']) ? (string) $row['category'] : 'NEUTRAL',
        );
    }

    public function refresh_prices($user_id, $symbols) {
        $prices = array();
        $stale_threshold_sec = $this->get_settings($user_id)['staleThresholdSec'];
        foreach ($symbols as $symbol) {
            if ($this->is_mt5_authoritative($user_id, $symbol)) {
                $cached = $this->get_cached_price($user_id, $symbol, $stale_threshold_sec);
                if ($cached) {
                    $prices[] = $cached;
                    continue;
                }
            }

            $quote = $this->fetch_quote($user_id, $symbol);
            if ($quote) {
                $prices[] = $quote;
            } else {
                $cached = $this->get_cached_price($user_id, $symbol, $stale_threshold_sec);
                $prices[] = $cached ? $cached : array(
                    'symbol' => $symbol,
                    'bid' => 0,
                    'ask' => 0,
                    'mid' => 0,
                    'changePct1d' => 0,
                    'updatedAt' => gmdate('c'),
                    'state' => $this->get_twelve_key_status($user_id) === 'ok' ? 'unavailable' : 'blocked',
                    'source' => 'unknown',
                    'age_sec' => PHP_INT_MAX,
                );
            }
        }

        return $prices;
    }

    private function fetch_quote($user_id, $symbol) {
        if ($this->is_mt5_authoritative($user_id, $symbol)) {
            $cached = $this->get_cached_price($user_id, $symbol);
            if (!$cached) {
                $this->log_feed_debug('fetch_quote.mt5_missing', array(
                    'symbol' => $symbol,
                    'rate_limited' => $this->is_feed_rate_limited($user_id, $symbol),
                ));
            } elseif (($cached['state'] ?? 'offline') !== 'live') {
                $this->log_feed_debug('fetch_quote.mt5_stale', array(
                    'symbol' => $symbol,
                    'state' => $cached['state'] ?? 'missing',
                    'age_sec' => isset($cached['age_sec']) ? (int) $cached['age_sec'] : null,
                    'rate_limited' => $this->is_feed_rate_limited($user_id, $symbol),
                ));
            }
            return $cached;
        }

        $cached = $this->get_cached_price($user_id, $symbol);
        $this->log_feed_debug('fetch_quote.non_mt5', array(
            'symbol' => $symbol,
            'cached_source' => $cached['source'] ?? 'none',
            'cached_state' => $cached['state'] ?? 'missing',
            'rate_limited' => $this->is_feed_rate_limited($user_id, $symbol),
        ));
        return null;
    }

    public function fetch_candles($user_id, $symbol, $timeframe, $outputsize) {
        global $wpdb;

        // Candle TTL: skip upstream call when candles were fetched recently, when the symbol is
        // MT5-authoritative, or when a non-MT5 symbol is in Twelve Data cooldown.
        $candle_ttl_key = 'smc_sf_ct_' . $user_id . '_' . md5($symbol . '|' . $timeframe);
        $mt5_authority = $this->is_mt5_authoritative($user_id, $symbol);
        $candle_ttl_hit = get_transient($candle_ttl_key) !== false;
        $symbol_rate_limited = $this->is_feed_rate_limited($user_id, $symbol);
        $candle_ttl_active = $mt5_authority || $candle_ttl_hit || (!$mt5_authority && $symbol_rate_limited);

        if ($mt5_authority && $symbol_rate_limited) {
            $this->log_feed_debug('fetch_candles.rate_limit_ignored', array(
                'symbol' => $symbol,
                'timeframe' => $timeframe,
            ));
        }

        $key = $this->get_twelve_key($user_id);
        error_log(sprintf(
            '[PHASE0_SOAK] fetch_candles: symbol=%s | timeframe=%s | ttl_active=%s | has_key=%s | will_call_td=%s',
            $symbol,
            $timeframe,
            $candle_ttl_active ? 'true' : 'false',
            is_wp_error($key) ? 'error' : ($key ? 'true' : 'false'),
            (!$candle_ttl_active && !is_wp_error($key) && $key) ? 'true' : 'false'
        ));
        if (!$candle_ttl_active && !is_wp_error($key) && $key) {
            $url = add_query_arg(array(
                'symbol' => $this->twelve_symbol($symbol),
                'interval' => $timeframe,
                'outputsize' => $outputsize,
                'apikey' => $key,
            ), 'https://api.twelvedata.com/time_series');
            $response = wp_remote_get($url, array('timeout' => 15));
            if (!is_wp_error($response)) {
                $td_code = wp_remote_retrieve_response_code($response);
                $body    = json_decode(wp_remote_retrieve_body($response), true);

                if ($td_code === 429 || (isset($body['code']) && (int) $body['code'] === 429)) {
                    // Transient-based rate-limit - do NOT change key_status so get_twelve_key() keeps working after cooldown.
                    $this->set_feed_rate_limited($user_id, $symbol);
                    error_log(sprintf(
                        '[PHASE0_SOAK] Rate-limit 429 detected: symbol=%s | setting transient ttl_sec=60',
                        $symbol
                    ));
                    $this->log_feed_debug('fetch_candles.rate_limited', array(
                        'symbol' => $symbol,
                        'timeframe' => $timeframe,
                        'authority' => 'twelve-data',
                    ));
                } elseif ($td_code === 401 || $td_code === 403 || (isset($body['code']) && in_array((int) $body['code'], array(401, 403), true))) {
                    // Only auth failures invalidate the key; a 400/404 for an unsupported symbol must not.
                    $this->set_twelve_key_status($user_id, 'invalid');
                } elseif ($td_code < 400) {
                    if (!empty($body['values']) && is_array($body['values'])) {
                        foreach ($body['values'] as $item) {
                            if (empty($item['datetime'])) {
                                continue;
                            }
                            $time = gmdate('Y-m-d H:i:s', strtotime($item['datetime']));
                            // HARDENING: INSERT … ON DUPLICATE KEY UPDATE instead of REPLACE so
                            // that MT5-authoritative candles (source='mt5') are never silently
                            // overwritten. REPLACE deletes then re-inserts, erasing the source flag.
                            $wpdb->query($wpdb->prepare(
                                "INSERT INTO `{$this->table('candles')}`
                                     (user_id, symbol, timeframe, candle_time, open, high, low, close, volume, source, created_at)
                                 VALUES (%d, %s, %s, %s, %f, %f, %f, %f, %s, 'twelve-data', %s)
                                 ON DUPLICATE KEY UPDATE
                                     open       = IF(source = 'mt5', open,       VALUES(open)),
                                     high       = IF(source = 'mt5', high,       VALUES(high)),
                                     low        = IF(source = 'mt5', low,        VALUES(low)),
                                     close      = IF(source = 'mt5', close,      VALUES(close)),
                                     volume     = IF(source = 'mt5', volume,     VALUES(volume)),
                                     source     = IF(source = 'mt5', 'mt5',      'twelve-data'),
                                     created_at = IF(source = 'mt5', created_at, VALUES(created_at))",
                                $user_id,
                                $symbol,
                                $timeframe,
                                $time,
                                (float) $item['open'],
                                (float) $item['high'],
                                (float) $item['low'],
                                (float) $item['close'],
                                isset($item['volume']) ? (string) $item['volume'] : null,
                                $this->now_mysql()
                            ));
                        }
                        // Mark candles as freshly fetched for 90 seconds to prevent API spam.
                        set_transient($candle_ttl_key, 1, 90);
                        $this->set_twelve_key_status($user_id, 'ok');
                    }
                    // status:error within a 2xx HTTP response means unsupported/unrecognised
                    // symbol — not an auth failure. Preserve key status so one bad watchlist
                    // entry cannot block the entire feed.
                    // $td_code >= 500: transient upstream error, also preserve key status.
                }
            }
        }

        // HARDENING: Fetch source alongside candle data for MT5 prioritization.
        // REGRESSION GUARD: Use LIMIT to prevent unbounded table scans. The candles table grows
        // indefinitely; without a LIMIT this query fetches ALL historical bars on every engine
        // run, causing memory/timeout degradation. We fetch 2× $outputsize with a floor of 200
        // to ensure enough headroom for MT5/TwelveData deduplication before slicing to $outputsize.
        $fetch_limit = max(200, (int) $outputsize * 2);
        $all_candles = $wpdb->get_results($wpdb->prepare(
            "SELECT candle_time, open, high, low, close, source FROM {$this->table('candles')} WHERE user_id = %d AND symbol = %s AND timeframe = %s ORDER BY candle_time DESC LIMIT %d",
            $user_id,
            $symbol,
            $timeframe,
            $fetch_limit
        ), ARRAY_A);

        // Deduplicate by candle_time, preferring MT5 over TwelveData
        $deduped = array();
        foreach ($all_candles as $candle) {
            $time_key = $candle['candle_time'];
            if (!isset($deduped[$time_key])) {
                // First occurrence: store it
                $deduped[$time_key] = $candle;
            } elseif ($candle['source'] === 'mt5' && $deduped[$time_key]['source'] !== 'mt5') {
                // Replace with MT5 if current is higher-priority source
                $deduped[$time_key] = $candle;
            }
            // Otherwise: keep existing (MT5 preferred, or existing is already MT5)
        }

        // Take top N candles (by most recent timestamps)
        $rows = array_slice($deduped, 0, $outputsize);

        if ($timeframe !== '1min') {
            $mt5_aggregated = $this->fetch_aggregated_mt5_m1_candles($user_id, $symbol, $timeframe, $outputsize);
            if (!empty($mt5_aggregated)) {
                $canonical_latest = 0;
                if (!empty($rows[0]['candle_time'])) {
                    $canonical_latest = strtotime($rows[0]['candle_time'] . ' UTC');
                    if ($canonical_latest === false) {
                        $canonical_latest = 0;
                    }
                }

                $mt5_latest = 0;
                $mt5_last = end($mt5_aggregated);
                if (!empty($mt5_last['time'])) {
                    $mt5_latest = strtotime($mt5_last['time']);
                    if ($mt5_latest === false) {
                        $mt5_latest = 0;
                    }
                }

                $tf_seconds = max(60, (int) $this->timeframe_seconds($timeframe));
                $freshness_window = max($tf_seconds * 2, 300);
                $mt5_is_recent = $mt5_latest > 0 && (time() - $mt5_latest) <= $freshness_window;
                $mt5_has_coverage = count($mt5_aggregated) >= min(max(1, (int) $outputsize), 5);
                $mt5_not_older_than_canonical = $canonical_latest <= 0 || $mt5_latest >= ($canonical_latest - $tf_seconds);

                if ($mt5_is_recent && $mt5_has_coverage && $mt5_not_older_than_canonical) {
                    $aggregated_count = count($mt5_aggregated);
                    if ($aggregated_count < 30) {
                        error_log(sprintf(
                            '[PHASE0_SOAK] CANDLE_GAP: symbol=%s | timeframe=%s | count=%d | status=INSUFFICIENT',
                            $symbol,
                            $timeframe,
                            $aggregated_count
                        ));
                    } else {
                        error_log(sprintf(
                            '[PHASE0_SOAK] CANDLE_OK: symbol=%s | timeframe=%s | count=%d',
                            $symbol,
                            $timeframe,
                            $aggregated_count
                        ));
                    }
                    return $mt5_aggregated;
                }
            }
        }

        if ($mt5_authority && count($rows) < min(30, (int) $outputsize)) {
            $this->log_feed_debug('fetch_candles.mt5_gap', array(
                'symbol' => $symbol,
                'timeframe' => $timeframe,
                'rows' => count($rows),
            ));
        }

        // Reverse to chronological order (oldest to newest)
        $rows = array_reverse($rows);
        $row_count = count($rows);

        if ($row_count < 30) {
            error_log(sprintf(
                '[PHASE0_SOAK] CANDLE_GAP: symbol=%s | timeframe=%s | count=%d | status=INSUFFICIENT',
                $symbol,
                $timeframe,
                $row_count
            ));
        } else {
            error_log(sprintf(
                '[PHASE0_SOAK] CANDLE_OK: symbol=%s | timeframe=%s | count=%d',
                $symbol,
                $timeframe,
                $row_count
            ));
        }

        return array_map(function ($row) {
            return array(
                'time' => $this->to_iso($row['candle_time']),
                'open' => (float) $row['open'],
                'high' => (float) $row['high'],
                'low' => (float) $row['low'],
                'close' => (float) $row['close'],
            );
        }, $rows);
    }

    private function fetch_aggregated_mt5_m1_candles($user_id, $symbol, $timeframe, $outputsize) {
        global $wpdb;

        $tf_seconds = $this->timeframe_seconds($timeframe);
        if ($tf_seconds <= 60) {
            return array();
        }

        $m1_rows = $wpdb->get_results($wpdb->prepare(
            "SELECT candle_time, open, high, low, close, volume FROM {$this->table('candles')} WHERE user_id = %d AND symbol = %s AND timeframe = %s AND source = %s ORDER BY candle_time ASC",
            $user_id,
            $symbol,
            '1min',
            'mt5'
        ), ARRAY_A);

        if (empty($m1_rows)) {
            return array();
        }

        $buckets = array();
        $now = time();
        foreach ($m1_rows as $row) {
            $ts = strtotime($row['candle_time'] . ' UTC');
            if ($ts === false) {
                continue;
            }

            $bucket_start = (int) (floor($ts / $tf_seconds) * $tf_seconds);
            if (($bucket_start + $tf_seconds) > $now) {
                continue;
            }

            if (!isset($buckets[$bucket_start])) {
                $buckets[$bucket_start] = array(
                    'time' => gmdate('c', $bucket_start),
                    'open' => (float) $row['open'],
                    'high' => (float) $row['high'],
                    'low' => (float) $row['low'],
                    'close' => (float) $row['close'],
                    'volume' => isset($row['volume']) ? (int) $row['volume'] : 0,
                );
                continue;
            }

            $buckets[$bucket_start]['high'] = max($buckets[$bucket_start]['high'], (float) $row['high']);
            $buckets[$bucket_start]['low'] = min($buckets[$bucket_start]['low'], (float) $row['low']);
            $buckets[$bucket_start]['close'] = (float) $row['close'];
            $buckets[$bucket_start]['volume'] += isset($row['volume']) ? (int) $row['volume'] : 0;
        }

        if (empty($buckets)) {
            return array();
        }

        ksort($buckets);
        return array_slice(array_values($buckets), -1 * max(1, (int) $outputsize));
    }

    public function validate_twelve_key($api_key) {
        $url = add_query_arg(array(
            'symbol' => 'EUR/USD',
            'apikey' => $api_key,
        ), 'https://api.twelvedata.com/quote');
        $response = wp_remote_get($url, array('timeout' => 12));

        if (is_wp_error($response)) {
            return array('ok' => false, 'status' => 'blocked', 'message' => $response->get_error_message());
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);
        if ($code === 429 || (isset($body['code']) && (int) $body['code'] === 429)) {
            return array('ok' => false, 'status' => 'rate-limited', 'message' => 'Twelve Data rate limit reached.');
        }
        // Check 5xx BEFORE checking body['status'] — same ordering fix as fetch_quote.
        if ($code >= 500) {
            return array('ok' => false, 'status' => 'blocked', 'message' => 'Twelve Data service unavailable. Try again shortly.');
        }
        if ($code >= 400 || (isset($body['status']) && $body['status'] === 'error')) {
            return array('ok' => false, 'status' => 'invalid', 'message' => isset($body['message']) ? $body['message'] : 'Invalid Twelve Data key.');
        }

        return array('ok' => true, 'status' => 'ok');
    }

    public function get_settings($user_id) {
        global $wpdb;

        $default = array(
            'backendUrl' => rest_url(),
            'apiKeyStatus' => $this->get_twelve_key_status($user_id),
            'refreshIntervalSec' => 2,
            'staleThresholdSec' => 60,
            'watchlist' => array('GBPUSD', 'AUDUSD', 'EURUSD', 'NZDUSD', 'USDJPY', 'AUDJPY', 'EURJPY', 'XAUUSD'),
            'riskAllocation' => array('perTradePct' => 0.5, 'dailyMaxPct' => 2.0, 'ddCapPct' => 6.0),
            'signalBoardSize' => 3,
        );

        $row = $wpdb->get_var($wpdb->prepare(
            "SELECT settings FROM {$this->table('user_settings')} WHERE user_id = %d",
            $user_id
        ));
        if ($row) {
            $stored = json_decode($row, true);
            if (is_array($stored)) {
                $default = array_merge($default, $stored);
            }
        }
        $default['apiKeyStatus'] = $this->get_twelve_key_status($user_id);
        $default['watchlist'] = $this->validate_watchlist_symbols($default['watchlist']);

        return $default;
    }

    public function get_risk_profile($user_id) {
        $blob = $this->get_account_blob($user_id);
        if (!empty($blob['riskProfile'])) {
            return $blob['riskProfile'];
        }

        return array(
            'tier' => 'balanced',
            'maxConcurrentTrades' => 3,
            'perTradePct' => 0.5,
            'dailyMaxPct' => 2.0,
            'ddCapPct' => 6.0,
            'cooldownMin' => 30,
            'updatedAt' => gmdate('c'),
        );
    }

    public function get_account_state($user_id) {
        $blob = $this->get_account_blob($user_id);
        $positions = $this->read_trade_payloads($user_id, 'position');
        $orders = $this->read_pending_orders($user_id);

        // Use the account-specific timestamp written only by post_user_account() so that
        // risk-profile saves (which share the same blob row) cannot falsely mark account live.
        $account_updated = !empty($blob['account']['updatedAt']) ? $blob['account']['updatedAt'] : null;
        $snap_age = $account_updated ? (time() - strtotime($account_updated)) : PHP_INT_MAX;
        $account_state = $snap_age <= 300 ? 'live' : 'stale';

        $default = array(
            'balanceUSC' => 0,
            'equityUSC' => 0,
            'marginUsedPct' => 0,
            'drawdownPct' => 0,
            'openPositions' => count($positions),
            'pendingOrders' => count($orders),
            'todayPnlUSC' => 0,
            'todayPnlPct' => 0,
            'state' => $account_state,
        );
        if (!empty($blob['account']) && is_array($blob['account'])) {
            $default = array_merge($default, $blob['account']);
        }
        $default['openPositions'] = count($positions);
        $default['pendingOrders'] = count($orders);
        $default['state'] = $account_state;

        return $default;
    }

    public function read_user_progress(int $user_id): array {
        return array(
            'equity_pulse' => $this->read_progress_equity_pulse($user_id),
            'streak' => $this->read_progress_streak($user_id),
            'milestones' => $this->read_progress_milestones($user_id),
            'generated_at' => gmdate('c'),
        );
    }

    public function get_account_blob($user_id) {
        global $wpdb;
        $row = $wpdb->get_var($wpdb->prepare(
            "SELECT data FROM {$this->table('account_snapshots')} WHERE user_id = %d",
            $user_id
        ));
        $decoded = $row ? json_decode($row, true) : array();
        return is_array($decoded) ? $decoded : array();
    }

    public function read_trade_payloads($user_id, $kind) {
        global $wpdb;
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT payload FROM {$this->table('trades')} WHERE user_id = %d AND kind = %s ORDER BY created_at DESC",
            $user_id,
            $kind
        ), ARRAY_A);
        return array_values(array_filter(array_map(function ($row) {
            $payload = json_decode($row['payload'], true);
            return is_array($payload) ? $payload : null;
        }, $rows)));
    }

    public function read_pending_orders($user_id) {
        global $wpdb;
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT payload FROM {$this->table('trade_queue')} WHERE user_id = %d AND state = 'pending-sync' ORDER BY created_at DESC",
            $user_id
        ), ARRAY_A);
        return array_values(array_filter(array_map(function ($row) {
            $payload = json_decode($row['payload'], true);
            return is_array($payload) ? $payload : null;
        }, $rows)));
    }

    public function has_phase2_trade_telemetry_payload(array $payload): bool {
        return array_key_exists('schema_version', $payload)
            || array_key_exists('positions', $payload)
            || array_key_exists('pending_orders', $payload)
            || array_key_exists('account_metrics', $payload)
            || array_key_exists('account_id', $payload)
            || array_key_exists('terminal_id', $payload);
    }

    public function persist_phase2_trade_telemetry(WP_REST_Request $request, array $payload, int $user_id) {
        global $wpdb;

        if (!self::ensure_trade_telemetry_tables()) {
            $detail = $this->wpdb_last_error();
            $this->audit($user_id, 'ea.trade_telemetry.rejected', array(
                'reason' => 'table_init_failed',
                'detail' => $detail !== null ? $detail : 'dbDelta unavailable',
            ));
            return new WP_Error(
                'smc_sf_trade_telemetry_table_init_failed',
                'Could not initialize Phase 2 trade telemetry storage.',
                array('status' => 500)
            );
        }

        $schema_version = $this->sanitize_ea_text($payload['schema_version'] ?? '', 64);
        if ($schema_version === '') {
            $this->audit($user_id, 'ea.trade_telemetry.rejected', array('reason' => 'missing_schema_version'));
            return new WP_Error(
                'smc_sf_trade_telemetry_schema_required',
                'schema_version is required for Phase 2 trade telemetry payloads.',
                array('status' => 400)
            );
        }

        if (!isset($payload['positions']) || !is_array($payload['positions'])) {
            $this->audit($user_id, 'ea.trade_telemetry.rejected', array('reason' => 'positions_missing_or_invalid'));
            return new WP_Error('smc_sf_trade_telemetry_positions_required', 'positions[] is required.', array('status' => 400));
        }
        if (!isset($payload['pending_orders']) || !is_array($payload['pending_orders'])) {
            $this->audit($user_id, 'ea.trade_telemetry.rejected', array('reason' => 'pending_orders_missing_or_invalid'));
            return new WP_Error('smc_sf_trade_telemetry_orders_required', 'pending_orders[] is required.', array('status' => 400));
        }
        if (!isset($payload['account_metrics']) || !is_array($payload['account_metrics'])) {
            $this->audit($user_id, 'ea.trade_telemetry.rejected', array('reason' => 'account_metrics_missing_or_invalid'));
            return new WP_Error('smc_sf_trade_telemetry_account_required', 'account_metrics is required.', array('status' => 400));
        }

        $account_id = $this->sanitize_ea_text($this->ea_request_value($request, $payload, 'account_id', ''), 64);
        $terminal_id = $this->sanitize_ea_text($this->ea_request_value($request, $payload, 'terminal_id', ''), 96);
        if ($account_id === '' || $terminal_id === '') {
            $this->audit($user_id, 'ea.trade_telemetry.rejected', array(
                'reason' => 'missing_account_identity',
                'account_id' => $account_id,
                'terminal_id' => $terminal_id,
            ));
            return new WP_Error(
                'smc_sf_trade_telemetry_identity_required',
                'account_id and terminal_id are required for Phase 2 trade telemetry.',
                array('status' => 400)
            );
        }

        $ea_version = $this->sanitize_ea_text($this->ea_request_value($request, $payload, 'ea_version', ''), 64);
        $seen_at = $this->normalize_market_timestamp(
            $this->ea_request_value($request, $payload, 'timestamp', gmdate('c')),
            $this->now_mysql()
        );
        $updated_at = $this->now_mysql();

        $account_metrics = $this->build_account_telemetry_record(
            $user_id,
            $account_id,
            $terminal_id,
            $payload['account_metrics'],
            $ea_version,
            $seen_at,
            $updated_at
        );
        if (is_wp_error($account_metrics)) {
            return $account_metrics;
        }

        $positions = array();
        foreach ($payload['positions'] as $index => $position_payload) {
            if (!is_array($position_payload)) {
                $this->audit($user_id, 'ea.trade_telemetry.rejected', array(
                    'reason' => 'position_not_object',
                    'index' => $index,
                ));
                return new WP_Error('smc_sf_trade_telemetry_position_invalid', 'Each positions[] entry must be an object.', array('status' => 400));
            }
            $record = $this->build_trade_position_record(
                $user_id,
                $account_id,
                $terminal_id,
                $position_payload,
                $ea_version,
                $seen_at,
                $updated_at
            );
            if (is_wp_error($record)) {
                return $record;
            }
            $positions[] = $record;
        }

        $orders = array();
        foreach ($payload['pending_orders'] as $index => $order_payload) {
            if (!is_array($order_payload)) {
                $this->audit($user_id, 'ea.trade_telemetry.rejected', array(
                    'reason' => 'order_not_object',
                    'index' => $index,
                ));
                return new WP_Error('smc_sf_trade_telemetry_order_invalid', 'Each pending_orders[] entry must be an object.', array('status' => 400));
            }
            $record = $this->build_trade_order_record(
                $user_id,
                $account_id,
                $terminal_id,
                $order_payload,
                $ea_version,
                $seen_at,
                $updated_at
            );
            if (is_wp_error($record)) {
                return $record;
            }
            $orders[] = $record;
        }

        $account_saved = $wpdb->replace(
            $this->table('account_telemetry'),
            $account_metrics,
            array('%d', '%s', '%s', '%f', '%f', '%f', '%f', '%f', '%f', '%s', '%d', '%s', '%s', '%s', '%s')
        );
        if ($account_saved === false) {
            return new WP_Error('smc_sf_trade_telemetry_account_write_failed', 'Could not persist account telemetry.', array('status' => 500));
        }

        $positions_upserted = 0;
        foreach ($positions as $record) {
            $saved = $wpdb->replace(
                $this->table('trade_positions'),
                $record,
                array('%s', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%f', '%f', '%f', '%f', '%f', '%f', '%f', '%f', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s')
            );
            if ($saved === false) {
                return new WP_Error('smc_sf_trade_telemetry_position_write_failed', 'Could not persist trade positions.', array('status' => 500));
            }
            $positions_upserted++;
        }

        $orders_upserted = 0;
        foreach ($orders as $record) {
            $saved = $wpdb->replace(
                $this->table('trade_orders'),
                $record,
                array('%s', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%f', '%f', '%f', '%f', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s')
            );
            if ($saved === false) {
                return new WP_Error('smc_sf_trade_telemetry_order_write_failed', 'Could not persist trade orders.', array('status' => 500));
            }
            $orders_upserted++;
        }

        $positions_swept = $this->sweep_absent_trade_rows(
            'trade_positions',
            'position_id',
            'open',
            'closed',
            $user_id,
            $account_id,
            $terminal_id,
            array_map(function ($record) {
                return $record['position_id'];
            }, $positions),
            'ea.trade_telemetry.position_swept'
        );
        $orders_swept = $this->sweep_absent_trade_rows(
            'trade_orders',
            'order_id',
            'active',
            'inactive',
            $user_id,
            $account_id,
            $terminal_id,
            array_map(function ($record) {
                return $record['order_id'];
            }, $orders),
            'ea.trade_telemetry.order_swept'
        );

        $this->audit($user_id, 'ea.trade_telemetry.batch_seen', array(
            'schema_version' => $schema_version,
            'account_id' => $account_id,
            'terminal_id' => $terminal_id,
            'positions_received' => count($positions),
            'pending_orders_received' => count($orders),
            'last_seen_at' => $this->to_iso($seen_at),
        ));

        return array(
            'account_telemetry_upserted' => 1,
            'positions_upserted' => $positions_upserted,
            'orders_upserted' => $orders_upserted,
            'positions_swept' => $positions_swept,
            'orders_swept' => $orders_swept,
        );
    }

    private function build_account_telemetry_record(
        int $user_id,
        string $account_id,
        string $terminal_id,
        array $metrics,
        string $ea_version,
        string $seen_at,
        string $updated_at
    ) {
        foreach (array('balance', 'equity', 'margin', 'free_margin', 'floating_pl') as $required_key) {
            if (!array_key_exists($required_key, $metrics)) {
                $this->audit($user_id, 'ea.trade_telemetry.rejected', array(
                    'reason' => 'account_metrics_missing_field',
                    'field' => $required_key,
                ));
                return new WP_Error(
                    'smc_sf_trade_telemetry_account_invalid',
                    'account_metrics is missing required field ' . $required_key . '.',
                    array('status' => 400)
                );
            }
        }

        return array(
            'user_id' => $user_id,
            'account_id' => $account_id,
            'terminal_id' => $terminal_id,
            'balance' => $this->sanitize_ea_number($metrics['balance']),
            'equity' => $this->sanitize_ea_number($metrics['equity']),
            'margin' => $this->sanitize_ea_number($metrics['margin']),
            'free_margin' => $this->sanitize_ea_number($metrics['free_margin']),
            'margin_level' => $this->sanitize_ea_number($metrics['margin_level'] ?? 0),
            'floating_pl' => $this->sanitize_ea_number($metrics['floating_pl']),
            'currency' => $this->sanitize_ea_text($metrics['currency'] ?? '', 32),
            'leverage' => $this->sanitize_ea_int($metrics['leverage'] ?? 0),
            'ea_version' => $ea_version,
            'last_seen_at' => $seen_at,
            'updated_at' => $updated_at,
            'raw_json' => wp_json_encode($metrics),
        );
    }

    private function build_trade_position_record(
        int $user_id,
        string $account_id,
        string $terminal_id,
        array $position,
        string $ea_version,
        string $seen_at,
        string $updated_at
    ) {
        foreach (array('position_id', 'symbol', 'direction', 'entry_price', 'sl', 'tp', 'volume', 'opened_at', 'state') as $required_key) {
            if (!array_key_exists($required_key, $position)) {
                $this->audit($user_id, 'ea.trade_telemetry.rejected', array(
                    'reason' => 'position_missing_field',
                    'field' => $required_key,
                    'position' => $position,
                ));
                return new WP_Error(
                    'smc_sf_trade_telemetry_position_invalid',
                    'positions[] is missing required field ' . $required_key . '.',
                    array('status' => 400)
                );
            }
        }

        $symbol = $this->sanitize_ea_text($position['symbol'], 96);
        $normalized_symbol = $this->sanitize_ea_text($position['normalized_symbol'] ?? $this->map_symbol_aliases($symbol), 64);
        $position_id = $this->sanitize_ea_text($position['position_id'], 64);

        return array(
            'deterministic_key' => sprintf('position:%d:%s:%s:%s', $user_id, $account_id, $terminal_id, $position_id),
            'user_id' => $user_id,
            'account_id' => $account_id,
            'terminal_id' => $terminal_id,
            'position_id' => $position_id,
            'symbol' => $symbol,
            'normalized_symbol' => $normalized_symbol,
            'direction' => $this->sanitize_ea_text($position['direction'], 32),
            'entry_price' => $this->sanitize_ea_number($position['entry_price']),
            'current_price' => $this->sanitize_ea_number($position['current_price'] ?? 0),
            'sl' => $this->sanitize_ea_number($position['sl']),
            'tp' => $this->sanitize_ea_number($position['tp']),
            'volume' => $this->sanitize_ea_number($position['volume']),
            'profit' => $this->sanitize_ea_number($position['profit'] ?? 0),
            'swap' => $this->sanitize_ea_number($position['swap'] ?? 0),
            'commission' => $this->sanitize_ea_number($position['commission'] ?? 0),
            'magic' => $this->sanitize_ea_int($position['magic'] ?? 0),
            'comment' => $this->sanitize_ea_text($position['comment'] ?? '', 191),
            'opened_at' => $this->normalize_market_timestamp($position['opened_at'], $seen_at),
            'state' => 'open',
            'ea_version' => $ea_version,
            'last_seen_at' => $seen_at,
            'updated_at' => $updated_at,
            'raw_json' => wp_json_encode($position),
        );
    }

    private function build_trade_order_record(
        int $user_id,
        string $account_id,
        string $terminal_id,
        array $order,
        string $ea_version,
        string $seen_at,
        string $updated_at
    ) {
        foreach (array('order_id', 'symbol', 'order_type', 'direction', 'entry_price', 'sl', 'tp', 'volume', 'placed_at', 'state') as $required_key) {
            if (!array_key_exists($required_key, $order)) {
                $this->audit($user_id, 'ea.trade_telemetry.rejected', array(
                    'reason' => 'order_missing_field',
                    'field' => $required_key,
                    'order' => $order,
                ));
                return new WP_Error(
                    'smc_sf_trade_telemetry_order_invalid',
                    'pending_orders[] is missing required field ' . $required_key . '.',
                    array('status' => 400)
                );
            }
        }

        $symbol = $this->sanitize_ea_text($order['symbol'], 96);
        $normalized_symbol = $this->sanitize_ea_text($order['normalized_symbol'] ?? $this->map_symbol_aliases($symbol), 64);
        $order_id = $this->sanitize_ea_text($order['order_id'], 64);

        return array(
            'deterministic_key' => sprintf('order:%d:%s:%s:%s', $user_id, $account_id, $terminal_id, $order_id),
            'user_id' => $user_id,
            'account_id' => $account_id,
            'terminal_id' => $terminal_id,
            'order_id' => $order_id,
            'symbol' => $symbol,
            'normalized_symbol' => $normalized_symbol,
            'order_type' => $this->sanitize_ea_text($order['order_type'], 32),
            'direction' => $this->sanitize_ea_text($order['direction'], 32),
            'entry_price' => $this->sanitize_ea_number($order['entry_price']),
            'sl' => $this->sanitize_ea_number($order['sl']),
            'tp' => $this->sanitize_ea_number($order['tp']),
            'volume' => $this->sanitize_ea_number($order['volume']),
            'magic' => $this->sanitize_ea_int($order['magic'] ?? 0),
            'comment' => $this->sanitize_ea_text($order['comment'] ?? '', 191),
            'placed_at' => $this->normalize_market_timestamp($order['placed_at'], $seen_at),
            'state' => 'active',
            'ea_version' => $ea_version,
            'last_seen_at' => $seen_at,
            'updated_at' => $updated_at,
            'raw_json' => wp_json_encode($order),
        );
    }

    private function sweep_absent_trade_rows(
        string $table_name,
        string $id_field,
        string $active_state,
        string $inactive_state,
        int $user_id,
        string $account_id,
        string $terminal_id,
        array $current_ids,
        string $audit_event
    ): int {
        global $wpdb;

        $existing_rows = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$this->table($table_name)} WHERE user_id = %d AND account_id = %s AND terminal_id = %s AND state = %s",
            $user_id,
            $account_id,
            $terminal_id,
            $active_state
        ), ARRAY_A);

        $active_ids = array_values(array_filter(array_map('strval', $current_ids), function ($value) {
            return $value !== '';
        }));
        $swept = 0;

        foreach ($existing_rows as $row) {
            $row_id = (string) ($row[$id_field] ?? '');
            if ($row_id === '' || in_array($row_id, $active_ids, true)) {
                continue;
            }

            $updated = $wpdb->update(
                $this->table($table_name),
                array(
                    'state' => $inactive_state,
                    'updated_at' => $this->now_mysql(),
                ),
                array(
                    'deterministic_key' => $row['deterministic_key'],
                ),
                array('%s', '%s'),
                array('%s')
            );

            if ($updated !== false) {
                $swept++;
                $this->audit($user_id, $audit_event, array(
                    $id_field => $row_id,
                    'account_id' => $account_id,
                    'terminal_id' => $terminal_id,
                    'reason' => 'absent_from_fresh_batch',
                ));
            }
        }

        return $swept;
    }

    public function read_account_telemetry(int $user_id): array {
        global $wpdb;

        if (!self::ensure_trade_telemetry_tables()) {
            return array(
                'balance' => 0,
                'equity' => 0,
                'margin' => 0,
                'free_margin' => 0,
                'margin_level' => 0,
                'floating_pl' => 0,
                'currency' => '',
                'leverage' => 0,
                'account_id' => '',
                'terminal_id' => '',
                'ea_version' => '',
                'last_seen_at' => null,
                'updated_at' => null,
                'freshness' => 'unavailable',
            );
        }

        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$this->table('account_telemetry')} WHERE user_id = %d",
            $user_id
        ), ARRAY_A);

        if (empty($rows)) {
            return array(
                'balance' => 0,
                'equity' => 0,
                'margin' => 0,
                'free_margin' => 0,
                'margin_level' => 0,
                'floating_pl' => 0,
                'currency' => '',
                'leverage' => 0,
                'account_id' => '',
                'terminal_id' => '',
                'ea_version' => '',
                'last_seen_at' => null,
                'updated_at' => null,
                'freshness' => 'unavailable',
            );
        }

        usort($rows, function ($left, $right) {
            return strcmp((string) ($right['last_seen_at'] ?? ''), (string) ($left['last_seen_at'] ?? ''));
        });

        $row = $rows[0];
        return array(
            'account_id' => (string) ($row['account_id'] ?? ''),
            'terminal_id' => (string) ($row['terminal_id'] ?? ''),
            'balance' => (float) ($row['balance'] ?? 0),
            'equity' => (float) ($row['equity'] ?? 0),
            'margin' => (float) ($row['margin'] ?? 0),
            'free_margin' => (float) ($row['free_margin'] ?? 0),
            'margin_level' => (float) ($row['margin_level'] ?? 0),
            'floating_pl' => (float) ($row['floating_pl'] ?? 0),
            'currency' => (string) ($row['currency'] ?? ''),
            'leverage' => (int) ($row['leverage'] ?? 0),
            'ea_version' => (string) ($row['ea_version'] ?? ''),
            'last_seen_at' => $this->to_iso($row['last_seen_at'] ?? null),
            'updated_at' => $this->to_iso($row['updated_at'] ?? null),
            'freshness' => $this->telemetry_freshness_state($row['last_seen_at'] ?? null),
        );
    }

    private function read_progress_equity_pulse(int $user_id): array {
        $telemetry = $this->read_account_telemetry($user_id);
        $account_blob = $this->get_account_blob($user_id);
        $today_pnl = 0.0;
        if (isset($account_blob['account']) && is_array($account_blob['account'])) {
            $today_pnl = (float) ($account_blob['account']['todayPnlUSC'] ?? 0);
        }

        return array(
            'equity_usc' => (float) ($telemetry['equity'] ?? 0),
            'today_pnl_usc' => $today_pnl,
            'state' => $this->progress_state_from_freshness((string) ($telemetry['freshness'] ?? 'unavailable')),
        );
    }

    private function read_progress_streak(int $user_id): array {
        global $wpdb;
        $table = $this->table('engine_runs');

        // Fetch only completed engine run records for this user (historical backfill included).
        // Heartbeat rows do not satisfy the active-day contract.
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE user_id = %d AND status = %s ORDER BY created_at DESC",
                $user_id,
                'complete'
            ),
            ARRAY_A
        );

        if (empty($rows)) {
            // No run data at all — streak is genuinely unavailable, not just zero.
            return array(
                'current_streak_days' => 0,
                'last_active_date'    => null,
                'state'               => 'UNAVAILABLE',
            );
        }

        // Collect distinct UTC calendar dates and track the most recent timestamp.
        $run_dates      = array();
        $last_active_at = null;
        foreach ($rows as $row) {
            $ts = strtotime(($row['created_at'] ?? '') . ' UTC');
            if (!$ts) {
                continue;
            }
            $date             = gmdate('Y-m-d', $ts);
            $run_dates[$date] = true;
            if ($last_active_at === null || strcmp((string) ($row['created_at'] ?? ''), $last_active_at) > 0) {
                $last_active_at = (string) $row['created_at'];
            }
        }

        if (empty($run_dates)) {
            return array(
                'current_streak_days' => 0,
                'last_active_date'    => null,
                'state'               => 'UNAVAILABLE',
            );
        }

        // Count consecutive calendar days ending today (UTC).
        // Definition: CALENDAR_DAY_WITH_ANY_COMPLETED_ENGINE_RUN.
        $streak = 0;
        $check  = gmdate('Y-m-d');
        while (isset($run_dates[$check])) {
            $streak++;
            $check = gmdate('Y-m-d', strtotime($check . ' -1 day'));
        }

        // Audit log: record which definition constant produced this streak result.
        // Visible in server logs when WP_DEBUG_LOG is enabled.
        if (defined('WP_DEBUG_LOG') && WP_DEBUG_LOG) {
            error_log(sprintf(
                '[SMC SuperFIB] streak computed for user %d: days=%d state=LIVE definition=%s',
                $user_id,
                $streak,
                self::ACTIVE_DAY_DEFINITION
            ));
        }

        return array(
            'current_streak_days' => $streak,
            'last_active_date'    => $last_active_at !== null
                ? gmdate('Y-m-d', strtotime($last_active_at . ' UTC'))
                : null,
            'state'               => 'LIVE',
        );
    }

    private function read_progress_milestones(int $user_id): array {
        $heartbeat_seen = $this->has_engine_heartbeat_source($user_id, 'explicit_heartbeat');
        $market_stream_seen = $this->has_engine_heartbeat_source($user_id, 'ea_push');
        $trade_telemetry_seen = $this->has_any_trade_telemetry($user_id);
        $latest_engine_activity = $this->latest_timestamp('engine_runs', $user_id, 'created_at');
        $latest_trade_telemetry = $this->latest_trade_telemetry_seen_at($user_id);
        $latest_source = $this->max_mysql_timestamp($latest_engine_activity, $latest_trade_telemetry);

        if (!$heartbeat_seen && !$market_stream_seen && !$trade_telemetry_seen) {
            $state = 'UNAVAILABLE';
        } elseif ($latest_source !== null && $this->telemetry_freshness_state($latest_source) === 'stale') {
            $state = 'STALE';
        } else {
            $state = 'LIVE';
        }

        return array(
            'first_heartbeat' => $heartbeat_seen,
            'first_market_stream' => $market_stream_seen,
            'first_trade_telemetry' => $trade_telemetry_seen,
            'state' => $state,
        );
    }

    private function resolve_active_trade_identity(int $user_id): array {
        global $wpdb;

        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT account_id, terminal_id FROM {$this->table('account_telemetry')} WHERE user_id = %d ORDER BY last_seen_at DESC, updated_at DESC, id DESC LIMIT 1",
            $user_id
        ), ARRAY_A);

        if (!is_array($row)) {
            return array('account_id' => '', 'terminal_id' => '');
        }

        return array(
            'account_id' => (string) ($row['account_id'] ?? ''),
            'terminal_id' => (string) ($row['terminal_id'] ?? ''),
        );
    }

    public function read_trade_positions(int $user_id): array {
        global $wpdb;

        if (!self::ensure_trade_telemetry_tables()) {
            return array();
        }

        $identity = $this->resolve_active_trade_identity($user_id);
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$this->table('trade_positions')} WHERE user_id = %d AND account_id = %s AND terminal_id = %s AND state = %s",
            $user_id,
            $identity['account_id'],
            $identity['terminal_id'],
            'open'
        ), ARRAY_A);

        return array_values(array_map(function ($row) {
            return array(
                'position_id' => (string) ($row['position_id'] ?? ''),
                'symbol' => (string) (($row['normalized_symbol'] ?? '') !== '' ? $row['normalized_symbol'] : ($row['symbol'] ?? '')),
                'normalized_symbol' => (string) (($row['normalized_symbol'] ?? '') !== '' ? $row['normalized_symbol'] : ($row['symbol'] ?? '')),
                'direction' => $this->normalize_trade_direction_for_read($row['direction'] ?? ''),
                'entry_price' => (float) ($row['entry_price'] ?? 0),
                'current_price' => (float) ($row['current_price'] ?? 0),
                'sl' => (float) ($row['sl'] ?? 0),
                'tp' => (float) ($row['tp'] ?? 0),
                'volume' => (float) ($row['volume'] ?? 0),
                'profit' => (float) ($row['profit'] ?? 0),
                'swap' => (float) ($row['swap'] ?? 0),
                'commission' => (float) ($row['commission'] ?? 0),
                'magic' => (int) ($row['magic'] ?? 0),
                'comment' => (string) ($row['comment'] ?? ''),
                'opened_at' => $this->to_iso($row['opened_at'] ?? null),
                'state' => 'open',
                'freshness' => $this->telemetry_freshness_state($row['last_seen_at'] ?? null),
                'account_id' => (string) ($row['account_id'] ?? ''),
                'terminal_id' => (string) ($row['terminal_id'] ?? ''),
                'ea_version' => (string) ($row['ea_version'] ?? ''),
                'last_seen_at' => $this->to_iso($row['last_seen_at'] ?? null),
                'updated_at' => $this->to_iso($row['updated_at'] ?? null),
            );
        }, is_array($rows) ? $rows : array()));
    }

    public function read_trade_orders(int $user_id): array {
        global $wpdb;

        if (!self::ensure_trade_telemetry_tables()) {
            return array();
        }

        $identity = $this->resolve_active_trade_identity($user_id);
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$this->table('trade_orders')} WHERE user_id = %d AND account_id = %s AND terminal_id = %s AND state = %s",
            $user_id,
            $identity['account_id'],
            $identity['terminal_id'],
            'active'
        ), ARRAY_A);

        return array_values(array_map(function ($row) {
            return array(
                'order_id' => (string) ($row['order_id'] ?? ''),
                'symbol' => (string) (($row['normalized_symbol'] ?? '') !== '' ? $row['normalized_symbol'] : ($row['symbol'] ?? '')),
                'normalized_symbol' => (string) (($row['normalized_symbol'] ?? '') !== '' ? $row['normalized_symbol'] : ($row['symbol'] ?? '')),
                'order_type' => (string) ($row['order_type'] ?? ''),
                'direction' => $this->normalize_trade_direction_for_read($row['direction'] ?? ''),
                'entry_price' => (float) ($row['entry_price'] ?? 0),
                'sl' => (float) ($row['sl'] ?? 0),
                'tp' => (float) ($row['tp'] ?? 0),
                'volume' => (float) ($row['volume'] ?? 0),
                'magic' => (int) ($row['magic'] ?? 0),
                'comment' => (string) ($row['comment'] ?? ''),
                'placed_at' => $this->to_iso($row['placed_at'] ?? null),
                'state' => 'active',
                'freshness' => $this->telemetry_freshness_state($row['last_seen_at'] ?? null),
                'account_id' => (string) ($row['account_id'] ?? ''),
                'terminal_id' => (string) ($row['terminal_id'] ?? ''),
                'ea_version' => (string) ($row['ea_version'] ?? ''),
                'last_seen_at' => $this->to_iso($row['last_seen_at'] ?? null),
                'updated_at' => $this->to_iso($row['updated_at'] ?? null),
            );
        }, is_array($rows) ? $rows : array()));
    }

    private function normalize_trade_direction_for_read($direction): string {
        $value = strtoupper(trim((string) $direction));
        if (in_array($value, array('BUY', 'BUY_LIMIT', 'BUY_STOP', 'BUY_STOP_LIMIT'), true)) {
            return 'LONG';
        }
        if (in_array($value, array('SELL', 'SELL_LIMIT', 'SELL_STOP', 'SELL_STOP_LIMIT'), true)) {
            return 'SHORT';
        }
        return $value !== '' ? $value : 'LONG';
    }

    private function telemetry_freshness_state($last_seen_at): string {
        if (!$last_seen_at) {
            return 'unavailable';
        }

        return (time() - strtotime((string) $last_seen_at . ' UTC')) <= 300 ? 'live' : 'stale';
    }

    private function progress_state_from_freshness(string $freshness): string {
        if ($freshness === 'live') {
            return 'LIVE';
        }
        if ($freshness === 'stale') {
            return 'STALE';
        }
        return 'UNAVAILABLE';
    }

    private function has_engine_heartbeat_source(int $user_id, string $source): bool {
        global $wpdb;

        $escaped_source = method_exists($wpdb, 'esc_like')
            ? $wpdb->esc_like($source)
            : addcslashes($source, '\\%_');

        $match = $wpdb->get_var($wpdb->prepare(
            "SELECT 1 FROM {$this->table('engine_runs')}
             WHERE user_id = %d
               AND status = %s
               AND summary LIKE %s
             LIMIT 1",
            $user_id,
            'heartbeat',
            '%"source":"' . $escaped_source . '"%'
        ));

        if ($match !== null) {
            return true;
        }

        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$this->table('engine_runs')} WHERE user_id = %d AND status = %s",
            $user_id,
            'heartbeat'
        ), ARRAY_A);

        foreach (is_array($rows) ? $rows : array() as $row) {
            $summary = json_decode((string) ($row['summary'] ?? ''), true);
            if (is_array($summary) && (string) ($summary['source'] ?? '') === $source) {
                return true;
            }
        }

        return false;
    }

    private function has_any_trade_telemetry(int $user_id): bool {
        return $this->latest_trade_telemetry_seen_at($user_id) !== null;
    }

    private function latest_trade_telemetry_seen_at(int $user_id): ?string {
        global $wpdb;

        if (!self::ensure_trade_telemetry_tables()) {
            return null;
        }

        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$this->table('account_telemetry')} WHERE user_id = %d",
            $user_id
        ), ARRAY_A);

        $latest = null;
        foreach (is_array($rows) ? $rows : array() as $row) {
            $candidate = (string) ($row['last_seen_at'] ?? '');
            if ($candidate !== '' && ($latest === null || strcmp($candidate, $latest) > 0)) {
                $latest = $candidate;
            }
        }

        return $latest;
    }

    private function max_mysql_timestamp(?string $left, ?string $right): ?string {
        if ($left === null || $left === '') {
            return $right !== '' ? $right : null;
        }
        if ($right === null || $right === '') {
            return $left;
        }
        return strcmp($left, $right) >= 0 ? $left : $right;
    }

    public function get_engine_snapshot($user_id) {
        $snapshot = get_user_meta($user_id, 'smc_sf_engine_snapshot', true);
        return is_array($snapshot) ? $snapshot : null;
    }

    private function apply_closed_session_price_states(array $prices, array $diagnostics): array {
        $closed_symbols = array();
        foreach ($diagnostics as $diagnostic) {
            if (!is_array($diagnostic)) {
                continue;
            }
            $symbol = strtoupper((string) ($diagnostic['symbol'] ?? ''));
            if ($symbol !== '' && ($diagnostic['priceState'] ?? '') === 'closed_session') {
                $closed_symbols[$symbol] = true;
            }
        }

        if (empty($closed_symbols)) {
            return $prices;
        }

        foreach ($prices as &$price) {
            if (!is_array($price)) {
                continue;
            }
            $symbol = strtoupper((string) ($price['symbol'] ?? ''));
            if (isset($closed_symbols[$symbol])) {
                $price['state'] = 'closed_session';
            }
        }
        unset($price);

        return $prices;
    }

    public function ensure_engine_snapshot($user_id, $force = false, &$was_computed = null) {
        $was_computed = false;
        $settings = $this->get_settings($user_id);
        $symbols = $settings['watchlist'];
        $snapshot = $this->get_engine_snapshot($user_id);

        if (
            !$force &&
            $this->is_engine_snapshot_current(
                $snapshot,
                $symbols,
                (int) $settings['refreshIntervalSec'],
                (int) $settings['staleThresholdSec']
            )
        ) {
            return $snapshot;
        }

        $prices = $this->refresh_prices($user_id, $symbols);
        $engine = $this->run_engine_for_symbols($user_id, $symbols, $prices, $force);
        $prices = $this->apply_closed_session_price_states($prices, $engine['diagnostics'] ?? array());
        $snapshot = array(
            'prices' => $prices,
            'regimes' => $engine['regimes'],
            'gates' => $engine['gates'],
            'signals' => $engine['signals'],
            'candidateSignals' => is_array($engine['candidateSignals'] ?? null) ? $engine['candidateSignals'] : array(),
            'plans' => $engine['plans'],
            'diagnostics' => $engine['diagnostics'] ?? array(),
            'meta' => array(
                'computedAt' => gmdate('c'),
                'watchlist' => $symbols,
            ),
        );
        $this->save_engine_snapshot($user_id, $snapshot);
        $was_computed = true;

        return $snapshot;
    }

    private function save_engine_snapshot($user_id, $snapshot) {
        if (!is_array($snapshot)) {
            return false;
        }
        update_user_meta($user_id, 'smc_sf_engine_snapshot', $snapshot);
        return true;
    }

    public function delete_engine_snapshot($user_id) {
        delete_user_meta($user_id, 'smc_sf_engine_snapshot');
        error_log("SMC_SF: engine snapshot invalidated for user {$user_id}");
    }

    public function invalidate_watchlist_snapshot_if_changed($user_id, $previous_watchlist, $next_watchlist, $context) {
        if ($previous_watchlist !== $next_watchlist) {
            $this->delete_engine_snapshot($user_id);
            return true;
        }

        $this->log_watchlist_snapshot_skip($user_id, $context);
        return false;
    }

    public function log_watchlist_snapshot_skip($user_id, $context) {
        error_log(sprintf(
            'SMC_SF WARNING: engine snapshot retained for user %d during %s because watchlist was unchanged',
            (int) $user_id,
            (string) $context
        ));
    }

    private function is_engine_snapshot_current($snapshot, $expected_symbols, $refresh_interval_sec, $stale_threshold_sec = null) {
        if (!is_array($snapshot) || empty($snapshot['prices']) || empty($snapshot['meta']['computedAt'])) {
            return false;
        }

        $snapshot_symbols = array_values(array_unique(array_filter(array_map(function ($price) {
            return isset($price['symbol']) ? (string) $price['symbol'] : null;
        }, is_array($snapshot['prices']) ? $snapshot['prices'] : array()))));
        sort($snapshot_symbols);

        $expected_symbols = array_values(array_unique(array_filter(array_map('strval', is_array($expected_symbols) ? $expected_symbols : array()))));
        sort($expected_symbols);

        if ($snapshot_symbols !== $expected_symbols) {
            return false;
        }

        $computed_at = strtotime((string) $snapshot['meta']['computedAt']);
        if (!$computed_at) {
            return false;
        }
        if ((time() - $computed_at) > max(self::ENGINE_SNAPSHOT_MIN_REFRESH_INTERVAL_SEC, (int) $refresh_interval_sec)) {
            return false;
        }

        if ($stale_threshold_sec !== null) {
            foreach (is_array($snapshot['prices']) ? $snapshot['prices'] : array() as $price) {
                $price_state = isset($price['state']) ? (string) $price['state'] : 'offline';
                if ($price_state !== 'live') {
                    continue;
                }

                $updated_at = isset($price['updatedAt']) ? $price['updatedAt'] : null;
                if (!is_string($updated_at) || $updated_at === '') {
                    return false;
                }

                if ($this->iso_age_sec($updated_at) > (int) $stale_threshold_sec) {
                    return false;
                }
            }
        }

        return true;
    }

    public function get_snapshot_row($user_id, $symbol, $source = 'mt5') {
        global $wpdb;

        $query = "SELECT * FROM {$this->table('snapshots')} WHERE user_id = %d AND symbol = %s";
        $params = array($user_id, $symbol);
        if ($source !== null) {
            $query .= " AND source = %s";
            $params[] = $source;
        }

        return $wpdb->get_row($wpdb->prepare($query, $params), ARRAY_A);
    }

    public function get_cached_price($user_id, $symbol, $stale_threshold_sec = null) {
        $row = $this->get_snapshot_row($user_id, $symbol, 'mt5');
        if (!$row) {
            return null;
        }

        // HARDENING: Use iso_age_sec() to avoid PHP 8 strtotime issues.
        // Regression guard: Preserve existing logic; extract to variable for clarity.
        $threshold = $stale_threshold_sec !== null
            ? $stale_threshold_sec
            : $this->get_settings($user_id)['staleThresholdSec'];
        $updated_at_iso = $this->to_iso($row['updated_at']);
        $age_sec = $this->iso_age_sec($updated_at_iso);
        $price_state = $age_sec > $threshold
            ? 'stale'
            : $row['state'];

        return array(
            'symbol' => $row['symbol'],
            'bid' => (float) $row['bid'],
            'ask' => (float) $row['ask'],
            'mid' => (float) $row['mid'],
            'changePct1d' => (float) $row['change_pct_1d'],
            'source' => isset($row['source']) && $row['source'] !== '' ? (string) $row['source'] : 'unknown',
            'updatedAt' => $updated_at_iso,
            'state' => $price_state,  // PATCHED
            'age_sec' => (int) $age_sec,
        );
    }

    private function find_price($prices, $symbol) {
        foreach ($prices as $price) {
            if ($price['symbol'] === $symbol) {
                return $price;
            }
        }
        return null;
    }

    private function fib_levels_from_candles($candles) {
        $empty = array(
            'LTF_SF' => array(),
            'HTF_AF' => array(),
        );

        if (empty($candles)) {
            return $empty;
        }

        $chart_tf_seconds = max(60, (int) $this->fib_context_tf_seconds);
        $symbol = (string) $this->fib_context_symbol;
        $timeframe = (string) $this->fib_context_timeframe;
        $svc = new SMC_MarketData_Service();
        $compression_threshold = $this->fib_compression_threshold($symbol);

        $anchors = $svc->resolve_session_anchors($candles, $chart_tf_seconds);
        foreach (array('F1', 'F2', 'F3') as $label) {
            $anchors[$label] = $this->filter_compressed_fib_anchor($anchors[$label], $compression_threshold);
        }

        $composite = $this->superfib_composite_anchor($anchors);
        $ltf_levels = array();
        if ($composite['valid'] && (($composite['high'] - $composite['low']) >= $compression_threshold)) {
            $ltf_levels = $this->fib_levels($composite['high'], $composite['low'], 'LTF_SF');
        }

        $htf_anchor = $this->filter_compressed_fib_anchor(
            $svc->resolve_htf_authority_anchor($candles, $chart_tf_seconds),
            $compression_threshold
        );
        $htf_levels = array();
        if (!empty($htf_anchor['valid'])) {
            $htf_levels = $this->fib_levels($htf_anchor['high'], $htf_anchor['low'], 'HTF_AF');
        }

        $log_payload = array(
            'symbol' => $symbol,
            'timeframe' => $timeframe,
            'chart_tf_seconds' => $chart_tf_seconds,
            'compression_threshold' => $compression_threshold,
            'anchors' => $anchors,
            'composite' => array(
                'high' => $composite['high'],
                'low' => $composite['low'],
                'valid' => $composite['valid'],
                'valid_count' => $composite['valid_count'],
            ),
            'htf_af' => $htf_anchor,
        );
        error_log('[INFO] SMC SuperFIB fib calc ' . (function_exists('wp_json_encode') ? wp_json_encode($log_payload) : json_encode($log_payload)));

        $sf_anchor = $composite['valid'] ? array(
            'high' => $composite['high'], 
            'low'  => $composite['low'],
        ) : null;
        $af_anchor = !empty($htf_anchor['valid']) ? array(
            'high' => $htf_anchor['high'],
            'low'  => $htf_anchor['low'],
        ) : null;

        return array(
            'LTF_SF' => $ltf_levels,
            'HTF_AF' => $htf_levels,
            'sf_anchor' => $sf_anchor,
            'af_anchor' => $af_anchor,
        );
    }

    private function fib_history_window_size($timeframe) {
        $chart_tf_seconds = max(60, (int) $this->timeframe_seconds($timeframe));
        $authority_span_seconds = $chart_tf_seconds <= 1800
            ? 28 * 86400
            : ($chart_tf_seconds <= 3600
                ? 124 * 86400
                : ($chart_tf_seconds <= 14400
                    ? 366 * 86400
                    : 1462 * 86400));

        return (int) max(120, ceil($authority_span_seconds / $chart_tf_seconds) + 8);
    }

    private function fib_compression_threshold($symbol) {
        $spec = $this->get_instrument_spec($symbol);
        $pip_size = isset($spec['pip_size']) && (float) $spec['pip_size'] > 0 ? (float) $spec['pip_size'] : 0.0001;
        $is_jpy = substr((string) $symbol, -3) === 'JPY';
        $minimum_pips = $is_jpy ? 40.0 : 20.0;

        return $minimum_pips * $pip_size;
    }

    private function filter_compressed_fib_anchor($anchor, $compression_threshold) {
        $normalized = array(
            'high' => isset($anchor['high']) ? (float) $anchor['high'] : null,
            'low' => isset($anchor['low']) ? (float) $anchor['low'] : null,
            'valid' => !empty($anchor['valid']),
        );

        if (!$normalized['valid'] || $normalized['high'] === null || $normalized['low'] === null) {
            $normalized['valid'] = false;
            return $normalized;
        }

        if (($normalized['high'] - $normalized['low']) < (float) $compression_threshold) {
            $normalized['high'] = null;
            $normalized['low'] = null;
            $normalized['valid'] = false;
        }

        return $normalized;
    }

    private function superfib_composite_anchor($anchors) {
        $f1_valid = !empty($anchors['F1']['valid']);
        $f2_valid = !empty($anchors['F2']['valid']);
        $f3_valid = !empty($anchors['F3']['valid']);
        $valid_count = ($f1_valid ? 1 : 0) + ($f2_valid ? 1 : 0) + ($f3_valid ? 1 : 0);
        $weights = array('F1' => 0.0, 'F2' => 0.0, 'F3' => 0.0);

        if ($valid_count === 3) {
            $weights['F1'] = 0.40;
            $weights['F2'] = 0.35;
            $weights['F3'] = 0.25;
        } elseif ($valid_count === 2) {
            if ($f1_valid) {
                $weights['F1'] = 0.55;
                $weights[$f2_valid ? 'F2' : 'F3'] = 0.45;
            } else {
                $weights['F2'] = 0.55;
                $weights['F3'] = 0.45;
            }
        } elseif ($valid_count === 1) {
            $weights['F1'] = $f1_valid ? 1.0 : 0.0;
            $weights['F2'] = $f2_valid ? 1.0 : 0.0;
            $weights['F3'] = $f3_valid ? 1.0 : 0.0;
        }

        $weight_total = array_sum($weights);
        if ($valid_count < 1 || $weight_total <= 0.0) {
            return array('high' => null, 'low' => null, 'valid' => false, 'valid_count' => $valid_count);
        }

        $sum_high = 0.0;
        $sum_low = 0.0;
        foreach ($weights as $label => $weight) {
            if ($weight <= 0.0 || empty($anchors[$label]['valid'])) {
                continue;
            }
            $sum_high += (float) $anchors[$label]['high'] * $weight;
            $sum_low += (float) $anchors[$label]['low'] * $weight;
        }

        return array(
            'high' => $sum_high / $weight_total,
            'low' => $sum_low / $weight_total,
            'valid' => true,
            'valid_count' => $valid_count,
        );
    }

    private function fib_levels($high, $low, $family) {
        $out = array();
        foreach ($this->ratios as $ratio) {
            $out[] = array(
                'family' => $family,
                'ratio' => $ratio,
                'label' => $this->ratio_label($ratio),
                'price' => $this->price_for_ratio($high, $low, $ratio),
                'role' => $this->fib_role($ratio),
            );
        }
        return $out;
    }

    private function ratio_label($ratio) {
        if (floor((float) $ratio) === (float) $ratio) {
            return (string) (int) $ratio . '%';
        }

        return rtrim(rtrim(number_format((float) $ratio, 1, '.', ''), '0'), '.') . '%';
    }

    private function price_for_ratio($high, $low, $ratio) {
        return round((float) $high - (((float) $ratio / 100) * ((float) $high - (float) $low)), 8);
    }

    private function nearest_level($levels, $price) {
        $nearest = null;
        foreach ($levels as $level) {
            if (!$nearest || abs($level['price'] - $price) < abs($nearest['price'] - $price)) {
                $nearest = $level;
            }
        }
        return $nearest;
    }

    private function execution_level($levels, $direction) {
        $wanted = $direction === 'LONG' ? 62.5 : 25;
        foreach ($levels as $level) {
            if ((float) $level['ratio'] === (float) $wanted) {
                return $level;
            }
        }
        return null;
    }

    private function fib_role($ratio) {
        if ($ratio < 0) {
            return 'premium-extension';
        }
        if ($ratio > 100) {
            return 'discount-extension';
        }
        if ($ratio < 50) {
            return 'premium';
        }
        if ((float) $ratio === 50.0) {
            return 'equilibrium';
        }
        return 'discount';
    }

    private function pd_state($ratio) {
        if ($ratio < 0) {
            return 'EXTENDED_PREMIUM';
        }
        if ($ratio > 100) {
            return 'EXTENDED_DISCOUNT';
        }
        if ($ratio < 37.5) {
            return 'PREMIUM';
        }
        if ($ratio <= 62.5) {
            return 'EQUILIBRIUM';
        }
        return 'DISCOUNT';
    }

    private function verdict($status, $confluence, $anchor_chop_caution) {
        $structural = array_values(array_diff($confluence, array('HTA_SF', 'LTF_SF')));
        // -1 soft penalty for single-anchor caution (was -2 hard for candle chop > 0.7).
        // Dual-anchor HARD BLOCK never reaches verdict() — status is forced ARMED before this.
        $score = count($structural) - ($anchor_chop_caution ? 1 : 0);
        if ($status === 'READY' && $score >= 3) {
            return 'A+';
        }
        if ($status === 'READY') {
            return 'A';
        }
        return $score >= 2 ? 'B' : 'C';
    }

    // ── Per-symbol engine blocker ─────────────────────────────────────────────
    // Returns a single string reason explaining why a READY signal cannot be
    // backend-confirmed, or 'OK' when everything is healthy.

    private function determine_engine_blocker($user_id, $price, $candles, $data_live, $status, $symbol = null, $anchor_chop_blocked = false, $aov_equilibrium_blocked = false, $is_equity_off_session = null, $fundamental_htf_opposed = false) {
        $is_mt5_authority = false;
        if ($symbol !== null) {
            $is_mt5_authority = $this->is_mt5_authoritative($user_id, $symbol);
        }

        $key_status = $this->get_twelve_key_status($user_id);
        $symbol_rate_limited = $symbol !== null && $this->is_feed_rate_limited($user_id, $symbol);
        if (!$is_mt5_authority && $key_status === 'missing') return 'KEY_MISSING';
        if (!$is_mt5_authority && $key_status === 'invalid') return 'KEY_INVALID';
        if (!$is_mt5_authority && $symbol_rate_limited) {
            $this->log_feed_debug('engine_blocker.rate_limited', array(
                'symbol' => $symbol,
                'status' => $status,
                'price_state' => $price['state'] ?? 'missing',
                'candle_count' => is_array($candles) ? count($candles) : 0,
            ));
            return 'RATE_LIMITED';
        }
        if ($is_mt5_authority && $symbol_rate_limited) {
            $this->log_feed_debug('engine_blocker.rate_limit_ignored', array(
                'symbol' => $symbol,
                'status' => $status,
                'price_state' => $price['state'] ?? 'missing',
                'candle_count' => is_array($candles) ? count($candles) : 0,
            ));
        }

        if (empty($price) || !isset($price['mid']) || (float) $price['mid'] <= 0) {
            return 'QUOTE_UNAVAILABLE';
        }
        $price_state = $price['state'] ?? 'offline';
        if (in_array($price_state, array('unavailable', 'blocked', 'offline'), true)) {
            return 'QUOTE_UNAVAILABLE';
        }

        if (empty($candles)) return 'CANDLES_MISSING';
        if (count($candles) < 30) return 'INSUFFICIENT_CANDLE_HISTORY';

        $last_candle = end($candles);
        $candle_age_sec = $last_candle ? (time() - strtotime($last_candle['time'])) : PHP_INT_MAX;

        if ($is_equity_off_session === null && $symbol !== null) {
            $is_equity_off_session = $this->is_equity_index_off_session($symbol);
        }
        if ($is_equity_off_session) return 'CLOSED_SESSION';

        if ($price_state === 'stale') return 'PRICE_STALE';
        if ($candle_age_sec > 7200) return 'CANDLES_STALE';

        if ($status === 'READY' && !$data_live) return 'READY_NOT_CONFIRMED_STALE_DATA';

        // CRITICAL HARDENING: Gate is BLOCKED when both SF and AF anchors place price
        // in equilibrium (37.5–62.5%). This is the ICT-aligned dual-anchor chop block.
        // Single-anchor caution does NOT block — it only applies a score penalty in verdict().
        if ($anchor_chop_blocked) return 'ANCHOR_CHOP_BLOCKED';

        // CRITICAL HARDENING: HTF authority equilibrium is also a hard AOV block.
        // It must suppress backend confirmation and plan generation, not just decorate
        // the gate response as BLOCKED.
        if ($aov_equilibrium_blocked) return 'AOV_EQUILIBRIUM_ZONE';

        // CRITICAL HARDENING: HTF fundamental counter-bias is a hard readiness veto.
        // Keep these ARMED setups planless by surfacing the same blocker that
        // prevented READY instead of allowing the pending-blueprint path via OK.
        if ($fundamental_htf_opposed) return 'FUNDAMENTAL_HTF_OPPOSED';

        return 'OK';
    }


    public function is_mt5_authoritative($user_id, $symbol) {
        if (!$symbol) return false;
        $cached_price = $this->get_cached_price($user_id, $symbol, PHP_INT_MAX);
        if ($cached_price && ($cached_price['source'] ?? '') === 'mt5') {
            return true;
        }

        $svc = new SMC_MarketData_Service();
        return $svc->has_mt5_data($user_id, $symbol);
    }

    // ── Rate-limit transient helpers ─────────────────────────────────────────
    // A 429 from Twelve Data is a temporary feed condition. We track it in a
    // short-lived WP transient so the stored key credential (key_status = 'ok')
    // is never corrupted.  After the TTL expires the feed recovers automatically.

    public function rl_transient_key($user_id, $symbol = null) {
        $key = 'smc_sf_rl_' . (int) $user_id;
        if ($symbol) {
            $key .= '_' . sanitize_key($symbol);
        }
        return $key;
    }

    private function set_feed_rate_limited($user_id, $symbol = null, $ttl_sec = 60) {
        if ($symbol !== null) {
            set_transient($this->rl_transient_key($user_id, $symbol), time(), $ttl_sec);
        } else {
            set_transient($this->rl_transient_key($user_id), time(), $ttl_sec);
        }
    }

    public function is_feed_rate_limited($user_id, $symbol = null) {
        $key = $symbol !== null ? $this->rl_transient_key($user_id, $symbol) : $this->rl_transient_key($user_id);
        $state = get_transient($key) !== false;

        if ($state && $symbol) {
            error_log(sprintf('[PHASE0_SOAK] is_feed_rate_limited: TRUE for %s', $symbol));
        }

        return $state;
    }

    public function get_twelve_key_status($user_id) {
        global $wpdb;
        $status = $wpdb->get_var($wpdb->prepare(
            "SELECT key_status FROM {$this->table('integrations')} WHERE user_id = %d AND provider = %s",
            $user_id,
            self::TWELVE_PROVIDER
        ));
        return $status ? $status : 'missing';
    }

    public function clear_feed_rate_limit_state($user_id) {
        delete_transient($this->rl_transient_key($user_id));
        $settings = $this->get_settings($user_id);
        foreach ($settings['watchlist'] as $symbol) {
            delete_transient($this->rl_transient_key($user_id, $symbol));
        }
    }

    public function log_feed_debug($event, $context = array()) {
        $parts = array();
        foreach ($context as $key => $value) {
            if (is_bool($value)) {
                $value = $value ? 'yes' : 'no';
            } elseif ($value === null) {
                $value = 'null';
            } elseif (is_array($value)) {
                $value = wp_json_encode($value);
            }
            $parts[] = $key . '=' . $value;
        }

        error_log('[smc_feed] ' . $event . (empty($parts) ? '' : ' | ' . implode(' ', $parts)));
    }

    private function set_twelve_key_status($user_id, $status) {
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT encrypted_secret FROM {$this->table('integrations')} WHERE user_id = %d AND provider = %s",
            $user_id,
            self::TWELVE_PROVIDER
        ), ARRAY_A);
        if ($row) {
            $wpdb->update(
                $this->table('integrations'),
                array('key_status' => $status, 'updated_at' => $this->now_mysql()),
                array('user_id' => $user_id, 'provider' => self::TWELVE_PROVIDER),
                array('%s', '%s'),
                array('%d', '%s')
            );
        }
    }

    private function get_twelve_key($user_id) {
        global $wpdb;
        $encrypted = $wpdb->get_var($wpdb->prepare(
            "SELECT encrypted_secret FROM {$this->table('integrations')} WHERE user_id = %d AND provider = %s AND key_status = 'ok'",
            $user_id,
            self::TWELVE_PROVIDER
        ));
        if (!$encrypted) {
            return null;
        }
        return $this->decrypt_secret($encrypted);
    }

    public function encrypt_secret($secret) {
        if (!function_exists('openssl_encrypt')) {
            return new WP_Error('smc_sf_crypto_missing', 'OpenSSL encryption is required.', array('status' => 500));
        }

        $iv = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($secret, 'aes-256-gcm', $this->crypto_key(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($cipher === false) {
            return new WP_Error('smc_sf_crypto_failed', 'Could not encrypt API key.', array('status' => 500));
        }

        return base64_encode(wp_json_encode(array(
            'v' => 1,
            'iv' => base64_encode($iv),
            'tag' => base64_encode($tag),
            'data' => base64_encode($cipher),
        )));
    }

    private function decrypt_secret($payload) {
        if (!function_exists('openssl_decrypt')) {
            return new WP_Error('smc_sf_crypto_missing', 'OpenSSL decryption is required.', array('status' => 500));
        }

        $decoded = json_decode(base64_decode($payload), true);
        if (!is_array($decoded) || empty($decoded['iv']) || empty($decoded['tag']) || empty($decoded['data'])) {
            return new WP_Error('smc_sf_crypto_payload', 'Stored API key payload is invalid.', array('status' => 500));
        }

        $plain = openssl_decrypt(
            base64_decode($decoded['data']),
            'aes-256-gcm',
            $this->crypto_key(),
            OPENSSL_RAW_DATA,
            base64_decode($decoded['iv']),
            base64_decode($decoded['tag'])
        );

        if ($plain === false) {
            return new WP_Error('smc_sf_crypto_decrypt_failed', 'Could not decrypt API key.', array('status' => 500));
        }

        return $plain;
    }

    private function crypto_key() {
        $salt = defined('AUTH_SALT') ? AUTH_SALT : wp_salt('auth');
        return hash('sha256', $salt . '|smc-superfib-sniper|' . (defined('SECURE_AUTH_SALT') ? SECURE_AUTH_SALT : ''), true);
    }

    public function replace_json($table, $data) {
        global $wpdb;
        foreach ($data as $field => $value) {
            if (is_array($value)) {
                $data[$field] = wp_json_encode($value);
            }
        }
        $wpdb->replace($this->table($table), $data);
    }

    public function audit($user_id, $event_type, $payload) {
        global $wpdb;
        $wpdb->insert(
            $this->table('audit_events'),
            array(
                'user_id' => $user_id,
                'event_type' => $event_type,
                'payload' => wp_json_encode($payload),
                'created_at' => $this->now_mysql(),
            ),
            array('%d', '%s', '%s', '%s')
        );
    }

    public function instrument_specs() {
        static $specs = null;
        if ($specs !== null) {
            return $specs;
        }
        $specs = array(
            // FOREX — USD quoted
            'GBPUSD' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            'AUDUSD' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            'EURUSD' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            'NZDUSD' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            // FOREX — non-USD quoted pairs use pip_val as a fallback only.
            // Runtime sizing resolves the quote currency into USD from live/cached reference mids
            // so JPY/CAD/CHF/GBP/AUD/NZD quoted pairs do not inherit the flat $10 assumption.
            'USDJPY' => array('type' => 'forex', 'pip_size' => 0.01,   'contract_size' => 100000, 'pip_val' => 10.0),
            'AUDJPY' => array('type' => 'forex', 'pip_size' => 0.01,   'contract_size' => 100000, 'pip_val' => 10.0),
            'EURJPY' => array('type' => 'forex', 'pip_size' => 0.01,   'contract_size' => 100000, 'pip_val' => 10.0),
            'GBPJPY' => array('type' => 'forex', 'pip_size' => 0.01,   'contract_size' => 100000, 'pip_val' => 10.0),
            'NZDJPY' => array('type' => 'forex', 'pip_size' => 0.01,   'contract_size' => 100000, 'pip_val' => 10.0),
            'CADJPY' => array('type' => 'forex', 'pip_size' => 0.01,   'contract_size' => 100000, 'pip_val' => 10.0),
            'CHFJPY' => array('type' => 'forex', 'pip_size' => 0.01,   'contract_size' => 100000, 'pip_val' => 10.0),
            // FOREX — non-JPY crosses
            'USDCAD' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            'USDCHF' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            'EURGBP' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            'EURAUD' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            'EURNZD' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            'EURCHF' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            'EURCAD' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            'GBPAUD' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            'GBPNZD' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            'GBPCAD' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            'GBPCHF' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            'AUDNZD' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            'AUDCAD' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            'AUDCHF' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            'NZDCAD' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            'NZDCHF' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            'CADCHF' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            // METALS — XAU: 100 oz/lot; 1 pip ($0.01) = $1/pip/lot
            'XAUUSD' => array('type' => 'metal',  'pip_size' => 0.01,   'contract_size' => 100,  'pip_val' => 1.0),
            // XAG: 5000 oz/lot; 1 pip ($0.001) = $5/pip/lot
            'XAGUSD' => array('type' => 'metal',  'pip_size' => 0.001,  'contract_size' => 5000, 'pip_val' => 5.0),
            // INDICES — contract sizes vary by broker; defaults use $1/point/lot
            'US30'   => array('type' => 'index',  'pip_size' => 1.0,    'contract_size' => 1, 'pip_val' => 1.0),
            'NAS100' => array('type' => 'index',  'pip_size' => 1.0,    'contract_size' => 1, 'pip_val' => 1.0),
            'SPX500' => array('type' => 'index',  'pip_size' => 0.1,    'contract_size' => 1, 'pip_val' => 0.1),
            // MACRO / REFERENCE — no lot sizing; informational only
            'DXYUSD' => array('type' => 'reference', 'pip_size' => 0.001, 'contract_size' => 0, 'pip_val' => 0.0),
            // EXOTIC FOREX
            'USDZAR' => array('type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'pip_val' => 10.0),
            // CRYPTO — contract sizes vary by broker; defaults use $1/point/lot
            'BTCUSD' => array('type' => 'crypto', 'pip_size' => 1.0,    'contract_size' => 1, 'pip_val' => 1.0),
            'ETHUSD' => array('type' => 'crypto', 'pip_size' => 1.0,    'contract_size' => 1, 'pip_val' => 1.0),
            'XRPUSD' => array('type' => 'crypto', 'pip_size' => 1.0,    'contract_size' => 1, 'pip_val' => 1.0),
            'BNBUSD' => array('type' => 'crypto', 'pip_size' => 1.0,    'contract_size' => 1, 'pip_val' => 1.0),
            'SOLUSD' => array('type' => 'crypto', 'pip_size' => 1.0,    'contract_size' => 1, 'pip_val' => 1.0),
        );
        return $specs;
    }

    private function get_instrument_spec($symbol) {
        $key = $this->map_symbol_aliases($symbol);
        $specs = $this->instrument_specs();
        return isset($specs[$key]) ? $specs[$key] : null;
    }

    public function is_supported_symbol($symbol) {
        $key = $this->map_symbol_aliases($symbol);
        $specs = $this->instrument_specs();
        return isset($specs[$key]);
    }

    public function validate_watchlist_symbols($symbols) {
        $out = array();
        foreach ($this->sanitize_symbols($symbols) as $sym) {
            if ($this->is_supported_symbol($sym)) {
                $out[] = $sym;
            }
        }
        return $out;
    }

    public function save_watchlist($user_id, $watchlist) {
        $current = $this->get_settings($user_id);
        $current['watchlist'] = $this->validate_watchlist_symbols($watchlist);
        $this->replace_json('user_settings', array(
            'user_id' => $user_id,
            'settings' => $current,
            'updated_at' => $this->now_mysql(),
        ));
    }

    public function sanitize_symbols($symbols) {
        if (!is_array($symbols)) {
            return array();
        }
        $out = array();
        foreach ($symbols as $symbol) {
            $clean = $this->map_symbol_aliases($symbol);
            // Reject empty strings and suspiciously long tokens (longest real symbol is ~10 chars).
            if ($clean === '' || strlen($clean) > 12) {
                continue;
            }
            if (!in_array($clean, $out, true)) {
                $out[] = $clean;
            }
        }
        return array_slice($out, 0, 24);
    }

    public function sanitize_risk_allocation($payload, $fallback) {
        if (!is_array($payload)) {
            return $fallback;
        }
        return array(
            'perTradePct' => $this->float_between($payload, 'perTradePct', 0.1, 5.0, $fallback['perTradePct']),
            'dailyMaxPct' => $this->float_between($payload, 'dailyMaxPct', 0.1, 20.0, $fallback['dailyMaxPct']),
            'ddCapPct' => $this->float_between($payload, 'ddCapPct', 0.1, 50.0, $fallback['ddCapPct']),
        );
    }

    public function sanitize_signal_board_size($value): int {
        $size = (int) $value;
        if ($size <= 3) {
            return 3;
        }
        if ($size <= 5) {
            return 5;
        }
        return 10;
    }

    public function resolve_signal_board_size(int $user_id): int {
        $request_value = isset($_GET['board_size']) ? $_GET['board_size'] : (isset($_GET['boardSize']) ? $_GET['boardSize'] : null);
        if ($request_value !== null) {
            return $this->sanitize_signal_board_size($request_value);
        }
        $settings = $this->get_settings($user_id);
        return $this->sanitize_signal_board_size($settings['signalBoardSize'] ?? 3);
    }

    public function int_between($payload, $key, $min, $max, $fallback) {
        if (!is_array($payload) || !isset($payload[$key])) {
            return $fallback;
        }
        return max($min, min($max, (int) $payload[$key]));
    }

    public function float_between($payload, $key, $min, $max, $fallback) {
        if (!is_array($payload) || !isset($payload[$key])) {
            return $fallback;
        }
        return max($min, min($max, (float) $payload[$key]));
    }

    private function twelve_symbol($symbol) {
        $key = $this->map_symbol_aliases($symbol);
        // All-alpha 6-letter tokens (forex pairs, metals, crypto like BTC/USD) are
        // slash-formatted by Twelve Data. Symbols with digits (US30, NAS100) pass through.
        // This covers both registry-known pairs and any legacy user-watchlist entries.
        if (preg_match('/^[A-Z]{6}$/', $key)) {
            return substr($key, 0, 3) . '/' . substr($key, 3, 3);
        }
        return $key;
    }

    public function latest_timestamp($table, $user_id, $column) {
        global $wpdb;
        $allowed_tables  = array('snapshots', 'engine_runs');
        $allowed_columns = array('updated_at', 'created_at');
        if (!in_array($table, $allowed_tables, true) || !in_array($column, $allowed_columns, true)) {
            return null;
        }
        $col = $column === 'updated_at' ? 'updated_at' : 'created_at';
        if ($table === 'snapshots') {
            return $wpdb->get_var($wpdb->prepare(
                "SELECT MAX({$col}) FROM {$this->table($table)} WHERE user_id = %d AND source = %s",
                $user_id,
                'mt5'
            ));
        }
        return $wpdb->get_var($wpdb->prepare(
            "SELECT MAX({$col}) FROM {$this->table($table)} WHERE user_id = %d",
            $user_id
        ));
    }

    private function is_stale($mysql_time, $threshold_sec) {
        return (time() - strtotime($mysql_time . ' UTC')) > $threshold_sec;
    }

    /**
     * Returns age in seconds for an ISO 8601 timestamp (e.g. from gmdate('c')).
     * Unlike is_stale(), this does NOT append ' UTC' — ISO strings already carry
     * timezone info, and appending ' UTC' causes strtotime() to return false in PHP 8.
     * 
     * P2 FIX: Handle timezone abbreviations (UTC, GMT, etc.) before forcing Z suffix.
     * Timestamps like "2026-05-06 12:34:56 UTC" must NOT become "2026-05-06 12:34:56 UTCZ".
     */
    private function iso_age_sec($iso_time) {
        if (!$iso_time) {
            return PHP_INT_MAX;
        }
        
        $value = trim((string) $iso_time);
        
        // Preserve non-UTC timezone abbreviations (EST, PST, CET, etc.) so PHP can convert
        // them correctly instead of silently coercing to UTC wall-clock.
        $has_named_tz = preg_match('/\s+([A-Z]{2,5})\s*$/i', $value, $tz_match) === 1;
        if ($has_named_tz) {
            $tz_abbrev = strtoupper($tz_match[1]);
            if (in_array($tz_abbrev, array('UTC', 'GMT', 'UT', 'Z'), true)) {
                $value = preg_replace('/\s+([A-Z]{2,5})\s*$/i', '', $value);
                $has_named_tz = false;
            }
        }
        
        // If timestamp doesn't already have a timezone offset ([+-]HH:MM or Z), add Z
        if (!$has_named_tz && !preg_match('/([+-]\d{2}:\d{2}|Z)\s*$/', $value)) {
            $value .= 'Z';
        }
        
        $ts = strtotime($value);
        return $ts !== false ? (time() - $ts) : PHP_INT_MAX;
    }

    /**
     * Parse an MT5 timestamp (YYYY.MM.DD HH:MM:SS) or ISO 8601 string into MySQL format.
     * MQL5's TimeToString(TIME_DATE|TIME_SECONDS) produces "YYYY.MM.DD HH:MM:SS" which
     * PHP strtotime() does not reliably handle — replace dots with dashes before parsing.
     */
    private function parse_mt5_timestamp($raw) {
        if (!$raw) {
            return $this->now_mysql();
        }
        $s = trim((string) $raw);
        // Convert MT5 dot-date format: "2024.01.15 10:30:45" → "2024-01-15 10:30:45"
        if (preg_match('/^\d{4}\.\d{2}\.\d{2}[ T]\d{2}:\d{2}:\d{2}/', $s)) {
            $s = preg_replace('/^(\d{4})\.(\d{2})\.(\d{2})/', '$1-$2-$3', $s);
        }
        $ts = strtotime($s);
        return $ts !== false ? gmdate('Y-m-d H:i:s', $ts) : $this->now_mysql();
    }

    private function timeframe_seconds($timeframe) {
        $key = strtolower(trim((string) $timeframe));
        if (!preg_match('/^(\d+)(min|h|day|week|month)$/', $key, $matches)) {
            return 3600;
        }
        $units = array(
            'min' => 60,
            'h' => 3600,
            'day' => 86400,
            'week' => 604800,
            'month' => 2592000,
        );
        return ((int) $matches[1]) * $units[$matches[2]];
    }

    // Returns true when $symbol is an equity index instrument (NAS100 or US30) and the
    // current UTC wall-clock time is outside its active trading session.
    // NYSE/NASDAQ regular session: 09:30-16:00 ET.
    //   EDT (UTC-4, 2nd Sun March → 1st Sun November): 13:30-20:00 UTC
    //   EST (UTC-5, otherwise):                         14:30-21:00 UTC
    public function is_equity_index_off_session($symbol) {
        static $equity_symbols = array('NAS100', 'US30');
        if (!in_array(strtoupper((string) $symbol), $equity_symbols, true)) {
            return false;
        }
        $dow            = (int) gmdate('w'); // 0=Sunday, 6=Saturday
        if ($dow === 0 || $dow === 6) {
            return true;
        }
        $utc_hour       = (int) gmdate('G');
        $utc_min        = (int) gmdate('i');
        $utc_min_of_day = $utc_hour * 60 + $utc_min;
        if ($this->is_us_dst_active()) {
            // EDT: session open 13:30-20:00 UTC
            return $utc_min_of_day < 810 || $utc_min_of_day >= 1200;
        } else {
            // EST: session open 14:30-21:00 UTC
            return $utc_min_of_day < 870 || $utc_min_of_day >= 1260;
        }
    }

    // Returns true when US DST (EDT, UTC-4) is currently active.
    // Post-2007 rules: starts 2nd Sunday March at 02:00 ET (07:00 UTC),
    // ends 1st Sunday November at 02:00 ET (06:00 UTC while still EDT).
    private function is_us_dst_active() {
        $month = (int) gmdate('n');
        $day   = (int) gmdate('j');
        $hour  = (int) gmdate('G');
        if ($month < 3 || $month > 11) return false;
        if ($month > 3 && $month < 11) return true;
        $year         = (int) gmdate('Y');
        $first_of_mon = mktime(0, 0, 0, $month, 1, $year);
        $dow_first    = (int) gmdate('w', $first_of_mon); // 0=Sun
        // Day number of the first Sunday of the month (1-based)
        $first_sunday_day = ($dow_first === 0) ? 1 : (1 + 7 - $dow_first);
        if ($month === 3) {
            $second_sunday_day = $first_sunday_day + 7;
            return $day > $second_sunday_day || ($day === $second_sunday_day && $hour >= 7);
        }
        // November: DST ends on 1st Sunday at 06:00 UTC
        return $day < $first_sunday_day || ($day === $first_sunday_day && $hour < 6);
    }

    public function is_chart_candle_fresh($candle_time, $timeframe) {
        $candle_ts = $candle_time ? strtotime((string) $candle_time) : false;
        if (!$candle_ts) {
            return false;
        }
        // CRITICAL FIX: Properly scale candle freshness window by timeframe.
        // A 1h candle can be up to 2 hours old before considered stale (covers a full bar + delay).
        // A 15m candle should be fresh within 30 minutes.
        // Minimum 2 hours for all frames to account for market gaps.
        $tf_seconds = $this->timeframe_seconds($timeframe);
        // For frames <= 15m: use 2-hour floor. For slower frames: scale to 2x timeframe.
        $threshold_sec = max(7200, min($tf_seconds * 2, 14400)); // 2h-4h range
        return (time() - $candle_ts) <= $threshold_sec;
    }

    public function normalize_market_timestamp($raw_time, $fallback = null) {
        $fallback_value = (func_num_args() >= 2) ? $fallback : $this->now_mysql();
        if ($raw_time === null || $raw_time === '') {
            return $fallback_value;
        }

        $value = trim((string) $raw_time);

        if (preg_match('/^\d{10,13}$/', $value) === 1) {
            $epoch = (int) $value;
            if (strlen($value) === 13) {
                $epoch = (int) floor($epoch / 1000);
            }
            return gmdate('Y-m-d H:i:s', $epoch);
        }
        
        // Convert MQL5 format (2026.05.06 12:34:56) to ISO 8601 (2026-05-06T12:34:56)
        // This regex handles both dot and dash separators for dates
        $value = preg_replace('/^(\d{4})\.(\d{2})\.(\d{2})/', '$1-$2-$3', $value);
        
        // HARDENING: If no timezone marker is present, treat as UTC explicitly.
        // Valid timezone markers: Z, +HH:MM, -HH:MM, etc.
        // Without this, PHP's strtotime() treats ambiguous times inconsistently across timezones.
        // REGRESSION GUARD: str_ends_with() requires PHP 8.0+. The regex already covers the 'Z'
        // suffix case ([Z+\-] matches Z with \d{0,2} allowing zero digits), so the redundant
        // str_ends_with() check is removed for PHP 7.x compatibility.
        if (!preg_match('/[Z+\-]\d{0,2}:?\d{0,2}$/', $value)) {
            // No timezone marker — force UTC interpretation
            $value = $value . 'Z';
            error_log("TIMESTAMP NORMALIZED TO UTC: raw={$raw_time} | normalized={$value}");
        }
        
        $ts = strtotime($value);
        if ($ts === false) {
            error_log("FAILED TO PARSE TIMESTAMP: raw={$raw_time} | value={$value}");
            return $fallback_value;
        }

        return gmdate('Y-m-d H:i:s', $ts);
    }

    public function normalize_mt5_timeframe($timeframe) {
        $value = strtoupper(trim((string) $timeframe));
        $mt5_map = array(
            'M1' => '1min',
            'M5' => '5min',
            'M15' => '15min',
            'M30' => '30min',
            'H1' => '1h',
            'H4' => '4h',
            'D1' => '1day',
            'W1' => '1week',
            'MN1' => '1month',
        );

        if (isset($mt5_map[$value])) {
            return $mt5_map[$value];
        }

        return sanitize_text_field($timeframe ?: '15min');
    }

    public function mt5_freshness_to_snapshot_state($freshness) {
        switch (strtoupper(trim((string) $freshness))) {
            case 'LIVE':
                return 'live';
            case 'DELAYED':
            case 'STALE':
                return 'stale';
            case 'CLOSED':
            case 'DISCONNECTED':
                return 'offline';
            default:
                return 'offline';
        }
    }

    public function table($name) {
        global $wpdb;
        return $wpdb->prefix . 'smc_sf_' . $name;
    }

    public function now_mysql() {
        return gmdate('Y-m-d H:i:s');
    }

    private function soak_get_var($query) {
        global $wpdb;
        $this->reset_wpdb_error();
        $value = $wpdb->get_var($query);
        return array(
            'value' => $value,
            'error' => $this->wpdb_last_error(),
        );
    }

    private function soak_get_row($query) {
        global $wpdb;
        $this->reset_wpdb_error();
        $value = $wpdb->get_row($query, ARRAY_A);
        return array(
            'value' => $value,
            'error' => $this->wpdb_last_error(),
        );
    }

    private function soak_get_results($query) {
        global $wpdb;
        $this->reset_wpdb_error();
        $value = $wpdb->get_results($query, ARRAY_A);
        return array(
            'value' => is_array($value) ? $value : array(),
            'error' => $this->wpdb_last_error(),
        );
    }

    private function seed_baseline_checkpoint() {
        global $wpdb;

        // checkpoint_type has no UNIQUE constraint (multiple non-baseline checkpoints
        // are valid). The WHERE NOT EXISTS check is not atomic on its own — two
        // concurrent /admin/soak-report requests can both observe "no baseline" and
        // both insert, violating the single-baseline invariant.
        // Advisory lock serializes concurrent seeders at the database level without
        // requiring a schema change.
        $lock_acquired = $wpdb->get_var("SELECT GET_LOCK('smc_sf_baseline_seed', 10)");
        if ($lock_acquired != 1) {
            return array(
                'seeded' => false,
                'error'  => 'Could not acquire baseline seed lock — try again.',
            );
        }

        try {
            $created_at    = $this->now_mysql();
            $snapshot_data = wp_json_encode(array());
            $this->reset_wpdb_error();
            $inserted = $wpdb->query($wpdb->prepare(
                "INSERT INTO {$this->table('soak_checkpoints')} (checkpoint_type, snapshot_data, operator_notes, created_at)
                 SELECT %s, %s, %s, %s
                 FROM DUAL
                 WHERE NOT EXISTS (
                     SELECT 1 FROM {$this->table('soak_checkpoints')} WHERE checkpoint_type = %s
                 )",
                'baseline',
                $snapshot_data,
                '',
                $created_at,
                'baseline'
            ));
            $error = $this->wpdb_last_error();
            if ($inserted === false || $error !== null) {
                return array(
                    'seeded' => false,
                    'error'  => $error !== null ? $error : 'Could not seed baseline checkpoint.',
                );
            }

            return array(
                'seeded' => ((int) $inserted) > 0,
                'error'  => null,
            );
        } finally {
            $wpdb->query("SELECT RELEASE_LOCK('smc_sf_baseline_seed')");
        }
    }

    private function infer_soak_type_from_evidence_rows($rows) {
        if (!is_array($rows)) {
            return null;
        }

        $accepted_keys = array('baseline.soak_type', 'soak.type', 'soak_type');
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $evidence_key = (string) ($row['evidence_key'] ?? '');
            if (!in_array($evidence_key, $accepted_keys, true)) {
                continue;
            }

            $soak_type = strtoupper(trim((string) ($row['evidence_value'] ?? '')));
            if (in_array($soak_type, array('PHASE_0_RESTART_72H', 'PHASE_3_STABILITY_72H', 'PHASE_4_30_DAY'), true)) {
                return $soak_type;
            }
        }

        return null;
    }

    private function map_soak_evidence_row($row) {
        return array(
            'id' => isset($row['id']) ? (int) $row['id'] : 0,
            'evidence_key' => (string) ($row['evidence_key'] ?? ''),
            'evidence_type' => (string) ($row['evidence_type'] ?? ''),
            'evidence_value' => (string) ($row['evidence_value'] ?? ''),
            'operator' => (string) ($row['operator'] ?? ''),
            'created_at' => $this->to_iso($row['created_at'] ?? null),
            'updated_at' => $this->to_iso($row['updated_at'] ?? null),
        );
    }

    private function map_soak_checkpoint_row($row) {
        $snapshot = json_decode((string) ($row['snapshot_data'] ?? ''), true);

        return array(
            'id' => isset($row['id']) ? (int) $row['id'] : 0,
            'checkpoint_type' => isset($row['checkpoint_type']) && $row['checkpoint_type'] === 'baseline' ? 'baseline' : 'checkpoint',
            'snapshot_data' => is_array($snapshot) ? $snapshot : array(),
            'operator_notes' => isset($row['operator_notes']) && $row['operator_notes'] !== '' ? (string) $row['operator_notes'] : null,
            'created_at' => $this->to_iso($row['created_at'] ?? null),
        );
    }

    private function reset_wpdb_error() {
        global $wpdb;
        if (is_object($wpdb) && property_exists($wpdb, 'last_error')) {
            $wpdb->last_error = '';
        }
    }

    public function wpdb_last_error() {
        global $wpdb;
        if (is_object($wpdb) && property_exists($wpdb, 'last_error') && $wpdb->last_error !== '') {
            return (string) $wpdb->last_error;
        }
        return null;
    }

    private function rest_response_status_code($response) {
        if (!($response instanceof WP_REST_Response)) {
            return 200;
        }

        if (method_exists($response, 'get_status')) {
            return (int) $response->get_status();
        }

        if (property_exists($response, 'status')) {
            return (int) $response->status;
        }

        return 200;
    }

    public function no_cache_response($payload) {
        $response = rest_ensure_response($payload);

        if ($response instanceof WP_REST_Response && method_exists($response, 'header')) {
            $response->header('Cache-Control', 'no-store, no-cache, must-revalidate');
            $response->header('Pragma', 'no-cache');
        }

        return $response;
    }

    public function to_iso($mysql_time) {
        if (!$mysql_time) {
            return null;
        }
        return gmdate('c', strtotime($mysql_time . ' UTC'));
    }
}
