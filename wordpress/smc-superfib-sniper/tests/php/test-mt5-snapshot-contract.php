<?php

define('ABSPATH', __DIR__ . '/');
define('ARRAY_A', 'ARRAY_A');

$GLOBALS['test_registered_routes'] = array();
$GLOBALS['test_transients'] = array();
$GLOBALS['test_user_meta'] = array();
$GLOBALS['test_deleted_user_meta'] = array();
$GLOBALS['test_current_user_id'] = 0;
$GLOBALS['test_is_logged_in'] = false;
$GLOBALS['test_capabilities'] = array(
    'read' => false,
    'manage_options' => false,
);

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

if (!class_exists('TestWpdb')) {
    class TestWpdb {
        public $prefix = 'wp_';
        public $tables = array();

        public function replace($table, $data, $formats = array()) {
            if (!isset($this->tables[$table])) {
                $this->tables[$table] = array();
            }
            $key = $this->row_key($table, $data);
            $this->tables[$table][$key] = $data;
            return 1;
        }

        public function update($table, $data, $where, $data_format = array(), $where_format = array()) {
            if (!isset($this->tables[$table])) {
                return 0;
            }
            foreach ($this->tables[$table] as $key => $row) {
                if ($this->matches_where($row, $where)) {
                    $this->tables[$table][$key] = array_merge($row, $data);
                    return 1;
                }
            }
            return 0;
        }

        public function insert($table, $data, $formats = array()) {
            if (!isset($this->tables[$table])) {
                $this->tables[$table] = array();
            }
            $this->tables[$table][] = $data;
            return 1;
        }

        public function query($sql) {
            return 1;
        }

        public function get_charset_collate() {
            return '';
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
            if (preg_match("/SELECT settings FROM ([^ ]+) WHERE user_id = (\\d+)/", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) $row['user_id'] === $user_id) {
                        return $row['settings'];
                    }
                }
                return null;
            }

            if (preg_match("/SELECT COUNT\\(\\*\\) FROM ([^ ]+) WHERE user_id = (\\d+) AND symbol = '([^']+)' AND source = 'mt5'/", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                $symbol = $m[3];
                $count = 0;
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) $row['user_id'] === $user_id && $row['symbol'] === $symbol && ($row['source'] ?? '') === 'mt5') {
                        $count++;
                    }
                }
                return $count;
            }

            if (preg_match("/SELECT COUNT\\(\\*\\) FROM ([^ ]+) WHERE user_id = (\\d+) AND symbol = '([^']+)' AND \\(source = 'twelve-data' OR source IS NULL OR source = ''\\)/", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                $symbol = $m[3];
                $count = 0;
                foreach ($this->tables[$table] ?? array() as $row) {
                    $source = isset($row['source']) ? $row['source'] : '';
                    if ((int) $row['user_id'] === $user_id && $row['symbol'] === $symbol && ($source === 'twelve-data' || $source === '')) {
                        $count++;
                    }
                }
                return $count;
            }

            if (preg_match("/SELECT MAX\\((updated_at|created_at)\\) FROM ([^ ]+) WHERE user_id = (\\d+)(?: AND source = '([^']+)')?/", $query, $m)) {
                $column = $m[1];
                $table = $m[2];
                $user_id = (int) $m[3];
                $source = isset($m[4]) ? $m[4] : null;
                $max = null;
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) !== $user_id) {
                        continue;
                    }
                    if ($source !== null && ($row['source'] ?? '') !== $source) {
                        continue;
                    }
                    $value = $row[$column] ?? null;
                    if ($value !== null && ($max === null || strcmp($value, $max) > 0)) {
                        $max = $value;
                    }
                }
                return $max;
            }

            return null;
        }

        public function get_row($query, $output = ARRAY_A) {
            if (preg_match("/SELECT \\* FROM ([^ ]+) WHERE user_id = (\\d+) AND symbol = '([^']+)'(?: AND source = '([^']+)')?/", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                $symbol = $m[3];
                $source = isset($m[4]) ? $m[4] : null;
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) $row['user_id'] !== $user_id || $row['symbol'] !== $symbol) {
                        continue;
                    }
                    if ($source !== null && ($row['source'] ?? '') !== $source) {
                        continue;
                    }
                    return $row;
                }
            }
            return null;
        }

        public function get_results($query, $output = ARRAY_A) {
            if (preg_match("/SELECT candle_time, open, high, low, close(?:, volume)?(?:, source)? FROM ([^ ]+) WHERE user_id = (\\d+) AND symbol = '([^']+)' AND timeframe = '([^']+)'(?: AND source = '([^']+)')? ORDER BY candle_time (ASC|DESC)/", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                $symbol = $m[3];
                $timeframe = $m[4];
                $source = isset($m[5]) && $m[5] !== '' ? $m[5] : null;
                $direction = isset($m[6]) ? $m[6] : 'ASC';
                $rows = array();
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) $row['user_id'] !== $user_id || $row['symbol'] !== $symbol || $row['timeframe'] !== $timeframe) {
                        continue;
                    }
                    if ($source !== null && ($row['source'] ?? '') !== $source) {
                        continue;
                    }
                    $rows[] = $row;
                }
                usort($rows, function ($a, $b) use ($direction) {
                    $cmp = strcmp($a['candle_time'], $b['candle_time']);
                    return $direction === 'DESC' ? -1 * $cmp : $cmp;
                });
                return $rows;
            }
            return array();
        }

        private function row_key($table, $data) {
            if (substr($table, -9) === 'snapshots') {
                return $data['user_id'] . '|' . $data['symbol'];
            }
            if (substr($table, -7) === 'candles') {
                return $data['user_id'] . '|' . $data['symbol'] . '|' . $data['timeframe'] . '|' . $data['candle_time'];
            }
            if (substr($table, -13) === 'user_settings') {
                return (string) $data['user_id'];
            }
            return uniqid('row_', true);
        }

        private function matches_where($row, $where) {
            foreach ($where as $key => $value) {
                if (!array_key_exists($key, $row) || (string) $row[$key] !== (string) $value) {
                    return false;
                }
            }
            return true;
        }
    }
}

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
if (!function_exists('register_rest_route')) {
    function register_rest_route($namespace, $route, $args) {
        $GLOBALS['test_registered_routes'][] = array(
            'namespace' => $namespace,
            'route' => $route,
            'args' => $args,
        );
    }
}
if (!function_exists('plugin_dir_path')) {
    function plugin_dir_path($file) {
        return dirname($file) . DIRECTORY_SEPARATOR;
    }
}
if (!function_exists('rest_ensure_response')) {
    function rest_ensure_response($value) {
        return $value;
    }
}
if (!function_exists('sanitize_text_field')) {
    function sanitize_text_field($value) {
        return trim((string) $value);
    }
}
if (!function_exists('esc_url_raw')) {
    function esc_url_raw($value) {
        return (string) $value;
    }
}
if (!function_exists('wp_unslash')) {
    function wp_unslash($value) {
        return $value;
    }
}
if (!function_exists('apply_filters')) {
    function apply_filters($hook, $value) {
        return $value;
    }
}
if (!function_exists('home_url')) {
    function home_url() {
        return 'https://example.com';
    }
}
if (!function_exists('wp_parse_url')) {
    function wp_parse_url($url, $component = -1) {
        return parse_url($url, $component);
    }
}
if (!function_exists('untrailingslashit')) {
    function untrailingslashit($value) {
        return rtrim((string) $value, '/');
    }
}
if (!function_exists('rest_url')) {
    function rest_url() {
        return 'https://example.com/wp-json';
    }
}
if (!function_exists('wp_json_encode')) {
    function wp_json_encode($value) {
        return json_encode($value);
    }
}
if (!function_exists('sanitize_key')) {
    function sanitize_key($key) {
        return strtolower(preg_replace('/[^a-zA-Z0-9_\\-]/', '', (string) $key));
    }
}
if (!function_exists('set_transient')) {
    function set_transient($key, $value, $expiration) {
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
if (!function_exists('get_current_user_id')) {
    function get_current_user_id() {
        return $GLOBALS['test_current_user_id'];
    }
}
if (!function_exists('is_user_logged_in')) {
    function is_user_logged_in() {
        return $GLOBALS['test_is_logged_in'];
    }
}
if (!function_exists('current_user_can')) {
    function current_user_can($cap) {
        return !empty($GLOBALS['test_capabilities'][$cap]);
    }
}
if (!function_exists('get_user_meta')) {
    function get_user_meta($user_id, $key, $single = false) {
        return $GLOBALS['test_user_meta'][$user_id][$key] ?? null;
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
        $GLOBALS['test_deleted_user_meta'][] = array(
            'user_id' => $user_id,
            'meta_key' => $key,
        );
        unset($GLOBALS['test_user_meta'][$user_id][$key]);
        return true;
    }
}
if (!function_exists('is_wp_error')) {
    function is_wp_error($value) {
        return $value instanceof WP_Error;
    }
}

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

$instance = new SMC_SuperFib_Sniper_REST();
$instance->register_routes();

$snapshotPostRoute = null;
$adminHealthRoute = null;
foreach ($GLOBALS['test_registered_routes'] as $route) {
    if ($route['namespace'] === 'sniper/v1' && $route['route'] === '/snapshot' && $route['args']['methods'] === WP_REST_Server::CREATABLE) {
        $snapshotPostRoute = $route;
    }
    if ($route['namespace'] === 'sniper/v1' && $route['route'] === '/admin/health' && $route['args']['methods'] === WP_REST_Server::READABLE) {
        $adminHealthRoute = $route;
    }
}

assert_true(is_array($snapshotPostRoute), 'POST /snapshot route was not registered');
assert_true(is_array($snapshotPostRoute['args']['permission_callback']), 'POST /snapshot must use authenticated permission callback');
assert_same('permission_user', $snapshotPostRoute['args']['permission_callback'][1], 'POST /snapshot permission callback mismatch');
assert_true(is_array($adminHealthRoute), 'GET /admin/health route was not registered');
assert_true(is_array($adminHealthRoute['args']['permission_callback']), 'GET /admin/health must use admin permission callback');
assert_same('permission_admin', $adminHealthRoute['args']['permission_callback'][1], 'GET /admin/health permission callback mismatch');

$GLOBALS['test_is_logged_in'] = false;
$GLOBALS['test_capabilities']['read'] = false;
$GLOBALS['test_capabilities']['manage_options'] = false;
$GLOBALS['test_current_user_id'] = 0;

$unauthorized = $instance->post_snapshot(new WP_REST_Request(array(
    'symbol' => 'EURUSD',
    'tick' => array(
        'bid' => 1.1010,
        'ask' => 1.1012,
        'timestamp' => '2026-05-03T08:15:30Z',
    ),
    'freshness' => 'LIVE',
)));

assert_true($unauthorized instanceof WP_Error, 'Unauthenticated MT5 snapshot should be rejected');
assert_same(401, $unauthorized->data['status'], 'Unauthenticated MT5 snapshot should return 401');
assert_true(empty($wpdb->tables[$wpdb->prefix . 'smc_sf_snapshots'] ?? array()), 'Unauthenticated MT5 snapshot must not persist data');

$unauthenticatedAdminDenied = $instance->permission_admin();
assert_true($unauthenticatedAdminDenied instanceof WP_Error, 'Unauthenticated user should be rejected from /admin/health');
assert_same(401, $unauthenticatedAdminDenied->data['status'], 'Unauthenticated user should receive 401 from /admin/health');

$GLOBALS['test_is_logged_in'] = true;
$GLOBALS['test_capabilities']['read'] = true;
$GLOBALS['test_current_user_id'] = 7;

$nonAdminDenied = $instance->permission_admin();
assert_true($nonAdminDenied instanceof WP_Error, 'Authenticated non-admin user should be rejected from /admin/health');
assert_same(403, $nonAdminDenied->data['status'], 'Authenticated non-admin user should receive 403 from /admin/health');

$authorized = $instance->post_snapshot(new WP_REST_Request(array(
    'symbol' => 'EURUSD',
    'normalized_symbol' => 'EURUSD',
    'tick' => array(
        'bid' => 1.1010,
        'ask' => 1.1012,
        'spread' => 2,
        'timestamp' => '2026-05-03T08:15:30Z',
    ),
    'candle_m1' => array(
        'timestamp' => '2026.05.03 08:15:00',
        'open' => 1.1005,
        'high' => 1.1015,
        'low' => 1.1001,
        'close' => 1.1011,
        'volume' => 12,
    ),
    'freshness' => 'LIVE',
    'session' => 'London',
)));

assert_true(is_array($authorized) && !empty($authorized['ok']), 'Authorized MT5 snapshot should succeed');

$snapshotTable = $wpdb->prefix . 'smc_sf_snapshots';
$snapshotRow = $wpdb->tables[$snapshotTable]['7|EURUSD'] ?? null;
assert_true(is_array($snapshotRow), 'Authorized MT5 snapshot row not stored');
assert_same('live', $snapshotRow['state'], 'MT5 snapshot must persist canonical live state');
assert_same('2026-05-03 08:15:30', $snapshotRow['updated_at'], 'MT5 snapshot must persist quote timestamp, not receipt time');
assert_same('LIVE', $GLOBALS['test_transients']['smc_sf_freshness_7_EURUSD'] ?? null, 'MT5 freshness transient missing');

$stateOnly = $instance->post_snapshot(new WP_REST_Request(array(
    'symbol' => 'EURUSD',
    'normalized_symbol' => 'EURUSD',
    'freshness' => 'DISCONNECTED',
    'session' => 'Closed',
)));

assert_true(is_array($stateOnly) && !empty($stateOnly['ok']), 'State-only MT5 update should succeed');
$snapshotRow = $wpdb->tables[$snapshotTable]['7|EURUSD'] ?? null;
assert_same('offline', $snapshotRow['state'], 'State-only MT5 update must degrade snapshot state');
assert_same('2026-05-03 08:15:30', $snapshotRow['updated_at'], 'State-only MT5 update must not rewrite quote timestamp');

$tickWithoutFreshness = $instance->post_snapshot(new WP_REST_Request(array(
    'symbol' => 'EURUSD',
    'normalized_symbol' => 'EURUSD',
    'tick' => array(
        'bid' => 1.1020,
        'ask' => 1.1022,
        'spread' => 2,
        'timestamp' => '2026-05-03T08:16:30Z',
    ),
    'session' => 'London',
)));

assert_true(is_array($tickWithoutFreshness) && !empty($tickWithoutFreshness['ok']), 'Tick-only MT5 update should succeed');
$snapshotRow = $wpdb->tables[$snapshotTable]['7|EURUSD'] ?? null;
assert_same('live', $snapshotRow['state'], 'Tick-only MT5 update must default to live when freshness is omitted');
assert_same('2026-05-03 08:16:30', $snapshotRow['updated_at'], 'Tick-only MT5 update must persist the new quote timestamp');

$snapshotCountBeforeInvalidSource = count($wpdb->tables[$snapshotTable] ?? array());
$invalidSource = $instance->post_snapshot(new WP_REST_Request(array(
    'symbol' => 'GBPUSD',
    'normalized_symbol' => 'GBPUSD',
    'source' => 'legacy_ea',
    'tick' => array(
        'bid' => 1.2500,
        'ask' => 1.2502,
        'spread' => 2,
        'timestamp' => '2026-05-03T08:17:30Z',
    ),
)));

assert_true(is_array($invalidSource) && !empty($invalidSource['ok']), 'Invalid-source MT5 payload should short-circuit without throwing');
assert_same($snapshotCountBeforeInvalidSource, count($wpdb->tables[$snapshotTable] ?? array()), 'Invalid-source MT5 payload must not persist a snapshot row');
$auditEvents = $wpdb->tables[$wpdb->prefix . 'smc_sf_audit_events'] ?? array();
$invalidSourceAudit = end($auditEvents);
assert_true(is_array($invalidSourceAudit), 'Invalid-source MT5 payload must create an audit event');
assert_same('mt5_snapshot.invalid_source', $invalidSourceAudit['event_type'] ?? null, 'Invalid-source MT5 payload must audit the rejected source');
assert_true(strpos((string) ($invalidSourceAudit['payload'] ?? ''), '"level":"ERROR"') !== false, 'Invalid-source MT5 payload audit must be tagged at ERROR level');

$wpdb->replace($snapshotTable, array(
    'user_id' => 7,
    'symbol' => 'USDJPY',
    'bid' => 156.40,
    'ask' => 156.42,
    'mid' => 156.41,
    'spread' => 2,
    'change_pct_1d' => 0,
    'source' => 'mt5',
    'state' => 'live',
    'updated_at' => '2026-05-03 08:16:00',
));
$wpdb->replace($wpdb->prefix . 'smc_sf_user_settings', array(
    'user_id' => 7,
    'settings' => json_encode(array(
        'backendUrl' => 'https://example.com/wp-json',
        'refreshIntervalSec' => 2,
        'staleThresholdSec' => 10,
        'watchlist' => array('EURUSD', 'USDJPY'),
        'riskAllocation' => array('perTradePct' => 0.5, 'dailyMaxPct' => 2.0, 'ddCapPct' => 6.0),
    )),
    'updated_at' => '2026-05-03 08:16:05',
));

$GLOBALS['test_deleted_user_meta'] = array();
update_user_meta(7, 'smc_sf_engine_snapshot', array(
    'prices' => array(array('symbol' => 'EURUSD')),
    'meta' => array('computedAt' => gmdate('c')),
));
$stateOnlyWatched = $instance->post_snapshot(new WP_REST_Request(array(
    'symbol' => 'EURUSD',
    'normalized_symbol' => 'EURUSD',
    'freshness' => 'DISCONNECTED',
    'session' => 'Closed',
)));
assert_true(is_array($stateOnlyWatched) && !empty($stateOnlyWatched['ok']), 'Watched state-only MT5 update should succeed');
assert_same(
    array(
        array(
            'user_id' => 7,
            'meta_key' => 'smc_sf_engine_snapshot',
        ),
    ),
    $GLOBALS['test_deleted_user_meta'],
    'State-only live-to-offline MT5 transitions must invalidate the cached engine snapshot for watched symbols'
);

$GLOBALS['test_deleted_user_meta'] = array();
update_user_meta(7, 'smc_sf_engine_snapshot', array(
    'prices' => array(array('symbol' => 'EURUSD')),
    'meta' => array('computedAt' => gmdate('c')),
));
$tickRecoverLive = $instance->post_snapshot(new WP_REST_Request(array(
    'symbol' => 'EURUSD',
    'normalized_symbol' => 'EURUSD',
    'tick' => array(
        'bid' => 1.1030,
        'ask' => 1.1032,
        'spread' => 2,
        'timestamp' => '2026-05-03T08:18:30Z',
    ),
)));
assert_true(is_array($tickRecoverLive) && !empty($tickRecoverLive['ok']), 'Watched offline-to-live MT5 recovery should succeed');
assert_same(
    array(
        array(
            'user_id' => 7,
            'meta_key' => 'smc_sf_engine_snapshot',
        ),
    ),
    $GLOBALS['test_deleted_user_meta'],
    'Offline-to-live MT5 transitions must invalidate the cached engine snapshot for watched symbols'
);

$GLOBALS['test_deleted_user_meta'] = array();
update_user_meta(7, 'smc_sf_engine_snapshot', array(
    'prices' => array(array('symbol' => 'EURUSD')),
    'meta' => array('computedAt' => gmdate('c')),
));
$steadyLive = $instance->post_snapshot(new WP_REST_Request(array(
    'symbol' => 'EURUSD',
    'normalized_symbol' => 'EURUSD',
    'tick' => array(
        'bid' => 1.1035,
        'ask' => 1.1037,
        'spread' => 2,
        'timestamp' => '2026-05-03T08:19:30Z',
    ),
)));
assert_true(is_array($steadyLive) && !empty($steadyLive['ok']), 'Steady live MT5 update should succeed');
assert_same(array(), $GLOBALS['test_deleted_user_meta'], 'Live-to-live MT5 updates must not invalidate the cached engine snapshot');

$authority = $instance->get_market_data_authority(new WP_REST_Request());
assert_true(is_array($authority), 'Authority endpoint should return an array');
assert_true(isset($authority['EURUSD']), 'Authority endpoint must include EURUSD from watchlist');
assert_true(isset($authority['USDJPY']), 'Authority endpoint must include USDJPY from watchlist');

$candleTable = $wpdb->prefix . 'smc_sf_candles';
$currentBucket = (int) (floor(time() / 900) * 900);
$firstM1 = $currentBucket - (30 * 900);
foreach (array('EURUSD' => 1.1000, 'USDJPY' => 156.0000) as $symbol => $base) {
    $wpdb->replace($snapshotTable, array(
        'user_id' => 7,
        'symbol' => $symbol,
        'bid' => $base,
        'ask' => $base + 0.0002,
        'mid' => $base + 0.0001,
        'spread' => 2,
        'change_pct_1d' => 0,
        'source' => 'mt5',
        'state' => 'live',
        'updated_at' => gmdate('Y-m-d H:i:s', time() - 5),
    ));

    for ($i = 0; $i < 450; $i++) {
        $price = $base + ($i * 0.00001);
        $wpdb->replace($candleTable, array(
            'user_id' => 7,
            'symbol' => $symbol,
            'timeframe' => '1min',
            'candle_time' => gmdate('Y-m-d H:i:s', $firstM1 + ($i * 60)),
            'open' => $price,
            'high' => $price + 0.0002,
            'low' => $price - 0.0002,
            'close' => $price + 0.00005,
            'volume' => '10',
            'source' => 'mt5',
            'created_at' => gmdate('Y-m-d H:i:s'),
        ));
    }
}

$ensureEngineSnapshot = new ReflectionMethod(SMC_SuperFib_Sniper_REST::class, 'ensure_engine_snapshot');
$ensureEngineSnapshot->setAccessible(true);
unset($GLOBALS['test_user_meta'][7]['smc_sf_engine_snapshot']);
$wpdb->replace($wpdb->prefix . 'smc_sf_user_settings', array(
    'user_id' => 7,
    'settings' => json_encode(array(
        'backendUrl' => 'https://example.com/wp-json',
        'refreshIntervalSec' => 30,
        'staleThresholdSec' => 10,
        'watchlist' => array('EURUSD'),
        'riskAllocation' => array('perTradePct' => 0.5, 'dailyMaxPct' => 2.0, 'ddCapPct' => 6.0),
    )),
    'updated_at' => '2026-05-03 08:20:00',
));
$singleSymbolSnapshot = $ensureEngineSnapshot->invoke($instance, 7);
assert_same(array('EURUSD'), $singleSymbolSnapshot['meta']['watchlist'] ?? null, 'ensure_engine_snapshot must compute a single-symbol snapshot for the initial watchlist');

$wpdb->replace($wpdb->prefix . 'smc_sf_user_settings', array(
    'user_id' => 7,
    'settings' => json_encode(array(
        'backendUrl' => 'https://example.com/wp-json',
        'refreshIntervalSec' => 30,
        'staleThresholdSec' => 10,
        'watchlist' => array('EURUSD', 'USDJPY'),
        'riskAllocation' => array('perTradePct' => 0.5, 'dailyMaxPct' => 2.0, 'ddCapPct' => 6.0),
    )),
    'updated_at' => '2026-05-03 08:20:05',
));
$expandedWatchlistSnapshot = $ensureEngineSnapshot->invoke($instance, 7);
assert_same(array('EURUSD', 'USDJPY'), $expandedWatchlistSnapshot['meta']['watchlist'] ?? null, 'Adding a watchlist symbol must bypass the cached engine snapshot and recompute');

$wpdb->replace($wpdb->prefix . 'smc_sf_user_settings', array(
    'user_id' => 7,
    'settings' => json_encode(array(
        'backendUrl' => 'https://example.com/wp-json',
        'refreshIntervalSec' => 30,
        'staleThresholdSec' => 10,
        'watchlist' => array('EURUSD'),
        'riskAllocation' => array('perTradePct' => 0.5, 'dailyMaxPct' => 2.0, 'ddCapPct' => 6.0),
    )),
    'updated_at' => '2026-05-03 08:20:10',
));
$reducedWatchlistSnapshot = $ensureEngineSnapshot->invoke($instance, 7);
assert_same(array('EURUSD'), $reducedWatchlistSnapshot['meta']['watchlist'] ?? null, 'Removing a watchlist symbol must bypass the cached engine snapshot and recompute');
$cachedReplay = $ensureEngineSnapshot->invoke($instance, 7);
assert_same($reducedWatchlistSnapshot, $cachedReplay, 'Unchanged watchlists must keep the cached engine snapshot current');

$wpdb->replace($wpdb->prefix . 'smc_sf_user_settings', array(
    'user_id' => 7,
    'settings' => json_encode(array(
        'backendUrl' => 'https://example.com/wp-json',
        'refreshIntervalSec' => 2,
        'staleThresholdSec' => 10,
        'watchlist' => array('EURUSD', 'USDJPY'),
        'riskAllocation' => array('perTradePct' => 0.5, 'dailyMaxPct' => 2.0, 'ddCapPct' => 6.0),
    )),
    'updated_at' => '2026-05-03 08:20:15',
));

$health = $instance->get_health();
assert_true(is_array($health), 'Health endpoint should return an array in the test harness');
assert_same('missing', $health['twelveDataKeyStatus'], 'Test setup should have no Twelve Data key');
assert_same('live', $health['feedStatus'], 'Fresh MT5 price plus aggregated M1 candles must make feedStatus live without a Twelve Data key');

$GLOBALS['test_capabilities']['manage_options'] = true;
$adminHealth = $instance->get_admin_health();
assert_true(is_array($adminHealth), 'Admin health endpoint should return an array in the test harness');
assert_same($health, $adminHealth, 'Admin health endpoint must proxy the same payload as /health');

$fetchQuote = new ReflectionMethod(SMC_SuperFib_Sniper_REST::class, 'fetch_quote');
$fetchQuote->setAccessible(true);
$quote = $fetchQuote->invoke($instance, 7, 'EURUSD');
assert_true(is_array($quote), 'fetch_quote should return cached MT5 data for MT5-live symbols');
assert_same('EURUSD', $quote['symbol'], 'fetch_quote MT5 guard returned the wrong symbol');
assert_same('live', $quote['state'], 'fetch_quote MT5 guard must preserve live state');
assert_same('mt5', $quote['source'], 'fetch_quote MT5 guard must preserve source authority');
assert_true(isset($quote['age_sec']) && $quote['age_sec'] <= 10, 'fetch_quote MT5 guard must expose fresh age_sec');

$getCachedPrice = new ReflectionMethod(SMC_SuperFib_Sniper_REST::class, 'get_cached_price');
$getCachedPrice->setAccessible(true);
$latestTimestamp = new ReflectionMethod(SMC_SuperFib_Sniper_REST::class, 'latest_timestamp');
$latestTimestamp->setAccessible(true);

$GLOBALS['test_transients']['smc_sf_rl_7_eurusd'] = time();
$wpdb->replace($snapshotTable, array(
    'user_id' => 7,
    'symbol' => 'EURUSD',
    'bid' => 1.1000,
    'ask' => 1.1002,
    'mid' => 1.1001,
    'spread' => 2,
    'change_pct_1d' => 0,
    'source' => 'mt5',
    'state' => 'live',
    'updated_at' => gmdate('Y-m-d H:i:s', time() - 600),
));

$staleHealth = $instance->get_health();
assert_same('stale', $staleHealth['feedStatus'], 'EA-authoritative stale symbols must degrade to stale instead of reusing Twelve Data rate-limit state');

$staleQuote = $fetchQuote->invoke($instance, 7, 'EURUSD');
assert_true(is_array($staleQuote), 'fetch_quote should still expose the MT5 snapshot for EA-authoritative symbols');
assert_same('mt5', $staleQuote['source'], 'fetch_quote must keep MT5 as authority even when the quote is stale');
assert_same('stale', $staleQuote['state'], 'fetch_quote must surface stale MT5 state without falling back to Twelve Data');

$fetchCandles = new ReflectionMethod(SMC_SuperFib_Sniper_REST::class, 'fetch_candles');
$fetchCandles->setAccessible(true);
$staleCandles = $fetchCandles->invoke($instance, 7, 'EURUSD', '15min', 30);

$determineBlocker = new ReflectionMethod(SMC_SuperFib_Sniper_REST::class, 'determine_engine_blocker');
$determineBlocker->setAccessible(true);
$staleBlocker = $determineBlocker->invoke($instance, 7, $staleQuote, $staleCandles, false, 'WATCH', 'EURUSD');
assert_same('PRICE_STALE', $staleBlocker, 'EA-authoritative stale symbols must not surface RATE_LIMITED from stale Twelve Data cooldown state');

$wpdb->replace($snapshotTable, array(
    'user_id' => 7,
    'symbol' => 'XAUUSD',
    'bid' => 2330.00,
    'ask' => 2330.50,
    'mid' => 2330.25,
    'spread' => 50,
    'change_pct_1d' => 0,
    'source' => 'twelve-data',
    'state' => 'live',
    'updated_at' => gmdate('Y-m-d H:i:s'),
));
$tdQuote = $fetchQuote->invoke($instance, 7, 'XAUUSD');
assert_same(null, $tdQuote, 'fetch_quote must not return Twelve Data rows after MT5-only decommission');
$legacyCachedPrice = $getCachedPrice->invoke($instance, 7, 'XAUUSD', 60);
assert_same(null, $legacyCachedPrice, 'get_cached_price must ignore non-MT5 snapshot rows');
$expectedLatestMt5Timestamp = $wpdb->tables[$snapshotTable]['7|USDJPY']['updated_at'] ?? null;
assert_same($expectedLatestMt5Timestamp, $latestTimestamp->invoke($instance, 'snapshots', 7, 'updated_at'), 'latest_timestamp must ignore non-MT5 snapshot rows when computing snapshot freshness');

$runEngine = new ReflectionMethod(SMC_SuperFib_Sniper_REST::class, 'run_engine_for_symbols');
$runEngine->setAccessible(true);
$guarded = $runEngine->invoke($instance, 7, array('XAUUSD'), array(array(
    'symbol' => 'XAUUSD',
    'bid' => 2330.00,
    'ask' => 2330.50,
    'mid' => 2330.25,
    'changePct1d' => 0,
    'updatedAt' => gmdate('c'),
    'state' => 'live',
    'source' => 'twelve-data',
    'age_sec' => 0,
)), true);
assert_same('PRICE_NOT_MT5_FRESH', $guarded['diagnostics'][0]['engineBlocker'] ?? null, 'engine guard must block non-MT5 prices before candle analysis');

$chart = $instance->get_chart_snapshot(new WP_REST_Request(array(
    'symbol' => 'EURUSD',
    'timeframe' => '15min',
)));
assert_true(is_array($chart), 'Chart snapshot should return an array');
assert_true(!empty($chart['candles']), 'Chart snapshot should include candles for MT5-backed symbols');
$lastChartCandle = end($chart['candles']);
assert_same($lastChartCandle['time'], $chart['updatedAt'], 'Chart snapshot updatedAt must reflect the last candle time, not response time');

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION TEST: normalize_market_timestamp — PHP 7 compat & UTC pinning
// Verifies PATCH 1: str_ends_with() removed (PHP 8.0+ only).
// The regex /[Z+\-]\d{0,2}:?\d{0,2}$/ already matches the Z suffix, so
// removing str_ends_with() is behaviour-neutral on PHP 8 and fixes PHP 7.
// ─────────────────────────────────────────────────────────────────────────────
$normalizeTs = new ReflectionMethod(SMC_SuperFib_Sniper_REST::class, 'normalize_market_timestamp');
$normalizeTs->setAccessible(true);

// ISO with Z — must NOT double-append Z, must parse to UTC
assert_same('2026-05-08 10:30:00', $normalizeTs->invoke($instance, '2026-05-08T10:30:00Z', null), 'ISO+Z must parse to UTC without double-appending Z (PHP 7 compat)');

// ISO with +00:00 explicit offset — must parse without alteration
assert_same('2026-05-08 08:30:00', $normalizeTs->invoke($instance, '2026-05-08T08:30:00+00:00', null), 'ISO+offset must parse to correct UTC without Z append');

// ISO without any TZ marker — must be pinned to UTC by appending Z
assert_same('2026-05-08 10:30:00', $normalizeTs->invoke($instance, '2026-05-08T10:30:00', null), 'ISO without TZ must be pinned to UTC by appending Z');

// MQL5 dot-format — must convert dots to dashes and treat as UTC
assert_same('2026-05-08 10:30:00', $normalizeTs->invoke($instance, '2026.05.08 10:30:00', null), 'MQL5 dot-format must normalize to UTC MySQL format');

// null input with null fallback — must return null
assert_same(null, $normalizeTs->invoke($instance, null, null), 'null raw_time with null fallback must return null');

// empty string with null fallback — must return null
assert_same(null, $normalizeTs->invoke($instance, '', null), 'empty raw_time with null fallback must return null');

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION TEST: fetch_candles — output bounded by outputsize
// Verifies PATCH 2: LIMIT clause prevents unbounded DB scans.
// The test DB has 450 M1 candles seeded; asking for 30 must return ≤ 30.
// ─────────────────────────────────────────────────────────────────────────────
$fetchCandlesBounded = $fetchCandles->invoke($instance, 7, 'EURUSD', '1min', 30);
assert_true(count($fetchCandlesBounded) > 0, 'fetch_candles must return candles for MT5-live EURUSD');
assert_true(count($fetchCandlesBounded) <= 30, 'fetch_candles must cap output at outputsize even when DB has 450 rows (LIMIT guard)');

// Smaller outputsize request must also be bounded
$fetchCandlesSmall = $fetchCandles->invoke($instance, 7, 'EURUSD', '1min', 5);
assert_true(count($fetchCandlesSmall) <= 5, 'fetch_candles with outputsize=5 must return at most 5 candles');
assert_true(count($fetchCandlesSmall) > 0, 'fetch_candles with outputsize=5 must return at least one candle');

fwrite(STDOUT, 'mt5 snapshot contract checks passed' . PHP_EOL);
