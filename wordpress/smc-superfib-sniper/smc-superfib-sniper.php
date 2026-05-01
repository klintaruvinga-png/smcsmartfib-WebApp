<?php
/**
 * Plugin Name: SMC SuperFIB Sniper REST Backend
 * Description: WordPress REST backend for the Lovable SMC SuperFIB dashboard.
 * Version: 1.0.0
 * Author: SMC SuperFIB
 */

if (!defined('ABSPATH')) {
    exit;
}

final class SMC_SuperFib_Sniper_REST {
    const VERSION = '1.0.0';
    const NAMESPACE = 'sniper/v1';
    const TWELVE_PROVIDER = 'twelve_data';

    private $ratios = array(-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300);

    public static function boot() {
        $instance = new self();
        add_action('rest_api_init', array($instance, 'register_routes'));
        add_filter('rest_pre_serve_request', array($instance, 'send_cors_headers'), 10, 4);
        register_activation_hook(__FILE__, array(__CLASS__, 'activate'));
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
            change_pct_1d DECIMAL(12,6) NOT NULL DEFAULT 0,
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
        $this->route('/health', WP_REST_Server::READABLE, 'get_health', true);
        $this->route('/session', WP_REST_Server::READABLE, 'get_session', false);
        $this->route('/snapshot', WP_REST_Server::READABLE, 'get_snapshot', true);
        $this->route('/snapshot', WP_REST_Server::CREATABLE, 'post_snapshot', true);
        $this->route('/charts', WP_REST_Server::READABLE, 'get_chart_snapshot', true);
        $this->route('/regimes', WP_REST_Server::READABLE, 'get_regimes', true);
        $this->route('/regime', WP_REST_Server::CREATABLE, 'post_regime', true);
        $this->route('/live-signals', WP_REST_Server::READABLE, 'get_live_signals', true);
        $this->route('/signal', WP_REST_Server::CREATABLE, 'post_signal', true);
        $this->route('/ladders', WP_REST_Server::READABLE, 'get_ladders', true);
        $this->route('/engine-batch', WP_REST_Server::CREATABLE, 'post_engine_batch', true);

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
    }

    private function route($path, $methods, $callback, $auth_required) {
        register_rest_route(self::NAMESPACE, $path, array(
            'methods' => $methods,
            'callback' => array($this, $callback),
            'permission_callback' => $auth_required ? array($this, 'permission_user') : '__return_true',
        ));
    }

    public function permission_user() {
        if (!is_user_logged_in() || !current_user_can('read')) {
            return new WP_Error('smc_sf_auth_required', 'Authentication required.', array('status' => 401));
        }

        return true;
    }

    public function send_cors_headers($served, $result, $request, $server) {
        $origin = isset($_SERVER['HTTP_ORIGIN']) ? esc_url_raw(wp_unslash($_SERVER['HTTP_ORIGIN'])) : '';
        if (!$origin) {
            return $served;
        }

        $allowed = apply_filters('smc_sf_allowed_origins', array(home_url(), 'https://trader.stokvelsociety.co.za'));
        if (in_array(untrailingslashit($origin), array_map('untrailingslashit', $allowed), true)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Access-Control-Allow-Credentials: true');
            header('Access-Control-Allow-Headers: Content-Type, X-WP-Nonce');
            header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
        }

        return $served;
    }

    public function get_session() {
        $hour = (int) gmdate('H');
        if ($hour >= 7 && $hour < 11) {
            $name = 'London';
            $open = '07:00';
            $close = '11:00';
        } elseif ($hour >= 15 && $hour < 17) {
            $name = 'London Close';
            $open = '15:00';
            $close = '17:00';
        } elseif ($hour >= 12 && $hour < 16) {
            $name = 'New York';
            $open = '12:00';
            $close = '16:00';
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
        $key_status = $this->get_twelve_key_status($user_id);
        $last_batch = $this->latest_timestamp('snapshots', $user_id, 'updated_at');
        $last_run = $this->latest_timestamp('engine_runs', $user_id, 'created_at');

        return rest_ensure_response(array(
            'backendSync' => $last_run ? 'live' : 'offline',
            'priceFeed' => $key_status === 'ok' ? ($last_batch ? 'live' : 'stale') : 'blocked',
            'twelveDataKey' => $key_status === 'ok' ? 'present' : 'missing',
            'twelveDataKeyStatus' => $key_status,
            'lastBatchAt' => $this->to_iso($last_batch),
            'lastEngineRunAt' => $this->to_iso($last_run),
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
            'refreshIntervalSec' => $this->int_between($payload, 'refreshIntervalSec', 5, 60, $current['refreshIntervalSec']),
            'staleThresholdSec' => $this->int_between($payload, 'staleThresholdSec', 30, 600, $current['staleThresholdSec']),
            'watchlist' => $this->sanitize_symbols(isset($payload['watchlist']) ? $payload['watchlist'] : $current['watchlist']),
            'riskAllocation' => $this->sanitize_risk_allocation(isset($payload['riskAllocation']) ? $payload['riskAllocation'] : $current['riskAllocation'], $current['riskAllocation']),
        ));
        $settings['apiKeyStatus'] = $this->get_twelve_key_status($user_id);

        $this->replace_json('user_settings', array('user_id' => $user_id), array(
            'user_id' => $user_id,
            'settings' => $settings,
            'updated_at' => $this->now_mysql(),
        ));
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

        $this->replace_json('account_snapshots', array('user_id' => $user_id), array(
            'user_id' => $user_id,
            'data' => array('riskProfile' => $profile, 'account' => $this->get_account_state($user_id)),
            'updated_at' => $this->now_mysql(),
        ));
        $this->audit($user_id, 'risk_profile.updated', $profile);

        return rest_ensure_response(array('ok' => true));
    }

    public function get_snapshot() {
        $user_id = get_current_user_id();
        $settings = $this->get_settings($user_id);
        $prices = $this->refresh_prices($user_id, $settings['watchlist']);
        $engine = $this->run_engine_for_symbols($user_id, $settings['watchlist'], $prices);

        return rest_ensure_response(array(
            'prices' => $prices,
            'regimes' => $engine['regimes'],
            'gates' => $engine['gates'],
        ));
    }

    public function post_snapshot(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        $this->audit($user_id, 'snapshot.posted', is_array($payload) ? $payload : array());
        return rest_ensure_response(array('ok' => true));
    }

    public function get_regimes() {
        $user_id = get_current_user_id();
        $settings = $this->get_settings($user_id);
        $prices = $this->get_cached_prices($user_id, $settings['watchlist']);
        $engine = $this->run_engine_for_symbols($user_id, $settings['watchlist'], $prices);
        return rest_ensure_response($engine['regimes']);
    }

    public function post_regime(WP_REST_Request $request) {
        $this->audit(get_current_user_id(), 'regime.posted', (array) $request->get_json_params());
        return rest_ensure_response(array('ok' => true));
    }

    public function get_live_signals() {
        $user_id = get_current_user_id();
        $settings = $this->get_settings($user_id);
        $prices = $this->get_cached_prices($user_id, $settings['watchlist']);
        $engine = $this->run_engine_for_symbols($user_id, $settings['watchlist'], $prices);
        return rest_ensure_response($engine['signals']);
    }

    public function post_signal(WP_REST_Request $request) {
        $this->audit(get_current_user_id(), 'signal.posted', (array) $request->get_json_params());
        return rest_ensure_response(array('ok' => true));
    }

    public function get_ladders(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $symbol = strtoupper(sanitize_text_field($request->get_param('symbol')));
        $settings = $this->get_settings($user_id);
        $symbols = $symbol ? array($symbol) : $settings['watchlist'];
        $prices = $this->get_cached_prices($user_id, $symbols);
        $engine = $this->run_engine_for_symbols($user_id, $symbols, $prices);
        return rest_ensure_response($engine['plans']);
    }

    public function get_chart_snapshot(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $symbol = strtoupper(sanitize_text_field($request->get_param('symbol') ?: 'GBPUSD'));
        $timeframe = sanitize_text_field($request->get_param('timeframe') ?: '15min');
        $candles = $this->fetch_candles($user_id, $symbol, $timeframe, 120);
        $state = empty($candles) ? ($this->get_twelve_key_status($user_id) === 'ok' ? 'stale' : 'blocked') : 'live';
        $levels = $this->fib_levels_from_candles($candles);

        return rest_ensure_response(array(
            'symbol' => $symbol,
            'timeframe' => $timeframe,
            'candles' => $candles,
            'fibLevels' => $levels,
            'updatedAt' => gmdate('c'),
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
        $account = array_merge($this->get_account_state($user_id), is_array($payload) ? $payload : array());
        $existing = $this->get_account_blob($user_id);
        $existing['account'] = $account;
        $this->replace_json('account_snapshots', array('user_id' => $user_id), array(
            'user_id' => $user_id,
            'data' => $existing,
            'updated_at' => $this->now_mysql(),
        ));
        $this->audit($user_id, 'account.updated', $account);
        return rest_ensure_response(array('ok' => true));
    }

    public function get_user_trade_queue() {
        return rest_ensure_response($this->read_pending_orders(get_current_user_id()));
    }

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

            if (!$signal || (int) $signal['backend_confirmed'] !== 1 || $signal['status'] !== 'READY') {
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
                $order_id = 'ord-' . substr(md5($signal_id . '|' . $stage . '|' . microtime(true)), 0, 16);
                $order = array(
                    'id' => $order_id,
                    'symbol' => $signal['symbol'],
                    'direction' => $signal['direction'],
                    'type' => 'LIMIT',
                    'price' => $plan['entries'][$stage],
                    'lots' => $plan['lotSize'][$stage],
                    'sl' => isset($plan['stops'][$stage]) ? $plan['stops'][$stage] : $plan['sl'],
                    'tp' => $plan['tps']['tp1'],
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
        $prices = $this->refresh_prices($user_id, $symbols);
        $this->run_engine_for_symbols($user_id, $symbols, $prices);
        return rest_ensure_response(array('ok' => true));
    }

    private function run_engine_for_symbols($user_id, $symbols, $prices) {
        global $wpdb;

        $regimes = array();
        $gates = array();
        $signals = array();
        $plans = array();

        foreach ($symbols as $symbol) {
            $price = $this->find_price($prices, $symbol);
            $state = $this->build_symbol_state($user_id, $symbol, $price);
            $regimes[] = $state['regime'];
            $gates[] = $state['gate'];

            if ($state['signal']) {
                $signals[] = $state['signal'];
                $wpdb->replace(
                    $this->table('signals'),
                    array(
                        'id' => $state['signal']['id'],
                        'user_id' => $user_id,
                        'symbol' => $symbol,
                        'direction' => $state['signal']['direction'],
                        'status' => $state['signal']['status'],
                        'verdict' => $state['signal']['verdict'],
                        'confluence' => wp_json_encode($state['signal']['confluence']),
                        'engine' => wp_json_encode($state['signal']['engine']),
                        'backend_confirmed' => $state['signal']['backendConfirmed'] ? 1 : 0,
                        'created_at' => $this->now_mysql(),
                        'updated_at' => $this->now_mysql(),
                    ),
                    array('%s', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%s')
                );
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

        return array('regimes' => $regimes, 'gates' => $gates, 'signals' => $signals, 'plans' => $plans);
    }

    private function build_symbol_state($user_id, $symbol, $price) {
        $candles = $this->fetch_candles($user_id, $symbol, '15min', 120);
        $has_key = $this->get_twelve_key_status($user_id) === 'ok';
        $state = $has_key ? 'stale' : 'blocked';

        if (!$price) {
            $price = array('symbol' => $symbol, 'mid' => 0, 'updatedAt' => gmdate('c'), 'state' => $state);
        }

        if (count($candles) < 30 || (float) $price['mid'] <= 0) {
            return array(
                'regime' => array('symbol' => $symbol, 'bias' => 'RANGING', 'chop' => 1, 'nearestFib' => null, 'updatedAt' => gmdate('c'), 'state' => $state),
                'gate' => array('symbol' => $symbol, 'allow' => 'BLOCKED', 'reason' => $has_key ? 'insufficient candle history' : 'Twelve Data key missing', 'state' => $state),
                'signal' => null,
                'plan' => null,
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
        $direction = $position_ratio >= 62.5 ? 'LONG' : ($position_ratio <= 25 ? 'SHORT' : null);
        $f3_chop = $position_ratio >= 37.5 && $position_ratio <= 62.5 ? 'blocked' : ($chop >= 0.7 ? 'caution' : 'clear');
        $hta_override = $position_ratio < 0 || $position_ratio > 100;
        $blocked = $f3_chop === 'blocked' || !$direction;
        $status = 'WATCH';

        if ($blocked) {
            $status = 'BLOCKED';
        } elseif (!$sequence[$direction]['sweep']) {
            $status = 'WATCH';
        } elseif (!$sequence[$direction]['mss']) {
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

        $gate = array(
            'symbol' => $symbol,
            'allow' => $status === 'BLOCKED' ? 'BLOCKED' : ($direction === 'LONG' ? 'BUY' : 'SELL'),
            'state' => $status === 'BLOCKED' ? 'blocked' : 'live',
        );
        if ($status === 'BLOCKED') {
            $gate['reason'] = !$direction ? 'equilibrium / F3 chop territory' : 'F3 yearly chop zone';
        }

        $regime = array(
            'symbol' => $symbol,
            'bias' => $bias,
            'chop' => $chop,
            'nearestFib' => $nearest ? $nearest['price'] : null,
            'updatedAt' => gmdate('c'),
            'state' => 'live',
        );

        if (!$direction) {
            return array('regime' => $regime, 'gate' => $gate, 'signal' => null, 'plan' => null);
        }

        $ltf_level = $this->execution_level($levels, $direction);
        $signal_id = 'sig-' . substr(md5($user_id . '|' . $symbol . '|' . $direction . '|' . gmdate('YmdH')), 0, 16);
        $signal = array(
            'id' => $signal_id,
            'symbol' => $symbol,
            'direction' => $direction,
            'status' => $status,
            'confluence' => $confluence,
            'verdict' => $this->verdict($status, $confluence, $chop),
            'computedBy' => 'backend',
            'backendConfirmed' => $status === 'READY',
            'createdAt' => gmdate('c'),
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

        return array(
            'regime' => $regime,
            'gate' => $gate,
            'signal' => $signal,
            'plan' => $status === 'BLOCKED' ? null : $this->build_trade_plan($user_id, $signal, $high, $low),
        );
    }

    private function build_trade_plan($user_id, $signal, $high, $low) {
        $risk = $this->get_risk_profile($user_id);
        $account = $this->get_account_state($user_id);
        $equity = max((float) $account['equityUSC'], 1);
        $risk_usc = round($equity * ((float) $risk['perTradePct'] / 100), 2);
        $is_long = $signal['direction'] === 'LONG';
        $ratios = $is_long ? array(62.5, 75, 100) : array(25, 0, -25);
        $stop_ratios = $is_long ? array(75, 100, 125) : array(0, -25, -62.5);
        $target_ratios = $is_long ? array(50, 25, 0) : array(50, 75, 100);
        $entries = array();
        $stops = array();
        $tps = array();
        $lots = array('e1' => 0.01, 'e2' => 0.02, 'e3' => 0.03);
        $ladder = array();

        foreach (array('e1', 'e2', 'e3') as $idx => $stage) {
            $entries[$stage] = $this->price_for_ratio($high, $low, $ratios[$idx]);
            $stops[$stage] = $this->price_for_ratio($high, $low, $stop_ratios[$idx]);
            $ladder[$stage] = array('ratio' => $ratios[$idx], 'stopRatio' => $stop_ratios[$idx], 'family' => 'LTF_SF');
        }

        foreach (array('tp1', 'tp2', 'tp3') as $idx => $tp) {
            $tps[$tp] = $this->price_for_ratio($high, $low, $target_ratios[$idx]);
        }

        $risk_per_unit = max(abs($entries['e1'] - $stops['e1']), 0.00000001);
        $rr = array(
            'tp1' => round(abs($tps['tp1'] - $entries['e1']) / $risk_per_unit, 2),
            'tp2' => round(abs($tps['tp2'] - $entries['e1']) / $risk_per_unit, 2),
            'tp3' => round(abs($tps['tp3'] - $entries['e1']) / $risk_per_unit, 2),
        );

        return array(
            'signalId' => $signal['id'],
            'entries' => $entries,
            'sl' => $stops['e3'],
            'stops' => $stops,
            'tps' => $tps,
            'rr' => $rr,
            'lotSize' => $lots,
            'ladder' => $ladder,
            'riskUSC' => $risk_usc,
            'riskZAR' => round($risk_usc * 18.5, 2),
            'drawdownImpactPct' => round(((float) $risk['perTradePct']), 2),
            'source' => 'backend-blueprint',
            'executionSource' => 'LTF_SF',
        );
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
        foreach ($symbols as $symbol) {
            $quote = $this->fetch_quote($user_id, $symbol);
            if ($quote) {
                $prices[] = $quote;
            } else {
                $cached = $this->get_cached_price($user_id, $symbol);
                $prices[] = $cached ? $cached : array(
                    'symbol' => $symbol,
                    'bid' => 0,
                    'ask' => 0,
                    'mid' => 0,
                    'changePct1d' => 0,
                    'updatedAt' => gmdate('c'),
                    'state' => $this->get_twelve_key_status($user_id) === 'ok' ? 'unavailable' : 'blocked',
                );
            }
        }

        return $prices;
    }

    private function fetch_quote($user_id, $symbol) {
        global $wpdb;

        $key = $this->get_twelve_key($user_id);
        if (is_wp_error($key) || !$key) {
            return null;
        }

        $url = add_query_arg(array(
            'symbol' => $this->twelve_symbol($symbol),
            'apikey' => $key,
        ), 'https://api.twelvedata.com/quote');
        $response = wp_remote_get($url, array('timeout' => 12));
        if (is_wp_error($response)) {
            return null;
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);
        if ($code === 429 || (isset($body['code']) && (int) $body['code'] === 429)) {
            $this->set_twelve_key_status($user_id, 'rate-limited');
            return null;
        }
        if ($code >= 400 || isset($body['status']) && $body['status'] === 'error') {
            $this->set_twelve_key_status($user_id, 'invalid');
            return null;
        }

        $mid = isset($body['close']) ? (float) $body['close'] : (isset($body['price']) ? (float) $body['price'] : 0);
        if ($mid <= 0) {
            return null;
        }

        $bid = isset($body['bid']) ? (float) $body['bid'] : $mid;
        $ask = isset($body['ask']) ? (float) $body['ask'] : $mid;
        $previous = isset($body['previous_close']) ? (float) $body['previous_close'] : $mid;
        $change = $previous > 0 ? (($mid - $previous) / $previous) * 100 : 0;
        $row = array(
            'symbol' => $symbol,
            'bid' => $bid,
            'ask' => $ask,
            'mid' => $mid,
            'changePct1d' => round($change, 4),
            'updatedAt' => gmdate('c'),
            'state' => 'live',
        );

        $wpdb->replace(
            $this->table('snapshots'),
            array(
                'user_id' => $user_id,
                'symbol' => $symbol,
                'bid' => $bid,
                'ask' => $ask,
                'mid' => $mid,
                'change_pct_1d' => $row['changePct1d'],
                'state' => 'live',
                'updated_at' => $this->now_mysql(),
            ),
            array('%d', '%s', '%f', '%f', '%f', '%f', '%s', '%s')
        );

        $this->set_twelve_key_status($user_id, 'ok');
        return $row;
    }

    private function fetch_candles($user_id, $symbol, $timeframe, $outputsize) {
        global $wpdb;

        $key = $this->get_twelve_key($user_id);
        if (!is_wp_error($key) && $key) {
            $url = add_query_arg(array(
                'symbol' => $this->twelve_symbol($symbol),
                'interval' => $timeframe,
                'outputsize' => $outputsize,
                'apikey' => $key,
            ), 'https://api.twelvedata.com/time_series');
            $response = wp_remote_get($url, array('timeout' => 15));
            if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) < 400) {
                $body = json_decode(wp_remote_retrieve_body($response), true);
                if (!empty($body['values']) && is_array($body['values'])) {
                    foreach ($body['values'] as $item) {
                        if (empty($item['datetime'])) {
                            continue;
                        }
                        $time = gmdate('Y-m-d H:i:s', strtotime($item['datetime']));
                        $wpdb->replace(
                            $this->table('candles'),
                            array(
                                'user_id' => $user_id,
                                'symbol' => $symbol,
                                'timeframe' => $timeframe,
                                'candle_time' => $time,
                                'open' => (float) $item['open'],
                                'high' => (float) $item['high'],
                                'low' => (float) $item['low'],
                                'close' => (float) $item['close'],
                                'volume' => isset($item['volume']) ? (float) $item['volume'] : null,
                                'created_at' => $this->now_mysql(),
                            ),
                            array('%d', '%s', '%s', '%s', '%f', '%f', '%f', '%f', '%f', '%s')
                        );
                    }
                    $this->set_twelve_key_status($user_id, 'ok');
                } elseif (isset($body['code']) && (int) $body['code'] === 429) {
                    $this->set_twelve_key_status($user_id, 'rate-limited');
                }
            }
        }

        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT candle_time, open, high, low, close FROM {$this->table('candles')} WHERE user_id = %d AND symbol = %s AND timeframe = %s ORDER BY candle_time DESC LIMIT %d",
            $user_id,
            $symbol,
            $timeframe,
            $outputsize
        ), ARRAY_A);

        $rows = array_reverse($rows);
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
            'refreshIntervalSec' => 15,
            'staleThresholdSec' => 180,
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
        $default = array(
            'balanceUSC' => 0,
            'equityUSC' => 0,
            'marginUsedPct' => 0,
            'drawdownPct' => 0,
            'openPositions' => count($positions),
            'pendingOrders' => count($orders),
            'todayPnlUSC' => 0,
            'todayPnlPct' => 0,
            'state' => 'live',
        );
        if (!empty($blob['account']) && is_array($blob['account'])) {
            $default = array_merge($default, $blob['account']);
        }
        $default['openPositions'] = count($positions);
        $default['pendingOrders'] = count($orders);

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
            "SELECT payload FROM {$this->table('trade_queue')} WHERE user_id = %d ORDER BY created_at DESC",
            $user_id
        ), ARRAY_A);
        return array_values(array_filter(array_map(function ($row) {
            $payload = json_decode($row['payload'], true);
            return is_array($payload) ? $payload : null;
        }, $rows)));
    }

    private function get_cached_prices($user_id, $symbols) {
        $prices = array();
        foreach ($symbols as $symbol) {
            $cached = $this->get_cached_price($user_id, $symbol);
            if ($cached) {
                $prices[] = $cached;
            }
        }
        return $prices;
    }

    private function get_cached_price($user_id, $symbol) {
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$this->table('snapshots')} WHERE user_id = %d AND symbol = %s",
            $user_id,
            $symbol
        ), ARRAY_A);
        if (!$row) {
            return null;
        }

        return array(
            'symbol' => $row['symbol'],
            'bid' => (float) $row['bid'],
            'ask' => (float) $row['ask'],
            'mid' => (float) $row['mid'],
            'changePct1d' => (float) $row['change_pct_1d'],
            'updatedAt' => $this->to_iso($row['updated_at']),
            'state' => $this->is_stale($row['updated_at'], $this->get_settings($user_id)['staleThresholdSec']) ? 'stale' : $row['state'],
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
        if ($status === 'BLOCKED') {
            return 'C';
        }
        $score = count($confluence) - ($chop > 0.7 ? 2 : 0);
        if ($status === 'READY' && $score >= 5) {
            return 'A+';
        }
        if ($status === 'READY') {
            return 'A';
        }
        return $score >= 4 ? 'B' : 'C';
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

    private function replace_json($table, $key, $data) {
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

    private function sanitize_symbols($symbols) {
        if (!is_array($symbols)) {
            return array();
        }
        $out = array();
        foreach ($symbols as $symbol) {
            $clean = strtoupper(preg_replace('/[^A-Z0-9]/', '', (string) $symbol));
            if ($clean !== '' && !in_array($clean, $out, true)) {
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
        $symbol = strtoupper($symbol);
        if ($symbol === 'XAUUSD') {
            return 'XAU/USD';
        }
        if (strlen($symbol) === 6) {
            return substr($symbol, 0, 3) . '/' . substr($symbol, 3, 3);
        }
        return $symbol;
    }

    private function latest_timestamp($table, $user_id, $column) {
        global $wpdb;
        $allowed = array('snapshots', 'engine_runs');
        if (!in_array($table, $allowed, true)) {
            return null;
        }
        return $wpdb->get_var($wpdb->prepare(
            "SELECT MAX($column) FROM {$this->table($table)} WHERE user_id = %d",
            $user_id
        ));
    }

    private function is_stale($mysql_time, $threshold_sec) {
        return (time() - strtotime($mysql_time . ' UTC')) > $threshold_sec;
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

SMC_SuperFib_Sniper_REST::boot();
