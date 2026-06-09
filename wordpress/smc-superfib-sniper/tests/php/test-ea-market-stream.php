<?php

define('ABSPATH', __DIR__ . '/');
define('ARRAY_A', 'ARRAY_A');

$GLOBALS['test_registered_routes'] = array();
$GLOBALS['test_options'] = array();
$GLOBALS['test_transients'] = array();
$GLOBALS['test_user_meta'] = array();
$GLOBALS['test_current_user_id'] = 1;
$GLOBALS['test_is_logged_in'] = true;
$GLOBALS['test_can_read'] = true;

if (!class_exists('WP_REST_Server')) {
    class WP_REST_Server {
        const READABLE = 'GET';
        const CREATABLE = 'POST';
        const DELETABLE = 'DELETE';
    }
}

if (!class_exists('WP_REST_Request')) {
    class WP_REST_Request {
        private $params;
        private $headers;

        public function __construct($params = array(), $headers = array()) {
            $this->params = is_array($params) ? $params : array();
            $this->headers = array();
            foreach ((array) $headers as $key => $value) {
                $this->headers[strtolower($key)] = $value;
            }
        }

        public function get_json_params() {
            return $this->params;
        }

        public function get_param($key) {
            return isset($this->params[$key]) ? $this->params[$key] : null;
        }

        public function get_header($key) {
            $key = strtolower($key);
            return isset($this->headers[$key]) ? $this->headers[$key] : '';
        }
    }
}

if (!class_exists('WP_REST_Response')) {
    class WP_REST_Response {
        public $data;
        public $status;

        public function __construct($data = null, $status = 200) {
            $this->data = $data;
            $this->status = $status;
        }
    }
}

if (!class_exists('WP_Error')) {
    class WP_Error {
        public $code;
        public $message;
        public $data;

        public function __construct($code = '', $message = '', $data = null) {
            $this->code = $code;
            $this->message = $message;
            $this->data = $data;
        }
    }
}

if (!function_exists('wp_unslash')) {
    function wp_unslash($value) {
        return $value;
    }
}

if (!function_exists('sanitize_text_field')) {
    function sanitize_text_field($str) {
        return trim($str);
    }
}

if (!function_exists('get_current_user_id')) {
    function get_current_user_id() {
        return $GLOBALS['test_current_user_id'];
    }
}

if (!defined('SMC_SF_EA_API_KEY')) {
    define('SMC_SF_EA_API_KEY', 'test-key');
}

if (!defined('MINUTE_IN_SECONDS')) {
    define('MINUTE_IN_SECONDS', 60);
}

if (!defined('HOUR_IN_SECONDS')) {
    define('HOUR_IN_SECONDS', 3600);
}

if (!function_exists('get_userdata')) {
    function get_userdata($user_id) {
        return $user_id > 0 ? (object) array('ID' => $user_id) : false;
    }
}

if (!function_exists('user_can')) {
    function user_can($user, $capability) {
        return $capability === 'read' && !empty($user->ID);
    }
}

if (!function_exists('wp_set_current_user')) {
    function wp_set_current_user($user_id) {
        $GLOBALS['test_current_user_id'] = (int) $user_id;
    }
}

if (!function_exists('current_time')) {
    function current_time($type, $gmt = 0) {
        return gmdate('Y-m-d H:i:s');
    }
}

if (!function_exists('wp_json_encode')) {
    function wp_json_encode($data) {
        return json_encode($data);
    }
}

if (!function_exists('set_transient')) {
    function set_transient($key, $value, $expiration = 0) {
        $GLOBALS['test_transients'][$key] = $value;
        return true;
    }
}

if (!function_exists('get_transient')) {
    function get_transient($key) {
        return array_key_exists($key, $GLOBALS['test_transients']) ? $GLOBALS['test_transients'][$key] : false;
    }
}

if (!function_exists('delete_transient')) {
    function delete_transient($key) {
        unset($GLOBALS['test_transients'][$key]);
        return true;
    }
}

if (!function_exists('sanitize_key')) {
    function sanitize_key($key) {
        return strtolower(preg_replace('/[^a-zA-Z0-9_\\-]/', '', (string) $key));
    }
}

if (!function_exists('get_option')) {
    function get_option($key, $default = false) {
        return $GLOBALS['test_options'][$key] ?? $default;
    }
}

if (!function_exists('update_option')) {
    function update_option($key, $value, $autoload = true) {
        $GLOBALS['test_options'][$key] = $value;
        return true;
    }
}

if (!function_exists('get_user_meta')) {
    function get_user_meta($user_id, $key, $single = false) {
        if (!isset($GLOBALS['test_user_meta'][$user_id])) {
            return $single ? '' : array();
        }
        $value = $GLOBALS['test_user_meta'][$user_id][$key] ?? '';
        return $single ? $value : array($value);
    }
}

if (!function_exists('update_user_meta')) {
    function update_user_meta($user_id, $key, $value) {
        if (!isset($GLOBALS['test_user_meta'][$user_id])) {
            $GLOBALS['test_user_meta'][$user_id] = array();
        }
        $GLOBALS['test_user_meta'][$user_id][$key] = $value;
        return true;
    }
}

if (!function_exists('delete_user_meta')) {
    function delete_user_meta($user_id, $key) {
        if (isset($GLOBALS['test_user_meta'][$user_id][$key])) {
            unset($GLOBALS['test_user_meta'][$user_id][$key]);
        }
        return true;
    }
}

if (!function_exists('rest_ensure_response')) {
    function rest_ensure_response($data) {
        return new WP_REST_Response($data);
    }
}

if (!class_exists('TestWpdb')) {
    class TestWpdb {
        public $prefix = 'wp_';
        public $tables = array();
        public $queries = array();
        public $last_error = '';

        public function replace($table, $data, $formats = array()) {
            $this->queries[] = array('type' => 'replace', 'table' => $table, 'data' => $data);
            if (!isset($this->tables[$table])) {
                $this->tables[$table] = array();
            }
            $key = $this->row_key($table, $data);
            $this->tables[$table][$key] = $data;
            return 1;
        }

        public function prepare($query, ...$args) {
            if (count($args) === 1 && is_array($args[0])) {
                $args = $args[0];
            }
            $out = '';
            $parts = preg_split('/(%(?:\d+\$)?[dfs])/', $query, -1, PREG_SPLIT_DELIM_CAPTURE);
            $arg_index = 0;
            foreach ($parts as $part) {
                if (preg_match('/^%(?:\d+\$)?([dfs])$/', $part, $matches)) {
                    $value = array_key_exists($arg_index, $args) ? $args[$arg_index++] : null;
                    if ($matches[1] === 'd') {
                        $out .= (string) (int) $value;
                    } elseif ($matches[1] === 'f') {
                        $out .= (string) (float) $value;
                    } else {
                        $out .= "'" . str_replace("'", "''", (string) $value) . "'";
                    }
                } else {
                    $out .= $part;
                }
            }
            return $out;
        }

        public function get_var($query) {
            if (strpos($query, 'SELECT open FROM') !== false && strpos($query, 'smc_sf_candles') !== false) {
                preg_match('/FROM ([^\\s]+)/', $query, $table_match);
                preg_match('/user_id = (\\d+)/', $query, $user_match);
                preg_match("/symbol = '([^']+)'/", $query, $symbol_match);
                preg_match("/candle_time >= '([^']+)'/", $query, $since_match);
                $table = $table_match[1] ?? '';
                $user_id = (int) ($user_match[1] ?? 0);
                $symbol = $symbol_match[1] ?? '';
                $since = $since_match[1] ?? '';
                $rows = array();
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) $row['user_id'] === $user_id && $row['symbol'] === $symbol && ($row['source'] ?? '') === 'mt5' && ($row['timeframe'] ?? '') === '1min' && strcmp($row['candle_time'], $since) >= 0) {
                        $rows[] = $row;
                    }
                }
                usort($rows, function ($a, $b) {
                    return strcmp($a['candle_time'], $b['candle_time']);
                });
                return $rows ? $rows[0]['open'] : null;
            }

            return null;
        }

        public function query($sql) {
            $this->queries[] = array('type' => 'query', 'sql' => $sql);
            return 1;
        }

        public function get_row($query, $output = ARRAY_A) {
            $results = $this->get_results($query, $output);
            return $results ? reset($results) : null;
        }

        public function get_results($query, $output = ARRAY_A) {
            if (!preg_match('/SELECT .* FROM ([^ ]+) WHERE (.+)$/', $query, $matches)) {
                return array();
            }

            $table = $matches[1];
            $conditions = $matches[2];
            $rows = array_values($this->tables[$table] ?? array());

            $rows = $this->apply_where_filters($rows, $conditions);

            if (preg_match('/ORDER BY ([^\s]+) DESC/', $conditions, $match)) {
                $order_col = $match[1];
                usort($rows, function ($a, $b) use ($order_col) {
                    return strcmp($b[$order_col] ?? '', $a[$order_col] ?? '');
                });
            }
            if (preg_match('/LIMIT (\d+)/', $conditions, $match)) {
                $limit = (int) $match[1];
                $rows = array_slice($rows, 0, $limit);
            }
            return $rows;
        }

        private function apply_where_filters(array $rows, $conditions) {
            $patterns = array(
                'feed_key' => "/feed_key = '([^']+)'/",
                'normalized_symbol' => "/normalized_symbol = '([^']+)'/",
                'timeframe' => "/timeframe = '([^']+)'/",
                'candle_open_time' => "/candle_open_time = '([^']+)'/",
                'symbol' => "/symbol = '([^']+)'/",
            );

            foreach ($patterns as $field => $pattern) {
                if (preg_match($pattern, $conditions, $match)) {
                    $value = $match[1];
                    $rows = array_values(array_filter($rows, function ($row) use ($field, $value) {
                        return isset($row[$field]) && $row[$field] === $value;
                    }));
                }
            }

            // Handle non-equality confidence filter: confidence <> 'disputed' or confidence != 'disputed'
            if (preg_match("/confidence\s*(?:<>|!=)\s*'([^']+)'/", $conditions, $match)) {
                $excluded_value = $match[1];
                $rows = array_values(array_filter($rows, function ($row) use ($excluded_value) {
                    return !isset($row['confidence']) || $row['confidence'] !== $excluded_value;
                }));
            }

            return $rows;
        }

        public function insert($table, $data, $formats = array()) {
            $this->queries[] = array('type' => 'insert', 'table' => $table, 'data' => $data);
            if (!isset($this->tables[$table])) {
                $this->tables[$table] = array();
            }
            $this->tables[$table][] = $data;
            return 1;
        }

        private function row_key($table, $data) {
            if ($table === 'wp_smc_sf_snapshots') {
                return $data['user_id'] . '_' . $data['symbol'];
            } elseif ($table === 'wp_smc_sf_candles') {
                return $data['user_id'] . '_' . $data['symbol'] . '_' . $data['timeframe'] . '_' . $data['candle_time'];
            } elseif ($table === 'wp_smc_sf_market_quotes_latest') {
                return ($data['feed_key'] ?? '') . '_' . ($data['normalized_symbol'] ?? '');
            } elseif ($table === 'wp_smc_sf_market_candles') {
                return ($data['feed_key'] ?? '') . '_' . ($data['normalized_symbol'] ?? '') . '_' . ($data['timeframe'] ?? '') . '_' . ($data['candle_open_time'] ?? '');
            }
            return md5(serialize($data));
        }
    }
}

// Mock WordPress functions
$wpdb = new TestWpdb();

if (!function_exists('register_activation_hook')) {
    function register_activation_hook($file, $function) {
        // Mock function
    }
}
if (!function_exists('register_deactivation_hook')) {
    function register_deactivation_hook(...$args) {
        // Mock function
    }
}

if (!function_exists('add_action')) {
    function add_action($hook, $function) {
        // Mock function
    }
}

if (!function_exists('add_filter')) {
    function add_filter($hook, $function) {
        // Mock function
    }
}

// Include the plugin
require_once __DIR__ . '/../../smc-superfib-sniper.php';

function dispatch_ea_market_stream($plugin, $payload, $headers = array()) {
    if (empty($headers)) {
        $headers = array('X-EA-API-Key' => 'test-key');
    }
    $request = new WP_REST_Request($payload, $headers);
    $permission = $plugin->permission_ea_market_stream($request);
    if ($permission !== true) {
        return $permission;
    }
    return $plugin->post_ea_market_stream($request);
}

function assert_test($condition, $message) {
    if (!$condition) {
        throw new RuntimeException($message);
    }
    echo "✓ SUCCESS: {$message}\n";
}

// Test the EA market stream endpoint
function test_ea_market_stream() {
    global $wpdb;

    echo "Testing EA Market Stream Endpoint\n";
    echo "=================================\n\n";

    $plugin = new SMC_SuperFib_Sniper_REST();
    $wpdb->replace('wp_smc_sf_candles', array(
        'user_id' => 7,
        'symbol' => 'EURUSD',
        'timeframe' => '1min',
        'candle_time' => gmdate('Y-m-d') . ' 00:00:00',
        'open' => 1.08000,
        'high' => 1.08020,
        'low' => 1.07980,
        'close' => 1.08010,
        'volume' => 10,
        'source' => 'mt5',
        'created_at' => gmdate('Y-m-d H:i:s'),
    ));
    $GLOBALS['test_transients']['smc_sf_rl_7_eurusd'] = time();
    $GLOBALS['test_transients']['smc_sf_qt_7_' . md5('EURUSD')] = 1;

    // Test 1: Valid payload with both snapshot and candle
    echo "Test 1: Valid payload with snapshot and candle\n";
    $now = time() - 10;
    $payload = array(
        'user_id' => 7,
        'symbol' => 'EURUSD',
        'timeframe' => 'M15',
        'timestamp' => gmdate('c', $now),
        'bid' => 1.08521,
        'ask' => 1.08534,
        'freshness' => 'LIVE',
        'session' => 'London',
        'candle' => array(
            'time' => gmdate('c', $now - 60),
            'open' => 1.08450,
            'high' => 1.08550,
            'low' => 1.08420,
            'close' => 1.08510,
            'volume' => 1234
        )
    );

    $response = dispatch_ea_market_stream($plugin, $payload);

    if ($response instanceof WP_REST_Response && isset($response->data['ok']) && $response->data['ok']) {
        echo "✓ SUCCESS: Response OK\n";
        echo "  Snapshots inserted: " . $response->data['snapshots_inserted'] . "\n";
        echo "  Candles inserted: " . $response->data['candles_inserted'] . "\n";

        // Check database
        $snapshots_table = 'wp_smc_sf_snapshots';
        $candles_table = 'wp_smc_sf_candles';

        if (isset($wpdb->tables[$snapshots_table])) {
            echo "✓ SUCCESS: Snapshot stored in database\n";
            $snapshot = reset($wpdb->tables[$snapshots_table]);
            echo "  Symbol: " . $snapshot['symbol'] . "\n";
            echo "  Source: " . $snapshot['source'] . "\n";
            echo "  State: " . $snapshot['state'] . "\n";
            if ((float) $snapshot['change_pct_1d'] !== 0.0) {
                echo "✓ SUCCESS: MT5 change_pct_1d derived from day open\n";
            } else {
                throw new RuntimeException('MT5 change_pct_1d should be derived from the first M1 open of the day');
            }
        }

        if (isset($wpdb->tables[$candles_table])) {
            echo "✓ SUCCESS: Candle stored in database\n";
            $candle = end($wpdb->tables[$candles_table]);
            echo "  Symbol: " . $candle['symbol'] . "\n";
            echo "  Timeframe: " . $candle['timeframe'] . "\n";
            echo "  Source: " . $candle['source'] . "\n";
            if ($candle['timeframe'] === '15min') {
                echo "✓ SUCCESS: MT5 timeframe normalized to internal value\n";
            } else {
                echo "✗ FAILED: MT5 timeframe not normalized\n";
            }
        }

        if (isset($wpdb->tables[$snapshots_table])) {
            $snapshot = reset($wpdb->tables[$snapshots_table]);
            $expected_snapshot_time = gmdate('Y-m-d H:i:s', strtotime($payload['timestamp']));
            if ($snapshot['updated_at'] === $expected_snapshot_time) {
                echo "SUCCESS: Snapshot preserves broker timestamp for accurate staleness detection\n";
            } else {
                throw new RuntimeException('Snapshot updated_at must preserve the EA payload timestamp for data freshness');
            }

            if (!isset($GLOBALS['test_transients']['smc_sf_rl_7_eurusd']) && !isset($GLOBALS['test_transients']['smc_sf_qt_7_' . md5('EURUSD')])) {
                echo "SUCCESS: MT5 push clears stale Twelve Data per-symbol cooldown transients\n";
            } else {
                throw new RuntimeException('MT5 push should clear stale TD rate-limit and quote-TTL transients');
            }

            $engine_runs = $wpdb->tables['wp_smc_sf_engine_runs'] ?? array();
            $heartbeat = end($engine_runs);
            if (($heartbeat['status'] ?? null) === 'heartbeat') {
                echo "SUCCESS: EA push writes backendSync heartbeat\n";
            } else {
                throw new RuntimeException('EA push should write an engine_runs heartbeat row');
            }

            if (($GLOBALS['test_transients']['smc_sf_freshness_7_EURUSD'] ?? null) === 'LIVE') {
                echo "✓ SUCCESS: Freshness transient stored\n";
            } else {
                echo "✗ FAILED: Freshness transient missing\n";
            }

            if (($GLOBALS['test_transients']['smc_sf_session_7_EURUSD'] ?? null) === 'London') {
                echo "✓ SUCCESS: Session transient stored\n";
            } else {
                echo "✗ FAILED: Session transient missing\n";
            }
    }
    } else {
        echo "✗ FAILED: Invalid response\n";
        var_dump($response);
    }

    echo "\n";

    // Test 2: Alternate header name X-API-KEY accepted
    echo "Test 2: Alternate header name X-API-KEY accepted\n";
    $alternate_header_payload = array(
        'user_id' => 7,
        'symbol' => 'USDJPY',
        'timeframe' => 'M15',
        'timestamp' => gmdate('c', time()),
        'bid' => 148.321,
        'ask' => 148.335
    );
    $alternate_header_response = dispatch_ea_market_stream($plugin, $alternate_header_payload, array('X-API-KEY' => 'test-key'));

    if ($alternate_header_response instanceof WP_REST_Response && isset($alternate_header_response->data['ok']) && $alternate_header_response->data['ok']) {
        echo "✓ SUCCESS: X-API-KEY header accepted\n";
    } else {
        echo "✗ FAILED: X-API-KEY header rejected\n";
        var_dump($alternate_header_response);
    }

    echo "\n";

    // Test 3: Permission requires user_id before callback runs.
    echo "Test 3: Missing user_id rejected by EA permission gate\n";
    $missing_user_payload = array(
        'symbol' => 'EURUSD',
        'timestamp' => gmdate('c'),
        'bid' => 1.08521,
        'ask' => 1.08534
    );

    $missing_user_response = dispatch_ea_market_stream($plugin, $missing_user_payload);

    if ($missing_user_response instanceof WP_Error && $missing_user_response->code === 'smc_sf_user_required') {
        echo "✓ SUCCESS: Missing user_id correctly rejected\n";
    } else {
        echo "✗ FAILED: Missing user_id not rejected\n";
        var_dump($missing_user_response);
    }

    echo "\n";

    // Test 4 (formerly 3): Stale data rejection — now returns HTTP 422 (BUG-002 patch)
    echo "Test 4: Stale data rejection (>300 seconds old) returns 422 Unprocessable Entity\n";
    $stale_payload = array(
        'user_id' => 7,
        'symbol' => 'EURUSD',
        'timestamp' => gmdate('c', time() - 400), // 400 seconds ago — exceeds 300s hard reject
        'bid' => 1.08521,
        'ask' => 1.08534
    );

    $stale_response = dispatch_ea_market_stream($plugin, $stale_payload);

    if ($stale_response instanceof WP_Error
        && $stale_response->code === 'stale_data'
        && isset($stale_response->data['status'])
        && (int) $stale_response->data['status'] === 422) {
        echo "✓ SUCCESS: Stale data correctly rejected with HTTP 422\n";
    } else {
        echo "✗ FAILED: Stale data not rejected as expected\n";
        var_dump($stale_response);
    }

    echo "\n";

    // Test 4: Invalid payload (missing symbol)
    echo "Test 5: Invalid payload (missing symbol)\n";
    $invalid_payload = array(
        'user_id' => 7,
        'bid' => 1.08521,
        'ask' => 1.08534
    );

    $invalid_response = dispatch_ea_market_stream($plugin, $invalid_payload);

    if ($invalid_response instanceof WP_Error && $invalid_response->code === 'invalid_payload') {
        echo "✓ SUCCESS: Invalid payload correctly rejected\n";
    } else {
        echo "✗ FAILED: Invalid payload not rejected\n";
        var_dump($invalid_response);
    }

    echo "\n";

    // Test 5: Snapshot only (no candle)
    echo "Test 6: Snapshot only payload\n";
    $snapshot_only_payload = array(
        'user_id' => 7,
        'symbol' => 'GBPUSD',
        'timestamp' => gmdate('c'),
        'bid' => 1.27500,
        'ask' => 1.27515
    );

    $snapshot_response = dispatch_ea_market_stream($plugin, $snapshot_only_payload);

    if ($snapshot_response instanceof WP_REST_Response && $snapshot_response->data['snapshots_inserted'] === 1) {
        echo "✓ SUCCESS: Snapshot-only payload accepted\n";
    } else {
        echo "✗ FAILED: Snapshot-only payload rejected\n";
        var_dump($snapshot_response);
    }

    echo "\n";

    // Test 6: OHLC validation guard (BUG-001 regression)
    echo "Test 7: Invalid OHLC candle silently rejected (snapshot still inserted)\n";
    $invalid_ohlc_payload = array(
        'user_id' => 7,
        'symbol' => 'EURUSD',
        'timestamp' => gmdate('c', time() - 5),
        'bid' => 1.08521,
        'ask' => 1.08534,
        'candle' => array(
            'time' => gmdate('c', time() - 65),
            'open' => 1.0850,
            'high' => 1.0848, // INVALID: high < open
            'low'  => 1.0843,
            'close' => 1.0851,
            'volume' => 100
        )
    );

    $invalid_ohlc_response = dispatch_ea_market_stream($plugin, $invalid_ohlc_payload);

    if ($invalid_ohlc_response instanceof WP_REST_Response
        && $invalid_ohlc_response->data['ok'] === true
        && $invalid_ohlc_response->data['candles_inserted'] === 0
        && $invalid_ohlc_response->data['snapshots_inserted'] === 1) {
        echo "✓ SUCCESS: Invalid OHLC candle rejected; snapshot still stored\n";
    } else {
        echo "✗ FAILED: Invalid OHLC candle not correctly handled\n";
        var_dump($invalid_ohlc_response);
    }

    echo "\n";

    // Test 7: is_finite() guard — INF bid/ask now returns WP_Error 422 (BUG-001 patch)
    echo "Test 8: INF bid rejected with HTTP 422 (BUG-001 patch: structured error response)\n";
    $inf_bid_payload = array(
        'user_id' => 7,
        'symbol' => 'GBPUSD',
        'timestamp' => gmdate('c', time() - 5),
        'bid' => INF,
        'ask' => 1.27515
    );

    $inf_bid_response = dispatch_ea_market_stream($plugin, $inf_bid_payload);

    if ($inf_bid_response instanceof WP_Error
        && $inf_bid_response->code === 'invalid_prices'
        && isset($inf_bid_response->data['status'])
        && (int) $inf_bid_response->data['status'] === 422) {
        echo "✓ SUCCESS: INF bid correctly returns WP_Error invalid_prices HTTP 422\n";
    } else {
        echo "✗ FAILED: INF bid was not rejected with structured 422\n";
        var_dump($inf_bid_response);
    }

    echo "\n";

    // Test 7b: bid > ask now returns WP_Error 422 (BUG-001 patch)
    echo "Test 8b: bid > ask rejected with HTTP 422 (BUG-001 patch)\n";
    $bid_gt_ask_payload = array(
        'user_id' => 7,
        'symbol' => 'GBPUSD',
        'timestamp' => gmdate('c', time() - 5),
        'bid' => 1.27600,
        'ask' => 1.27515  // bid > ask
    );

    $bid_gt_ask_response = dispatch_ea_market_stream($plugin, $bid_gt_ask_payload);

    if ($bid_gt_ask_response instanceof WP_Error
        && $bid_gt_ask_response->code === 'invalid_prices'
        && isset($bid_gt_ask_response->data['status'])
        && (int) $bid_gt_ask_response->data['status'] === 422) {
        echo "✓ SUCCESS: bid > ask correctly returns WP_Error invalid_prices HTTP 422\n";
    } else {
        echo "✗ FAILED: bid > ask was not rejected with structured 422\n";
        var_dump($bid_gt_ask_response);
    }

    echo "\n";

    // Test 8: Non-numeric tick_volume (array) is clamped to 0 (Codex P2 regression)
    echo "Test 9: Non-numeric tick_volume (array) clamped to 0 (Codex P2 guard)\n";
    $nonnumeric_volume_payload = array(
        'user_id' => 7,
        'symbol' => 'EURUSD',
        'timestamp' => gmdate('c', time() - 5),
        'bid' => 1.08521,
        'ask' => 1.08534,
        'candle' => array(
            'time' => gmdate('c', time() - 65),
            'open' => 1.0850,
            'high' => 1.0855,
            'low'  => 1.0848,
            'close' => 1.0852,
            'volume' => array('nested' => 'object'), // non-numeric — would cast to 1 without guard
        )
    );

    $nonnumeric_volume_response = dispatch_ea_market_stream($plugin, $nonnumeric_volume_payload);

    if ($nonnumeric_volume_response instanceof WP_REST_Response
        && $nonnumeric_volume_response->data['ok'] === true
        && $nonnumeric_volume_response->data['candles_inserted'] === 1) {
        $candles_table = 'wp_smc_sf_candles';
        $stored_vol2 = null;
        foreach ($wpdb->tables[$candles_table] ?? array() as $row) {
            if ($row['symbol'] === 'EURUSD' && $row['timeframe'] === '15min') {
                $stored_vol2 = (int) $row['volume'];
            }
        }
        if ($stored_vol2 === 0) {
            echo "✓ SUCCESS: Non-numeric tick_volume (array) clamped to 0 (not silently 1)\n";
        } else {
            echo "✗ FAILED: Expected stored volume=0, got volume=" . var_export($stored_vol2, true) . "\n";
        }
    } else {
        echo "✗ FAILED: Candle with non-numeric volume was not accepted\n";
        var_dump($nonnumeric_volume_response);
    }

    echo "\n";

    // Test 9: Negative tick_volume is clamped to 0 (BUG-001 regression)
    echo "Test 10: Negative tick_volume clamped to 0 (BUG-001 regression guard)\n";
    $neg_volume_payload = array(
        'user_id' => 7,
        'symbol' => 'EURUSD',
        'timestamp' => gmdate('c', time() - 5),
        'bid' => 1.08521,
        'ask' => 1.08534,
        'candle' => array(
            'time' => gmdate('c', time() - 65),
            'open' => 1.0850,
            'high' => 1.0855,
            'low'  => 1.0848,
            'close' => 1.0852,
            'volume' => -999,
        )
    );

    $neg_volume_response = dispatch_ea_market_stream($plugin, $neg_volume_payload);

    if ($neg_volume_response instanceof WP_REST_Response
        && $neg_volume_response->data['ok'] === true
        && $neg_volume_response->data['candles_inserted'] === 1) {
        // Check that the stored candle volume is 0 (clamped), not -999
        $candles_table = 'wp_smc_sf_candles';
        $stored_volume = null;
        foreach ($wpdb->tables[$candles_table] ?? array() as $row) {
            if ($row['symbol'] === 'EURUSD' && $row['timeframe'] === '15min') {
                $stored_volume = (int) $row['volume'];
            }
        }
        if ($stored_volume === 0) {
            echo "✓ SUCCESS: Negative tick_volume clamped to 0 (stored as 0, not -999)\n";
        } else {
            echo "✗ FAILED: Expected stored volume=0, got volume=" . var_export($stored_volume, true) . "\n";
        }
    } else {
        echo "✗ FAILED: Candle with negative volume was not accepted (expected 1 candle inserted)\n";
        var_dump($neg_volume_response);
    }

    // Test 10: Missing timestamp — candle must still pass through future-candle and staleness guards
    // via the server-time fallback (BUG-001 2026-05-14 patch). A properly formed recent candle
    // (past, not future) must be stored. An open/forming candle (time >= server time) must be rejected.
    echo "Test 11: Missing timestamp with valid past candle — server-time fallback allows insert (BUG-001 guard)\n";
    $no_timestamp_valid_candle_payload = array(
        'user_id' => 7,
        'symbol' => 'GBPJPY',
        'bid' => 193.500,
        'ask' => 193.515,
        // No 'timestamp' field — the server-time fallback must kick in
        'candle' => array(
            'time' => gmdate('c', time() - 90), // 90 seconds in the past — within 180s max_age_sec
            'open' => 193.480,
            'high' => 193.520,
            'low'  => 193.460,
            'close' => 193.500,
            'volume' => 55,
        )
    );

    $no_ts_response = dispatch_ea_market_stream($plugin, $no_timestamp_valid_candle_payload);

    if ($no_ts_response instanceof WP_REST_Response
        && $no_ts_response->data['ok'] === true
        && $no_ts_response->data['candles_inserted'] === 1) {
        echo "✓ SUCCESS: Past candle inserted when timestamp absent (server-time fallback active)\n";
    } else {
        echo "✗ FAILED: Past candle with missing timestamp was not stored\n";
        var_dump($no_ts_response);
    }

    // Test 12: quote_time alias accepted — canonical REST contract (BUG-001 2026-05-15 patch)
    // Confirms that payloads using 'quote_time' instead of 'timestamp' pass the staleness guard
    // and produce a successful snapshot insertion. This is the canonical published API contract.
    echo "Test 12: quote_time alias accepted (canonical REST contract — BUG-001 2026-05-15)\n";
    $quote_time_payload = array(
        'user_id' => 7,
        'symbol' => 'USDJPY',
        'timeframe' => 'M1',
        'source' => 'MT5',
        'server_time' => gmdate('c'),
        'quote_time' => gmdate('c', time() - 5),   // Uses quote_time, NOT timestamp
        'bid' => 148.321,
        'ask' => 148.335,
        'spread' => 1.4,
        // No 'timestamp' field at all
    );

    $quote_time_response = dispatch_ea_market_stream($plugin, $quote_time_payload);

    if ($quote_time_response instanceof WP_REST_Response
        && isset($quote_time_response->data['ok'])
        && $quote_time_response->data['ok'] === true
        && $quote_time_response->data['snapshots_inserted'] === 1) {
        echo "✓ SUCCESS: quote_time alias accepted; snapshot inserted\n";
    } else {
        echo "✗ FAILED: quote_time alias was not accepted\n";
        var_dump($quote_time_response);
    }

    echo "\n";

    // Test 13: candles[] array shim — canonical REST contract (BUG-001 2026-05-15 patch)
    // Confirms that a payload using the 'candles' array format (published contract) is processed
    // correctly by promoting candles[0] to the M1 candle object.
    echo "Test 13: candles[] array shim accepted (canonical REST contract — BUG-001 2026-05-15)\n";
    $candles_array_payload = array(
        'user_id' => 7,
        'symbol' => 'EURUSD',
        'timeframe' => 'M1',
        'source' => 'MT5',
        'quote_time' => gmdate('c', time() - 5),
        'bid' => 1.08521,
        'ask' => 1.08534,
        'candles' => array(
            array(
                'time'        => gmdate('c', time() - 90),
                'open'        => 1.0850,
                'high'        => 1.0856,
                'low'         => 1.0848,
                'close'       => 1.0853,
                'tick_volume' => 210,   // canonical uses tick_volume; shim maps to volume
            ),
        ),
        // No 'candle' key — handler must promote candles[0]
    );

    $candles_array_response = dispatch_ea_market_stream($plugin, $candles_array_payload);

    if ($candles_array_response instanceof WP_REST_Response
        && isset($candles_array_response->data['ok'])
        && $candles_array_response->data['ok'] === true
        && $candles_array_response->data['snapshots_inserted'] === 1
        && $candles_array_response->data['candles_inserted'] >= 1) {
        echo "✓ SUCCESS: candles[] array shim accepted; candle promoted and stored\n";
    } else {
        echo "✗ FAILED: candles[] array shim was not accepted\n";
        var_dump($candles_array_response);
    }

    echo "\n";

    // Test 14: Stale quote_time rejected with 422 (confirms quote_time staleness guard active)
    echo "Test 14: Stale quote_time rejected with 422 (staleness guard on alias)\n";
    $stale_quote_time_payload = array(
        'user_id' => 7,
        'symbol' => 'EURUSD',
        'quote_time' => gmdate('c', time() - 400),  // 400s ago — exceeds 300s hard reject
        'bid' => 1.08521,
        'ask' => 1.08534,
    );

    $stale_qt_response = dispatch_ea_market_stream($plugin, $stale_quote_time_payload);

    if ($stale_qt_response instanceof WP_Error
        && $stale_qt_response->code === 'stale_data'
        && isset($stale_qt_response->data['status'])
        && (int) $stale_qt_response->data['status'] === 422) {
        echo "✓ SUCCESS: Stale quote_time correctly rejected with HTTP 422\n";
    } else {
        echo "✗ FAILED: Stale quote_time was not rejected as expected\n";
        var_dump($stale_qt_response);
    }


    // ────────────────────────────────────────────────────────────────────────────
    // Tests 15–19: shared candle source/confidence + feed_key scoping
    // ────────────────────────────────────────────────────────────────────────────

    echo "Test 15: Same source retry does not increment source_count\n";
    $candle_table_key = 'wp_smc_sf_market_candles';
    // Clear shared candle table for isolation
    $wpdb->tables[$candle_table_key] = array();
    $candle_ts_15 = gmdate('c', time() - 90);
    $shared_candle_payload_a = array(
        'user_id' => 7,
        'symbol' => 'EURUSD',
        'timeframe' => 'M15',
        'timestamp' => gmdate('c', time() - 5),
        'bid' => 1.08521,
        'ask' => 1.08534,
        'spread' => 1.3,
        'freshness' => 'LIVE',
        'candle_m15' => array(
            'time' => $candle_ts_15,
            'open' => 1.0850, 'high' => 1.0855, 'low' => 1.0848, 'close' => 1.0852,
            'volume' => 100,
        ),
    );
    dispatch_ea_market_stream($plugin, $shared_candle_payload_a);
    $count_before = count($wpdb->tables[$candle_table_key] ?? array());
    dispatch_ea_market_stream($plugin, $shared_candle_payload_a); // retry from same source
    error_log('[TEST DEBUG] wp_smc_sf_market_candles after retries: ' . wp_json_encode(array_values($wpdb->tables[$candle_table_key] ?? array())));
    $rows_after = array_values($wpdb->tables[$candle_table_key] ?? array());
    $source_count_after_retry = null;
    foreach ($rows_after as $r) {
        if (($r['timeframe'] ?? '') === '15min') {
            $source_count_after_retry = (int) ($r['source_count'] ?? 0);
        }
    }
    if ($source_count_after_retry === 1) {
        echo "✓ SUCCESS: Same-source retry did not increment source_count (still 1)\n";
    } else {
        echo "✗ FAILED: source_count after same-source retry = " . var_export($source_count_after_retry, true) . " (expected 1)\n";
    }

    echo "\n";

    echo "Test 16: Second distinct source with same OHLC promotes confidence to 'confirmed'\n";
    $wpdb->tables[$candle_table_key] = array();
    $candle_ts_16 = gmdate('c', time() - 110);
    $shared_p_src1 = array(
        'user_id' => 7,
        'symbol' => 'EURUSD',
        'timeframe' => 'M15',
        'timestamp' => gmdate('c', time() - 5),
        'bid' => 1.08521,
        'ask' => 1.08534,
        'spread' => 1.3,
        'freshness' => 'LIVE',
        'candle_m15' => array(
            'time' => $candle_ts_16,
            'open' => 1.0850, 'high' => 1.0855, 'low' => 1.0848, 'close' => 1.0852,
        ),
    );
    dispatch_ea_market_stream($plugin, $shared_p_src1); // user_id=7
    $shared_p_src2 = $shared_p_src1;
    $shared_p_src2['user_id'] = 8; // different user = distinct source hash
    $GLOBALS['test_current_user_id'] = 8;
    dispatch_ea_market_stream($plugin, $shared_p_src2);
    $GLOBALS['test_current_user_id'] = 7;
    $confidence_16 = null;
    $source_count_16 = null;
    foreach (array_values($wpdb->tables[$candle_table_key] ?? array()) as $r) {
        if (($r['timeframe'] ?? '') === '15min') {
            $confidence_16 = $r['confidence'] ?? null;
            $source_count_16 = (int) ($r['source_count'] ?? 0);
        }
    }
    if ($confidence_16 === 'confirmed' && $source_count_16 === 2) {
        echo "✓ SUCCESS: Second distinct source with same OHLC: confidence=confirmed, source_count=2\n";
    } else {
        echo "✗ FAILED: confidence=" . var_export($confidence_16, true) . " source_count=" . var_export($source_count_16, true) . " (expected confirmed/2)\n";
    }

    echo "\n";

    echo "Test 17: Second distinct source with different OHLC sets confidence='disputed', canonical OHLC unchanged\n";
    $wpdb->tables[$candle_table_key] = array();
    $candle_ts_17 = gmdate('c', time() - 130);
    $shared_p17_src1 = array(
        'user_id' => 7,
        'symbol' => 'EURUSD',
        'timeframe' => 'M15',
        'timestamp' => gmdate('c', time() - 5),
        'bid' => 1.08521,
        'ask' => 1.08534,
        'spread' => 1.3,
        'freshness' => 'LIVE',
        'candle_m15' => array(
            'time' => $candle_ts_17,
            'open' => 1.0850, 'high' => 1.0855, 'low' => 1.0848, 'close' => 1.0852,
        ),
    );
    dispatch_ea_market_stream($plugin, $shared_p17_src1);
    $shared_p17_src2 = $shared_p17_src1;
    $shared_p17_src2['user_id'] = 9;
    $shared_p17_src2['candle_m15']['open'] = 1.0860; // conflicting OHLC
    $shared_p17_src2['candle_m15']['close'] = 1.0865;
    $GLOBALS['test_current_user_id'] = 9;
    dispatch_ea_market_stream($plugin, $shared_p17_src2);
    $GLOBALS['test_current_user_id'] = 7;
    $confidence_17 = null;
    $open_17 = null;
    foreach (array_values($wpdb->tables[$candle_table_key] ?? array()) as $r) {
        if (($r['timeframe'] ?? '') === '15min') {
            $confidence_17 = $r['confidence'] ?? null;
            $open_17 = (float) ($r['open'] ?? 0);
        }
    }
    if ($confidence_17 === 'disputed' && abs($open_17 - 1.0850) < 0.0001) {
        echo "✓ SUCCESS: Conflicting OHLC: confidence=disputed, canonical open preserved (1.0850)\n";
    } else {
        echo "✗ FAILED: confidence=" . var_export($confidence_17, true) . " open=" . var_export($open_17, true) . " (expected disputed, open=1.0850)\n";
    }

    echo "\n";

    echo "Test 18: fetch_shared_market_candles ignores rows from a different feed_key\n";
    // Seed a row under a different feed_key
    $wpdb->tables[$candle_table_key] = array();
    $foreign_candle = array(
        'id' => null,
        'feed_key' => 'FOREIGN_BROKER|LONDON',
        'normalized_symbol' => 'EURUSD',
        'timeframe' => '15min',
        'candle_open_time' => gmdate('Y-m-d H:i:s', time() - 900),
        'open' => 1.0800, 'high' => 1.0810, 'low' => 1.0795, 'close' => 1.0805,
        'volume' => '50.0000',
        'source_count' => 1,
        'source_hashes' => '["abc"]',
        'first_seen_at' => gmdate('Y-m-d H:i:s'),
        'last_seen_at' => gmdate('Y-m-d H:i:s'),
        'confidence' => 'single',
    );
    $wpdb->replace($candle_table_key, $foreign_candle);
    // resolve_user_shared_feed_key reads market_quotes_latest — clear it so it returns ''
    $wpdb->tables['wp_smc_sf_market_quotes_latest'] = array();
    // Directly test the method via reflection with a different feed_key to verify filtering
    $ref = new ReflectionMethod($plugin, 'fetch_shared_market_candles');
    $ref->setAccessible(true);
    $result_18 = $ref->invoke($plugin, 'LOCAL_BROKER|LONDON', 'EURUSD', '15min', 50);
    if (empty($result_18)) {
        echo "✓ SUCCESS: Different feed_key returns no shared candles (foreign rows ignored)\n";
    } else {
        echo "✗ FAILED: Got " . count($result_18) . " candle(s) with different feed_key (expected 0)\n";
    }

    echo "\n";

    echo "Test 19: Stale shared candles trigger fallback (return empty)\n";
    $wpdb->tables[$candle_table_key] = array();
    $stale_candle = array(
        'id' => null,
        'feed_key' => 'STALEBROKER',
        'normalized_symbol' => 'EURUSD',
        'timeframe' => '15min',
        'candle_open_time' => gmdate('Y-m-d H:i:s', time() - 7200), // 2 hours old > 45-min TTL
        'open' => 1.0800, 'high' => 1.0810, 'low' => 1.0795, 'close' => 1.0805,
        'volume' => '50.0000',
        'source_count' => 1,
        'source_hashes' => '["abc"]',
        'first_seen_at' => gmdate('Y-m-d H:i:s', time() - 7200),
        'last_seen_at' => gmdate('Y-m-d H:i:s', time() - 7200),
        'confidence' => 'single',
    );
    $wpdb->replace($candle_table_key, $stale_candle);
    $ref19 = new ReflectionMethod($plugin, 'fetch_shared_market_candles');
    $ref19->setAccessible(true);
    $result_19 = $ref19->invoke($plugin, 'STALEBROKER', 'EURUSD', '15min', 50);
    if (empty($result_19)) {
        echo "✓ SUCCESS: Stale shared candles return empty (fallback triggered)\n";
    } else {
        echo "✗ FAILED: Stale candles not rejected; got " . count($result_19) . " row(s)\n";
    }

    echo "\n";

    echo "Test 20: M15 canonical rows derive correct H1/H4 OHLC in order\n";
    $wpdb->tables[$candle_table_key] = array();
    $base_time = time() - 3600;
    $m15_rows = array(
        array('time' => gmdate('c', $base_time + 0 * 900), 'open' => 1.1000, 'high' => 1.1010, 'low' => 1.0990, 'close' => 1.1005),
        array('time' => gmdate('c', $base_time + 1 * 900), 'open' => 1.1005, 'high' => 1.1020, 'low' => 1.1000, 'close' => 1.1015),
        array('time' => gmdate('c', $base_time + 2 * 900), 'open' => 1.1015, 'high' => 1.1030, 'low' => 1.1010, 'close' => 1.1025),
        array('time' => gmdate('c', $base_time + 3 * 900), 'open' => 1.1025, 'high' => 1.1040, 'low' => 1.1020, 'close' => 1.1035),
    );

    foreach ($m15_rows as $row) {
        $wpdb->replace($candle_table_key, array(
            'id' => null,
            'feed_key' => 'H1H4_TEST_FEED',
            'normalized_symbol' => 'EURUSD',
            'timeframe' => '15min',
            'candle_open_time' => gmdate('Y-m-d H:i:s', strtotime($row['time'])),
            'open' => $row['open'],
            'high' => $row['high'],
            'low' => $row['low'],
            'close' => $row['close'],
            'volume' => '100.0000',
            'source_count' => 1,
            'source_hashes' => '[]',
            'first_seen_at' => gmdate('Y-m-d H:i:s', strtotime($row['time'])),
            'last_seen_at' => gmdate('Y-m-d H:i:s', strtotime($row['time'])),
            'confidence' => 'confirmed',
        ));
    }

    $ref20 = new ReflectionMethod($plugin, 'fetch_shared_market_candles');
    $ref20->setAccessible(true);
    $result_20 = $ref20->invoke($plugin, 'H1H4_TEST_FEED', 'EURUSD', '1h', 1);
    assert_test(
        count($result_20) === 1 && isset($result_20[0]['open'], $result_20[0]['high'], $result_20[0]['low'], $result_20[0]['close']),
        'H1 derived candle should be returned from M15 source rows'
    );
    assert_test(
        abs($result_20[0]['open'] - 1.1000) < 0.000001 && abs($result_20[0]['high'] - 1.1040) < 0.000001 && abs($result_20[0]['low'] - 1.0990) < 0.000001 && abs($result_20[0]['close'] - 1.1035) < 0.000001,
        'H1 candle OHLC should aggregate M15 rows correctly'
    );


    // ────────────────────────────────────────────────────────────────────────────
    // Tests 21–25: shared quote read-through in get_cached_price()
    // ────────────────────────────────────────────────────────────────────────────

    $quotes_table_key = 'wp_smc_sf_market_quotes_latest';
    $ref_get_cached = new ReflectionMethod($plugin, 'get_cached_price');
    $ref_get_cached->setAccessible(true);
    $ref_shared_quote = new ReflectionMethod($plugin, 'fetch_shared_market_quote');
    $ref_shared_quote->setAccessible(true);

    echo "Test 21: get_cached_price() returns shared quote when feed_key exists and quote is fresh\n";
    $wpdb->tables[$quotes_table_key] = array();
    // Seed a fresh shared quote row — feed_key has no trailing pipe (no session segment)
    $wpdb->replace($quotes_table_key, array(
        'id'                    => null,
        'feed_key'              => 'ICMARKETS_SV',
        'symbol'                => 'EURUSD',
        'normalized_symbol'     => 'EURUSD',
        'bid'                   => 1.08521,
        'ask'                   => 1.08534,
        'mid'                   => 1.085275,
        'source_count'          => 2,
        'last_source_user_hash' => 'abc',
        'updated_at'            => gmdate('Y-m-d H:i:s', time() - 10),  // 10s old — fresh
    ));
    // Store the feed_key in user meta so resolve_user_shared_feed_key() finds it
    update_user_meta(7, 'smc_sf_shared_feed_key_' . md5('EURUSD'), 'ICMARKETS_SV');
    $result_21 = $ref_get_cached->invoke($plugin, 7, 'EURUSD', 300);
    assert_test(
        isset($result_21['source']) && $result_21['source'] === 'mt5',
        'Test 21: get_cached_price() should return MT5-compatible shared quote when feed_key exists and quote is fresh'
    );
    assert_test(
        isset($result_21['sourceDetail']) && $result_21['sourceDetail'] === 'shared_market_quote',
        'Test 21: shared quote sourceDetail should be shared_market_quote (provenance)'
    );
    assert_test(
        isset($result_21['source_count']) && (int) $result_21['source_count'] === 2,
        'Test 21: shared quote source_count should be 2 (two distinct EA sources)'
    );
    assert_test(
        array_key_exists('changePct1d', $result_21) && $result_21['changePct1d'] === null,
        'Test 21: shared quote changePct1d should be null (not fake 0.0) until daily-change is implemented'
    );

    echo "\n";

    echo "Test 22: Stale shared quote (> stale_threshold_sec) falls back to per-user snapshot\n";
    $wpdb->tables[$quotes_table_key] = array();
    $wpdb->replace($quotes_table_key, array(
        'id'                    => null,
        'feed_key'              => 'ICMARKETS_SV',
        'symbol'                => 'EURUSD',
        'normalized_symbol'     => 'EURUSD',
        'bid'                   => 1.09000,
        'ask'                   => 1.09015,
        'mid'                   => 1.090075,
        'source_count'          => 1,
        'last_source_user_hash' => 'abc',
        'updated_at'            => gmdate('Y-m-d H:i:s', time() - 400),  // 400s > 300s threshold
    ));
    update_user_meta(7, 'smc_sf_shared_feed_key_' . md5('EURUSD'), 'ICMARKETS_SV');
    // Ensure per-user snapshot row exists for fallback
    $wpdb->replace('wp_smc_sf_snapshots', array(
        'user_id' => 7, 'symbol' => 'EURUSD', 'bid' => 1.08521, 'ask' => 1.08534,
        'mid' => 1.085275, 'spread' => 1, 'change_pct_1d' => 0.0,
        'source' => 'mt5', 'state' => 'live',
        'updated_at' => gmdate('Y-m-d H:i:s', time() - 5),
    ));
    $result_22 = $ref_get_cached->invoke($plugin, 7, 'EURUSD', 300);
    assert_test(
        isset($result_22['source']) && $result_22['source'] === 'mt5',
        'Test 22: shared quote older than stale_threshold_sec must fall back to per-user mt5 snapshot'
    );

    echo "\n";

    echo "Test 23: Missing feed_key falls back to per-user snapshot\n";
    // Remove the stored feed_key for this symbol
    delete_user_meta(7, 'smc_sf_shared_feed_key_' . md5('EURUSD'));
    $wpdb->tables[$quotes_table_key] = array();
    // Per-user snapshot still present from Test 22 setup
    $result_23 = $ref_get_cached->invoke($plugin, 7, 'EURUSD', 300);
    assert_test(
        isset($result_23['source']) && $result_23['source'] === 'mt5',
        'Test 23: missing feed_key must fall back to per-user mt5 snapshot'
    );
    // Restore feed_key for subsequent tests
    update_user_meta(7, 'smc_sf_shared_feed_key_' . md5('EURUSD'), 'ICMARKETS_SV');

    echo "\n";

    echo "Test 24: fetch_shared_market_quote() ignores rows with a different feed_key\n";
    $wpdb->tables[$quotes_table_key] = array();
    $wpdb->replace($quotes_table_key, array(
        'id'                    => null,
        'feed_key'              => 'OTHER_BROKER',   // different feed_key — no pipe
        'symbol'                => 'EURUSD',
        'normalized_symbol'     => 'EURUSD',
        'bid'                   => 1.09500,
        'ask'                   => 1.09515,
        'mid'                   => 1.095075,
        'source_count'          => 1,
        'last_source_user_hash' => 'xyz',
        'updated_at'            => gmdate('Y-m-d H:i:s', time() - 5),
    ));
    // user meta still maps to 'ICMARKETS_SV' — different from row in table
    $result_24 = $ref_shared_quote->invoke($plugin, 7, 'EURUSD', 300);
    assert_test(
        $result_24 === null,
        'Test 24: fetch_shared_market_quote() must return null when stored feed_key does not match any table row'
    );

    echo "\n";

    echo "Test 25: Empty broker_server does not write shared quote rows\n";
    $wpdb->tables[$quotes_table_key] = array();
    $no_broker_payload = array(
        'user_id'   => 7,
        'symbol'    => 'GBPUSD',
        'timestamp' => gmdate('c', time() - 5),
        'bid'       => 1.27000,
        'ask'       => 1.27015,
        'spread'    => 1.5,
        'freshness' => 'LIVE',
        // broker_server intentionally absent — normalize_market_feed_key() returns ''
    );
    dispatch_ea_market_stream($plugin, $no_broker_payload);
    $rows_25 = array_filter(
        array_values($wpdb->tables[$quotes_table_key] ?? array()),
        function ($r) { return ($r['normalized_symbol'] ?? '') === 'GBPUSD'; }
    );
    assert_test(
        count($rows_25) === 0,
        'Test 25: empty broker_server must not write any shared quote row'
    );

    echo "\n";

    echo "\nTest completed.\n";
}


// Run the test
test_ea_market_stream();
