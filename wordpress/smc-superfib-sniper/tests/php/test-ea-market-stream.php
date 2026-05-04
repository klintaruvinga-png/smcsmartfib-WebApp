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

        public function __construct($params = array()) {
            $this->params = is_array($params) ? $params : array();
        }

        public function get_json_params() {
            return $this->params;
        }

        public function get_param($key) {
            return isset($this->params[$key]) ? $this->params[$key] : null;
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

// Test the EA market stream endpoint
function test_ea_market_stream() {
    global $wpdb;

    echo "Testing EA Market Stream Endpoint\n";
    echo "=================================\n\n";

    $plugin = new SMC_SuperFib_Sniper_REST();

    // Test 1: Valid payload with both snapshot and candle
    echo "Test 1: Valid payload with snapshot and candle\n";
    $payload = array(
        'symbol' => 'EURUSD',
        'timeframe' => 'M15',
        'timestamp' => gmdate('c'), // Current time
        'bid' => 1.08521,
        'ask' => 1.08534,
        'candle' => array(
            'time' => gmdate('c'),
            'open' => 1.08450,
            'high' => 1.08550,
            'low' => 1.08420,
            'close' => 1.08510,
            'volume' => 1234
        )
    );

    $request = new WP_REST_Request($payload);
    $response = $plugin->post_ea_market_stream($request);

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
        }
    } else {
        echo "✗ FAILED: Invalid response\n";
        var_dump($response);
    }

    echo "\n";

    // Test 2: Stale data rejection
    echo "Test 2: Stale data rejection (>5 minutes old)\n";
    $stale_payload = array(
        'symbol' => 'EURUSD',
        'timestamp' => gmdate('c', time() - 400), // 400 seconds ago
        'bid' => 1.08521,
        'ask' => 1.08534
    );

    $stale_request = new WP_REST_Request($stale_payload);
    $stale_response = $plugin->post_ea_market_stream($stale_request);

    if ($stale_response instanceof WP_Error && $stale_response->code === 'stale_data') {
        echo "✓ SUCCESS: Stale data correctly rejected\n";
    } else {
        echo "✗ FAILED: Stale data not rejected\n";
        var_dump($stale_response);
    }

    echo "\n";

    // Test 3: Invalid payload (missing symbol)
    echo "Test 3: Invalid payload (missing symbol)\n";
    $invalid_payload = array(
        'bid' => 1.08521,
        'ask' => 1.08534
    );

    $invalid_request = new WP_REST_Request($invalid_payload);
    $invalid_response = $plugin->post_ea_market_stream($invalid_request);

    if ($invalid_response instanceof WP_Error && $invalid_response->code === 'invalid_payload') {
        echo "✓ SUCCESS: Invalid payload correctly rejected\n";
    } else {
        echo "✗ FAILED: Invalid payload not rejected\n";
        var_dump($invalid_response);
    }

    echo "\n";

    // Test 4: Snapshot only (no candle)
    echo "Test 4: Snapshot only payload\n";
    $snapshot_only_payload = array(
        'symbol' => 'GBPUSD',
        'timestamp' => gmdate('c'),
        'bid' => 1.27500,
        'ask' => 1.27515
    );

    $snapshot_request = new WP_REST_Request($snapshot_only_payload);
    $snapshot_response = $plugin->post_ea_market_stream($snapshot_request);

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
