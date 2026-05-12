<?php

define('ABSPATH', __DIR__ . '/');
define('ARRAY_A', 'ARRAY_A');

$GLOBALS['test_registered_routes'] = array();
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
    echo "Test 2: Missing user_id rejected by EA permission gate\n";
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

    // Test 3: Stale data rejection
    echo "Test 3: Stale data rejection (>120 seconds old)\n";
    $stale_payload = array(
        'user_id' => 7,
        'symbol' => 'EURUSD',
        'timestamp' => gmdate('c', time() - 400), // 400 seconds ago
        'bid' => 1.08521,
        'ask' => 1.08534
    );

    $stale_response = dispatch_ea_market_stream($plugin, $stale_payload);

    if ($stale_response instanceof WP_Error && $stale_response->code === 'stale_data') {
        echo "✓ SUCCESS: Stale data correctly rejected\n";
    } else {
        echo "✗ FAILED: Stale data not rejected\n";
        var_dump($stale_response);
    }

    echo "\n";

    // Test 4: Invalid payload (missing symbol)
    echo "Test 4: Invalid payload (missing symbol)\n";
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
    echo "Test 5: Snapshot only payload\n";
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
    echo "Test 6: Invalid OHLC candle silently rejected (snapshot still inserted)\n";
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

    // Test 7: is_finite() guard — INF bid/ask rejected (BUG-001 regression)
    echo "Test 7: INF bid rejected by is_finite() guard (snapshot NOT inserted)\n";
    $inf_bid_payload = array(
        'user_id' => 7,
        'symbol' => 'GBPUSD',
        'timestamp' => gmdate('c', time() - 5),
        'bid' => INF,
        'ask' => 1.27515
    );

    $inf_bid_response = dispatch_ea_market_stream($plugin, $inf_bid_payload);

    if ($inf_bid_response instanceof WP_REST_Response
        && $inf_bid_response->data['ok'] === true
        && $inf_bid_response->data['snapshots_inserted'] === 0) {
        echo "✓ SUCCESS: INF bid correctly rejected by is_finite() guard\n";
    } else {
        echo "✗ FAILED: INF bid was not rejected\n";
        var_dump($inf_bid_response);
    }

    echo "\nTest completed.\n";
}

// Run the test
test_ea_market_stream();
