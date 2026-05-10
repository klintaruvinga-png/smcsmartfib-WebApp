<?php

define('ABSPATH', __DIR__ . '/');

if (!function_exists('add_action')) {
    function add_action(...$args) {}
}
if (!function_exists('add_filter')) {
    function add_filter(...$args) {}
}
if (!function_exists('register_activation_hook')) {
    function register_activation_hook(...$args) {}
}
if (!function_exists('register_deactivation_hook')) {
    function register_deactivation_hook(...$args) {}
}
if (!function_exists('plugin_dir_path')) {
    function plugin_dir_path($file) {
        return dirname($file) . DIRECTORY_SEPARATOR;
    }
}
if (!class_exists('WP_REST_Request')) {
    class WP_REST_Request {
        private $json_params;

        public function __construct($json_params = array()) {
            $this->json_params = is_array($json_params) ? $json_params : array();
        }

        public function get_json_params() {
            return $this->json_params;
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
if (!class_exists('TestWpdb')) {
    class TestWpdb {
        public $prefix = 'wp_';
        public $tables = array();

        public function replace($table, $data, $formats = array()) {
            if (!isset($this->tables[$table])) {
                $this->tables[$table] = array();
            }
            $key = isset($data['user_id']) ? (string) $data['user_id'] : uniqid('row_', true);
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
                    switch ($matches[1]) {
                        case 'd':
                            $out .= (string) (int) $value;
                            break;
                        case 'f':
                            $out .= (string) (float) $value;
                            break;
                        case 's':
                        default:
                            $out .= "'" . str_replace("'", "''", (string) $value) . "'";
                            break;
                    }
                } else {
                    $out .= $part;
                }
            }
            return $out;
        }

        public function get_var($query) {
            if (preg_match("/SELECT settings FROM ([^ ]+) WHERE user_id = (\\d+)/", $query, $matches)) {
                $table = $matches[1];
                $user_id = (string) ((int) $matches[2]);
                return $this->tables[$table][$user_id]['settings'] ?? null;
            }

            if (preg_match("/SELECT data FROM ([^ ]+) WHERE user_id = (\\d+)/", $query, $matches)) {
                $table = $matches[1];
                $user_id = (string) ((int) $matches[2]);
                return $this->tables[$table][$user_id]['data'] ?? null;
            }

            if (preg_match("/SELECT key_status FROM ([^ ]+) WHERE user_id = (\\d+) AND provider = '([^']+)'/", $query)) {
                return null;
            }

            return null;
        }

        public function insert($table, $data, $formats = array()) {
            if (!isset($this->tables[$table])) {
                $this->tables[$table] = array();
            }
            $this->tables[$table][] = $data;
            return 1;
        }

        public function delete($table, $where, $where_format = array()) {
            if (!isset($this->tables[$table])) {
                return 0;
            }
            $deleted = 0;
            foreach ($this->tables[$table] as $key => $row) {
                $matches = true;
                foreach ($where as $field => $value) {
                    if (!array_key_exists($field, $row) || (string) $row[$field] !== (string) $value) {
                        $matches = false;
                        break;
                    }
                }
                if ($matches) {
                    unset($this->tables[$table][$key]);
                    $deleted++;
                }
            }
            return $deleted;
        }
    }
}
if (!function_exists('delete_user_meta')) {
    function delete_user_meta($user_id, $meta_key) {
        $GLOBALS['smc_watchlist_deleted_meta'][] = array(
            'user_id' => $user_id,
            'meta_key' => $meta_key,
        );
        return true;
    }
}
if (!function_exists('wp_json_encode')) {
    function wp_json_encode($value) {
        return json_encode($value);
    }
}
if (!function_exists('rest_url')) {
    function rest_url() {
        return 'https://example.com/wp-json';
    }
}
if (!function_exists('rest_ensure_response')) {
    function rest_ensure_response($value) {
        return $value;
    }
}
if (!function_exists('get_current_user_id')) {
    function get_current_user_id() {
        return $GLOBALS['test_current_user_id'] ?? 0;
    }
}
if (!function_exists('esc_url_raw')) {
    function esc_url_raw($value) {
        return (string) $value;
    }
}

$GLOBALS['smc_watchlist_deleted_meta'] = array();
$GLOBALS['test_current_user_id'] = 7;

global $wpdb;
$wpdb = new TestWpdb();

require_once dirname(__DIR__, 2) . '/smc-superfib-sniper.php';

function fail($message) {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function assert_true($condition, $message) {
    if (!$condition) {
        fail($message);
    }
}

function assert_same($expected, $actual, $message) {
    if ($expected !== $actual) {
        fail($message . ' expected=' . var_export($expected, true) . ' actual=' . var_export($actual, true));
    }
}

$ref = new ReflectionClass('SMC_SuperFib_Sniper_REST');
$instance = $ref->newInstanceWithoutConstructor();

$isCurrent = $ref->getMethod('is_engine_snapshot_current');
$isCurrent->setAccessible(true);
$deleteSnapshot = $ref->getMethod('delete_engine_snapshot');
$deleteSnapshot->setAccessible(true);
$getSettings = $ref->getMethod('get_settings');
$getSettings->setAccessible(true);
$saveWatchlist = $ref->getMethod('save_watchlist');
$saveWatchlist->setAccessible(true);

$freshSnapshot = array(
    'prices' => array(
        array('symbol' => 'EURUSD'),
        array('symbol' => 'USDJPY'),
    ),
    'meta' => array(
        'computedAt' => gmdate('c'),
    ),
);

assert_true(
    $isCurrent->invoke($instance, $freshSnapshot, array('EURUSD', 'USDJPY'), 30),
    'matching symbols with a fresh timestamp must keep the snapshot current'
);
assert_true(
    !$isCurrent->invoke($instance, $freshSnapshot, array('EURUSD'), 30),
    'symbol-set mismatch must invalidate a fresh snapshot before timestamp freshness is considered'
);

$deleteSnapshot->invoke($instance, 42);
assert_same(
    array(
        array(
            'user_id' => 42,
            'meta_key' => 'smc_sf_engine_snapshot',
        ),
    ),
    $GLOBALS['smc_watchlist_deleted_meta'],
    'watchlist snapshot invalidation must delete the cached engine snapshot user meta'
);

$userSettingsTable = $wpdb->prefix . 'smc_sf_user_settings';
$wpdb->replace($userSettingsTable, array(
    'user_id' => 7,
    'settings' => json_encode(array(
        'backendUrl' => 'https://example.com/wp-json',
        'refreshIntervalSec' => 2,
        'staleThresholdSec' => 60,
        'watchlist' => array(' eurusd ', 'EURUSD', 'usdjpy', 'XAU/USD', 'SYMBOL_TOO_LONG_123'),
        'riskAllocation' => array('perTradePct' => 0.5, 'dailyMaxPct' => 2.0, 'ddCapPct' => 6.0),
    )),
    'updated_at' => '2026-05-09 12:00:00',
));

$normalizedSettings = $getSettings->invoke($instance, 7);
assert_same(
    array('EURUSD', 'USDJPY', 'XAUUSD'),
    $normalizedSettings['watchlist'],
    'get_settings must normalize mixed-case persisted watchlists before downstream snapshot reads'
);

$saveWatchlist->invoke($instance, 7, array(' gbpusd ', 'GBPUSD', 'usdjpy', 'SYMBOL_TOO_LONG_123'));
$savedSettingsRow = $wpdb->tables[$userSettingsTable]['7'] ?? null;
assert_true(is_array($savedSettingsRow), 'save_watchlist must persist user settings');
$savedSettings = json_decode($savedSettingsRow['settings'], true);
assert_same(
    array('GBPUSD', 'USDJPY'),
    $savedSettings['watchlist'] ?? null,
    'save_watchlist must persist a canonical uppercase de-duplicated watchlist'
);

$GLOBALS['smc_watchlist_deleted_meta'] = array();
$response = $instance->post_user_settings(new WP_REST_Request(array(
    'backendUrl' => 'https://example.com/wp-json',
    'refreshIntervalSec' => 5,
    'staleThresholdSec' => 60,
    'watchlist' => array('EURUSD', 'GBPUSD'),
    'riskAllocation' => array('perTradePct' => 0.5, 'dailyMaxPct' => 2.0, 'ddCapPct' => 6.0),
)));
assert_same(array('ok' => true), $response, 'post_user_settings must return success in the test harness');
assert_same(
    array(
        array(
            'user_id' => 7,
            'meta_key' => 'smc_sf_engine_snapshot',
        ),
    ),
    $GLOBALS['smc_watchlist_deleted_meta'],
    'post_user_settings must invalidate the cached engine snapshot when the saved watchlist changes'
);

fwrite(STDOUT, 'watchlist snapshot regression checks passed' . PHP_EOL);
