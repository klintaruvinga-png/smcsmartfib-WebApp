<?php

define('ABSPATH', __DIR__ . '/');
define('ARRAY_A', 'ARRAY_A');

$GLOBALS['test_registered_routes'] = array();
$GLOBALS['test_transients'] = array();
$GLOBALS['test_user_meta'] = array();
$GLOBALS['test_current_user_id'] = 1;
$GLOBALS['test_is_logged_in'] = true;
$GLOBALS['test_capabilities'] = array(
    'read' => true,
    'manage_options' => true,
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

        public function insert($table, $data, $formats = array()) {
            $this->queries[] = array('type' => 'insert', 'table' => $table, 'data' => $data);
            if (!isset($this->tables[$table])) {
                $this->tables[$table] = array();
            }
            $this->tables[$table][] = $data;
            return 1;
        }

        public function delete($table, $where, $where_format = array()) {
            $this->queries[] = array('type' => 'delete', 'table' => $table, 'where' => $where);
            if (!isset($this->tables[$table])) {
                return 0;
            }
            $deleted = 0;
            foreach ($this->tables[$table] as $key => $row) {
                if ($this->matches_where($row, $where)) {
                    unset($this->tables[$table][$key]);
                    $deleted++;
                }
            }
            return $deleted;
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
            if (preg_match("/SELECT data FROM ([^ ]+) WHERE user_id = (\\d+)/", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) === $user_id) {
                        return $row['data'];
                    }
                }
                return null;
            }

            if (preg_match("/SELECT settings FROM ([^ ]+) WHERE user_id = (\\d+)/", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) === $user_id) {
                        return $row['settings'];
                    }
                }
                return null;
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
            if (preg_match("/SELECT \\* FROM ([^ ]+) WHERE user_id = (\\d+) AND symbol = '([^']+)' AND source = '([^']+)' ORDER BY updated_at DESC LIMIT 1/", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                $symbol = $m[3];
                $source = $m[4];
                $matches = array();
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) !== $user_id
                        || ($row['symbol'] ?? '') !== $symbol
                        || ($row['source'] ?? '') !== $source) {
                        continue;
                    }
                    $matches[] = $row;
                }

                if ($matches === array()) {
                    return null;
                }

                usort($matches, function ($a, $b) {
                    return strcmp((string) ($b['updated_at'] ?? ''), (string) ($a['updated_at'] ?? ''));
                });

                return $matches[0];
            }

            return null;
        }

        public function get_results($query, $output = ARRAY_A) {
            return array();
        }

        private function row_key($table, $data) {
            if ($table === 'wp_smc_sf_snapshots') {
                return $data['user_id'] . '|' . $data['symbol'];
            }
            if ($table === 'wp_smc_sf_candles') {
                return $data['user_id'] . '|' . $data['symbol'] . '|' . $data['timeframe'] . '|' . $data['candle_time'];
            }
            if ($table === 'wp_smc_sf_user_settings') {
                return (string) $data['user_id'];
            }
            if ($table === 'wp_smc_sf_account_snapshots') {
                return (string) $data['user_id'];
            }
            if ($table === 'wp_smc_sf_symbol_sync') {
                return implode('|', array(
                    $data['user_id'] ?? '',
                    $data['account_id'] ?? '',
                    $data['terminal_id'] ?? '',
                    $data['broker_symbol'] ?? '',
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
if (!function_exists('plugin_dir_path')) {
    function plugin_dir_path($file) {
        return dirname($file) . DIRECTORY_SEPARATOR;
    }
}
if (!function_exists('rest_ensure_response')) {
    function rest_ensure_response($data) {
        return new WP_REST_Response($data);
    }
}
if (!function_exists('sanitize_text_field')) {
    function sanitize_text_field($str) {
        return trim((string) $str);
    }
}
if (!function_exists('sanitize_textarea_field')) {
    function sanitize_textarea_field($str) {
        return trim((string) $str);
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
    function wp_json_encode($data) {
        return json_encode($data);
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
        return !empty($GLOBALS['test_capabilities'][$capability]);
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
        return array_key_exists($key, $GLOBALS['test_transients']) ? $GLOBALS['test_transients'][$key] : false;
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
if (!function_exists('wp_validate_auth_cookie')) {
    function wp_validate_auth_cookie($cookie = '', $scheme = '') {
        return 0;
    }
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
        $GLOBALS['test_user_meta'][$user_id . '|' . $key] = $value;
        return true;
    }
}
if (!function_exists('get_user_meta')) {
    function get_user_meta($user_id, $key, $single = false) {
        $lookup = $user_id . '|' . $key;
        return array_key_exists($lookup, $GLOBALS['test_user_meta']) ? $GLOBALS['test_user_meta'][$lookup] : ($single ? null : array());
    }
}
if (!function_exists('delete_user_meta')) {
    function delete_user_meta($user_id, $key) {
        unset($GLOBALS['test_user_meta'][$user_id . '|' . $key]);
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

function reset_ea_bridge_test_state() {
    global $wpdb;
    $wpdb->tables = array();
    $wpdb->queries = array();
    $wpdb->last_error = '';
    $GLOBALS['test_registered_routes'] = array();
    $GLOBALS['test_transients'] = array();
    $GLOBALS['test_user_meta'] = array();
    $GLOBALS['test_current_user_id'] = 1;
    $GLOBALS['test_is_logged_in'] = true;
    $GLOBALS['test_capabilities'] = array(
        'read' => true,
        'manage_options' => true,
    );
}

function ea_bridge_headers($api_key = 'test-key') {
    return array('X-EA-API-Key' => $api_key);
}

function dispatch_ea_request($plugin, $permission_method, $handler_method, $payload, $headers = array()) {
    $request = new WP_REST_Request($payload, $headers);
    $permission = $plugin->{$permission_method}($request);
    if ($permission !== true) {
        return $permission;
    }
    return $plugin->{$handler_method}($request);
}

function find_registered_route($route) {
    foreach ($GLOBALS['test_registered_routes'] as $entry) {
        if (($entry['namespace'] ?? '') === 'sniper/v1' && ($entry['route'] ?? '') === $route) {
            return $entry;
        }
    }
    return null;
}

function assert_true($condition, $message) {
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function assert_same($expected, $actual, $message) {
    if ($expected !== $actual) {
        throw new RuntimeException($message . ' Expected=' . var_export($expected, true) . ' Actual=' . var_export($actual, true));
    }
}

