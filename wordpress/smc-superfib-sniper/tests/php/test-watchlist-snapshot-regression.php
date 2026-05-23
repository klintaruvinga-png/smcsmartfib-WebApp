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
$sanitizeSymbols = $ref->getMethod('sanitize_symbols');
$sanitizeSymbols->setAccessible(true);
$isSupportedSymbol = $ref->getMethod('is_supported_symbol');
$isSupportedSymbol->setAccessible(true);

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
    $isCurrent->invoke($instance, $freshSnapshot, array('EURUSD', 'USDJPY'), 30, 60),
    'matching symbols with a fresh timestamp must keep the snapshot current'
);
assert_true(
    !$isCurrent->invoke($instance, $freshSnapshot, array('EURUSD'), 30, 60),
    'symbol-set mismatch must invalidate a fresh snapshot before timestamp freshness is considered'
);
assert_true(
    !$isCurrent->invoke($instance, array(
        'prices' => array(
            array('symbol' => 'EURUSD'),
        ),
        'meta' => array(
            'computedAt' => gmdate('c'),
        ),
    ), array('EURUSD', 'USDJPY'), 30, 60),
    'symbol additions must also invalidate a fresh snapshot before timestamp freshness is considered'
);
assert_true(
    !$isCurrent->invoke($instance, array(
        'prices' => array(
            array(
                'symbol' => 'EURUSD',
                'state' => 'live',
                'updatedAt' => gmdate('c', time() - 15),
            ),
            array(
                'symbol' => 'USDJPY',
                'state' => 'live',
                'updatedAt' => gmdate('c', time() - 15),
            ),
        ),
        'meta' => array(
            'computedAt' => gmdate('c'),
        ),
    ), array('EURUSD', 'USDJPY'), 30, 10),
    'freshly computed engine snapshots must be invalidated once live quote timestamps exceed the stale threshold'
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
        'watchlist' => array(' eurusd ', 'EURUSD', 'usdjpy', 'XAU/USD', 'FOOBAR', 'SYMBOL_TOO_LONG_123'),
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

$saveWatchlist->invoke($instance, 7, array(' gbpusd ', 'GBPUSD', 'usdjpy', 'FOOBAR', 'SYMBOL_TOO_LONG_123'));
$savedSettingsRow = $wpdb->tables[$userSettingsTable]['7'] ?? null;
assert_true(is_array($savedSettingsRow), 'save_watchlist must persist user settings');
$savedSettings = json_decode($savedSettingsRow['settings'], true);
assert_same(
    array('GBPUSD', 'USDJPY'),
    $savedSettings['watchlist'] ?? null,
    'save_watchlist must persist a canonical uppercase de-duplicated watchlist'
);

assert_same(
    array('NAS100', 'SOLUSD', 'BTCUSD', 'ETHUSD', 'XRPUSD', 'BNBUSD'),
    $sanitizeSymbols->invoke(
        $instance,
        array('NASDAQ', 'US Tech 100', 'nas100', 'sol/usd', 'BTCUSD', 'ethusd', 'xrpusd', 'bnbusd')
    ),
    'sanitize_symbols must collapse supported index aliases and crypto symbols to canonical watchlist tokens'
);
assert_true(
    $isSupportedSymbol->invoke($instance, 'NASDAQ'),
    'is_supported_symbol must accept NASDAQ as an alias for NAS100'
);
assert_true(
    $isSupportedSymbol->invoke($instance, 'US Tech 100'),
    'is_supported_symbol must accept US Tech 100 as an alias for NAS100'
);
assert_true(
    $isSupportedSymbol->invoke($instance, 'SOLUSD'),
    'is_supported_symbol must accept SOLUSD once it is present in the authoritative instrument registry'
);
assert_true(
    $isSupportedSymbol->invoke($instance, 'AUDCAD'),
    'is_supported_symbol must keep AUDCAD in the authoritative instrument registry'
);
assert_true(
    !$isSupportedSymbol->invoke($instance, 'ADAUSD'),
    'is_supported_symbol must remain fail-closed for unsupported crypto symbols'
);

$GLOBALS['smc_watchlist_deleted_meta'] = array();
$response = $instance->post_user_settings(new WP_REST_Request(array(
    'backendUrl' => 'https://example.com/wp-json',
    'refreshIntervalSec' => 5,
    'staleThresholdSec' => 60,
    'watchlist' => array('EURUSD', 'FOOBAR', 'AUDCAD'),
    'riskAllocation' => array('perTradePct' => 0.5, 'dailyMaxPct' => 2.0, 'ddCapPct' => 6.0),
)));
assert_same(
    array(
        'ok' => true,
        'watchlist' => array('EURUSD', 'AUDCAD'),
    ),
    $response,
    'post_user_settings must return the authoritative canonical watchlist in the mutation response'
);
$savedSettingsRow = $wpdb->tables[$userSettingsTable]['7'] ?? null;
assert_true(is_array($savedSettingsRow), 'post_user_settings must persist user settings');
$savedSettings = json_decode($savedSettingsRow['settings'], true);
assert_same(
    array('EURUSD', 'AUDCAD'),
    $savedSettings['watchlist'] ?? null,
    'post_user_settings must persist only supported watchlist symbols'
);
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

$GLOBALS['smc_watchlist_deleted_meta'] = array();
$response = $instance->post_user_watchlist(new WP_REST_Request(array(
    'watchlist' => array('NASDAQ', 'US Tech 100', 'SOLUSD', 'ETHUSD', 'XRPUSD', 'BNBUSD'),
)));
assert_same(
    array(
        'ok' => true,
        'watchlist' => array('NAS100', 'SOLUSD', 'ETHUSD', 'XRPUSD', 'BNBUSD'),
    ),
    $response,
    'post_user_watchlist must persist and return the authoritative canonical watchlist for index aliases and supported cryptos'
);
assert_same(
    array(
        array(
            'user_id' => 7,
            'meta_key' => 'smc_sf_engine_snapshot',
        ),
    ),
    $GLOBALS['smc_watchlist_deleted_meta'],
    'post_user_watchlist must invalidate the cached engine snapshot after canonical alias persistence'
);

$GLOBALS['smc_watchlist_deleted_meta'] = array();
$response = $instance->post_watchlist_add(new WP_REST_Request(array('symbol' => 'nasdaq')));
assert_same(
    array(
        'ok' => true,
        'watchlist' => array('NAS100', 'SOLUSD', 'ETHUSD', 'XRPUSD', 'BNBUSD'),
    ),
    $response,
    'post_watchlist_add must no-op when an alias resolves to an already-persisted canonical symbol'
);
assert_same(
    array(),
    $GLOBALS['smc_watchlist_deleted_meta'],
    'post_watchlist_add must not invalidate the cached engine snapshot when the canonical watchlist is unchanged'
);

$GLOBALS['smc_watchlist_deleted_meta'] = array();
$response = $instance->post_watchlist_add(new WP_REST_Request(array('symbol' => 'btcusd')));
assert_same(
    array(
        'ok' => true,
        'watchlist' => array('NAS100', 'SOLUSD', 'ETHUSD', 'XRPUSD', 'BNBUSD', 'BTCUSD'),
    ),
    $response,
    'post_watchlist_add must accept newly-supported crypto symbols through the canonical mutation path'
);
assert_same(
    array(
        array(
            'user_id' => 7,
            'meta_key' => 'smc_sf_engine_snapshot',
        ),
    ),
    $GLOBALS['smc_watchlist_deleted_meta'],
    'post_watchlist_add must invalidate the cached engine snapshot when the persisted canonical watchlist changes'
);

$snapshotTable = $wpdb->prefix . 'smc_sf_snapshots';
$wpdb->tables[$snapshotTable] = array(
    'nas100' => array('user_id' => 7, 'symbol' => 'NAS100'),
);
$GLOBALS['smc_watchlist_deleted_meta'] = array();
$response = $instance->post_watchlist_remove(new WP_REST_Request(array('symbol' => 'US Tech 100')));
assert_same(
    array(
        'ok' => true,
        'watchlist' => array('SOLUSD', 'ETHUSD', 'XRPUSD', 'BNBUSD', 'BTCUSD'),
    ),
    $response,
    'post_watchlist_remove must remove canonical symbols even when the request uses a supported alias'
);
assert_same(
    array(
        array(
            'user_id' => 7,
            'meta_key' => 'smc_sf_engine_snapshot',
        ),
    ),
    $GLOBALS['smc_watchlist_deleted_meta'],
    'post_watchlist_remove must invalidate the cached engine snapshot after alias-based removal'
);
assert_same(
    array(),
    array_values($wpdb->tables[$snapshotTable] ?? array()),
    'post_watchlist_remove must clear the stale snapshot row for the removed canonical symbol'
);

fwrite(STDOUT, 'watchlist snapshot regression checks passed' . PHP_EOL);
