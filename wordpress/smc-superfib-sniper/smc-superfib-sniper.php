<?php
/**
 * Plugin Name: SMC SuperFIB Signal Engine & Account Manager
 * Description: WordPress REST backend for the SMC SuperFIB Dashboard.
 * Version: 13.0.1
 * Author: Kudzanai Lloyd Taruvinga For Munhumukapa Holdings Group
 */

if (!defined('ABSPATH')) {
    exit;
}

require_once __DIR__ . '/class-market-data-service.php';

final class SMC_SuperFib_Sniper_REST {
    const VERSION = '13.0.1';
    const NAMESPACE = 'sniper/v1';
    const TWELVE_PROVIDER = 'twelve_data';

    private $ratios = array(-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300);

    public static function boot() {
        $instance = new self();
        add_action('rest_api_init', array($instance, 'register_routes'));
        
        // Send CORS headers on all REST responses (success, error, auth failure, etc)
        add_filter('rest_post_dispatch', function($response, $server, $request) {
            $allowed = self::get_allowed_origins();
            $origin  = isset($_SERVER['HTTP_ORIGIN']) ? sanitize_text_field(wp_unslash($_SERVER['HTTP_ORIGIN'])) : '';
            if ($origin && self::is_allowed_origin($origin, $allowed)) {
                self::send_cors_headers_for_origin($origin);
            }
            return $response;
        }, 10, 3);
        
        add_filter('rest_pre_serve_request', function($value) {
            $allowed = self::get_allowed_origins();
            $origin  = isset($_SERVER['HTTP_ORIGIN']) ? sanitize_text_field(wp_unslash($_SERVER['HTTP_ORIGIN'])) : '';
            if ($origin && self::is_allowed_origin($origin, $allowed)) {
                self::send_cors_headers_for_origin($origin);
            }
            return $value;
        }, 15);

        // Early preflight handler: send CORS headers for OPTIONS before WordPress performs routing.
        add_action('init', function() {
            self::handle_options_preflight_request();
        }, 0);

        // Regression guard: Validate CORS configuration consistency on every boot.
        // Non-fatal: logs a warning but never blocks plugin load.
        if (!self::validate_cors_origins_consistency()) {
            error_log('SMC SuperFIB: CORS configuration inconsistency detected. Check allowed origins for protocol prefix or duplicate entries.');
        }

        // Respond to CORS preflight (OPTIONS) requests before WordPress processes them.
        // Without this, the browser's preflight check silently fails and blocks POST/DELETE.
        add_action('wp_loaded', function() {
            if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
                // Check if this is a request to our REST API
                $request_uri = $_SERVER['REQUEST_URI'] ?? '';
                if (strpos($request_uri, '/wp-json/sniper/v1/') !== false) {
                    $allowed = self::get_allowed_origins();
                    $origin  = $_SERVER['HTTP_ORIGIN'] ?? '';
                    if ($origin && self::is_allowed_origin($origin, $allowed)) {
                        self::send_cors_headers_for_origin($origin);
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

    public static function deactivate(): void {
        // Clear any pending/recurrent prune events so deactivation does not leave orphaned cron jobs.
        wp_clear_scheduled_hook('smc_sf_prune_tables');
        wp_unschedule_hook('smc_sf_prune_tables');
    }

    public static function activate() {
        global $wpdb;

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $charset = $wpdb->get_charset_collate();
        $tables = array();

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_user_settings (
            user_id BIGINT UNSIGNED NOT NULL,
            settings LONGTEXT NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (user_id)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_integrations (
            user_id BIGINT UNSIGNED NOT NULL,
            provider VARCHAR(64) NOT NULL,
            encrypted_secret LONGTEXT NULL,
            key_status VARCHAR(32) NOT NULL DEFAULT 'missing',
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (user_id, provider)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_candles (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NOT NULL,
            symbol VARCHAR(24) NOT NULL,
            timeframe VARCHAR(16) NOT NULL,
            candle_time DATETIME NOT NULL,
            open DECIMAL(20,8) NOT NULL,
            high DECIMAL(20,8) NOT NULL,
            low DECIMAL(20,8) NOT NULL,
            close DECIMAL(20,8) NOT NULL,
            volume DECIMAL(24,8) NULL,
            source VARCHAR(20) NOT NULL DEFAULT 'twelve-data',
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY candle_lookup (user_id, symbol, timeframe, candle_time),
            KEY latest_symbol (user_id, symbol, timeframe, candle_time)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_snapshots (
            user_id BIGINT UNSIGNED NOT NULL,
            symbol VARCHAR(24) NOT NULL,
            bid DECIMAL(20,8) NOT NULL DEFAULT 0,
            ask DECIMAL(20,8) NOT NULL DEFAULT 0,
            mid DECIMAL(20,8) NOT NULL DEFAULT 0,
            spread INT NOT NULL DEFAULT 0,
            change_pct_1d DECIMAL(12,6) NOT NULL DEFAULT 0,
            source VARCHAR(20) NOT NULL DEFAULT 'twelve-data',
            state VARCHAR(32) NOT NULL DEFAULT 'offline',
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (user_id, symbol)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_engine_runs (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NOT NULL,
            status VARCHAR(32) NOT NULL,
            summary LONGTEXT NOT NULL,
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY user_created (user_id, created_at)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_signals (
            id VARCHAR(64) NOT NULL,
            user_id BIGINT UNSIGNED NOT NULL,
            symbol VARCHAR(24) NOT NULL,
            direction VARCHAR(8) NOT NULL,
            status VARCHAR(16) NOT NULL,
            verdict VARCHAR(4) NOT NULL,
            confluence LONGTEXT NOT NULL,
            engine LONGTEXT NOT NULL,
            backend_confirmed TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY user_symbol (user_id, symbol),
            KEY user_status (user_id, status)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_trade_plans (
            signal_id VARCHAR(64) NOT NULL,
            user_id BIGINT UNSIGNED NOT NULL,
            plan LONGTEXT NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (signal_id),
            KEY user_updated (user_id, updated_at)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_trade_queue (
            id VARCHAR(64) NOT NULL,
            user_id BIGINT UNSIGNED NOT NULL,
            signal_id VARCHAR(64) NOT NULL,
            payload LONGTEXT NOT NULL,
            state VARCHAR(32) NOT NULL DEFAULT 'pending-sync',
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY user_state (user_id, state)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_account_snapshots (
            user_id BIGINT UNSIGNED NOT NULL,
            data LONGTEXT NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (user_id)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_trades (
            id VARCHAR(64) NOT NULL,
            user_id BIGINT UNSIGNED NOT NULL,
            kind VARCHAR(16) NOT NULL,
            payload LONGTEXT NOT NULL,
            state VARCHAR(32) NOT NULL DEFAULT 'live',
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY user_kind (user_id, kind)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_audit_events (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NOT NULL,
            event_type VARCHAR(64) NOT NULL,
            payload LONGTEXT NOT NULL,
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY user_event (user_id, event_type, created_at)
        ) $charset;";

        foreach ($tables as $sql) {
            dbDelta($sql);
        }
    }

    public function register_routes() {
        $this->route('/health', WP_REST_Server::READABLE, 'get_health', false);
        $this->route('/session', WP_REST_Server::READABLE, 'get_session', false);
        $this->route('/snapshot', WP_REST_Server::READABLE, 'get_snapshot', true);
        $this->route('/snapshot', WP_REST_Server::CREATABLE, 'post_snapshot', true);
        $this->route('/charts', WP_REST_Server::READABLE, 'get_chart_snapshot', true);
        $this->route('/regimes', WP_REST_Server::READABLE, 'get_regimes', true);
        $this->route('/regime', WP_REST_Server::CREATABLE, 'post_regime', true);
        $this->route('/live-signals', WP_REST_Server::READABLE, 'get_live_signals', true);
        $this->route('/signal', WP_REST_Server::CREATABLE, 'post_signal', true);
        $this->route('/ladders', WP_REST_Server::READABLE, 'get_ladders', true);

        $this->route('/user/engine-batch', WP_REST_Server::CREATABLE, 'post_engine_batch', true);
        $this->route('/user/market-data', WP_REST_Server::CREATABLE, 'post_user_market_data', true);
        $this->route('/user/trades', WP_REST_Server::READABLE, 'get_user_trades', true);
        $this->route('/user/trades', WP_REST_Server::CREATABLE, 'post_user_trades', true);
        $this->route('/user/account', WP_REST_Server::READABLE, 'get_user_account', true);
        $this->route('/user/account', WP_REST_Server::CREATABLE, 'post_user_account', true);
        $this->route('/user/settings', WP_REST_Server::READABLE, 'get_user_settings', true);
        $this->route('/user/settings', WP_REST_Server::CREATABLE, 'post_user_settings', true);
        $this->route('/user/risk-profile', WP_REST_Server::READABLE, 'get_user_risk_profile', true);
        $this->route('/user/risk-profile', WP_REST_Server::CREATABLE, 'post_user_risk_profile', true);
        $this->route('/user/trade-queue', WP_REST_Server::READABLE, 'get_user_trade_queue', true);
        $this->route('/user/trade-queue', WP_REST_Server::CREATABLE, 'post_user_trade_queue', true);
        $this->route('/user/execute-signals', WP_REST_Server::CREATABLE, 'post_execute_signals', true);
        $this->route('/user/twelve-data-key', WP_REST_Server::CREATABLE, 'post_twelve_data_key', true);
        $this->route('/user/twelve-data-key', WP_REST_Server::DELETABLE, 'delete_twelve_data_key', true);
        $this->route('/user/watchlist', WP_REST_Server::READABLE, 'get_user_watchlist', true);
        $this->route('/user/watchlist', WP_REST_Server::CREATABLE, 'post_user_watchlist', true);
        $this->route('/user/watchlist/add', WP_REST_Server::CREATABLE, 'post_watchlist_add', true);
        $this->route('/user/watchlist/remove', WP_REST_Server::CREATABLE, 'post_watchlist_remove', true);
        $this->route('/instruments', WP_REST_Server::READABLE, 'get_instruments', true);
        $this->route('/market-data-authority', WP_REST_Server::READABLE, 'get_market_data_authority', true);
        $this->route('/authority-diagnostics', WP_REST_Server::READABLE, 'get_authority_diagnostics', true);

        // MT5 EA market data ingestion endpoint (API key auth, no session/cookies).
        register_rest_route(self::NAMESPACE, '/ea/market-stream', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($this, 'post_ea_market_stream'),
            'permission_callback' => array($this, 'permission_ea_market_stream'),
        ));
    }

    private function route($path, $methods, $callback, $auth_required) {
        register_rest_route(self::NAMESPACE, $path, array(
            'methods' => $methods,
            'callback' => array($this, $callback),
            'permission_callback' => $auth_required ? array($this, 'permission_user') : '__return_true',
        ));
    }

    public function permission_user() {
        $logged_in = is_user_logged_in();
        $can_read = current_user_can('read');
        $user_id = get_current_user_id();

        if (!$logged_in || !$can_read) {
            error_log(sprintf(
                'SMC SuperFIB auth failed: user_id=%s logged_in=%s can_read=%s request_uri=%s method=%s remote_addr=%s',
                $user_id,
                $logged_in ? 'true' : 'false',
                $can_read ? 'true' : 'false',
                isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : 'unknown',
                isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'unknown',
                isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown'
            ));

            return new WP_Error('smc_sf_auth_required', 'Authentication required.', array('status' => 401));
        }

        return true;
    }

    public function permission_ea_market_stream(WP_REST_Request $request) {
        $provided = trim((string) $this->get_ea_api_key($request));
        if ($provided === '') {
            return new WP_Error('smc_sf_api_key_missing', 'X-EA-API-Key or X-API-KEY header required.', array('status' => 401));
        }

        $configured = trim((string) (defined('SMC_SF_EA_API_KEY') ? SMC_SF_EA_API_KEY : getenv('SMC_SF_EA_API_KEY')));
        if ($configured === '') {
            error_log('SMC SuperFIB: SMC_SF_EA_API_KEY is not configured.');
            return new WP_Error('smc_sf_api_key_unconfigured', 'EA ingest key not configured.', array('status' => 503));
        }

        if (!hash_equals($configured, $provided)) {
            return new WP_Error('smc_sf_api_key_invalid', 'Invalid API key.', array('status' => 403));
        }

        $payload = (array) $request->get_json_params();
        $ea_user_id = isset($payload['user_id']) ? (int) $payload['user_id'] : 0;
        if ($ea_user_id <= 0) {
            return new WP_Error('smc_sf_user_required', 'user_id is required for EA ingest.', array('status' => 400));
        }

        $user = get_userdata($ea_user_id);
        if (!$user || !user_can($user, 'read')) {
            return new WP_Error('smc_sf_user_invalid', 'user_id must reference a valid readable user.', array('status' => 403));
        }

        // Bind ingest writes to a concrete WordPress user context.
        wp_set_current_user($ea_user_id);

        return true;
    }

    private function get_ea_api_key(WP_REST_Request $request): string
    {
        $header_names = array(
            'x-ea-api-key',
            'x_ea_api_key',
            'x-api-key',
            'x_api_key',
        );

        foreach ($header_names as $name) {
            $value = trim((string) $request->get_header($name));
            if ($value !== '') {
                return $value;
            }
        }

        return '';
    }

    private function resolve_ea_user_id(): int
    {
        // EA key is global — resolve to the admin user
        // who owns the plugin installation
        $admin = get_users(array(
            'role'    => 'administrator',
            'number'  => 1,
            'orderby' => 'ID',
            'order'   => 'ASC',
            'fields'  => array('ID'),
        ));
        return !empty($admin) ? (int) $admin[0]->ID : 1;
    }

    private static function is_allowed_origin($origin, $allowed) {
        $normalized = untrailingslashit($origin);
        $allowed_normalized = array_map('untrailingslashit', $allowed);

        if (in_array($normalized, $allowed_normalized, true)) {
            return true;
        }

        $host = wp_parse_url($origin, PHP_URL_HOST);
        if (!$host) {
            return false;
        }

        if (preg_match('/^(?:[0-9a-f\-]+\.lovableproject\.com|id-preview--[0-9a-z\-]+\.lovable\.app)$/', $host)) {
            return true;
        }

        // Allow only explicitly trusted Worker hostnames listed in get_allowed_origins().
        // Do not allow wildcard *.workers.dev because CORS credentials are enabled.
        return false;
    }

    private static function get_allowed_origins() {
        return apply_filters('smc_sf_allowed_origins', array(
            home_url(),
            'https://trader.stokvelsociety.co.za',
            'https://smcsuperfibwebapp.klintaruvinga.workers.dev',
            'https://smcsmartfib.lovable.app',
            'https://id-preview--97eda4a2-efed-4b50-8b90-e9ac49043f57.lovable.app',
        ));
    }

    private static function get_cors_allowed_headers() {
        return 'Authorization, Content-Type, X-WP-Nonce, X-Sniper-Secret, X-EA-API-Key, X-API-KEY';
    }

    private static function send_cors_headers_for_origin($origin) {
        header('Vary: Origin', false);
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: ' . self::get_cors_allowed_headers());
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Max-Age: 86400');
    }

    private static function handle_options_preflight_request() {
        if (isset($_SERVER['REQUEST_METHOD']) && strtoupper($_SERVER['REQUEST_METHOD']) === 'OPTIONS') {
            $request_uri = $_SERVER['REQUEST_URI'] ?? '';
            if (strpos($request_uri, '/wp-json/sniper/v1/') !== false) {
                $allowed = self::get_allowed_origins();
                $origin  = isset($_SERVER['HTTP_ORIGIN']) ? sanitize_text_field(wp_unslash($_SERVER['HTTP_ORIGIN'])) : '';
                if ($origin && self::is_allowed_origin($origin, $allowed)) {
                    self::send_cors_headers_for_origin($origin);
                    header('Content-Length: 0');
                    http_response_code(204);
                    exit;
                }
            }
        }
    }

    /**
     * Regression guard: Ensure CORS allowed origins are consistently defined.
     * This prevents future CORS issues from protocol prefix mismatches.
     */
    private static function validate_cors_origins_consistency() {
        $allowed_origins = self::get_allowed_origins();
        $normalized_origins = array_map('untrailingslashit', $allowed_origins);

        // Validate that all origins include protocol (no bare hostnames)
        foreach ($allowed_origins as $origin) {
            if (!wp_parse_url($origin, PHP_URL_SCHEME)) {
                return false;
            }
        }

        // Validate that there are no duplicate origins after normalization.
        if (count($normalized_origins) !== count(array_unique($normalized_origins))) {
            return false;
        }

        return true;
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
        $user_id = get_current_user_id();

        // Fallback: REST API may not resolve cookie auth without a nonce (e.g. direct
        // browser navigation). Validate the auth cookie directly for this read-only endpoint.
        if (!$user_id) {
            $user_id = (int) wp_validate_auth_cookie('', 'logged_in');
            if ($user_id) {
                wp_set_current_user($user_id);
            }
        }

        if (!$user_id) {
            return rest_ensure_response(array(
                'status'  => 'ok',
                'auth'    => false,
                'message' => 'System is operational. Log in for detailed diagnostics.',
            ));
        }

        $key_status = $this->get_twelve_key_status($user_id);
        $last_batch = $this->latest_timestamp('snapshots', $user_id, 'updated_at');
        $last_run = $this->latest_timestamp('engine_runs', $user_id, 'created_at');
        $run_age      = $last_run ? (time() - strtotime($last_run . ' UTC')) : PHP_INT_MAX;
        $backend_sync = $run_age <= 120 ? 'live' : ($last_run ? 'stale' : 'offline');

        $batch_age = $last_batch ? (time() - strtotime($last_batch . ' UTC')) : PHP_INT_MAX;

        // feedStatus separates runtime feed health from credential validity.
        // rate-limited = temporary 429 cooldown (key remains ok).
        // blocked = key missing or invalid — feed cannot recover without user action.
        $settings = $this->get_settings($user_id);
        $feed_has_stale_symbols = false;
        $feed_any_rate_limited = false;
        $feed_requires_twelve_data = false;
        $mt5_live_symbols = 0;
        $watchlist_count = count($settings['watchlist']);
        foreach ($settings['watchlist'] as $symbol) {
            $mt5_authority = $this->is_mt5_authoritative($user_id, $symbol);
            if (!$mt5_authority) {
                $feed_requires_twelve_data = true;
            }
            $cached_price = $this->get_cached_price($user_id, $symbol, $settings['staleThresholdSec']);
            $mt5_price_live = $cached_price
                && ($cached_price['source'] ?? '') === 'mt5'
                && ($cached_price['state'] ?? '') === 'live';
            $price_age = isset($cached_price['age_sec']) ? (int) $cached_price['age_sec'] : PHP_INT_MAX;
            $symbol_rate_limited = $this->is_feed_rate_limited($user_id, $symbol);
            $mt5_candles_live = false;
            if ($mt5_price_live) {
                $candles = $this->fetch_candles($user_id, $symbol, '15min', 30);
                $last_candle = !empty($candles) ? end($candles) : null;
                $mt5_candles_live = count($candles) >= 30
                    && $last_candle
                    && $this->is_chart_candle_fresh($last_candle['time'] ?? null, '15min');
            }

            if ($mt5_price_live && $mt5_candles_live) {
                $mt5_live_symbols++;
            } elseif ($mt5_price_live || !$cached_price || ($cached_price['state'] ?? 'offline') !== 'live') {
                $feed_has_stale_symbols = true;
            }
            if (!$mt5_authority && $symbol_rate_limited) {
                $feed_any_rate_limited = true;
            }

            error_log(sprintf(
                '[PHASE0_SOAK] Health check: symbol=%s | mt5_live=%s | mt5_candles_live=%s | rate_limited=%s | age_sec=%d',
                $symbol,
                $mt5_price_live ? 'true' : 'false',
                $mt5_candles_live ? 'true' : 'false',
                $symbol_rate_limited ? 'true' : 'false',
                $price_age
            ));

            if ($symbol_rate_limited || !$mt5_price_live || !$mt5_candles_live) {
                $this->log_feed_debug('health.symbol', array(
                    'symbol' => $symbol,
                    'mt5_authority' => $mt5_authority,
                    'price_source' => $cached_price['source'] ?? 'none',
                    'price_state' => $cached_price['state'] ?? 'missing',
                    'price_age_sec' => isset($cached_price['age_sec']) ? (int) $cached_price['age_sec'] : null,
                    'mt5_price_live' => $mt5_price_live,
                    'mt5_candles_live' => $mt5_candles_live,
                    'rate_limited' => $symbol_rate_limited,
                ));
            }
        }

        $all_symbols_mt5_live = $watchlist_count > 0 && $mt5_live_symbols === $watchlist_count;

        if ($all_symbols_mt5_live) {
            $feed_status = 'live';
        } elseif ($feed_any_rate_limited) {
            $feed_status = 'rate-limited';
        } elseif ($feed_requires_twelve_data && $key_status !== 'ok') {
            $feed_status = 'blocked';
        } elseif (!$feed_has_stale_symbols && $batch_age <= 120) {
            $feed_status = 'live';
        } else {
            $feed_status = 'stale';
        }

        error_log(sprintf(
            '[PHASE0_SOAK] Final feed status: all_symbols_mt5_live=%s | feed_any_rate_limited=%s | key_status=%s | batch_age=%d | RESULT=%s',
            $all_symbols_mt5_live ? 'true' : 'false',
            $feed_any_rate_limited ? 'true' : 'false',
            $key_status,
            $batch_age,
            $feed_status
        ));
        // priceFeed kept for backwards compatibility.
        $price_feed = ($feed_status === 'live') ? 'live' : (($feed_status === 'blocked') ? 'blocked' : 'stale');

        if ($feed_status !== 'live' || $feed_any_rate_limited || $feed_has_stale_symbols) {
            $this->log_feed_debug('health.summary', array(
                'feed_status' => $feed_status,
                'price_feed' => $price_feed,
                'backend_sync' => $backend_sync,
                'watchlist_count' => $watchlist_count,
                'mt5_live_symbols' => $mt5_live_symbols,
                'requires_twelve_data' => $feed_requires_twelve_data,
                'stale_symbols' => $feed_has_stale_symbols,
                'rate_limited' => $feed_any_rate_limited,
            ));
        }

        // engineRunState: whether the last engine run used fresh data or a cached result.
        if (!$last_run) {
            $engine_run_state = 'failed';
        } elseif ($run_age <= 10) {
            $engine_run_state = 'live';
        } elseif ($run_age <= 120) {
            $engine_run_state = 'cached';
        } else {
            $engine_run_state = 'stale';
        }

        $snapshot = $this->get_engine_snapshot($user_id);

        return rest_ensure_response(array(
            'backendSync' => $backend_sync,
            'priceFeed' => $price_feed,
            'feedStatus' => $feed_status,
            'engineRunState' => $engine_run_state,
            'twelveDataKey' => $key_status === 'ok' ? 'present' : 'missing',
            'twelveDataKeyStatus' => $key_status,
            'lastBatchAt' => $this->to_iso($last_batch),
            'lastEngineRunAt' => $this->to_iso($last_run),
            'perSymbolDiagnostics' => is_array($snapshot) ? ($snapshot['diagnostics'] ?? array()) : array(),
        ));
    }

    public function get_user_settings() {
        $user_id = get_current_user_id();
        $settings = $this->get_settings($user_id);
        return rest_ensure_response($settings);
    }

    public function post_user_settings(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            $payload = array();
        }

        $current = $this->get_settings($user_id);
        $settings = array_merge($current, array(
            'backendUrl' => isset($payload['backendUrl']) ? esc_url_raw($payload['backendUrl']) : $current['backendUrl'],
            'refreshIntervalSec' => $this->int_between($payload, 'refreshIntervalSec', 2, 60, $current['refreshIntervalSec']),
            'staleThresholdSec' => $this->int_between($payload, 'staleThresholdSec', 10, 120, $current['staleThresholdSec']),
            'watchlist' => $this->sanitize_symbols(isset($payload['watchlist']) ? $payload['watchlist'] : $current['watchlist']),
            'riskAllocation' => $this->sanitize_risk_allocation(isset($payload['riskAllocation']) ? $payload['riskAllocation'] : $current['riskAllocation'], $current['riskAllocation']),
        ));
        $watchlist_changed = $current['watchlist'] !== $settings['watchlist'];

        $this->replace_json('user_settings', array(
            'user_id' => $user_id,
            'settings' => $settings,
            'updated_at' => $this->now_mysql(),
        ));
        if ($watchlist_changed) {
            $this->delete_engine_snapshot($user_id);
        }

        // Keep riskProfile in sync when the Settings tab edits the three overlapping risk-cap
        // fields so execution sizing always sees the latest user intent regardless of which tab
        // was used to change the values.
        if (isset($settings['riskAllocation']) && is_array($settings['riskAllocation'])) {
            $ra = $settings['riskAllocation'];
            $existing_blob = $this->get_account_blob($user_id);
            $existing_blob['riskProfile'] = array_merge(
                $this->get_risk_profile($user_id),
                array(
                    'perTradePct' => (float) ($ra['perTradePct'] ?? 0.5),
                    'dailyMaxPct' => (float) ($ra['dailyMaxPct'] ?? 2.0),
                    'ddCapPct'    => (float) ($ra['ddCapPct'] ?? 6.0),
                    'updatedAt'   => gmdate('c'),
                )
            );
            $this->replace_json('account_snapshots', array(
                'user_id'    => $user_id,
                'data'       => $existing_blob,
                'updated_at' => $this->now_mysql(),
            ));
        }

        $this->audit($user_id, 'settings.updated', array('watchlist' => $settings['watchlist']));

        return rest_ensure_response(array('ok' => true));
    }

    public function post_twelve_data_key(WP_REST_Request $request) {
        global $wpdb;

        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        $api_key = isset($payload['apiKey']) ? trim((string) $payload['apiKey']) : '';
        $test_only = !empty($payload['testOnly']);

        if ($api_key === '') {
            return rest_ensure_response(array('ok' => false, 'status' => 'missing', 'message' => 'Twelve Data API key is required.'));
        }

        // Reject keys that are clearly malformed before making any outbound request.
        if (strlen($api_key) < 8 || strlen($api_key) > 64 || !preg_match('/^[A-Za-z0-9_\-]+$/', $api_key)) {
            return rest_ensure_response(array('ok' => false, 'status' => 'invalid', 'message' => 'Invalid API key format.'));
        }

        $validation = $this->validate_twelve_key($api_key);
        if (!$validation['ok']) {
            return rest_ensure_response($validation);
        }

        if (!$test_only) {
            $encrypted = $this->encrypt_secret($api_key);
            if (is_wp_error($encrypted)) {
                return $encrypted;
            }

            $wpdb->replace(
                $this->table('integrations'),
                array(
                    'user_id' => $user_id,
                    'provider' => self::TWELVE_PROVIDER,
                    'encrypted_secret' => $encrypted,
                    'key_status' => 'ok',
                    'updated_at' => $this->now_mysql(),
                ),
                array('%d', '%s', '%s', '%s', '%s')
            );
            $this->clear_feed_rate_limit_state($user_id);
            $this->audit($user_id, 'twelve_data_key.saved', array('status' => 'ok'));
        }

        return rest_ensure_response(array('ok' => true, 'status' => 'ok'));
    }

    public function delete_twelve_data_key() {
        global $wpdb;
        $user_id = get_current_user_id();
        $wpdb->delete($this->table('integrations'), array('user_id' => $user_id, 'provider' => self::TWELVE_PROVIDER), array('%d', '%s'));
        $this->audit($user_id, 'twelve_data_key.deleted', array());
        return rest_ensure_response(array('ok' => true, 'status' => 'missing'));
    }

    public function get_instruments() {
        return rest_ensure_response($this->instrument_specs());
    }

    public function get_user_watchlist() {
        $user_id = get_current_user_id();
        $settings = $this->get_settings($user_id);
        return rest_ensure_response(array(
            'watchlist' => $settings['watchlist'],
            'supported' => array_keys($this->instrument_specs()),
        ));
    }

    public function post_user_watchlist(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        $symbols = isset($payload['watchlist']) && is_array($payload['watchlist']) ? $payload['watchlist'] : array();
        $validated = $this->validate_watchlist_symbols($symbols);
        $this->save_watchlist($user_id, $validated);
        $this->delete_engine_snapshot($user_id);
        $this->audit($user_id, 'watchlist.saved', array('watchlist' => $validated));
        return rest_ensure_response(array('ok' => true, 'watchlist' => $validated));
    }

    public function post_watchlist_add(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        $symbol = $this->normalize_symbol_token($payload['symbol'] ?? '');
        if ($symbol === '') {
            return new WP_Error('smc_sf_watchlist_symbol_missing', 'Symbol is required.', array('status' => 400));
        }
        if (!$this->is_supported_symbol($symbol)) {
            return new WP_Error('smc_sf_watchlist_unsupported', 'Symbol not supported: ' . $symbol, array('status' => 400));
        }
        $settings = $this->get_settings($user_id);
        $watchlist = $settings['watchlist'];
        if (!in_array($symbol, $watchlist, true)) {
            $watchlist[] = $symbol;
            $watchlist = array_slice($watchlist, 0, 24);
            $this->save_watchlist($user_id, $watchlist);
            $this->delete_engine_snapshot($user_id);
            $this->audit($user_id, 'watchlist.add', array('symbol' => $symbol));
        }
        return rest_ensure_response(array('ok' => true, 'watchlist' => $watchlist));
    }

    public function post_watchlist_remove(WP_REST_Request $request) {
        global $wpdb;
        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        $symbol = $this->normalize_symbol_token($payload['symbol'] ?? '');
        if ($symbol === '') {
            return new WP_Error('smc_sf_watchlist_symbol_missing', 'Symbol is required.', array('status' => 400));
        }
        $settings = $this->get_settings($user_id);
        $watchlist = array_values(array_filter($settings['watchlist'], function ($w) use ($symbol) {
            return $w !== $symbol;
        }));
        $this->save_watchlist($user_id, $watchlist);
        $this->delete_engine_snapshot($user_id);
        // Remove stale price row so the symbol does not reappear as a ghost price tile.
        $wpdb->delete($this->table('snapshots'), array('user_id' => $user_id, 'symbol' => $symbol), array('%d', '%s'));
        $this->audit($user_id, 'watchlist.remove', array('symbol' => $symbol));
        return rest_ensure_response(array('ok' => true, 'watchlist' => $watchlist));
    }

    public function get_user_risk_profile() {
        return rest_ensure_response($this->get_risk_profile(get_current_user_id()));
    }

    public function post_user_risk_profile(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            $payload = array();
        }

        $current = $this->get_risk_profile($user_id);
        $profile = array(
            'tier' => in_array(isset($payload['tier']) ? $payload['tier'] : '', array('conservative', 'balanced', 'aggressive'), true) ? $payload['tier'] : $current['tier'],
            'maxConcurrentTrades' => $this->int_between($payload, 'maxConcurrentTrades', 1, 10, $current['maxConcurrentTrades']),
            'perTradePct' => $this->float_between($payload, 'perTradePct', 0.1, 5.0, $current['perTradePct']),
            'dailyMaxPct' => $this->float_between($payload, 'dailyMaxPct', 0.1, 20.0, $current['dailyMaxPct']),
            'ddCapPct' => $this->float_between($payload, 'ddCapPct', 0.1, 50.0, $current['ddCapPct']),
            'cooldownMin' => $this->int_between($payload, 'cooldownMin', 0, 1440, $current['cooldownMin']),
            'updatedAt' => gmdate('c'),
        );

        // Merge only the riskProfile key; preserve existing account data untouched.
        $existing = $this->get_account_blob($user_id);
        $existing['riskProfile'] = $profile;
        $this->replace_json('account_snapshots', array(
            'user_id' => $user_id,
            'data' => $existing,
            'updated_at' => $this->now_mysql(),
        ));

        // Mirror the three overlapping risk-cap fields back to settings.riskAllocation so the
        // Settings tab and Risk tab always display consistent values after a risk save.
        $current_settings = $this->get_settings($user_id);
        $current_settings['riskAllocation'] = array_merge(
            is_array($current_settings['riskAllocation'] ?? null) ? $current_settings['riskAllocation'] : array(),
            array(
                'perTradePct' => $profile['perTradePct'],
                'dailyMaxPct' => $profile['dailyMaxPct'],
                'ddCapPct' => $profile['ddCapPct'],
            )
        );
        $this->replace_json('user_settings', array(
            'user_id' => $user_id,
            'settings' => $current_settings,
            'updated_at' => $this->now_mysql(),
        ));

        $this->audit($user_id, 'risk_profile.updated', $profile);

        return rest_ensure_response(array('ok' => true));
    }

    public function get_snapshot() {
        $user_id = get_current_user_id();
        $snapshot = $this->ensure_engine_snapshot($user_id);
        return rest_ensure_response($snapshot);
    }

    // MT5 webhook — process and store market data from MT5 EA
    public function post_snapshot(WP_REST_Request $request) {
        global $wpdb;

        $permission = $this->permission_user();
        if ($permission !== true) {
            return $permission;
        }

        $user_id = get_current_user_id();
        $payload = $request->get_json_params();

        if (!is_array($payload) || !isset($payload['symbol'])) {
            return new WP_REST_Response(array('error' => 'Invalid payload'), 400);
        }

        $symbol = strtoupper(sanitize_text_field($payload['symbol']));
        $normalized_symbol = isset($payload['normalized_symbol']) ? strtoupper(sanitize_text_field($payload['normalized_symbol'])) : $symbol;
        $freshness_raw = isset($payload['freshness']) ? sanitize_text_field($payload['freshness']) : '';
        $snapshot_state = $this->mt5_freshness_to_snapshot_state($freshness_raw);

        // Store tick data as price snapshot
        if (isset($payload['tick'])) {
            $tick = $payload['tick'];
            $bid = isset($tick['bid']) ? (float) $tick['bid'] : 0;
            $ask = isset($tick['ask']) ? (float) $tick['ask'] : 0;
            $spread = isset($tick['spread']) ? (int) $tick['spread'] : 0;
            $timestamp_mysql = $this->normalize_market_timestamp(isset($tick['timestamp']) ? $tick['timestamp'] : null, $this->now_mysql());
            $tick_snapshot_state = $freshness_raw !== '' ? $snapshot_state : 'live';

            $mid = ($bid + $ask) / 2;
            $changePct1d = 0; // Placeholder, could be calculated from historical data

            $wpdb->replace(
                $this->table('snapshots'),
                array(
                    'user_id' => $user_id,
                    'symbol' => $normalized_symbol,
                    'bid' => $bid,
                    'ask' => $ask,
                    'mid' => $mid,
                    'spread' => $spread,
                    'change_pct_1d' => $changePct1d,
                    'source' => 'mt5',
                    'state' => $tick_snapshot_state,
                    'updated_at' => $timestamp_mysql,
                ),
                array('%d', '%s', '%f', '%f', '%f', '%d', '%f', '%s', '%s', '%s')
            );
        } elseif ($freshness_raw !== '') {
            // Preserve the last authoritative quote timestamp when MT5 is only reporting a
            // freshness/session transition. Bumping updated_at here would fake a live quote.
            $wpdb->update(
                $this->table('snapshots'),
                array(
                    'state' => $snapshot_state,
                    'source' => 'mt5',
                ),
                array(
                    'user_id' => $user_id,
                    'symbol' => $normalized_symbol,
                ),
                array('%s', '%s'),
                array('%d', '%s')
            );
        }

        // Store M1 candle
        if (isset($payload['candle_m1'])) {
            $candle = $payload['candle_m1'];
            $timeframe = '1min';
            $candle_time = $this->normalize_market_timestamp(isset($candle['timestamp']) ? $candle['timestamp'] : null, $this->now_mysql());

            $wpdb->replace(
                $this->table('candles'),
                array(
                    'user_id' => $user_id,
                    'symbol' => $normalized_symbol,
                    'timeframe' => $timeframe,
                    'candle_time' => $candle_time,
                    'open' => (float) $candle['open'],
                    'high' => (float) $candle['high'],
                    'low' => (float) $candle['low'],
                    'close' => (float) $candle['close'],
                    'volume' => isset($candle['volume']) ? (string) $candle['volume'] : null,
                    'source' => 'mt5',
                    'created_at' => $this->now_mysql(),
                ),
                array('%d', '%s', '%s', '%s', '%f', '%f', '%f', '%f', '%s', '%s', '%s')
            );
        }

        // Store freshness state (could add to snapshots or new table)
        // For now, store in transients or extend snapshots table
        if (isset($payload['freshness'])) {
            $freshness = strtoupper($freshness_raw);
            set_transient('smc_sf_freshness_' . $user_id . '_' . $normalized_symbol, $freshness, 300); // 5 min
        }

        // Store session state
        if (isset($payload['session'])) {
            $session = sanitize_text_field($payload['session']);
            set_transient('smc_sf_session_' . $user_id . '_' . $normalized_symbol, $session, 300);
        }

        $this->audit($user_id, 'mt5_snapshot.processed', array(
            'symbol' => $symbol,
            'normalized_symbol' => $normalized_symbol,
            'has_tick' => isset($payload['tick']),
            'has_candle' => isset($payload['candle_m1']),
            'freshness' => $payload['freshness'] ?? null,
            'session' => $payload['session'] ?? null,
            'is_synthetic' => $payload['is_synthetic'] ?? false,
        ));

        return rest_ensure_response(array('ok' => true));
    }

    public function get_market_data_authority(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $symbol  = strtoupper(sanitize_text_field($request->get_param('symbol') ?: ''));

        $svc = new SMC_MarketData_Service();

        if ($symbol) {
            return rest_ensure_response($svc->get_authority_state($user_id, $symbol));
        }

        $watched = $this->get_settings($user_id)['watchlist'];
        if (empty($watched)) {
            $snapshot = $this->ensure_engine_snapshot($user_id);
            $watched = $snapshot['meta']['watchlist'] ?? array_column($snapshot['prices'] ?? array(), 'symbol');
        }
        $watched = array_values(array_unique(array_filter(array_map('strval', is_array($watched) ? $watched : array()))));
        $result   = array();
        foreach ($watched as $sym) {
            $result[$sym] = $svc->get_authority_state($user_id, $sym);
        }
        return rest_ensure_response($result);
    }

    public function get_authority_diagnostics(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $symbol  = strtoupper(sanitize_text_field($request->get_param('symbol') ?: ''));

        if (!$symbol) {
            return new WP_REST_Response(array('error' => 'symbol required'), 400);
        }

        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT source, updated_at FROM {$this->table('snapshots')} WHERE user_id = %d AND symbol = %s",
            $user_id,
            $symbol
        ));

        if (!$row) {
            return rest_ensure_response(array(
                'symbol' => $symbol,
                'authority' => 'unavailable',
                'authorityAgeSec' => null,
                'lastUpdateTime' => null,
            ));
        }

        $now_ts = strtotime($this->now_mysql());
        $update_ts = strtotime($row->updated_at);
        $age_sec = max(0, $now_ts - $update_ts);

        return rest_ensure_response(array(
            'symbol' => $symbol,
            'authority' => $row->source,  // 'mt5', 'twelve-data', or 'unavailable'
            'authorityAgeSec' => $age_sec,
            'lastUpdateTime' => $this->to_iso($row->updated_at),
            'authorityStale' => ($row->source === 'mt5' && $age_sec >= 60),
            'willFallbackToTD' => ($row->source === 'mt5' && $age_sec >= 60),
        ));
    }

    /**
     * MT5 EA market data ingestion endpoint
     * Accepts live price snapshots and OHLC candles from MT5 Expert Advisor
     * 
     * Expected payload:
     * {
     *   "symbol": "EURUSD",
     *   "timeframe": "M15",
     *   "timestamp": "2026-05-04T12:30:00Z",
     *   "bid": 1.08521,
     *   "ask": 1.08534,
     *   "candle": {
     *     "time": "2026-05-04T12:30:00Z",
     *     "open": 1.08450,
     *     "high": 1.08550,
     *     "low": 1.08420,
     *     "close": 1.08510,
     *     "volume": 1234
     *   }
     * }
     */
    public function post_ea_market_stream(WP_REST_Request $request) {
        global $wpdb;

        $payload = $request->get_json_params();
        $user_id = isset($payload['user_id']) ? (int) $payload['user_id'] : 0;
        if ($user_id <= 0) {
            $user_id = $this->resolve_ea_user_id();
        }

        $user = get_userdata($user_id);
        if (!$user || !user_can($user, 'read')) {
            return new WP_Error('smc_sf_user_invalid', 'user_id must reference a valid readable user.', array('status' => 403));
        }

        // Regression guard: Validate payload structure
        if (!$payload || !isset($payload['symbol'])) {
            $this->audit($user_id, 'ea.market_stream.invalid_payload', array('reason' => 'missing_symbol', 'payload' => $payload));
            return new WP_Error('invalid_payload', 'Missing required symbol field', array('status' => 400));
        }

        $symbol = sanitize_text_field(strtoupper($payload['symbol']));
        if (!empty($payload['normalized_symbol'])) {
            $symbol = preg_replace('/[^A-Z0-9]/', '', strtoupper(sanitize_text_field($payload['normalized_symbol'])));
        }
        $timeframe = $this->normalize_mt5_timeframe($payload['timeframe'] ?? 'M15');
        $snapshot_updated_at = $this->normalize_market_timestamp($payload['timestamp'] ?? null, $this->now_mysql());

        // HARDENING: Separate snapshot-freshness from candle-freshness.
        // The top-level timestamp is the EA's tick time (broker clock). During weekend,
        // thin-market, or broker-jitter conditions this can drift 60–180s while the
        // bid/ask snapshot is still the most current available price.
        // Only hard-reject at 300s (5 min) at the payload level; candle staleness is
        // enforced at 180s inside insert_mt5_candle() with a full audit trail.
        // This preserves snapshots during low-liquidity sessions.
        if (!empty($payload['timestamp'])) {
            $normalized_payload_timestamp = $this->normalize_market_timestamp($payload['timestamp'], null);
            $data_timestamp = $normalized_payload_timestamp ? strtotime($normalized_payload_timestamp) : false;

            if ($data_timestamp === false) {
                $this->audit($user_id, 'ea.market_stream.stale_data_rejected', array(
                    'symbol' => $symbol,
                    'timestamp' => $payload['timestamp'],
                    'normalized_timestamp' => $normalized_payload_timestamp,
                    'reason' => 'unparseable_timestamp',
                    'rejection_level' => 'payload',
                ));
                return new WP_Error('stale_data', 'Rejected market data with unparseable timestamp', array('status' => 400));
            }

            $now_timestamp = time();
            $age_seconds = $now_timestamp - $data_timestamp;

            if ($age_seconds > 300) {
                $this->audit($user_id, 'ea.market_stream.stale_data_rejected', array(
                    'symbol' => $symbol,
                    'timestamp' => $payload['timestamp'],
                    'normalized_timestamp' => $normalized_payload_timestamp,
                    'age_seconds' => $age_seconds,
                    'rejection_level' => 'payload',
                ));
                return new WP_Error('stale_data', 'Rejected market data older than 300 seconds', array('status' => 400));
            }

            // Warn (but don't reject) between 120–300s so the log shows drift without losing the snapshot.
            if ($age_seconds > 120) {
                error_log("MT5 DRIFT WARNING: {$symbol} | payload_age={$age_seconds}s | snapshot will write, candle gated separately");
            }
        }

        $inserted_snapshots = 0;
        $inserted_candles = 0;

        if (!isset($payload['bid'], $payload['ask'])) {
            return new WP_Error('missing_prices', 'bid and ask are required.', array('status' => 400));
        }

        // Insert price snapshot (bid/ask required).
        if (isset($payload['bid'], $payload['ask'])) {
            $bid = (float) $payload['bid'];
            $ask = (float) $payload['ask'];
            
            if ($bid > 0 && $ask > 0 && $bid <= $ask) {
                $result = $this->upsert_mt5_snapshot($user_id, $symbol, $bid, $ask, $snapshot_updated_at);
                if ($result) {
                    $inserted_snapshots = 1;
                    delete_transient('smc_sf_qt_' . $user_id . '_' . md5($symbol));
                    delete_transient($this->rl_transient_key($user_id, $symbol));
                }
            } else {
                $this->audit($user_id, 'ea.market_stream.invalid_prices', array(
                    'symbol' => $symbol,
                    'bid' => $bid,
                    'ask' => $ask
                ));
            }
        }

        // Insert candle if provided (closed candle only, dedupe via UNIQUE candle key).
        if (!empty($payload['candle']) && is_array($payload['candle'])) {
            $candle = $payload['candle'];
            
            // Validate required candle fields
            if (isset($candle['time'], $candle['open'], $candle['high'], $candle['low'], $candle['close'])) {
                // REGRESSION GUARD: Reject candles with epoch or pre-2000 timestamps.
                // A valid live candle must be after 2000-01-01 (Unix ts 946684800).
                // This catches both zero-datetime (1970) and any other MQL5 uninitialised
                // MqlRates.time value that slips through the EA-side epoch guard.
                $candle_ts = strtotime($candle['time']);
                $min_valid_ts = 946684800; // 2000-01-01 00:00:00 UTC
                if ($candle_ts === false || $candle_ts <= 0 || $candle_ts < $min_valid_ts) {
                    error_log("REGRESSION GUARD: Rejecting candle with invalid/epoch timestamp for {$symbol} | time={$candle['time']} | parsed_ts={$candle_ts} | min_valid={$min_valid_ts}");
                    $this->audit($user_id, 'ea.market_stream.invalid_candle_timestamp', array(
                        'symbol' => $symbol,
                        'candle_time' => $candle['time'],
                        'parsed_timestamp' => $candle_ts
                    ));
                } else {
                    $result = $this->insert_mt5_candle($user_id, $symbol, $timeframe, $candle, $payload['timestamp'] ?? null);
                    if ($result) {
                        $inserted_candles = 1;
                    } else {
                        error_log("MT5 CANDLE INSERT FAILED: {$symbol} | tf={$timeframe} | time={$candle['time']} | stream_timestamp=" . ($payload['timestamp'] ?? 'null'));
                    }
                }
            } else {
                error_log("MT5 CANDLE PAYLOAD INVALID: " . print_r($candle, true));
                $this->audit($user_id, 'ea.market_stream.invalid_candle', array(
                    'symbol' => $symbol,
                    'candle' => $candle
                ));
            }
        } else {
            error_log("MT5 CANDLE PAYLOAD MISSING OR INVALID FOR SYMBOL: {$symbol}");
        }

        // Insert M15 candle if provided (separate from M1).
        // This is critical: the engine requires at least 30 closed M15 bars to run.
        // Without M15 candles, the engine hard-exits at fetch_candles() with INSUFFICIENT_CANDLE_HISTORY.
        if (!empty($payload['candle_m15']) && is_array($payload['candle_m15'])) {
            $candle_m15 = $payload['candle_m15'];
            
            if (isset($candle_m15['time'], $candle_m15['open'], $candle_m15['high'], $candle_m15['low'], $candle_m15['close'])) {
                $candle_m15_ts = strtotime($candle_m15['time']);
                $min_valid_ts = 946684800; // 2000-01-01 00:00:00 UTC
                if ($candle_m15_ts === false || $candle_m15_ts <= 0 || $candle_m15_ts < $min_valid_ts) {
                    error_log("REGRESSION GUARD: Rejecting M15 candle with invalid/epoch timestamp for {$symbol} | time={$candle_m15['time']} | parsed_ts={$candle_m15_ts} | min_valid={$min_valid_ts}");
                    $this->audit($user_id, 'ea.market_stream.invalid_m15_candle_timestamp', array(
                        'symbol' => $symbol,
                        'candle_time' => $candle_m15['time'],
                        'parsed_timestamp' => $candle_m15_ts
                    ));
                } else {
                    $result = $this->insert_mt5_candle($user_id, $symbol, '15min', $candle_m15, $payload['timestamp'] ?? null, 1800);
                    if ($result) {
                        $inserted_candles++;  // ← ADD THIS LINE: count M15 inserts in API response
                    } else {
                        error_log("MT5 M15 CANDLE INSERT FAILED: {$symbol} | timeframe=15min | time={$candle_m15['time']} | stream_timestamp=" . ($payload['timestamp'] ?? 'null'));
                    }
                }
            } else {
                error_log("MT5 M15 CANDLE PAYLOAD INVALID: " . print_r($candle_m15, true));
                $this->audit($user_id, 'ea.market_stream.invalid_m15_candle', array(
                    'symbol' => $symbol,
                    'candle_m15' => $candle_m15
                ));
            }
        }

        if (!empty($payload['freshness'])) {
            $freshness = strtoupper(sanitize_text_field($payload['freshness']));
            set_transient('smc_sf_freshness_' . $user_id . '_' . $symbol, $freshness, 300);
        }

        if (!empty($payload['session'])) {
            $session = sanitize_text_field($payload['session']);
            set_transient('smc_sf_session_' . $user_id . '_' . $symbol, $session, 300);
        }

        if ($inserted_snapshots > 0) {
            $wpdb->insert(
                $this->table('engine_runs'),
                array(
                    'user_id' => $user_id,
                    'status' => 'heartbeat',
                    'summary' => wp_json_encode(array('source' => 'ea_push', 'symbol' => $symbol)),
                    'created_at' => $this->now_mysql(),
                ),
                array('%d', '%s', '%s', '%s')
            );
        }

        // Audit successful ingestion
        $this->audit($user_id, 'ea.market_stream.ingested', array(
            'symbol' => $symbol,
            'snapshots_inserted' => $inserted_snapshots,
            'candles_inserted' => $inserted_candles,
            'timestamp' => $payload['timestamp'] ?? null,
            'freshness' => $payload['freshness'] ?? null,
            'session' => $payload['session'] ?? null
        ));

        return rest_ensure_response(array(
            'ok' => true,
            'symbol' => $symbol,
            'snapshots_inserted' => $inserted_snapshots,
            'candles_inserted' => $inserted_candles,
            'server_time' => gmdate('c')
        ));
    }

    /**
     * Insert or update MT5 price snapshot
     * Regression guard: Atomic operation with proper source tagging
     */
    private function upsert_mt5_snapshot($user_id, $symbol, $bid, $ask, $updated_at = null) {
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
                'state' => 'live',
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
    private function insert_mt5_candle($user_id, $symbol, $timeframe, $candle, $stream_timestamp = null, $max_age_sec = 180) {
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
                'volume' => isset($candle['volume']) ? (string) $candle['volume'] : '0',
                'source' => 'mt5',
                'created_at' => $this->now_mysql()
            ),
            array('%d', '%s', '%s', '%s', '%f', '%f', '%f', '%f', '%s', '%s', '%s')
        );

        return $result !== false;
    }

    public function get_regimes() {
        $user_id = get_current_user_id();
        $snapshot = $this->ensure_engine_snapshot($user_id);
        return rest_ensure_response($snapshot['regimes'] ?? array());
    }

    // Pine webhook stub — intentionally audit-only until Pine alert integration is implemented.
    public function post_regime(WP_REST_Request $request) {
        $this->audit(get_current_user_id(), 'regime.posted', (array) $request->get_json_params());
        return rest_ensure_response(array('ok' => true));
    }

    public function get_live_signals() {
        $user_id = get_current_user_id();
        $snapshot = $this->ensure_engine_snapshot($user_id);
        return rest_ensure_response($snapshot['signals'] ?? array());
    }

    // Pine webhook stub — intentionally audit-only until Pine alert integration is implemented.
    public function post_signal(WP_REST_Request $request) {
        $this->audit(get_current_user_id(), 'signal.posted', (array) $request->get_json_params());
        return rest_ensure_response(array('ok' => true));
    }

    public function get_ladders(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $symbol = strtoupper(sanitize_text_field($request->get_param('symbol')));
        $snapshot = $this->ensure_engine_snapshot($user_id);
        $plans = $snapshot['plans'] ?? array();
        if ($symbol) {
            $plans = array_values(array_filter($plans, function ($plan) use ($symbol) {
                return isset($plan['symbol']) && $plan['symbol'] === $symbol;
            }));
        }
        return rest_ensure_response($plans);
    }

    public function get_chart_snapshot(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $symbol = strtoupper(sanitize_text_field($request->get_param('symbol') ?: 'GBPUSD'));
        $timeframe = sanitize_text_field($request->get_param('timeframe') ?: '15min');
        $candles = $this->fetch_candles($user_id, $symbol, $timeframe, 120);
        $state = 'offline';
        $updated_at = null;
        if (!empty($candles)) {
            $last_candle = end($candles);
            $updated_at = isset($last_candle['time']) ? $last_candle['time'] : null;
            $state = $this->is_chart_candle_fresh($last_candle['time'] ?? null, $timeframe) ? 'live' : 'stale';
        } else {
            $state = $this->get_twelve_key_status($user_id) === 'ok' ? 'stale' : 'blocked';
        }
        $levels = $this->fib_levels_from_candles($candles);

        return rest_ensure_response(array(
            'symbol' => $symbol,
            'timeframe' => $timeframe,
            'candles' => $candles,
            'fibLevels' => $levels,
            'updatedAt' => $updated_at,
            'state' => $state,
        ));
    }

    public function post_user_market_data(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        $symbols = isset($payload['symbols']) ? $this->sanitize_symbols($payload['symbols']) : $this->get_settings($user_id)['watchlist'];
        return rest_ensure_response($this->refresh_prices($user_id, $symbols));
    }

    public function get_user_trades() {
        $user_id = get_current_user_id();
        return rest_ensure_response(array(
            'positions' => $this->read_trade_payloads($user_id, 'position'),
            'orders' => $this->read_pending_orders($user_id),
        ));
    }

    // Audit-only stub — does not process payload; trade state is sourced from MT4/MT5 bridge.
    public function post_user_trades(WP_REST_Request $request) {
        $this->audit(get_current_user_id(), 'trades.posted', (array) $request->get_json_params());
        return rest_ensure_response(array('ok' => true));
    }

    public function get_user_account() {
        return rest_ensure_response($this->get_account_state(get_current_user_id()));
    }

    public function post_user_account(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            $payload = array();
        }

        // Only allow updating user-supplied numeric fields; computed fields (openPositions,
        // pendingOrders) are always derived from live DB state and cannot be overwritten.
        $writable = array('balanceUSC', 'equityUSC', 'marginUsedPct', 'drawdownPct', 'todayPnlUSC', 'todayPnlPct');
        $update = array();
        foreach ($writable as $key) {
            if (array_key_exists($key, $payload)) {
                $update[$key] = (float) $payload[$key];
            }
        }

        $existing = $this->get_account_blob($user_id);
        $existing['account'] = array_merge(
            isset($existing['account']) && is_array($existing['account']) ? $existing['account'] : array(),
            $update,
            array('updatedAt' => gmdate('c'))
        );
        $this->replace_json('account_snapshots', array(
            'user_id' => $user_id,
            'data' => $existing,
            'updated_at' => $this->now_mysql(),
        ));
        $this->audit($user_id, 'account.updated', $update);
        return rest_ensure_response(array('ok' => true));
    }

    public function get_user_trade_queue() {
        return rest_ensure_response($this->read_pending_orders(get_current_user_id()));
    }

    // Audit-only stub — does not process payload; trade state is sourced from MT4/MT5 bridge.
    public function post_user_trade_queue(WP_REST_Request $request) {
        $this->audit(get_current_user_id(), 'trade_queue.posted', (array) $request->get_json_params());
        return rest_ensure_response(array('ok' => true));
    }

    public function post_execute_signals(WP_REST_Request $request) {
        global $wpdb;

        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        $ids = isset($payload['signalIds']) && is_array($payload['signalIds']) ? $payload['signalIds'] : array();
        $queued = 0;

        foreach ($ids as $signal_id) {
            $signal_id = sanitize_text_field($signal_id);
            $signal = $wpdb->get_row($wpdb->prepare(
                "SELECT * FROM {$this->table('signals')} WHERE id = %s AND user_id = %d",
                $signal_id,
                $user_id
            ), ARRAY_A);

            // CRITICAL: Only allow execution of backend-confirmed READY signals.
            // Reject ANY signal with backend_confirmed=0, regardless of frontend status.
            // This prevents frontend-only signal execution.
            if (!$signal || (int) $signal['backend_confirmed'] !== 1 || $signal['status'] !== 'READY') {
                $this->audit($user_id, 'signals.execute.rejected', array(
                    'signal_id' => $signal_id,
                    'reason' => !$signal ? 'not_found' : ((int) $signal['backend_confirmed'] !== 1 ? 'not_confirmed' : 'not_ready'),
                ));
                continue;
            }

            $plan_row = $wpdb->get_row($wpdb->prepare(
                "SELECT plan FROM {$this->table('trade_plans')} WHERE signal_id = %s AND user_id = %d",
                $signal_id,
                $user_id
            ), ARRAY_A);

            if (!$plan_row) {
                continue;
            }

            $plan = json_decode($plan_row['plan'], true);
            foreach (array('e1', 'e2', 'e3') as $stage) {
                // Deterministic ID: same signal+stage always maps to the same row so that
                // wpdb::replace deduplicates repeated execute calls instead of inserting extras.
                $order_id = 'ord-' . substr(md5($signal_id . '|' . $stage), 0, 16);
                // Map each entry stage to its corresponding TP: e1→tp1, e2→tp2, e3→tp3.
                $tp_key = 'tp' . substr($stage, 1);
                $order = array(
                    'id' => $order_id,
                    'symbol' => $signal['symbol'],
                    'direction' => $signal['direction'],
                    'type' => 'LIMIT',
                    'price' => $plan['entries'][$stage],
                    'lots' => $plan['lotSize'][$stage],
                    'sl' => isset($plan['stops'][$stage]) ? $plan['stops'][$stage] : $plan['sl'],
                    'tp' => isset($plan['tps'][$tp_key]) ? $plan['tps'][$tp_key] : $plan['tps']['tp1'],
                    'placedAt' => gmdate('c'),
                    'state' => 'pending-sync',
                );

                $wpdb->replace(
                    $this->table('trade_queue'),
                    array(
                        'id' => $order_id,
                        'user_id' => $user_id,
                        'signal_id' => $signal_id,
                        'payload' => wp_json_encode($order),
                        'state' => 'pending-sync',
                        'created_at' => $this->now_mysql(),
                    ),
                    array('%s', '%d', '%s', '%s', '%s', '%s')
                );
                $queued++;
            }
        }

        $this->audit($user_id, 'signals.executed', array('signalIds' => $ids, 'queued' => $queued));
        return rest_ensure_response(array('ok' => true, 'queued' => $queued));
    }

    public function post_engine_batch(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        $symbols = isset($payload['symbols']) ? $this->sanitize_symbols($payload['symbols']) : $this->get_settings($user_id)['watchlist'];
        // Force fresh data by clearing quote TTL, candle TTL, and rate-limit transients per symbol.
        // Without clearing candle TTL, a force-refresh fetches new quotes but returns 90-second-old
        // cached candles from the DB, producing a stale-candle / fresh-price mismatch.
        // Without clearing rate-limit transients, a previous 429 keeps all pairs stuck on
        // "Feed rate-limited — cooling down" even after the user explicitly requests a refresh.
        foreach ($symbols as $sym) {
            delete_transient('smc_sf_qt_' . $user_id . '_' . md5($sym));
            delete_transient('smc_sf_ct_' . $user_id . '_' . md5($sym . '|15min'));
            delete_transient($this->rl_transient_key($user_id, $sym));
        }
        $snapshot = $this->ensure_engine_snapshot($user_id, true);
        return rest_ensure_response(array(
            'ok' => true,
            'diagnostics' => isset($snapshot['diagnostics']) ? $snapshot['diagnostics'] : array(),
        ));
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
                $sig = $state['signal'];
                $sig_created = gmdate('Y-m-d H:i:s', strtotime($sig['createdAt']));
                $wpdb->query($wpdb->prepare(
                    "INSERT INTO `{$this->table('signals')}` (id, user_id, symbol, direction, status, verdict, confluence, engine, backend_confirmed, created_at, updated_at) VALUES (%s, %d, %s, %s, %s, %s, %s, %s, %d, %s, %s) ON DUPLICATE KEY UPDATE symbol=VALUES(symbol), direction=VALUES(direction), status=VALUES(status), verdict=VALUES(verdict), confluence=VALUES(confluence), engine=VALUES(engine), backend_confirmed=VALUES(backend_confirmed), updated_at=VALUES(updated_at)",
                    $sig['id'],
                    $user_id,
                    $symbol,
                    $sig['direction'],
                    $sig['status'],
                    $sig['verdict'],
                    wp_json_encode($sig['confluence']),
                    wp_json_encode($sig['engine']),
                    $sig['backendConfirmed'] ? 1 : 0,
                    $sig_created,
                    $this->now_mysql()
                ));
            }

            if ($state['plan']) {
                $plans[] = $state['plan'];
                $wpdb->replace(
                    $this->table('trade_plans'),
                    array(
                        'signal_id' => $state['plan']['signalId'],
                        'user_id' => $user_id,
                        'plan' => wp_json_encode($state['plan']),
                        'updated_at' => $this->now_mysql(),
                    ),
                    array('%s', '%d', '%s', '%s')
                );
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

        $result = array('regimes' => $regimes, 'gates' => $gates, 'signals' => $signals, 'plans' => $plans, 'diagnostics' => $diagnostics);
        set_transient($transient_key, $result, 5);

        return $result;
    }

    private function build_symbol_state($user_id, $symbol, $price) {
        $candles = $this->fetch_candles($user_id, $symbol, '15min', 120);
        $has_key = $this->get_twelve_key_status($user_id) === 'ok';
        $settings = $this->get_settings($user_id);
        $stale_threshold_sec = $settings['staleThresholdSec'];
        $mt5_authority = $this->is_mt5_authoritative($user_id, $symbol);
        $state = ($has_key || $mt5_authority) ? 'stale' : 'blocked';

        if (!$price) {
            $price = array('symbol' => $symbol, 'mid' => 0, 'updatedAt' => gmdate('c'), 'state' => $state);
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
        $pd_state = $this->pd_state($position_ratio);
        $bias = $move > $range * 0.2 ? 'BULL' : ($move < -$range * 0.2 ? 'BEAR' : 'RANGING');
        $chop = round(max(0, min(1, 1 - (abs($move) / $range))), 2);
        $levels = $this->fib_levels($high, $low, 'LTF_SF');
        $nearest = $this->nearest_level($levels, $close);
        $sequence = $this->sequence_state($candles);
        $direction = $position_ratio >= 62.5 ? 'LONG' : ($position_ratio <= 25 ? 'SHORT' : ($bias === 'BEAR' ? 'SHORT' : 'LONG'));
        $f3_chop = ($position_ratio >= 37.5 && $position_ratio <= 62.5) || $chop >= 0.7 ? 'caution' : 'clear';
        $hta_override = $position_ratio < 0 || $position_ratio > 100;
        $status = 'WATCH';

        if (!$sequence[$direction]['sweep']) {
            $status = 'WATCH';
        } elseif (!$sequence[$direction]['mss']) {
            $status = 'ARMED';
        } elseif ($chop >= 0.7) {
            // CRITICAL: Block READY status when chop >= 0.7 (F3 caution zone).
            // SMC methodology requires no entries in high-chop equilibrium.
            $status = 'ARMED';
        } else {
            $status = 'READY';
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
        $data_live      = $price_is_live && $candles_fresh;
        $symbol_state   = $data_live ? 'live' : 'stale';
        $candle_state   = empty($candles) ? 'missing' : ($candles_fresh ? 'live' : 'stale');

        // CRITICAL HARDENING: Block gate when chop >= 0.7 (F3 caution zone).
        // SMC methodology requires no entries in high-chop equilibrium; this was
        // missing from the live backend while the mock data showed BLOCKED correctly.
        if ($chop >= 0.7) {
            $gate = array(
                'symbol' => $symbol,
                'allow'  => 'BLOCKED',
                'reason' => 'chop > 0.7 — F3 caution zone',
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
            'symbol' => $symbol,
            'bias' => $bias,
            'chop' => $chop,
            'nearestFib' => $nearest ? $nearest['price'] : null,
            'updatedAt' => gmdate('c'),
            'state' => $symbol_state,
        );

        $ltf_level = $this->execution_level($levels, $direction);

        // A signal may only be backend-confirmed when the price feed is live AND candles are
        // fresh (last candle no older than 2 hours — two 15-min bars worth of normal delay plus
        // buffer). Stale data can never produce a READY backend-confirmed signal.

        // Anchor the signal identity to the latest analysed candle so the same setup stays stable
        // within one 15m bar, while later intraday setups get a distinct execution queue identity.
        $engine_blocker = $this->determine_engine_blocker($user_id, $price, $candles, $data_live, $status, $symbol, $chop);

        $signal_anchor = $last_candle && !empty($last_candle['time']) ? $last_candle['time'] : gmdate('c');
        $signal_id = 'sig-' . substr(md5($user_id . '|' . $symbol . '|' . $direction . '|' . $signal_anchor), 0, 16);
        $signal = array(
            'id' => $signal_id,
            'symbol' => $symbol,
            'direction' => $direction,
            'status' => $status,
            'confluence' => $confluence,
            'verdict' => $this->verdict($status, $confluence, $chop),
            'computedBy' => 'backend',
            // CRITICAL HARDENING: Never backend-confirm a signal unless status is READY
            // (which already incorporates chop gate blocking). Without this guard, 
            // post_execute_signals() would still accept and queue non-READY signals.
            'backendConfirmed' => $status === 'READY' && $data_live,
            'engineBlocker' => $engine_blocker,
            'createdAt' => $signal_anchor,
            'engine' => array(
                'htfBias' => $bias === 'RANGING' ? 'TRANSITIONAL' : $bias,
                'pdState' => $pd_state,
                'drawOnLiquidity' => $direction === 'LONG' ? 'opposing buy-side liquidity' : 'opposing sell-side liquidity',
                'sweep' => $sequence[$direction]['sweep'] ? 'present' : 'absent',
                'mss' => $sequence[$direction]['mss'] ? 'present' : 'absent',
                'displacement' => $sequence[$direction]['displacement'],
                'htaOverride' => $hta_override,
                'f3Chop' => $f3_chop,
                'ltfLevel' => $ltf_level,
                'firstReactionFamily' => $hta_override ? 'HTA_SF' : 'LTF_SF',
                'chartState' => 'chart-derived',
                'panelState' => null,
            ),
        );

        $diagnostic = array(
            'symbol' => $symbol,
            'priceState' => $price['state'] ?? $symbol_state,
            'candleState' => $candle_state,
            'lastPriceAt' => $price['updatedAt'] ?? null,
            'lastCandleAt' => $last_candle ? $last_candle['time'] : null,
            'candleCount' => count($candles),
            'engineBlocker' => $engine_blocker,
        );

        return array(
            'regime' => $regime,
            'gate' => $gate,
            'signal' => $signal,
            'plan' => $this->build_trade_plan($user_id, $signal, $high, $low, $sequence, $candles),
            'diagnostic' => $diagnostic,
        );
    }

    private function build_trade_plan($user_id, $signal, $high, $low, $sequence, $candles) {
        $risk = $this->get_risk_profile($user_id);
        $account = $this->get_account_state($user_id);
        $equity = max((float) $account['equityUSC'], 1);
        $risk_usc = round($equity * ((float) $risk['perTradePct'] / 100), 2);
        $is_long = $signal['direction'] === 'LONG';

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

        foreach (array('e1', 'e2', 'e3') as $idx => $stage) {
            $entries[$stage] = $this->price_for_ratio($high, $low, $ratios[$idx]);
            $stops[$stage]   = $this->price_for_ratio($high, $low, $stop_ratios[$idx]);
            $ladder[$stage]  = array('ratio' => $ratios[$idx], 'stopRatio' => $stop_ratios[$idx], 'family' => 'LTF_SF');
        }

        foreach (array('tp1', 'tp2', 'tp3') as $idx => $tp_key) {
            $tps[$tp_key] = $this->price_for_ratio($high, $low, $target_ratios[$idx]);
        }

        // Compute lot sizes from risk budget. Weights match 1:2:3 so each stage carries a
        // proportional share; rounding to the nearest micro-lot (0.01) keeps broker precision.
        $sym = $signal['symbol'];
        $spec = $this->get_instrument_spec($sym);
        $pip = $spec ? (float) $spec['pip_size'] : 0.0001;
        $pip_val = $spec ? $this->pip_value_per_standard_lot($user_id, $sym, $spec) : 10.0;
        $risk_weights = array('e1' => 1, 'e2' => 2, 'e3' => 3);
        foreach (array('e1', 'e2', 'e3') as $stage) {
            $stop_dist = max(abs($entries[$stage] - $stops[$stage]), $pip);
            $stop_pips = $stop_dist / $pip;
            $stage_risk = $risk_usc * ($risk_weights[$stage] / 6.0);
            $raw_lots = $stage_risk / max($stop_pips * $pip_val, 0.01);
            $lots[$stage] = max(0.01, round($raw_lots / 0.01) * 0.01);
        }

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
            'riskZAR' => round($risk_usc * 18.5, 2),
            'drawdownImpactPct' => round(($risk_usc / $equity) * 100, 4),
            'source' => 'backend-blueprint',
            'executionSource' => 'LTF_SF',
            'ladderId' => md5($signal['id']),
            'direction' => $signal['direction'],
            'stageFills' => array('e1' => false, 'e2' => false, 'e3' => false),
            'state' => 'ACTIVE',
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

    private function map_symbol_aliases($symbol) {
        static $aliases = array(
            'NASDAQ' => 'NAS100',
            'US TECH 100' => 'NAS100',
            'USTECH100' => 'NAS100',
            // Add more aliases as needed
        );
        $upper = strtoupper(trim((string) $symbol));
        return isset($aliases[$upper]) ? $aliases[$upper] : $symbol;
    }

    private function reference_mid_from_market($market_mids, $symbol) {
        $key = $this->normalize_symbol_token($symbol);
        return isset($market_mids[$key]) ? (float) $market_mids[$key] : 0.0;
    }

    private function split_symbol_pair($symbol) {
        $key = $this->normalize_symbol_token($symbol);
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

    private function refresh_prices($user_id, $symbols) {
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

    private function fetch_candles($user_id, $symbol, $timeframe, $outputsize) {
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

    private function validate_twelve_key($api_key) {
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

    private function get_settings($user_id) {
        global $wpdb;

        $default = array(
            'backendUrl' => rest_url(),
            'apiKeyStatus' => $this->get_twelve_key_status($user_id),
            'refreshIntervalSec' => 2,
            'staleThresholdSec' => 60,
            'watchlist' => array('GBPUSD', 'AUDUSD', 'EURUSD', 'NZDUSD', 'USDJPY', 'AUDJPY', 'EURJPY', 'XAUUSD'),
            'riskAllocation' => array('perTradePct' => 0.5, 'dailyMaxPct' => 2.0, 'ddCapPct' => 6.0),
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
        $default['watchlist'] = $this->sanitize_symbols($default['watchlist']);

        return $default;
    }

    private function get_risk_profile($user_id) {
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

    private function get_account_state($user_id) {
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

    private function get_account_blob($user_id) {
        global $wpdb;
        $row = $wpdb->get_var($wpdb->prepare(
            "SELECT data FROM {$this->table('account_snapshots')} WHERE user_id = %d",
            $user_id
        ));
        $decoded = $row ? json_decode($row, true) : array();
        return is_array($decoded) ? $decoded : array();
    }

    private function read_trade_payloads($user_id, $kind) {
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

    private function read_pending_orders($user_id) {
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

    private function get_engine_snapshot($user_id) {
        $snapshot = get_user_meta($user_id, 'smc_sf_engine_snapshot', true);
        return is_array($snapshot) ? $snapshot : null;
    }

    private function ensure_engine_snapshot($user_id, $force = false) {
        $settings = $this->get_settings($user_id);
        $symbols = $settings['watchlist'];
        $snapshot = $this->get_engine_snapshot($user_id);

        if (!$force && $this->is_engine_snapshot_current($snapshot, $symbols, (int) $settings['refreshIntervalSec'])) {
            return $snapshot;
        }

        $prices = $this->refresh_prices($user_id, $symbols);
        $engine = $this->run_engine_for_symbols($user_id, $symbols, $prices, $force);
        $snapshot = array(
            'prices' => $prices,
            'regimes' => $engine['regimes'],
            'gates' => $engine['gates'],
            'signals' => $engine['signals'],
            'plans' => $engine['plans'],
            'diagnostics' => $engine['diagnostics'] ?? array(),
            'meta' => array(
                'computedAt' => gmdate('c'),
                'watchlist' => $symbols,
            ),
        );
        $this->save_engine_snapshot($user_id, $snapshot);

        return $snapshot;
    }

    private function save_engine_snapshot($user_id, $snapshot) {
        if (!is_array($snapshot)) {
            return false;
        }
        update_user_meta($user_id, 'smc_sf_engine_snapshot', $snapshot);
        return true;
    }

    private function delete_engine_snapshot($user_id) {
        delete_user_meta($user_id, 'smc_sf_engine_snapshot');
        error_log("SMC_SF: engine snapshot invalidated for user {$user_id} after watchlist change");
    }

    private function is_engine_snapshot_current($snapshot, $expected_symbols, $refresh_interval_sec) {
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
        if ((time() - $computed_at) > max(2, (int) $refresh_interval_sec)) {
            return false;
        }

        return true;
    }

    private function get_cached_price($user_id, $symbol, $stale_threshold_sec = null) {
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$this->table('snapshots')} WHERE user_id = %d AND symbol = %s",
            $user_id,
            $symbol
        ), ARRAY_A);
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
        if (empty($candles)) {
            return array();
        }
        $high = max(array_map(function ($c) { return (float) $c['high']; }, $candles));
        $low = min(array_map(function ($c) { return (float) $c['low']; }, $candles));
        return $this->fib_levels($high, $low, 'LTF_SF');
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

    private function verdict($status, $confluence, $chop) {
        $structural = array_values(array_diff($confluence, array('HTA_SF', 'LTF_SF')));
        $score = count($structural) - ($chop > 0.7 ? 2 : 0);
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

    private function determine_engine_blocker($user_id, $price, $candles, $data_live, $status, $symbol = null, $chop = null) {
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

        if ($price_state === 'stale') return 'PRICE_STALE';
        if ($candle_age_sec > 7200) return 'CANDLES_STALE';

        if ($status === 'READY' && !$data_live) return 'READY_NOT_CONFIRMED_STALE_DATA';

        // CRITICAL HARDENING: Gate is BLOCKED when chop >= 0.7; signal must never be
        // backend-confirmed in this state. Without this check, post_execute_signals()
        // can still queue a READY+confirmed signal even though the gate is BLOCKED,
        // breaking the chop-gate contract introduced by the gate patch.
        if ($chop !== null && (float) $chop >= 0.7) return 'CHOP_GATE_BLOCKED';

        return 'OK';
    }


    private function is_mt5_authoritative($user_id, $symbol) {
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

    private function rl_transient_key($user_id, $symbol = null) {
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

    private function is_feed_rate_limited($user_id, $symbol = null) {
        $key = $symbol !== null ? $this->rl_transient_key($user_id, $symbol) : $this->rl_transient_key($user_id);
        $state = get_transient($key) !== false;

        if ($state && $symbol) {
            error_log(sprintf('[PHASE0_SOAK] is_feed_rate_limited: TRUE for %s', $symbol));
        }

        return $state;
    }

    private function get_twelve_key_status($user_id) {
        global $wpdb;
        $status = $wpdb->get_var($wpdb->prepare(
            "SELECT key_status FROM {$this->table('integrations')} WHERE user_id = %d AND provider = %s",
            $user_id,
            self::TWELVE_PROVIDER
        ));
        return $status ? $status : 'missing';
    }

    private function clear_feed_rate_limit_state($user_id) {
        delete_transient($this->rl_transient_key($user_id));
        $settings = $this->get_settings($user_id);
        foreach ($settings['watchlist'] as $symbol) {
            delete_transient($this->rl_transient_key($user_id, $symbol));
        }
    }

    private function log_feed_debug($event, $context = array()) {
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

    private function encrypt_secret($secret) {
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

    private function replace_json($table, $data) {
        global $wpdb;
        foreach ($data as $field => $value) {
            if (is_array($value)) {
                $data[$field] = wp_json_encode($value);
            }
        }
        $wpdb->replace($this->table($table), $data);
    }

    private function audit($user_id, $event_type, $payload) {
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

    private function instrument_specs() {
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
            // CRYPTO — contract sizes vary by broker; defaults use $1/point/lot
            'BTCUSD' => array('type' => 'crypto', 'pip_size' => 1.0,    'contract_size' => 1, 'pip_val' => 1.0),
            'ETHUSD' => array('type' => 'crypto', 'pip_size' => 1.0,    'contract_size' => 1, 'pip_val' => 1.0),
            'SOLUSD' => array('type' => 'crypto', 'pip_size' => 0.01,   'contract_size' => 1, 'pip_val' => 1.0),
        );
        return $specs;
    }

    private function get_instrument_spec($symbol) {
        $key = $this->normalize_symbol_token($symbol);
        $specs = $this->instrument_specs();
        return isset($specs[$key]) ? $specs[$key] : null;
    }

    private function is_supported_symbol($symbol) {
        $mapped = $this->map_symbol_aliases($symbol);
        $key = $this->normalize_symbol_token($mapped);
        $specs = $this->instrument_specs();
        return isset($specs[$key]);
    }

    private function validate_watchlist_symbols($symbols) {
        $out = array();
        foreach ($this->sanitize_symbols($symbols) as $sym) {
            if ($this->is_supported_symbol($sym)) {
                $out[] = $sym;
            }
        }
        return $out;
    }

    private function save_watchlist($user_id, $watchlist) {
        $current = $this->get_settings($user_id);
        $current['watchlist'] = $this->sanitize_symbols($watchlist);
        $this->replace_json('user_settings', array(
            'user_id' => $user_id,
            'settings' => $current,
            'updated_at' => $this->now_mysql(),
        ));
    }

    private function sanitize_symbols($symbols) {
        if (!is_array($symbols)) {
            return array();
        }
        $out = array();
        foreach ($symbols as $symbol) {
            $mapped = $this->map_symbol_aliases($symbol);
            $clean = $this->normalize_symbol_token($mapped);
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

    private function sanitize_risk_allocation($payload, $fallback) {
        if (!is_array($payload)) {
            return $fallback;
        }
        return array(
            'perTradePct' => $this->float_between($payload, 'perTradePct', 0.1, 5.0, $fallback['perTradePct']),
            'dailyMaxPct' => $this->float_between($payload, 'dailyMaxPct', 0.1, 20.0, $fallback['dailyMaxPct']),
            'ddCapPct' => $this->float_between($payload, 'ddCapPct', 0.1, 50.0, $fallback['ddCapPct']),
        );
    }

    private function int_between($payload, $key, $min, $max, $fallback) {
        if (!is_array($payload) || !isset($payload[$key])) {
            return $fallback;
        }
        return max($min, min($max, (int) $payload[$key]));
    }

    private function float_between($payload, $key, $min, $max, $fallback) {
        if (!is_array($payload) || !isset($payload[$key])) {
            return $fallback;
        }
        return max($min, min($max, (float) $payload[$key]));
    }

    private function twelve_symbol($symbol) {
        $key = $this->normalize_symbol_token($symbol);
        // All-alpha 6-letter tokens (forex pairs, metals, crypto like BTC/USD) are
        // slash-formatted by Twelve Data. Symbols with digits (US30, NAS100) pass through.
        // This covers both registry-known pairs and any legacy user-watchlist entries.
        if (preg_match('/^[A-Z]{6}$/', $key)) {
            return substr($key, 0, 3) . '/' . substr($key, 3, 3);
        }
        return $key;
    }

    private function latest_timestamp($table, $user_id, $column) {
        global $wpdb;
        $allowed_tables  = array('snapshots', 'engine_runs');
        $allowed_columns = array('updated_at', 'created_at');
        if (!in_array($table, $allowed_tables, true) || !in_array($column, $allowed_columns, true)) {
            return null;
        }
        $col = $column === 'updated_at' ? 'updated_at' : 'created_at';
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
        
        // Strip timezone abbreviations (UTC, GMT, EST, PST, etc.) that appear at the end
        $value = preg_replace('/\s+(UTC|GMT|[A-Z]{3,4})\s*$/', '', $value);
        
        // If timestamp doesn't already have a timezone offset ([+-]HH:MM or Z), add Z
        if (!preg_match('/([+-]\d{2}:\d{2}|Z)\s*$/', $value)) {
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

    private function is_chart_candle_fresh($candle_time, $timeframe) {
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

    private function normalize_market_timestamp($raw_time, $fallback = null) {
        $fallback_value = (func_num_args() >= 2) ? $fallback : $this->now_mysql();
        if ($raw_time === null || $raw_time === '') {
            return $fallback_value;
        }

        $value = trim((string) $raw_time);
        
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

    private function normalize_mt5_timeframe($timeframe) {
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

    private function mt5_freshness_to_snapshot_state($freshness) {
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

    private function table($name) {
        global $wpdb;
        return $wpdb->prefix . 'smc_sf_' . $name;
    }

    private function now_mysql() {
        return gmdate('Y-m-d H:i:s');
    }

    private function to_iso($mysql_time) {
        if (!$mysql_time) {
            return null;
        }
        return gmdate('c', strtotime($mysql_time . ' UTC'));
    }
}

register_activation_hook(__FILE__, array('SMC_SuperFib_Sniper_REST', 'activate'));
register_deactivation_hook(__FILE__, array('SMC_SuperFib_Sniper_REST', 'deactivate'));

add_action('plugins_loaded', array('SMC_SuperFib_Sniper_REST', 'boot'));
