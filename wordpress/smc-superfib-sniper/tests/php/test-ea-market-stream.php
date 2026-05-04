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
            return $query; // Simplified for testing
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

    // Test 1: Valid payload with both snapshot and candle
    echo "Test 1: Valid payload with snapshot and candle\n";
    $now = time();
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
        }

        if (isset($wpdb->tables[$candles_table])) {
            echo "✓ SUCCESS: Candle stored in database\n";
            $candle = reset($wpdb->tables[$candles_table]);
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
            echo "✓ SUCCESS: Snapshot uses payload timestamp for updated_at\n";
        } else {
            echo "✗ FAILED: Snapshot updated_at does not match payload timestamp\n";
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

    echo "\nTest completed.\n";
}

// Run the test
test_ea_market_stream();
