<?php

define('ABSPATH', __DIR__ . '/');
define('ARRAY_A', 'ARRAY_A');

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
if (!function_exists('sanitize_text_field')) {
    function sanitize_text_field($value) {
        return trim((string) $value);
    }
}
if (!function_exists('sanitize_key')) {
    function sanitize_key($value) {
        return strtolower(preg_replace('/[^a-zA-Z0-9_\-]/', '', (string) $value));
    }
}
if (!function_exists('wp_json_encode')) {
    function wp_json_encode($value) {
        return json_encode($value);
    }
}
if (!function_exists('rest_url')) {
    function rest_url() {
        return 'http://example.test/wp-json/';
    }
}
if (!function_exists('set_transient')) {
    function set_transient($key, $value, $expiration = 0) {
        $GLOBALS['fib_test_transients'][$key] = $value;
        return true;
    }
}
if (!function_exists('get_transient')) {
    function get_transient($key) {
        return array_key_exists($key, $GLOBALS['fib_test_transients']) ? $GLOBALS['fib_test_transients'][$key] : false;
    }
}
if (!function_exists('delete_transient')) {
    function delete_transient($key) {
        unset($GLOBALS['fib_test_transients'][$key]);
        return true;
    }
}
if (!function_exists('get_current_user_id')) {
    function get_current_user_id() {
        return isset($GLOBALS['fib_test_current_user_id']) ? (int) $GLOBALS['fib_test_current_user_id'] : 1;
    }
}
if (!function_exists('rest_ensure_response')) {
    function rest_ensure_response($value) {
        return new WP_REST_Response($value);
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
                $this->headers[strtolower((string) $key)] = $value;
            }
        }

        public function get_json_params() {
            return $this->params;
        }

        public function get_param($key) {
            return isset($this->params[$key]) ? $this->params[$key] : null;
        }

        public function get_header($key) {
            $lookup = strtolower((string) $key);
            return isset($this->headers[$lookup]) ? $this->headers[$lookup] : '';
        }
    }
}

if (!class_exists('WP_REST_Server')) {
    class WP_REST_Server {
        const READABLE = 'GET';
        const CREATABLE = 'POST';
        const DELETABLE = 'DELETE';
    }
}

if (!class_exists('WP_REST_Response')) {
    class WP_REST_Response {
        public $data;
        public $status;

        public function __construct($data = null, $status = 200) {
            $this->data = $data;
            $this->status = (int) $status;
        }

        public function get_status() {
            return $this->status;
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
        public $last_error = '';
        public $tables = array();
        public $queries = array();

        public function prepare($query, ...$args) {
            if (count($args) === 1 && is_array($args[0])) {
                $args = $args[0];
            }

            $output = '';
            $parts = preg_split('/(%(?:\d+\$)?[dfs])/', $query, -1, PREG_SPLIT_DELIM_CAPTURE);
            $arg_index = 0;
            foreach ($parts as $part) {
                if (!preg_match('/^%(?:\d+\$)?([dfs])$/', $part, $matches)) {
                    $output .= $part;
                    continue;
                }

                $value = array_key_exists($arg_index, $args) ? $args[$arg_index++] : null;
                if ($matches[1] === 'd') {
                    $output .= (string) (int) $value;
                } elseif ($matches[1] === 'f') {
                    $output .= (string) (float) $value;
                } else {
                    $output .= "'" . str_replace("'", "''", (string) $value) . "'";
                }
            }

            return $output;
        }

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

            $key = $this->row_key($table, $data, true);
            $this->tables[$table][$key] = $data;
            return 1;
        }

        public function get_var($query) {
            list($fields, $rows) = $this->select_rows($query);
            if (empty($rows)) {
                return null;
            }

            $projected = $this->project_row($rows[0], $fields);
            if (empty($projected)) {
                return null;
            }

            $values = array_values($projected);
            return $values[0];
        }

        public function get_row($query, $output = ARRAY_A) {
            list($fields, $rows) = $this->select_rows($query);
            if (empty($rows)) {
                return null;
            }

            return $this->project_row($rows[0], $fields);
        }

        public function get_results($query, $output = ARRAY_A) {
            list($fields, $rows) = $this->select_rows($query);
            return array_map(function ($row) use ($fields) {
                return $this->project_row($row, $fields);
            }, $rows);
        }

        public function query($query) {
            $this->queries[] = array('type' => 'query', 'query' => $query);
            return 0;
        }

        public function get_charset_collate() {
            return '';
        }

        public function reset() {
            $this->tables = array();
            $this->queries = array();
            $this->last_error = '';
        }

        private function select_rows($query) {
            $fields = '*';
            $table = '';
            $where = '';
            $order_by = '';

            if (preg_match('/SELECT\s+(.+?)\s+FROM\s+([^\s]+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+\d+)?\s*$/i', trim($query), $matches)) {
                $fields = trim($matches[1]);
                $table = $matches[2];
                $where = isset($matches[3]) ? trim($matches[3]) : '';
                $order_by = isset($matches[4]) ? trim($matches[4]) : '';
            }

            $rows = array_values(isset($this->tables[$table]) ? $this->tables[$table] : array());
            $conditions = $this->parse_conditions($where);
            if (!empty($conditions)) {
                $rows = array_values(array_filter($rows, function ($row) use ($conditions) {
                    foreach ($conditions as $field => $expected) {
                        $actual = array_key_exists($field, $row) ? $row[$field] : null;
                        if ((string) $actual !== (string) $expected) {
                            return false;
                        }
                    }
                    return true;
                }));
            }

            if ($order_by !== '' && preg_match('/^([a-zA-Z0-9_]+)\s+(ASC|DESC)$/i', $order_by, $matches)) {
                $field = $matches[1];
                $direction = strtoupper($matches[2]);
                usort($rows, function ($left, $right) use ($field, $direction) {
                    $left_value = $left[$field] ?? null;
                    $right_value = $right[$field] ?? null;
                    if ($left_value === $right_value) {
                        return 0;
                    }

                    $comparison = strcmp((string) $left_value, (string) $right_value);
                    return $direction === 'DESC' ? -1 * $comparison : $comparison;
                });
            }

            return array($fields, $rows);
        }

        private function parse_conditions($where) {
            $conditions = array();
            if ($where === '') {
                return $conditions;
            }

            foreach (preg_split('/\s+AND\s+/i', $where) as $clause) {
                if (preg_match("/([a-zA-Z0-9_]+)\s*=\s*'((?:''|[^'])*)'/", $clause, $matches)) {
                    $conditions[$matches[1]] = str_replace("''", "'", $matches[2]);
                    continue;
                }

                if (preg_match('/([a-zA-Z0-9_]+)\s*=\s*(-?\d+(?:\.\d+)?)/', $clause, $matches)) {
                    $conditions[$matches[1]] = $matches[2];
                }
            }

            return $conditions;
        }

        private function project_row($row, $fields) {
            if ($fields === '*') {
                return $row;
            }

            $projected = array();
            foreach (explode(',', $fields) as $field) {
                $field_name = trim($field);
                if ($field_name === '') {
                    continue;
                }
                $projected[$field_name] = array_key_exists($field_name, $row) ? $row[$field_name] : null;
            }

            return $projected;
        }

        private function row_key($table, $data, $always_unique = false) {
            if ($always_unique) {
                return 'row-' . count(isset($this->tables[$table]) ? $this->tables[$table] : array()) . '-' . md5(wp_json_encode($data));
            }

            if (isset($data['id'])) {
                return 'id:' . $data['id'];
            }

            if (isset($data['user_id']) && isset($data['signal_id'])) {
                return 'user-signal:' . $data['user_id'] . ':' . $data['signal_id'];
            }

            if (isset($data['user_id']) && isset($data['provider'])) {
                return 'user-provider:' . $data['user_id'] . ':' . $data['provider'];
            }

            if (isset($data['user_id']) && isset($data['symbol']) && isset($data['source'])) {
                return 'user-symbol-source:' . $data['user_id'] . ':' . $data['symbol'] . ':' . $data['source'];
            }

            if (isset($data['user_id'])) {
                return 'user:' . $data['user_id'];
            }

            return 'hash:' . md5(wp_json_encode($data));
        }
    }
}

if (!function_exists('dbDelta')) {
    function dbDelta($sql) {
        global $wpdb;
        if (preg_match('/CREATE TABLE ([^ ]+)/', $sql, $matches)) {
            $table = $matches[1];
            if (!isset($wpdb->tables[$table])) {
                $wpdb->tables[$table] = array();
            }
        }
        return true;
    }
}

global $wpdb;
$wpdb = new TestWpdb();

require_once dirname(__DIR__, 2) . '/smc-superfib-sniper.php';

function fib_test_fail($message) {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function fib_test_assert_true($condition, $message) {
    if (!$condition) {
        fib_test_fail($message);
    }
}

function fib_test_assert_same($expected, $actual, $message) {
    if ($expected !== $actual) {
        fib_test_fail($message . ' expected=' . var_export($expected, true) . ' actual=' . var_export($actual, true));
    }
}

function fib_test_assert_near($expected, $actual, $tolerance, $message) {
    if (abs((float) $expected - (float) $actual) > (float) $tolerance) {
        fib_test_fail($message . ' expected=' . $expected . ' actual=' . $actual);
    }
}

function fib_test_make_rest_instance() {
    $ref = new ReflectionClass('SMC_SuperFib_Sniper_REST');
    return $ref->newInstanceWithoutConstructor();
}

function fib_test_set_private_property($instance, $property, $value) {
    $ref = new ReflectionProperty(get_class($instance), $property);
    $ref->setAccessible(true);
    $ref->setValue($instance, $value);
}

function fib_test_invoke_private_method($instance, $method, array $args = array()) {
    $ref = new ReflectionMethod(get_class($instance), $method);
    $ref->setAccessible(true);
    return $ref->invokeArgs($instance, $args);
}

function fib_test_make_candle($time, $high, $low, $open = null, $close = null) {
    $open_price = $open !== null ? (float) $open : (float) $low;
    $close_price = $close !== null ? (float) $close : (float) $high;

    return array(
        'time' => gmdate('c', strtotime($time)),
        'open' => $open_price,
        'high' => (float) $high,
        'low' => (float) $low,
        'close' => $close_price,
    );
}

function fib_test_find_level(array $levels, $ratio) {
    foreach ($levels as $level) {
        if ((float) $level['ratio'] === (float) $ratio) {
            return $level;
        }
    }

    fib_test_fail('Missing fib ratio ' . $ratio);
}

function fib_test_expected_prices($high, $low, array $ratios) {
    $expected = array();
    foreach ($ratios as $ratio) {
        $expected[(string) $ratio] = round((float) $high - (((float) $ratio / 100) * ((float) $high - (float) $low)), 8);
    }
    return $expected;
}

function fib_test_reset_env($user_id = 1) {
    global $wpdb;

    if (!($wpdb instanceof TestWpdb)) {
        $wpdb = new TestWpdb();
    }

    $wpdb->reset();
    $GLOBALS['fib_test_current_user_id'] = (int) $user_id;
    $GLOBALS['fib_test_transients'] = array();
}

function fib_test_table_name($name) {
    global $wpdb;
    return $wpdb->prefix . 'smc_sf_' . $name;
}

function fib_test_seed_row($table, array $data) {
    global $wpdb;
    $wpdb->replace(fib_test_table_name($table), $data);
}

function fib_test_seed_account_blob($user_id, array $blob) {
    fib_test_seed_row('account_snapshots', array(
        'user_id' => (int) $user_id,
        'data' => wp_json_encode($blob),
        'updated_at' => gmdate('Y-m-d H:i:s'),
    ));
}

function fib_test_seed_snapshot($user_id, $symbol, $mid, array $overrides = array()) {
    $base = array(
        'user_id' => (int) $user_id,
        'symbol' => $symbol,
        'bid' => (float) $mid,
        'ask' => (float) $mid,
        'mid' => (float) $mid,
        'change_pct_1d' => 0,
        'updated_at' => gmdate('Y-m-d H:i:s'),
        'state' => 'live',
        'source' => 'mt5',
    );

    fib_test_seed_row('snapshots', array_merge($base, $overrides));
}

function fib_test_response_data($response) {
    return $response instanceof WP_REST_Response ? $response->data : $response;
}

function fib_test_table_rows($table) {
    global $wpdb;
    $name = fib_test_table_name($table);
    return array_values(isset($wpdb->tables[$name]) ? $wpdb->tables[$name] : array());
}
