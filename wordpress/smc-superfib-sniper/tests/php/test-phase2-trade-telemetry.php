<?php

define('ABSPATH', __DIR__ . '/');
define('ARRAY_A', 'ARRAY_A');

$GLOBALS['test_registered_routes'] = array();
$GLOBALS['test_current_user_id'] = 7;
$GLOBALS['test_is_logged_in'] = true;
$GLOBALS['test_can_read'] = true;
$GLOBALS['test_transients'] = array();

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
            return $this->params[$key] ?? null;
        }

        public function get_header($key) {
            return $this->headers[strtolower($key)] ?? '';
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

        public function insert($table, $data, $formats = array()) {
            $this->queries[] = array('type' => 'insert', 'table' => $table, 'data' => $data);
            if (!isset($this->tables[$table])) {
                $this->tables[$table] = array();
            }
            $this->tables[$table][] = $data;
            return 1;
        }

        public function update($table, $data, $where, $data_format = array(), $where_format = array()) {
            $this->queries[] = array('type' => 'update', 'table' => $table, 'data' => $data, 'where' => $where);
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

        public function query($sql) {
            $this->queries[] = array('type' => 'query', 'sql' => $sql);
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
                    $value = $args[$arg_index++] ?? null;
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
            if (preg_match("/SELECT 1 FROM ([^ ]+)/", $query, $m) && strpos($query, 'summary LIKE') !== false) {
                $table = trim($m[1]);
                preg_match("/user_id = (\\d+)/", $query, $user_match);
                preg_match("/status = '([^']+)'/", $query, $status_match);
                preg_match("/summary LIKE '([^']+)'/", $query, $needle_match);
                $user_id = (int) ($user_match[1] ?? 0);
                $status = $status_match[1] ?? '';
                $needle = isset($needle_match[1]) ? str_replace('%', '', str_replace("''", "'", $needle_match[1])) : '';
                $needle = str_replace(array('\\_', '\\%', '\\\\'), array('_', '%', '\\'), $needle);
                if ($needle === '' && strpos($query, 'explicit_heartbeat') !== false) {
                    $needle = 'explicit_heartbeat';
                } elseif ($needle === '' && strpos($query, 'ea_push') !== false) {
                    $needle = 'ea_push';
                }
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) !== $user_id || (string) ($row['status'] ?? '') !== $status) {
                        continue;
                    }
                    $summary = (string) ($row['summary'] ?? '');
                    if ($needle !== '' && strpos($summary, $needle) !== false) {
                        return '1';
                    }
                }
                return null;
            }

            if (preg_match("/SELECT data FROM ([^ ]+) WHERE user_id = (\\d+)/", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) === $user_id) {
                        return $row['data'];
                    }
                }
            }

            if (preg_match("/SELECT open FROM ([^ ]+)\\s+WHERE user_id = (\\d+) AND symbol = '([^']+)' AND source = 'mt5'\\s+AND timeframe = '1min' AND candle_time >= '([^']+)'/s", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                $symbol = $m[3];
                $since = $m[4];
                $rows = array();
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) === $user_id
                        && ($row['symbol'] ?? '') === $symbol
                        && ($row['source'] ?? '') === 'mt5'
                        && ($row['timeframe'] ?? '') === '1min'
                        && strcmp((string) ($row['candle_time'] ?? ''), $since) >= 0) {
                        $rows[] = $row;
                    }
                }
                usort($rows, function ($a, $b) {
                    return strcmp($a['candle_time'], $b['candle_time']);
                });
                return $rows ? $rows[0]['open'] : null;
            }

            if (preg_match("/SELECT MAX\\((updated_at|created_at)\\) FROM ([^ ]+) WHERE user_id = (\\d+)(?: AND source = '([^']+)')?/", $query, $m)) {
                $column = $m[1];
                $table = $m[2];
                $user_id = (int) $m[3];
                $source = $m[4] ?? null;
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
            $results = $this->get_results($query, $output);
            return $results ? $results[0] : null;
        }

        public function get_results($query, $output = ARRAY_A) {
            if (!preg_match('/SELECT \\* FROM ([^ ]+) WHERE (.+)$/', $query, $m)) {
                return array();
            }

            $table = $m[1];
            $conditions = $m[2];
            $rows = array_values($this->tables[$table] ?? array());

            if (preg_match('/user_id = (\\d+)/', $conditions, $user_match)) {
                $user_id = (int) $user_match[1];
                $rows = array_values(array_filter($rows, function ($row) use ($user_id) {
                    return (int) ($row['user_id'] ?? 0) === $user_id;
                }));
            }
            if (preg_match("/account_id = '([^']+)'/", $conditions, $account_match)) {
                $account_id = $account_match[1];
                $rows = array_values(array_filter($rows, function ($row) use ($account_id) {
                    return (string) ($row['account_id'] ?? '') === $account_id;
                }));
            }
            if (preg_match("/terminal_id = '([^']+)'/", $conditions, $terminal_match)) {
                $terminal_id = $terminal_match[1];
                $rows = array_values(array_filter($rows, function ($row) use ($terminal_id) {
                    return (string) ($row['terminal_id'] ?? '') === $terminal_id;
                }));
            }
            if (preg_match("/state = '([^']+)'/", $conditions, $state_match)) {
                $state = $state_match[1];
                $rows = array_values(array_filter($rows, function ($row) use ($state) {
                    return (string) ($row['state'] ?? '') === $state;
                }));
            }
            if (preg_match("/status = '([^']+)'/", $conditions, $status_match)) {
                $status = $status_match[1];
                $rows = array_values(array_filter($rows, function ($row) use ($status) {
                    return (string) ($row['status'] ?? '') === $status;
                }));
            }

            return array_values($rows);
        }

        private function row_key($table, $data) {
            if ($table === 'wp_smc_sf_snapshots') {
                return $data['user_id'] . '|' . $data['symbol'];
            }
            if ($table === 'wp_smc_sf_candles') {
                return $data['user_id'] . '|' . $data['symbol'] . '|' . $data['timeframe'] . '|' . $data['candle_time'];
            }
            if ($table === 'wp_smc_sf_trade_positions' || $table === 'wp_smc_sf_trade_orders') {
                return (string) ($data['deterministic_key'] ?? md5(serialize($data)));
            }
            if ($table === 'wp_smc_sf_account_telemetry') {
                return implode('|', array(
                    $data['user_id'] ?? '',
                    $data['account_id'] ?? '',
                    $data['terminal_id'] ?? '',
                ));
            }
            return md5(serialize($data));
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

$wpdb = new TestWpdb();

if (!defined('SMC_SF_EA_API_KEY')) {
    define('SMC_SF_EA_API_KEY', 'test-key');
}

if (!function_exists('register_activation_hook')) {
    function register_activation_hook(...$args) {}
}
if (!function_exists('register_deactivation_hook')) {
    function register_deactivation_hook(...$args) {}
}
if (!function_exists('add_action')) {
    function add_action(...$args) {}
}
if (!function_exists('add_filter')) {
    function add_filter(...$args) {}
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
if (!function_exists('rest_ensure_response')) {
    function rest_ensure_response($data) {
        return new WP_REST_Response($data);
    }
}
if (!function_exists('sanitize_text_field')) {
    function sanitize_text_field($value) {
        return trim((string) $value);
    }
}
if (!function_exists('sanitize_textarea_field')) {
    function sanitize_textarea_field($value) {
        return trim((string) $value);
    }
}
if (!function_exists('wp_unslash')) {
    function wp_unslash($value) {
        return $value;
    }
}
if (!function_exists('sanitize_key')) {
    function sanitize_key($key) {
        return strtolower(preg_replace('/[^a-zA-Z0-9_\\-]/', '', (string) $key));
    }
}
if (!function_exists('wp_json_encode')) {
    function wp_json_encode($value) {
        return json_encode($value);
    }
}
if (!function_exists('current_time')) {
    function current_time($type, $gmt = 0) {
        return gmdate('Y-m-d H:i:s');
    }
}
if (!function_exists('get_current_user_id')) {
    function get_current_user_id() {
        return $GLOBALS['test_current_user_id'];
    }
}
if (!function_exists('is_user_logged_in')) {
    function is_user_logged_in() {
        return !empty($GLOBALS['test_is_logged_in']);
    }
}
if (!function_exists('current_user_can')) {
    function current_user_can($capability) {
        return $capability === 'read' ? !empty($GLOBALS['test_can_read']) : true;
    }
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
if (!function_exists('get_users')) {
    function get_users($args = array()) {
        return array((object) array('ID' => 1));
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
        return $GLOBALS['test_transients'][$key] ?? false;
    }
}
if (!function_exists('delete_transient')) {
    function delete_transient($key) {
        unset($GLOBALS['test_transients'][$key]);
        return true;
    }
}
if (!function_exists('is_wp_error')) {
    function is_wp_error($value) {
        return $value instanceof WP_Error;
    }
}
if (!function_exists('wp_validate_auth_cookie')) {
    function wp_validate_auth_cookie($cookie = '', $scheme = '') {
        return 0;
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
if (!function_exists('esc_url_raw')) {
    function esc_url_raw($value) {
        return (string) $value;
    }
}
if (!function_exists('wp_create_nonce')) {
    function wp_create_nonce($action = '') {
        return 'test-nonce';
    }
}
if (!function_exists('wp_register_script')) {
    function wp_register_script(...$args) {}
}
if (!function_exists('wp_enqueue_script')) {
    function wp_enqueue_script(...$args) {}
}
if (!function_exists('wp_add_inline_script')) {
    function wp_add_inline_script(...$args) {}
}
if (!function_exists('wp_next_scheduled')) {
    function wp_next_scheduled($hook) {
        return false;
    }
}
if (!function_exists('wp_schedule_event')) {
    function wp_schedule_event(...$args) {
        return true;
    }
}
if (!function_exists('wp_clear_scheduled_hook')) {
    function wp_clear_scheduled_hook(...$args) {
        return true;
    }
}
if (!function_exists('wp_unschedule_hook')) {
    function wp_unschedule_hook(...$args) {
        return true;
    }
}
if (!function_exists('update_user_meta')) {
    function update_user_meta($user_id, $key, $value) {
        return true;
    }
}
if (!function_exists('get_user_meta')) {
    function get_user_meta($user_id, $key, $single = false) {
        return $single ? null : array();
    }
}
if (!function_exists('delete_user_meta')) {
    function delete_user_meta($user_id, $key) {
        return true;
    }
}
if (!function_exists('dbDelta')) {
    function dbDelta($sql) {
        global $wpdb;
        if (preg_match('/CREATE TABLE ([^ ]+)/', $sql, $m)) {
            $table = $m[1];
            if (!isset($wpdb->tables[$table])) {
                $wpdb->tables[$table] = array();
            }
        }
        return true;
    }
}

require_once __DIR__ . '/../../smc-superfib-sniper.php';

function phase2_reset_state() {
    global $wpdb;
    $wpdb->tables = array();
    $wpdb->queries = array();
    $wpdb->last_error = '';
    $GLOBALS['test_registered_routes'] = array();
    $GLOBALS['test_current_user_id'] = 7;
    $GLOBALS['test_is_logged_in'] = true;
    $GLOBALS['test_can_read'] = true;
    $GLOBALS['test_transients'] = array();
}

function phase2_assert_true($condition, $message) {
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function phase2_assert_same($expected, $actual, $message) {
    if ($expected !== $actual) {
        throw new RuntimeException($message . ' Expected=' . var_export($expected, true) . ' Actual=' . var_export($actual, true));
    }
}

function phase2_find_route($route) {
    foreach ($GLOBALS['test_registered_routes'] as $entry) {
        if (($entry['namespace'] ?? '') === 'sniper/v1' && ($entry['route'] ?? '') === $route) {
            return $entry;
        }
    }
    return null;
}

function phase2_dispatch_market_stream($plugin, $payload, $headers = array()) {
    $request = new WP_REST_Request($payload, $headers ?: array('X-EA-API-Key' => 'test-key'));
    $permission = $plugin->permission_ea_market_stream($request);
    if ($permission !== true) {
        return $permission;
    }
    return $plugin->post_ea_market_stream($request);
}

function phase2_invoke_static_private($class_name, $method_name) {
    $method = new ReflectionMethod($class_name, $method_name);
    $method->setAccessible(true);
    return $method->invoke(null);
}

function phase2_payload($overrides = array()) {
    $base = array(
        'schema_version' => 'phase2.trade_telemetry.v1',
        'user_id' => 7,
        'account_id' => '32206603',
        'terminal_id' => 'FB9A56D617EDDDFE29EE54EBEFFE96C1',
        'ea_version' => '1.00',
        'timestamp' => gmdate('c', time() - 5),
        'symbol' => 'EURUSD',
        'normalized_symbol' => 'EURUSD',
        'bid' => 1.08521,
        'ask' => 1.08534,
        'freshness' => 'LIVE',
        'session' => 'London',
        'positions' => array(
            array(
                'position_id' => '1001',
                'symbol' => 'EURUSD',
                'normalized_symbol' => 'EURUSD',
                'direction' => 'BUY_LIMIT',
                'entry_price' => 1.08,
                'current_price' => 1.081,
                'sl' => 1.075,
                'tp' => 1.09,
                'volume' => 0.5,
                'profit' => 125,
                'swap' => 0,
                'commission' => 0,
                'magic' => 42,
                'comment' => 'alpha',
                'opened_at' => gmdate('c', time() - 3600),
                'state' => 'OPEN',
            ),
        ),
        'pending_orders' => array(
            array(
                'order_id' => '2001',
                'symbol' => 'EURUSD',
                'normalized_symbol' => 'EURUSD',
                'order_type' => 'SELL_STOP',
                'direction' => 'SELL_STOP',
                'entry_price' => 1.07,
                'sl' => 1.08,
                'tp' => 1.06,
                'volume' => 0.25,
                'magic' => 77,
                'comment' => 'beta',
                'placed_at' => gmdate('c', time() - 1800),
                'state' => 'ACTIVE',
            ),
        ),
        'account_metrics' => array(
            'balance' => 10000,
            'equity' => 10125,
            'margin' => 1000,
            'free_margin' => 9125,
            'margin_level' => 1012.5,
            'floating_pl' => 125,
            'currency' => 'USC',
            'leverage' => 500,
        ),
    );

    return array_replace_recursive($base, $overrides);
}

function test_phase2_trade_telemetry() {
    global $wpdb;

    echo "Testing Phase 2 Trade Telemetry\n";
    echo "================================\n\n";

    phase2_reset_state();
    $plugin = new SMC_SuperFib_Sniper_REST();
    $plugin->register_routes();

    phase2_assert_true(phase2_find_route('/account-telemetry') !== null, 'GET /account-telemetry route must register');
    phase2_assert_true(phase2_find_route('/positions') !== null, 'GET /positions route must register');
    phase2_assert_true(phase2_find_route('/orders') !== null, 'GET /orders route must register');
    $progress_route = phase2_find_route('/user/progress');
    phase2_assert_true($progress_route !== null, 'GET /user/progress route must register');
    phase2_assert_true(is_array($progress_route['args']['permission_callback']), 'GET /user/progress must use authenticated permission callback');
    phase2_assert_same('permission_user', $progress_route['args']['permission_callback'][1] ?? null, 'GET /user/progress permission callback mismatch');
    echo "PASS route registration\n";

    phase2_assert_true(phase2_invoke_static_private('SMC_SuperFib_Sniper_REST', 'ensure_trade_telemetry_tables') === true, 'Phase 2 tables must initialize');
    phase2_assert_true(isset($wpdb->tables['wp_smc_sf_trade_positions']), 'smc_sf_trade_positions table missing');
    phase2_assert_true(isset($wpdb->tables['wp_smc_sf_trade_orders']), 'smc_sf_trade_orders table missing');
    phase2_assert_true(isset($wpdb->tables['wp_smc_sf_account_telemetry']), 'smc_sf_account_telemetry table missing');
    echo "PASS telemetry tables initialized\n";

    $phase1_response = phase2_dispatch_market_stream($plugin, array(
        'user_id' => 7,
        'symbol' => 'GBPUSD',
        'timestamp' => gmdate('c', time() - 5),
        'bid' => 1.275,
        'ask' => 1.2752,
    ));
    phase2_assert_true($phase1_response instanceof WP_REST_Response, 'Phase 1 payload must still return 200');
    phase2_assert_same(true, $phase1_response->data['ok'] ?? false, 'Phase 1 payload must remain accepted');
    echo "PASS Phase 1 backward compatibility\n";

    $phase2_response = phase2_dispatch_market_stream($plugin, phase2_payload());
    phase2_assert_true($phase2_response instanceof WP_REST_Response, 'Phase 2 payload must be accepted');
    phase2_assert_same(1, $phase2_response->data['positions_upserted'] ?? 0, 'Position upsert count mismatch');
    phase2_assert_same(1, $phase2_response->data['orders_upserted'] ?? 0, 'Order upsert count mismatch');
    phase2_assert_same(1, $phase2_response->data['account_telemetry_upserted'] ?? 0, 'Account telemetry upsert count mismatch');
    phase2_assert_same(1, count($wpdb->tables['wp_smc_sf_trade_positions']), 'Exactly one position row should exist after first insert');
    phase2_assert_same(1, count($wpdb->tables['wp_smc_sf_trade_orders']), 'Exactly one order row should exist after first insert');
    echo "PASS Phase 2 persistence\n";

    $duplicate_response = phase2_dispatch_market_stream($plugin, phase2_payload(array(
        'positions' => array(
            array(
                'position_id' => '1001',
                'symbol' => 'EURUSD',
                'normalized_symbol' => 'EURUSD',
                'direction' => 'BUY_LIMIT',
                'entry_price' => 1.0825,
                'current_price' => 1.083,
                'sl' => 1.076,
                'tp' => 1.091,
                'volume' => 0.5,
                'profit' => 150,
                'swap' => 0,
                'commission' => 0,
                'magic' => 42,
                'comment' => 'alpha-updated',
                'opened_at' => gmdate('c', time() - 3500),
                'state' => 'OPEN',
            ),
        ),
    )));
    phase2_assert_true($duplicate_response instanceof WP_REST_Response, 'Duplicate position upsert must succeed');
    phase2_assert_same(1, count($wpdb->tables['wp_smc_sf_trade_positions']), 'Duplicate ticket must overwrite, not insert a second row');
    $position_row = array_values($wpdb->tables['wp_smc_sf_trade_positions'])[0];
    phase2_assert_same('1.0825', rtrim(rtrim(number_format((float) $position_row['entry_price'], 4, '.', ''), '0'), '.'), 'Duplicate upsert must replace entry_price');
    echo "PASS duplicate-ticket upsert\n";

    $positions_response = $plugin->get_positions();
    $orders_response = $plugin->get_orders();
    $account_response = $plugin->get_account_telemetry();
    phase2_assert_same('LONG', $positions_response->data[0]['direction'] ?? null, 'BUY_LIMIT must normalize to LONG at GET time');
    phase2_assert_same('SHORT', $orders_response->data[0]['direction'] ?? null, 'SELL_STOP must normalize to SHORT at GET time');
    phase2_assert_true(!array_key_exists('raw_json', $positions_response->data[0]), 'raw_json must not be exposed on positions GET');
    phase2_assert_true(!array_key_exists('raw_json', $orders_response->data[0]), 'raw_json must not be exposed on orders GET');
    phase2_assert_true(!array_key_exists('raw_json', $account_response->data), 'raw_json must not be exposed on account telemetry GET');
    echo "PASS GET normalization and raw_json hiding\n";

    $wpdb->replace('wp_smc_sf_account_snapshots', array(
        'user_id' => 7,
        'data' => wp_json_encode(array(
            'account' => array(
                'todayPnlUSC' => 48.5,
            ),
        )),
        'updated_at' => gmdate('Y-m-d H:i:s', time() - 5),
    ));
    $wpdb->insert('wp_smc_sf_engine_runs', array(
        'user_id' => 7,
        'status' => 'heartbeat',
        'summary' => wp_json_encode(array('source' => 'explicit_heartbeat')),
        'created_at' => gmdate('Y-m-d H:i:s', time() - 5),
    ));
    $wpdb->insert('wp_smc_sf_engine_runs', array(
        'user_id' => 7,
        'status' => 'complete',
        'summary' => wp_json_encode(array('source' => 'engine_batch', 'symbols' => array('EURUSD'), 'signals' => 1)),
        'created_at' => gmdate('Y-m-d H:i:s', time() - 5),
    ));
    $progress_response = $plugin->get_user_progress();
    phase2_assert_true($progress_response instanceof WP_REST_Response, 'GET /user/progress must return a REST response');
    phase2_assert_same(10125.0, (float) ($progress_response->data['equity_pulse']['equity_usc'] ?? 0), 'Progress equity must mirror account telemetry equity');
    phase2_assert_same(48.5, (float) ($progress_response->data['equity_pulse']['today_pnl_usc'] ?? 0), 'Progress today P/L must expose the persisted account snapshot value when present');
    phase2_assert_same('LIVE', $progress_response->data['equity_pulse']['state'] ?? null, 'Live telemetry must map to LIVE progress state');
    phase2_assert_same(1, $progress_response->data['streak']['current_streak_days'] ?? null, 'Streak must return 1 consecutive day when one engine run exists from today (CALENDAR_DAY_WITH_ANY_COMPLETED_ENGINE_RUN)');
    phase2_assert_same('LIVE', $progress_response->data['streak']['state'] ?? null, 'Streak must return LIVE state once active-day definition is approved and engine run data exists');
    phase2_assert_true(!empty($progress_response->data['streak']['last_active_date']), 'Streak must still expose the latest activity date when engine activity exists');
    phase2_assert_same(true, $progress_response->data['milestones']['first_heartbeat'] ?? false, 'Explicit heartbeat milestone must require a persisted explicit heartbeat row');
    phase2_assert_same(true, $progress_response->data['milestones']['first_market_stream'] ?? false, 'Market-stream milestone must require a persisted ea_push heartbeat row');
    phase2_assert_same(true, $progress_response->data['milestones']['first_trade_telemetry'] ?? false, 'Trade telemetry milestone must require persisted trade telemetry');
    phase2_assert_same('LIVE', $progress_response->data['milestones']['state'] ?? null, 'Fresh milestone sources must map to LIVE');
    phase2_assert_true(!empty($progress_response->data['generated_at']), 'Progress response must include generated_at');
    echo "PASS progress endpoint schema and milestone detection\n";

    $wpdb->replace('wp_smc_sf_account_telemetry', array(
        'user_id' => 7,
        'account_id' => '32206603',
        'terminal_id' => 'FB9A56D617EDDDFE29EE54EBEFFE96C1',
        'balance' => 10000,
        'equity' => 10125,
        'margin' => 800,
        'free_margin' => 9325,
        'margin_level' => 1265.625,
        'floating_pl' => 125,
        'currency' => 'USC',
        'leverage' => 500,
        'ea_version' => '1.00',
        'last_seen_at' => gmdate('Y-m-d H:i:s', time() - 601),
        'updated_at' => gmdate('Y-m-d H:i:s', time() - 601),
        'raw_json' => '{}',
    ));
    $stale_progress = $plugin->get_user_progress();
    phase2_assert_same('STALE', $stale_progress->data['equity_pulse']['state'] ?? null, 'Stale account telemetry must propagate as STALE on /user/progress');
    echo "PASS progress stale-state propagation\n";

    $empty_positions_payload = phase2_payload();
    $empty_positions_payload['positions'] = array();
    $partial_sweep = phase2_dispatch_market_stream($plugin, $empty_positions_payload);
    phase2_assert_true($partial_sweep instanceof WP_REST_Response, 'Empty positions batch must succeed');
    phase2_assert_same(1, $partial_sweep->data['positions_swept'] ?? 0, 'Empty positions batch must sweep the missing position');
    $positions_after_clear = $plugin->get_positions();
    phase2_assert_same(0, count($positions_after_clear->data), 'Swept positions must be excluded from GET /positions');
    echo "PASS position sweep on empty batch\n";

    $two_positions_payload = phase2_payload();
    $two_positions_payload['positions'] = array(
        array(
            'position_id' => '3001',
            'symbol' => 'EURUSD',
            'normalized_symbol' => 'EURUSD',
            'direction' => 'BUY',
            'entry_price' => 1.08,
            'current_price' => 1.081,
            'sl' => 1.075,
            'tp' => 1.09,
            'volume' => 0.5,
            'profit' => 25,
            'swap' => 0,
            'commission' => 0,
            'magic' => 1,
            'comment' => 'one',
            'opened_at' => gmdate('c', time() - 3600),
            'state' => 'OPEN',
        ),
        array(
            'position_id' => '3002',
            'symbol' => 'EURUSD',
            'normalized_symbol' => 'EURUSD',
            'direction' => 'SELL',
            'entry_price' => 1.09,
            'current_price' => 1.088,
            'sl' => 1.095,
            'tp' => 1.08,
            'volume' => 0.5,
            'profit' => 35,
            'swap' => 0,
            'commission' => 0,
            'magic' => 2,
            'comment' => 'two',
            'opened_at' => gmdate('c', time() - 3500),
            'state' => 'OPEN',
        ),
    );
    phase2_dispatch_market_stream($plugin, $two_positions_payload);
    $one_position_payload = phase2_payload();
    $one_position_payload['positions'] = array(
        array(
            'position_id' => '3001',
            'symbol' => 'EURUSD',
            'normalized_symbol' => 'EURUSD',
            'direction' => 'BUY',
            'entry_price' => 1.08,
            'current_price' => 1.081,
            'sl' => 1.075,
            'tp' => 1.09,
            'volume' => 0.5,
            'profit' => 25,
            'swap' => 0,
            'commission' => 0,
            'magic' => 1,
            'comment' => 'one',
            'opened_at' => gmdate('c', time() - 3600),
            'state' => 'OPEN',
        ),
    );
    $partial_batch = phase2_dispatch_market_stream($plugin, $one_position_payload);
    phase2_assert_same(1, $partial_batch->data['positions_swept'] ?? 0, 'Partial batch must sweep only the missing position');
    phase2_assert_same(1, count($plugin->get_positions()->data), 'One open position should remain after partial sweep');
    echo "PASS partial sweep\n";

    $missing_schema = phase2_dispatch_market_stream($plugin, array(
        'user_id' => 7,
        'account_id' => '32206603',
        'terminal_id' => 'FB9A56D617EDDDFE29EE54EBEFFE96C1',
        'symbol' => 'EURUSD',
        'timestamp' => gmdate('c', time() - 5),
        'bid' => 1.085,
        'ask' => 1.0852,
        'positions' => array(),
        'pending_orders' => array(),
        'account_metrics' => array(
            'balance' => 10000,
            'equity' => 10000,
            'margin' => 0,
            'free_margin' => 10000,
            'floating_pl' => 0,
        ),
    ));
    phase2_assert_true($missing_schema instanceof WP_Error, 'Phase 2 payload missing schema_version must be rejected');
    phase2_assert_same('smc_sf_trade_telemetry_schema_required', $missing_schema->code, 'Missing schema_version should trip the schema gate');
    echo "PASS schema gate\n";

    $GLOBALS['test_is_logged_in'] = false;
    $GLOBALS['test_can_read'] = false;
    $auth_error = $plugin->permission_user();
    phase2_assert_true($auth_error instanceof WP_Error, 'Unauthenticated GET must be rejected');
    phase2_assert_same(401, (int) ($auth_error->data['status'] ?? 0), 'Unauthenticated GET must return 401');
    $GLOBALS['test_is_logged_in'] = true;
    $GLOBALS['test_can_read'] = true;

    $wpdb->replace('wp_smc_sf_trade_positions', array(
        'deterministic_key' => 'position:8:other:term:4001',
        'user_id' => 8,
        'account_id' => 'other',
        'terminal_id' => 'term',
        'position_id' => '4001',
        'symbol' => 'GBPUSD',
        'normalized_symbol' => 'GBPUSD',
        'direction' => 'SELL',
        'entry_price' => 1.27,
        'current_price' => 1.26,
        'sl' => 1.28,
        'tp' => 1.25,
        'volume' => 0.5,
        'profit' => 100,
        'swap' => 0,
        'commission' => 0,
        'magic' => 9,
        'comment' => 'foreign',
        'opened_at' => gmdate('Y-m-d H:i:s', time() - 3600),
        'state' => 'open',
        'ea_version' => '1.00',
        'last_seen_at' => gmdate('Y-m-d H:i:s', time() - 5),
        'updated_at' => gmdate('Y-m-d H:i:s', time() - 5),
        'raw_json' => '{}',
    ));
    $scoped_positions = $plugin->get_positions();
    foreach ($scoped_positions->data as $row) {
        phase2_assert_same(7, (int) ($GLOBALS['test_current_user_id']), 'Current user must remain scoped');
        phase2_assert_true(($row['account_id'] ?? '') !== 'other', 'GET /positions must not leak another user account');
    }
    echo "PASS auth and user scoping\n";

    echo "\nAll Phase 2 telemetry tests passed.\n";
}

function test_progress_streak_live_state_with_consecutive_run_fixtures() {
    global $wpdb;

    echo "\nTesting progress streak: live state with consecutive run fixtures\n";
    echo "=================================================================\n\n";

    phase2_reset_state();
    $plugin = new SMC_SuperFib_Sniper_REST();
    $plugin->register_routes();

    // Insert engine runs for 3 consecutive days ending today.
    $today     = gmdate('Y-m-d H:i:s');
    $yesterday = gmdate('Y-m-d H:i:s', strtotime('-1 day'));
    $two_ago   = gmdate('Y-m-d H:i:s', strtotime('-2 days'));
    $complete_summary = wp_json_encode(array('source' => 'engine_batch', 'symbols' => array('EURUSD'), 'signals' => 1));
    $wpdb->insert('wp_smc_sf_engine_runs', array('user_id' => 7, 'status' => 'complete', 'summary' => $complete_summary, 'created_at' => $today));
    $wpdb->insert('wp_smc_sf_engine_runs', array('user_id' => 7, 'status' => 'complete', 'summary' => $complete_summary, 'created_at' => $yesterday));
    $wpdb->insert('wp_smc_sf_engine_runs', array('user_id' => 7, 'status' => 'complete', 'summary' => $complete_summary, 'created_at' => $two_ago));

    // Seed account telemetry so equity_pulse resolves.
    $wpdb->replace('wp_smc_sf_account_telemetry', array(
        'user_id' => 7, 'account_id' => 'acc', 'terminal_id' => 'term',
        'balance' => 10000, 'equity' => 10000, 'margin' => 0, 'free_margin' => 10000,
        'margin_level' => 0, 'floating_pl' => 0, 'currency' => 'USC', 'leverage' => 500,
        'ea_version' => '1.00',
        'last_seen_at' => gmdate('Y-m-d H:i:s', time() - 5),
        'updated_at' => gmdate('Y-m-d H:i:s', time() - 5),
        'raw_json' => '{}',
    ));

    $response = $plugin->get_user_progress();
    phase2_assert_true($response instanceof WP_REST_Response, 'GET /user/progress must return a response');
    phase2_assert_same(3, $response->data['streak']['current_streak_days'] ?? null, 'Streak must count 3 consecutive days from today');
    phase2_assert_same('LIVE', $response->data['streak']['state'] ?? null, 'Streak must be LIVE when consecutive run data exists');
    phase2_assert_true(!empty($response->data['streak']['last_active_date']), 'last_active_date must be populated');
    echo "PASS streak live state with 3 consecutive run fixtures\n";
}

function test_progress_streak_unavailable_with_no_run_data() {
    global $wpdb;

    echo "\nTesting progress streak: unavailable state with no run data\n";
    echo "===========================================================\n\n";

    phase2_reset_state();
    $plugin = new SMC_SuperFib_Sniper_REST();
    $plugin->register_routes();

    // No engine_runs rows inserted — table is empty.
    $wpdb->replace('wp_smc_sf_account_telemetry', array(
        'user_id' => 7, 'account_id' => 'acc', 'terminal_id' => 'term',
        'balance' => 10000, 'equity' => 10000, 'margin' => 0, 'free_margin' => 10000,
        'margin_level' => 0, 'floating_pl' => 0, 'currency' => 'USC', 'leverage' => 500,
        'ea_version' => '1.00',
        'last_seen_at' => gmdate('Y-m-d H:i:s', time() - 5),
        'updated_at' => gmdate('Y-m-d H:i:s', time() - 5),
        'raw_json' => '{}',
    ));

    $response = $plugin->get_user_progress();
    phase2_assert_true($response instanceof WP_REST_Response, 'GET /user/progress must return a response with no run data');
    phase2_assert_same(0, $response->data['streak']['current_streak_days'] ?? -1, 'Streak must be 0 when no run data exists');
    phase2_assert_same('UNAVAILABLE', $response->data['streak']['state'] ?? null, 'Streak state must be UNAVAILABLE when no run data exists');
    phase2_assert_true($response->data['streak']['last_active_date'] === null, 'last_active_date must be null when no run data exists');
    echo "PASS streak unavailable with no run data\n";
}

test_phase2_trade_telemetry();
test_progress_streak_live_state_with_consecutive_run_fixtures();
test_progress_streak_unavailable_with_no_run_data();
