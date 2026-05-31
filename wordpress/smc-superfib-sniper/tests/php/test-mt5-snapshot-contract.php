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
        private $headers;

        public function __construct($data = null, $status = 200) {
            $this->data = $data;
            $this->status = $status;
            $this->headers = array();
        }

        public function header($name, $value) {
            $this->headers[(string) $name] = $value;
        }

        public function get_headers() {
            return $this->headers;
        }

        public function get_data() {
            return $this->data;
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
        public $schemas = array();
        public $last_error = '';

        public function replace($table, $data, $formats = array()) {
            $unknown_columns = $this->find_unknown_columns($table, $data);
            if (!empty($unknown_columns)) {
                $this->last_error = 'Unknown column ' . $unknown_columns[0];
                return false;
            }
            $this->last_error = '';
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

        public function apply_dbdelta($sql) {
            if (!preg_match('/CREATE TABLE\s+([^\s(]+)\s*\((.*)\)\s*;?\s*$/is', trim($sql), $matches)) {
                return true;
            }

            $table = $matches[1];
            if (!isset($this->schemas[$table])) {
                $this->schemas[$table] = array();
            }

            foreach (preg_split('/\n/', $matches[2]) as $line) {
                $line = trim($line, " \t\r\n,");
                if ($line === '' || preg_match('/^(PRIMARY|UNIQUE|KEY)\b/i', $line)) {
                    continue;
                }
                if (preg_match('/^`?([A-Za-z0-9_]+)`?\s+/', $line, $column_match)) {
                    $this->schemas[$table][$column_match[1]] = true;
                }
            }
            $this->last_error = '';
            return true;
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
            if (preg_match("/SELECT composite_score, category FROM ([^ ]+) WHERE currency = '([^']+)' LIMIT 1/", $query, $m)) {
                $table = $m[1];
                $currency = $m[2];
                foreach ($this->tables[$table] ?? array() as $row) {
                    if (($row['currency'] ?? '') === $currency) {
                        return $row;
                    }
                }
                return null;
            }
            if (preg_match("/SELECT \\* FROM ([^\\s]+)\\s+WHERE user_id = (\\d+) AND symbol = '([^']+)' AND fib_family = '([^']*)' AND fib_ratio = ([0-9.]+)\\s+AND fib_level IS NOT NULL AND fib_level BETWEEN ([0-9.\\-]+) AND ([0-9.\\-]+) AND direction = '([^']+)'\\s+ORDER BY created_at DESC LIMIT 1/s", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                $symbol = $m[3];
                $fib_family = $m[4];
                $fib_ratio = (float) $m[5];
                $min_fib_level = (float) $m[6];
                $max_fib_level = (float) $m[7];
                $direction = $m[8];
                $latest = null;
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) !== $user_id) {
                        continue;
                    }
                    if (($row['symbol'] ?? '') !== $symbol || ($row['direction'] ?? '') !== $direction || ($row['fib_family'] ?? '') !== $fib_family) {
                        continue;
                    }
                    if (abs((float) ($row['fib_ratio'] ?? 0) - $fib_ratio) > 0.0000001) {
                        continue;
                    }
                    if (!isset($row['fib_level']) || !is_numeric($row['fib_level'])) {
                        continue;
                    }
                    $row_fib_level = (float) $row['fib_level'];
                    if ($row_fib_level < $min_fib_level || $row_fib_level > $max_fib_level) {
                        continue;
                    }
                    if ($latest === null || strcmp((string) ($row['created_at'] ?? ''), (string) ($latest['created_at'] ?? '')) > 0) {
                        $latest = $row;
                    }
                }
                return $latest;
            }
            if (preg_match("/SELECT \\* FROM ([^\\s]+)\\s+WHERE user_id = (\\d+) AND symbol = '([^']+)' AND direction = '([^']+)' AND fib_family = '([^']*)' AND fib_ratio = ([0-9.]+)\\s+AND fib_level IS NOT NULL AND fib_level BETWEEN ([0-9.\\-]+) AND ([0-9.\\-]+)\\s+ORDER BY created_at DESC LIMIT 1/s", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                $symbol = $m[3];
                $direction = $m[4];
                $fib_family = $m[5];
                $fib_ratio = (float) $m[6];
                $min_fib_level = (float) $m[7];
                $max_fib_level = (float) $m[8];
                $latest = null;
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) !== $user_id) {
                        continue;
                    }
                    if (($row['symbol'] ?? '') !== $symbol || ($row['direction'] ?? '') !== $direction || ($row['fib_family'] ?? '') !== $fib_family) {
                        continue;
                    }
                    if (abs((float) ($row['fib_ratio'] ?? 0) - $fib_ratio) > 0.0000001) {
                        continue;
                    }
                    if (!isset($row['fib_level']) || !is_numeric($row['fib_level'])) {
                        continue;
                    }
                    $row_fib_level = (float) $row['fib_level'];
                    if ($row_fib_level < $min_fib_level || $row_fib_level > $max_fib_level) {
                        continue;
                    }
                    if ($latest === null || strcmp((string) ($row['created_at'] ?? ''), (string) ($latest['created_at'] ?? '')) > 0) {
                        $latest = $row;
                    }
                }
                return $latest;
            }
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
            if (preg_match("/SELECT account_id, terminal_id FROM ([^ ]+) WHERE user_id = (\\d+) ORDER BY last_seen_at DESC, updated_at DESC, id DESC LIMIT 1/s", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                $latest = null;
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) !== $user_id) {
                        continue;
                    }
                    if ($latest === null) {
                        $latest = $row;
                        continue;
                    }
                    $row_rank = implode('|', array(
                        (string) ($row['last_seen_at'] ?? ''),
                        (string) ($row['updated_at'] ?? ''),
                        (string) ($row['id'] ?? ''),
                    ));
                    $latest_rank = implode('|', array(
                        (string) ($latest['last_seen_at'] ?? ''),
                        (string) ($latest['updated_at'] ?? ''),
                        (string) ($latest['id'] ?? ''),
                    ));
                    if (strcmp($row_rank, $latest_rank) > 0) {
                        $latest = $row;
                    }
                }
                return $latest;
            }
            if (preg_match("/SELECT \\* FROM ([^\\s]+)\\s+WHERE user_id = (\\d+) AND symbol = '([^']+)' AND direction = '([^']+)' AND fib_family = '([^']*)' AND fib_ratio = ([0-9.]+)\\s+ORDER BY created_at DESC LIMIT 1/s", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                $symbol = $m[3];
                $direction = $m[4];
                $fib_family = $m[5];
                $fib_ratio = (float) $m[6];
                $latest = null;
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) !== $user_id) {
                        continue;
                    }
                    if (($row['symbol'] ?? '') !== $symbol || ($row['direction'] ?? '') !== $direction || ($row['fib_family'] ?? '') !== $fib_family) {
                        continue;
                    }
                    if (abs((float) ($row['fib_ratio'] ?? 0) - $fib_ratio) > 0.0000001) {
                        continue;
                    }
                    if ($latest === null || strcmp((string) ($row['created_at'] ?? ''), (string) ($latest['created_at'] ?? '')) > 0) {
                        $latest = $row;
                    }
                }
                return $latest;
            }
            if (preg_match("/SELECT direction, engine FROM ([^ ]+) WHERE user_id = (\\d+) AND symbol = '([^']+)' AND status != 'CLOSED' ORDER BY created_at DESC LIMIT 1/", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                $symbol = $m[3];
                $latest = null;
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) !== $user_id || ($row['symbol'] ?? null) !== $symbol) {
                        continue;
                    }
                    if (($row['status'] ?? '') === 'CLOSED') {
                        continue;
                    }
                    if ($latest === null || strcmp((string) ($row['created_at'] ?? ''), (string) ($latest['created_at'] ?? '')) > 0) {
                        $latest = $row;
                    }
                }
                return $latest;
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
            if (preg_match("/SELECT \\* FROM ([^ ]+) WHERE user_id = (\\d+)$/", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                $rows = array();
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) === $user_id) {
                        $rows[] = $row;
                    }
                }
                return $rows;
            }
            if (preg_match("/SELECT \\* FROM ([^ ]+) WHERE user_id = (\\d+) AND account_id = '([^']*)' AND terminal_id = '([^']*)' AND state = '([^']+)'/", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                $account_id = $m[3];
                $terminal_id = $m[4];
                $state = $m[5];
                $rows = array();
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) !== $user_id) {
                        continue;
                    }
                    if ((string) ($row['account_id'] ?? '') !== $account_id || (string) ($row['terminal_id'] ?? '') !== $terminal_id) {
                        continue;
                    }
                    if ((string) ($row['state'] ?? '') !== $state) {
                        continue;
                    }
                    $rows[] = $row;
                }
                return $rows;
            }
            return array();
        }

        private function find_unknown_columns($table, $data) {
            if (empty($this->schemas[$table])) {
                return array();
            }

            $unknown = array();
            foreach (array_keys($data) as $column) {
                if (!isset($this->schemas[$table][$column])) {
                    $unknown[] = $column;
                }
            }
            return $unknown;
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
            if (substr($table, -7) === 'signals' && isset($data['id'])) {
                return (string) $data['id'];
            }
            if (substr($table, -10) === 'candidates' && isset($data['id'])) {
                return (string) $data['id'];
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
if (!function_exists('dbDelta')) {
    function dbDelta(...$args) {
        global $wpdb;
        if (is_object($wpdb) && method_exists($wpdb, 'apply_dbdelta')) {
            return $wpdb->apply_dbdelta($args[0] ?? '');
        }
        return true;
    }
}
if (!function_exists('plugin_dir_path')) {
    function plugin_dir_path($file) {
        return dirname($file) . DIRECTORY_SEPARATOR;
    }
}
if (!function_exists('rest_ensure_response')) {
    function rest_ensure_response($value) {
        if ($value instanceof WP_Error || $value instanceof WP_REST_Response) {
            return $value;
        }
        if (!empty($GLOBALS['test_rest_force_response'])) {
            return new WP_REST_Response($value);
        }
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

function seed_ready_build_symbol_state_fixture($wpdb, $user_id, $symbol, $bid, $ask, $last_open = 1.1020, $last_close = 1.1142) {
    $snapshotTable = $wpdb->prefix . 'smc_sf_snapshots';
    $candleTable = $wpdb->prefix . 'smc_sf_candles';
    $now = time();
    $bucket = (int) (floor($now / 900) * 900);
    $start = $bucket - (119 * 900);

    $wpdb->replace($snapshotTable, array(
        'user_id' => $user_id,
        'symbol' => $symbol,
        'bid' => $bid,
        'ask' => $ask,
        'mid' => ($bid + $ask) / 2,
        'spread' => 2,
        'change_pct_1d' => 0,
        'source' => 'mt5',
        'state' => 'live',
        'updated_at' => gmdate('Y-m-d H:i:s', $now - 5),
    ));

    for ($i = 0; $i < 120; $i++) {
        $open = 1.1300;
        $high = 1.1400;
        $low = 1.1210;
        $close = 1.1290;

        if ($i >= 85 && $i <= 109) {
            $open = 1.1180;
            $high = 1.1200;
            $low = 1.1100;
            $close = 1.1160;
        } elseif ($i >= 110 && $i <= 118) {
            $open = 1.1090;
            $high = 1.1140;
            $low = $i === 110 ? 1.0990 : 1.1060;
            $close = 1.1120;
        } elseif ($i === 119) {
            $open = $last_open;
            $high = 1.1150;
            $low = 1.1010;
            $close = $last_close;
        }

        $wpdb->replace($candleTable, array(
            'user_id' => $user_id,
            'symbol' => $symbol,
            'timeframe' => '15min',
            'candle_time' => gmdate('Y-m-d H:i:s', $start + ($i * 900)),
            'open' => $open,
            'high' => $high,
            'low' => $low,
            'close' => $close,
            'volume' => '10',
            'source' => 'mt5',
            'created_at' => gmdate('Y-m-d H:i:s', $now),
        ));
    }

    return array(
        'direction' => 'LONG',
        'fibRatio' => 62.5,
        'fibLevel' => 1.114375,
        'entryPrice' => 1.1160,
        'slPrice' => 1.10925,
        'tpPrice' => 1.1195,
    );
}

function seed_watch_build_symbol_state_fixture($wpdb, $user_id, $symbol, $bid, $ask) {
    $snapshotTable = $wpdb->prefix . 'smc_sf_snapshots';
    $candleTable = $wpdb->prefix . 'smc_sf_candles';
    $now = time();
    $bucket = (int) (floor($now / 900) * 900);
    $start = $bucket - (119 * 900);

    $wpdb->replace($snapshotTable, array(
        'user_id' => $user_id,
        'symbol' => $symbol,
        'bid' => $bid,
        'ask' => $ask,
        'mid' => ($bid + $ask) / 2,
        'spread' => 2,
        'change_pct_1d' => 0,
        'source' => 'mt5',
        'state' => 'live',
        'updated_at' => gmdate('Y-m-d H:i:s', $now - 5),
    ));

    for ($i = 0; $i < 120; $i++) {
        $open = 1.1300;
        $high = 1.1400;
        $low = 1.1210;
        $close = 1.1290;

        if ($i >= 85 && $i <= 109) {
            $open = 1.1180;
            $high = 1.1200;
            $low = 1.1100;
            $close = 1.1160;
        } elseif ($i >= 110 && $i <= 118) {
            $open = 1.1160;
            $high = 1.1180;
            $low = 1.1110;
            $close = 1.1150;
        } elseif ($i === 119) {
            $open = 1.1140;
            $high = 1.1180;
            $low = 1.1110;
            $close = 1.1142;
        }

        $wpdb->replace($candleTable, array(
            'user_id' => $user_id,
            'symbol' => $symbol,
            'timeframe' => '15min',
            'candle_time' => gmdate('Y-m-d H:i:s', $start + ($i * 900)),
            'open' => $open,
            'high' => $high,
            'low' => $low,
            'close' => $close,
            'volume' => '10',
            'source' => 'mt5',
            'created_at' => gmdate('Y-m-d H:i:s', $now),
        ));
    }
}

$displaySignalsRuntimeTable = $wpdb->prefix . 'smc_sf_display_signals';
$displaySignalsReadyProperty = new ReflectionProperty('SMC_SuperFib_Sniper_REST', 'display_signals_table_ready');
$displaySignalsReadyProperty->setAccessible(true);
$displaySignalsReadyProperty->setValue(null, false);
unset($wpdb->schemas[$displaySignalsRuntimeTable], $wpdb->tables[$displaySignalsRuntimeTable]);
assert_true(SMC_SuperFib_Sniper_REST::ensure_display_signals_table(), 'Runtime display_signals migration should succeed outside activation');
assert_true(isset($wpdb->schemas[$displaySignalsRuntimeTable]['source_candidate_id']), 'Runtime display_signals migration must create the display board schema');

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

$canonicalSnapshot = $instance->post_snapshot(new WP_REST_Request(array(
    'symbol' => 'US Tech 100',
    'normalized_symbol' => 'USTECH100',
    'source' => 'MT5',
    'bid' => 18654.2,
    'ask' => 18654.8,
    'spread' => 6,
    'quote_time' => '2026-05-03T08:20:30Z',
    'candles' => array(
        array(
            'time' => '2026-05-03T08:20:00Z',
            'open' => 18650.0,
            'high' => 18656.0,
            'low' => 18649.5,
            'close' => 18654.4,
            'tick_volume' => 27,
        ),
    ),
    'freshness' => 'LIVE',
    'session' => 'New York',
)));

assert_true(is_array($canonicalSnapshot) && !empty($canonicalSnapshot['ok']), 'Canonical MT5 snapshot payload should succeed on the authenticated /snapshot route');
$canonicalSnapshotRow = $wpdb->tables[$snapshotTable]['7|NAS100'] ?? null;
assert_true(is_array($canonicalSnapshotRow), 'Canonical MT5 snapshot payload must persist the aliased snapshot row');
assert_same('2026-05-03 08:20:30', $canonicalSnapshotRow['updated_at'], 'Canonical MT5 snapshot payload must persist quote_time as the quote timestamp');
assert_same('live', $canonicalSnapshotRow['state'], 'Canonical MT5 snapshot payload must persist canonical live state');
$canonicalCandleRow = null;
foreach (($wpdb->tables[$wpdb->prefix . 'smc_sf_candles'] ?? array()) as $row) {
    if (($row['symbol'] ?? null) === 'NAS100' && ($row['timeframe'] ?? null) === '1min') {
        $canonicalCandleRow = $row;
        break;
    }
}
assert_true(is_array($canonicalCandleRow), 'Canonical MT5 snapshot payload must promote candles[0] into an M1 candle row');
assert_same('27', $canonicalCandleRow['volume'] ?? null, 'Canonical MT5 snapshot payload must map tick_volume onto candle volume');
assert_same('LIVE', $GLOBALS['test_transients']['smc_sf_freshness_7_NAS100'] ?? null, 'Canonical MT5 snapshot payload must persist freshness against the aliased symbol');

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

for ($i = 0; $i < 450; $i++) {
    $price = 1.2500 + ($i * 0.00001);
    $wpdb->replace($candleTable, array(
        'user_id' => 7,
        'symbol' => 'GBPUSD',
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

$stableLiveSignalsSnapshot = array(
    'prices' => array(
        array(
            'symbol' => 'EURUSD',
            'updatedAt' => gmdate('c'),
            'state' => 'live',
            'source' => 'mt5',
            'bid' => 1.1010,
            'ask' => 1.1012,
            'mid' => 1.1011,
        ),
    ),
    'regimes' => array(),
    'gates' => array(),
    'signals' => array(
        array(
            'id' => 'sig-eurusd-watch-raw',
            'symbol' => 'EURUSD',
            'direction' => 'LONG',
            'status' => 'WATCH',
            'confluence' => array('HTA_SF'),
            'verdict' => 'C',
            'computedBy' => 'backend',
            'backendConfirmed' => false,
            'engineBlocker' => 'OK',
            'createdAt' => '2026-05-03T08:15:00+00:00',
        ),
    ),
    'plans' => array(),
    'diagnostics' => array(
        array(
            'symbol' => 'EURUSD',
            'priceState' => 'live',
            'candleState' => 'live',
            'engineBlocker' => 'OK',
        ),
    ),
    'meta' => array(
        'computedAt' => gmdate('c'),
        'watchlist' => array('EURUSD'),
    ),
);
update_user_meta(7, 'smc_sf_engine_snapshot', $stableLiveSignalsSnapshot);
$displaySignalsTable = $wpdb->prefix . 'smc_sf_display_signals';
$wpdb->replace($displaySignalsTable, array(
    'id' => 'disp-eurusd-long-stable',
    'user_id' => 7,
    'symbol' => 'EURUSD',
    'direction' => 'LONG',
    'lifecycle_state' => 'DISPLAY_ACTIVE',
    'status' => 'READY',
    'verdict' => 'A',
    'confluence' => json_encode(array('OB', 'FVG')),
    'engine' => json_encode(array(
        'engineBlocker' => 'OK',
        'htfBias' => 'BULL',
        'pdState' => 'DISCOUNT',
        'drawOnLiquidity' => 'opposing buy-side liquidity',
        'sweep' => 'present',
        'mss' => 'present',
        'displacement' => 'clean',
        'htaOverride' => false,
        'f3Chop' => 'clear',
    )),
    'quality_score' => 735.0,
    'signal_family_key' => 'family-eurusd-long',
    'entry_price' => 9.99000000,
    'sl_price' => 1.08000000,
    'tp_price' => 1.09500000,
    'source_candidate_id' => 'sig-eurusd-long-stable',
    'source' => 'backend',
    'entry_hit_at' => null,
    'stop_hit_at' => null,
    'replaced_by' => null,
    'invalidated_at' => null,
    'invalidation_reason' => null,
    'first_seen_at' => '2026-05-03 08:15:00',
    'last_confirmed_at' => '2026-05-03 08:16:00',
    'last_evaluated_at' => '2026-05-03 08:16:00',
    'expires_at' => '2026-12-31 12:16:00',
));
$GLOBALS['test_rest_force_response'] = true;
$firstLiveSignalsResponse = $instance->get_live_signals();
assert_true($firstLiveSignalsResponse instanceof WP_REST_Response, 'get_live_signals must return a REST response when header assertions are enabled');
$firstLiveSignalsHeaders = $firstLiveSignalsResponse->get_headers();
$firstLiveSignalsPayload = $firstLiveSignalsResponse->get_data();
$secondLiveSignalsResponse = $instance->get_live_signals();
$secondLiveSignalsHeaders = $secondLiveSignalsResponse->get_headers();
$secondLiveSignalsPayload = $secondLiveSignalsResponse->get_data();
unset($GLOBALS['test_rest_force_response']);

$firstLiveSignals = $firstLiveSignalsPayload['signals'] ?? array();
$secondLiveSignals = $secondLiveSignalsPayload['signals'] ?? array();

assert_true(is_array($firstLiveSignalsPayload), 'get_live_signals must return an envelope payload');
assert_true(is_array($secondLiveSignalsPayload), 'get_live_signals must return an envelope payload');
assert_true(!empty($firstLiveSignalsPayload['polledAt']), 'get_live_signals must stamp polledAt on the response envelope');
assert_true(!empty($secondLiveSignalsPayload['polledAt']), 'get_live_signals must stamp polledAt on the response envelope');
assert_same(1, count($firstLiveSignals), 'get_live_signals must preserve the stable signal count across repeated polls');
assert_same(1, count($secondLiveSignals), 'get_live_signals must preserve the stable signal count across repeated polls');
assert_same('disp-eurusd-long-stable', $firstLiveSignals[0]['id'] ?? null, 'get_live_signals must read the durable display board row instead of raw snapshot WATCH output');
assert_same($firstLiveSignals[0]['id'] ?? null, $secondLiveSignals[0]['id'] ?? null, 'get_live_signals must keep signal identity stable across repeated polls');
assert_same($firstLiveSignals[0]['createdAt'] ?? null, $secondLiveSignals[0]['createdAt'] ?? null, 'get_live_signals must keep createdAt stable across repeated polls');
assert_same($firstLiveSignals[0]['backendConfirmed'] ?? null, $secondLiveSignals[0]['backendConfirmed'] ?? null, 'get_live_signals must keep backendConfirmed stable across repeated polls');
assert_same('DISPLAY_ACTIVE', $firstLiveSignals[0]['lifecycleState'] ?? null, 'get_live_signals must expose display lifecycle state');
assert_same(735.0, $firstLiveSignals[0]['qualityScore'] ?? null, 'get_live_signals must expose deterministic display quality score');
assert_same(1, $firstLiveSignalsPayload['meta']['totalActive'] ?? null, 'get_live_signals must expose total active board signals');
assert_true(!array_key_exists('polledAt', $firstLiveSignals[0] ?? array()), 'get_live_signals must not stamp polledAt on individual signals');
assert_true(!array_key_exists('polledAt', $secondLiveSignals[0] ?? array()), 'get_live_signals must not stamp polledAt on individual signals');
assert_same('no-store, no-cache, must-revalidate', $firstLiveSignalsHeaders['Cache-Control'] ?? null, 'get_live_signals must preserve Cache-Control anti-cache headers');
assert_same('no-cache', $firstLiveSignalsHeaders['Pragma'] ?? null, 'get_live_signals must preserve Pragma anti-cache headers');
assert_same('no-store, no-cache, must-revalidate', $secondLiveSignalsHeaders['Cache-Control'] ?? null, 'get_live_signals must preserve Cache-Control anti-cache headers');
assert_same('no-cache', $secondLiveSignalsHeaders['Pragma'] ?? null, 'get_live_signals must preserve Pragma anti-cache headers');

$blockedLiveSignalsSnapshot = $stableLiveSignalsSnapshot;
$blockedLiveSignalsSnapshot['signals'] = array();
$blockedLiveSignalsSnapshot['diagnostics'] = array(
    array(
        'symbol' => 'EURUSD',
        'priceState' => 'stale',
        'candleState' => 'live',
        'engineBlocker' => 'PRICE_NOT_MT5_FRESH',
    ),
);
update_user_meta(7, 'smc_sf_engine_snapshot', $blockedLiveSignalsSnapshot);
$GLOBALS['test_rest_force_response'] = true;
$blockedLiveSignalsResponse = $instance->get_live_signals();
$blockedLiveSignalsPayload = $blockedLiveSignalsResponse->get_data();
unset($GLOBALS['test_rest_force_response']);
assert_same(1, count($blockedLiveSignalsPayload['signals'] ?? array()), 'get_live_signals must hold persisted board rows through current blocker diagnostics');
assert_same('STALE_HELD', $blockedLiveSignalsPayload['signals'][0]['lifecycleState'] ?? null, 'get_live_signals must mark held rows as STALE_HELD instead of hiding them');

$upsertDisplaySignalMethod = new ReflectionMethod('SMC_SuperFib_Sniper_REST', 'upsert_display_signal_row');
$upsertDisplaySignalMethod->setAccessible(true);
$promotedDisplayId = $upsertDisplaySignalMethod->invoke(
    $instance,
    7,
    array(
        'id' => 'sig-eurusd-ready-source',
        'symbol' => 'EURUSD',
        'direction' => 'LONG',
        'status' => 'READY',
        'verdict' => 'A',
        'confluence' => array('OB', 'FVG'),
        'engine' => array('engineBlocker' => 'OK'),
    ),
    array(
        'id' => 'mt5-candidate-eurusd-ready',
        'symbol' => 'EURUSD',
        'direction' => 'LONG',
        'status' => 'READY',
        'verdict' => 'A',
        'entry_price' => 1.09125,
        'sl_price' => 1.08000,
        'tp_price' => 1.10500,
    ),
    'family-eurusd-ready-source',
    850.0,
    null,
    '2026-05-03 08:17:00'
);
assert_same('sig-eurusd-ready-source', $promotedDisplayId, 'New display promotions must preserve the backend source signal id');
assert_true(isset($wpdb->tables[$displaySignalsTable]['sig-eurusd-ready-source']), 'Display board row must be keyed by the backend source signal id for ladder and execution matching');
assert_same('mt5-candidate-eurusd-ready', $wpdb->tables[$displaySignalsTable]['sig-eurusd-ready-source']['source_candidate_id'] ?? null, 'Display board rows should still retain the originating MT5 candidate id separately');

$GLOBALS['test_rest_force_response'] = true;
$volatileResponseChecks = array(
    'get_snapshot' => $instance->get_snapshot(),
    'get_chart_snapshot' => $instance->get_chart_snapshot(new WP_REST_Request(array(
        'symbol' => 'EURUSD',
        'timeframe' => '15min',
    ))),
    'get_market_data_regime' => $instance->get_market_data_regime(new WP_REST_Request(array(
        'symbol' => 'EURUSD',
    ))),
    'get_market_data_signal_drift' => $instance->get_market_data_signal_drift(new WP_REST_Request()),
    'get_account_telemetry' => $instance->get_account_telemetry(),
    'get_positions' => $instance->get_positions(),
    'get_orders' => $instance->get_orders(),
    'get_user_progress' => $instance->get_user_progress(),
);

foreach ($volatileResponseChecks as $endpointName => $endpointResponse) {
    assert_true($endpointResponse instanceof WP_REST_Response, $endpointName . ' must return a REST response when header assertions are enabled');
    $endpointHeaders = $endpointResponse->get_headers();
    assert_same('no-store, no-cache, must-revalidate', $endpointHeaders['Cache-Control'] ?? null, $endpointName . ' must preserve Cache-Control anti-cache headers');
    assert_same('no-cache', $endpointHeaders['Pragma'] ?? null, $endpointName . ' must preserve Pragma anti-cache headers');
}

unset($GLOBALS['test_rest_force_response']);

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


$closedSessionFreshCandles = array();
for ($i = 29; $i >= 0; $i--) {
    $closedSessionFreshCandles[] = array(
        'time' => gmdate('c', time() - ($i * 60)),
        'open' => 18450.0,
        'high' => 18460.0,
        'low' => 18440.0,
        'close' => 18455.0,
    );
}
$closedSessionQuote = array(
    'symbol' => 'NAS100',
    'bid' => 18455.0,
    'ask' => 18456.0,
    'mid' => 18455.5,
    'source' => 'mt5',
    'state' => 'live',
    'updatedAt' => gmdate('c'),
);
$closedSessionBlocker = $determineBlocker->invoke($instance, 7, $closedSessionQuote, $closedSessionFreshCandles, true, 'READY', 'NAS100', null, false, true);
assert_same('CLOSED_SESSION', $closedSessionBlocker, 'Fresh NAS100 snapshots during the closed regular session must not be backend-confirmable as live data');

$applyClosedSessionPriceStates = new ReflectionMethod(SMC_SuperFib_Sniper_REST::class, 'apply_closed_session_price_states');
$applyClosedSessionPriceStates->setAccessible(true);
$closedSessionPrices = $applyClosedSessionPriceStates->invoke($instance, array($closedSessionQuote), array(array(
    'symbol' => 'NAS100',
    'priceState' => 'closed_session',
    'engineBlocker' => 'CLOSED_SESSION',
)));
assert_same('closed_session', $closedSessionPrices[0]['state'] ?? null, 'Closed-session diagnostics must propagate to the rendered price snapshot state');

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
$buildSymbolState = new ReflectionMethod(SMC_SuperFib_Sniper_REST::class, 'build_symbol_state');
$buildSymbolState->setAccessible(true);
$missingQuoteState = $buildSymbolState->invoke($instance, 7, 'GBPUSD', null);
assert_same('QUOTE_UNAVAILABLE', $missingQuoteState['diagnostic']['engineBlocker'] ?? null, 'build_symbol_state must keep quote-unavailable diagnostics when candles exist without a quote');
assert_true(array_key_exists('lastPriceAt', $missingQuoteState['diagnostic']), 'build_symbol_state diagnostics must retain the lastPriceAt field when quotes are missing');
assert_same(null, $missingQuoteState['diagnostic']['lastPriceAt'], 'build_symbol_state must not fabricate lastPriceAt when no authoritative quote exists');

$buildLifecycleCandidateTable = $wpdb->prefix . 'smc_sf_mt5_signal_candidates';
$buildLifecycleAccountTelemetryTable = $wpdb->prefix . 'smc_sf_account_telemetry';
$buildLifecycleTradePositionsTable = $wpdb->prefix . 'smc_sf_trade_positions';
$buildLifecycleTradeOrdersTable = $wpdb->prefix . 'smc_sf_trade_orders';
$buildLifecycleSeenAt = gmdate('Y-m-d H:i:s');
$wpdb->replace($buildLifecycleAccountTelemetryTable, array(
    'id' => 'acct-telemetry-build-symbol-lifecycle',
    'user_id' => 7,
    'account_id' => 'acct-1',
    'terminal_id' => 'term-1',
    'balance' => 10000,
    'equity' => 10000,
    'margin' => 0,
    'free_margin' => 10000,
    'margin_level' => 0,
    'floating_pl' => 0,
    'currency' => 'USD',
    'leverage' => 100,
    'ea_version' => 'test',
    'last_seen_at' => $buildLifecycleSeenAt,
    'updated_at' => $buildLifecycleSeenAt,
    'raw_json' => '{}',
));

$noPriorFixture = seed_ready_build_symbol_state_fixture($wpdb, 7, 'CADCHF', 1.1141, 1.1143);
$noPriorState = $buildSymbolState->invoke($instance, 7, 'CADCHF', array(
    'symbol' => 'CADCHF',
    'bid' => 1.1141,
    'ask' => 1.1143,
    'mid' => 1.1142,
    'updatedAt' => gmdate('c', time() - 5),
    'state' => 'live',
    'source' => 'mt5',
));
assert_same('READY', $noPriorState['signal']['status'] ?? null, 'build_symbol_state must keep a structurally valid setup READY when there is no prior MT5 candidate');
assert_same(true, $noPriorState['signal']['backendConfirmed'] ?? null, 'build_symbol_state must backend-confirm a live READY setup with no lifecycle blocker');
assert_true(is_array($noPriorState['plan'] ?? null), 'build_symbol_state must generate a plan for the unblocked READY control setup');

seed_ready_build_symbol_state_fixture($wpdb, 7, 'AUDCHF', 1.1134, 1.1136, 1.1020, 1.1135);
$structuralNoLifecycleState = $buildSymbolState->invoke($instance, 7, 'AUDCHF', array(
    'symbol' => 'AUDCHF',
    'bid' => 1.1134,
    'ask' => 1.1136,
    'mid' => 1.1135,
    'updatedAt' => gmdate('c', time() - 5),
    'state' => 'live',
    'source' => 'mt5',
));
assert_same('ARMED', $structuralNoLifecycleState['signal']['status'] ?? null, 'Structurally valid no-lifecycle setup must remain ARMED when structural confirmation is present but MSS has not crossed');
assert_same(false, $structuralNoLifecycleState['signal']['backendConfirmed'] ?? null, 'Structurally valid no-lifecycle pending blueprint must not be backend-confirmed');
assert_same('OK', $structuralNoLifecycleState['signal']['engineBlocker'] ?? null, 'Structurally valid no-lifecycle pending blueprint must keep engineBlocker OK');
assert_same('present', $structuralNoLifecycleState['signal']['engine']['sweep'] ?? null, 'Structurally valid no-lifecycle pending blueprint must require sweep confirmation');
assert_same('absent', $structuralNoLifecycleState['signal']['engine']['mss'] ?? null, 'Structurally valid no-lifecycle pending blueprint may use clean or strong displacement when MSS has not crossed');
assert_true(in_array($structuralNoLifecycleState['signal']['engine']['displacement'] ?? null, array('clean', 'strong'), true), 'Structurally valid no-lifecycle pending blueprint must retain clean or strong displacement');
assert_same(null, $structuralNoLifecycleState['diagnostic']['lifecycle'] ?? null, 'Structurally valid no-lifecycle pending blueprint must not require lifecycle diagnostics');
assert_true(is_array($structuralNoLifecycleState['plan'] ?? null), 'Structurally valid no-lifecycle ARMED setup must expose a non-executable pending blueprint');
assert_same('pending-blueprint', $structuralNoLifecycleState['plan']['source'] ?? null, 'Structurally valid no-lifecycle ARMED setup must tag the plan as pending-blueprint');

seed_watch_build_symbol_state_fixture($wpdb, 7, 'NZDCAD', 1.1141, 1.1143);
$watchBlueprintState = $buildSymbolState->invoke($instance, 7, 'NZDCAD', array(
    'symbol' => 'NZDCAD',
    'bid' => 1.1141,
    'ask' => 1.1143,
    'mid' => 1.1142,
    'updatedAt' => gmdate('c', time() - 5),
    'state' => 'live',
    'source' => 'mt5',
));
assert_same('WATCH', $watchBlueprintState['signal']['status'] ?? null, 'Natural live no-sweep setup must remain WATCH');
assert_same(false, $watchBlueprintState['signal']['backendConfirmed'] ?? null, 'Natural WATCH blueprints must not be backend-confirmed');
assert_same('OK', $watchBlueprintState['signal']['engineBlocker'] ?? null, 'Natural WATCH blueprint fixture must stay unblocked');
assert_true(is_array($watchBlueprintState['plan'] ?? null), 'Natural live WATCH setup must expose a read-only watch blueprint');
assert_same('watch-blueprint', $watchBlueprintState['plan']['source'] ?? null, 'Natural live WATCH setup must tag the plan as watch-blueprint');

seed_ready_build_symbol_state_fixture($wpdb, 7, 'USDCHF', 1.1141, 1.1143);
$wpdb->replace($wpdb->prefix . 'smc_sf_fundamental_bias', array(
    'currency' => 'USD',
    'composite_score' => -1.5,
    'category' => 'BEARISH',
    'updated_at' => gmdate('Y-m-d H:i:s'),
));
$fundamentalOpposedState = $buildSymbolState->invoke($instance, 7, 'USDCHF', array(
    'symbol' => 'USDCHF',
    'bid' => 1.1141,
    'ask' => 1.1143,
    'mid' => 1.1142,
    'updatedAt' => gmdate('c', time() - 5),
    'state' => 'live',
    'source' => 'mt5',
));
assert_same('ARMED', $fundamentalOpposedState['signal']['status'] ?? null, 'Opposing HTF fundamentals must cap an otherwise READY setup at ARMED');
assert_same(false, $fundamentalOpposedState['signal']['backendConfirmed'] ?? null, 'Opposing HTF fundamentals must prevent backend confirmation');
assert_same('FUNDAMENTAL_HTF_OPPOSED', $fundamentalOpposedState['signal']['engineBlocker'] ?? null, 'Opposing HTF fundamentals must surface a hard engine blocker instead of OK');
assert_same('BEARISH', $fundamentalOpposedState['signal']['engine']['fundamentalBias'] ?? null, 'Opposing HTF fundamental bias must remain visible in signal diagnostics');
assert_same(null, $fundamentalOpposedState['plan'] ?? null, 'Counter-bias ARMED setups must remain planless instead of emitting pending blueprints');

$preEntryFixture = seed_ready_build_symbol_state_fixture($wpdb, 7, 'CHFJPY', 1.1141, 1.1143);
$wpdb->replace($buildLifecycleCandidateTable, array(
    'id' => 'mt5-chfjpy-build-pre-entry',
    'user_id' => 7,
    'symbol' => 'CHFJPY',
    'direction' => $preEntryFixture['direction'],
    'status' => 'READY',
    'verdict' => 'A',
    'entry_price' => $preEntryFixture['entryPrice'],
    'sl_price' => $preEntryFixture['slPrice'],
    'tp_price' => $preEntryFixture['tpPrice'],
    'fib_level' => $preEntryFixture['fibLevel'],
    'fib_ratio' => $preEntryFixture['fibRatio'],
    'fib_family' => 'LTF_SF',
    'htf_bias' => 'BULL',
    'ltf_regime' => 'TRENDING',
    'confidence' => 0.85,
    'created_at' => gmdate('Y-m-d H:i:s', time() - 120),
    'updated_at' => gmdate('Y-m-d H:i:s', time() - 120),
));
$preEntryState = $buildSymbolState->invoke($instance, 7, 'CHFJPY', array(
    'symbol' => 'CHFJPY',
    'bid' => 1.1141,
    'ask' => 1.1143,
    'mid' => 1.1142,
    'updatedAt' => gmdate('c', time() - 5),
    'state' => 'live',
    'source' => 'mt5',
));
assert_same('ARMED', $preEntryState['signal']['status'] ?? null, 'ACTIVE_PRE_ENTRY must cap a structurally READY build_symbol_state signal at ARMED, not WATCH');
assert_same(false, $preEntryState['signal']['backendConfirmed'] ?? null, 'ACTIVE_PRE_ENTRY capped signals must not be backend-confirmed');
assert_true(is_array($preEntryState['plan'] ?? null), 'ACTIVE_PRE_ENTRY capped signals must expose a non-executable pending blueprint');
assert_same('pending-blueprint', $preEntryState['plan']['source'] ?? null, 'ACTIVE_PRE_ENTRY capped signals must tag the plan as pending-blueprint');
assert_same('ACTIVE_PRE_ENTRY', $preEntryState['diagnostic']['lifecycle']['state'] ?? null, 'ACTIVE_PRE_ENTRY lifecycle diagnostics must remain visible');
assert_same('entry_not_crossed', $preEntryState['diagnostic']['lifecycle']['reason'] ?? null, 'ACTIVE_PRE_ENTRY lifecycle reason must remain entry_not_crossed');

$pendingTradePlanRows = array_filter($wpdb->tables[$wpdb->prefix . 'smc_sf_trade_plans'] ?? array(), function ($row) use ($preEntryState) {
    return ($row['signal_id'] ?? null) === ($preEntryState['signal']['id'] ?? null);
});
assert_same(0, count($pendingTradePlanRows), 'ACTIVE_PRE_ENTRY pending blueprints must not be persisted as executable trade plan rows during build_symbol_state');

$wpdb->replace($wpdb->prefix . 'smc_sf_user_settings', array(
    'user_id' => 7,
    'settings' => json_encode(array(
        'backendUrl' => 'https://example.com/wp-json',
        'refreshIntervalSec' => 30,
        'staleThresholdSec' => 10,
        'watchlist' => array('CHFJPY'),
        'riskAllocation' => array('perTradePct' => 0.5, 'dailyMaxPct' => 2.0, 'ddCapPct' => 6.0),
    )),
    'updated_at' => gmdate('Y-m-d H:i:s'),
));
unset($GLOBALS['test_user_meta'][7]['smc_sf_engine_snapshot']);
$preEntrySnapshot = $ensureEngineSnapshot->invoke($instance, 7, true);
assert_same('pending-blueprint', $preEntrySnapshot['plans'][0]['source'] ?? null, 'ensure_engine_snapshot must expose ACTIVE_PRE_ENTRY pending blueprints in the plans payload');
$persistedPendingRows = array_filter($wpdb->tables[$wpdb->prefix . 'smc_sf_trade_plans'] ?? array(), function ($row) use ($preEntrySnapshot) {
    return ($row['signal_id'] ?? null) === ($preEntrySnapshot['plans'][0]['signalId'] ?? null);
});
assert_same(0, count($persistedPendingRows), 'ensure_engine_snapshot must not persist pending-blueprint plans as executable trade plan rows');

$wpdb->replace($wpdb->prefix . 'smc_sf_user_settings', array(
    'user_id' => 7,
    'settings' => json_encode(array(
        'backendUrl' => 'https://example.com/wp-json',
        'refreshIntervalSec' => 30,
        'staleThresholdSec' => 10,
        'watchlist' => array('NZDCAD'),
        'riskAllocation' => array('perTradePct' => 0.5, 'dailyMaxPct' => 2.0, 'ddCapPct' => 6.0),
    )),
    'updated_at' => gmdate('Y-m-d H:i:s'),
));
unset($GLOBALS['test_user_meta'][7]['smc_sf_engine_snapshot']);
$watchBlueprintSnapshot = $ensureEngineSnapshot->invoke($instance, 7, true);
assert_same('watch-blueprint', $watchBlueprintSnapshot['plans'][0]['source'] ?? null, 'ensure_engine_snapshot must expose natural WATCH blueprints in the plans payload');
$persistedWatchRows = array_filter($wpdb->tables[$wpdb->prefix . 'smc_sf_trade_plans'] ?? array(), function ($row) use ($watchBlueprintSnapshot) {
    return ($row['signal_id'] ?? null) === ($watchBlueprintSnapshot['plans'][0]['signalId'] ?? null);
});
assert_same(0, count($persistedWatchRows), 'ensure_engine_snapshot must not persist watch-blueprint plans as executable trade plan rows');

$weakDisplacementFixture = seed_ready_build_symbol_state_fixture($wpdb, 7, 'NZDCHF', 1.1134, 1.1136, 1.1093, 1.1135);
$wpdb->replace($buildLifecycleCandidateTable, array(
    'id' => 'mt5-nzdchf-build-weak-pre-entry',
    'user_id' => 7,
    'symbol' => 'NZDCHF',
    'direction' => $weakDisplacementFixture['direction'],
    'status' => 'READY',
    'verdict' => 'A',
    'entry_price' => $weakDisplacementFixture['entryPrice'],
    'sl_price' => $weakDisplacementFixture['slPrice'],
    'tp_price' => $weakDisplacementFixture['tpPrice'],
    'fib_level' => $weakDisplacementFixture['fibLevel'],
    'fib_ratio' => $weakDisplacementFixture['fibRatio'],
    'fib_family' => 'LTF_SF',
    'htf_bias' => 'BULL',
    'ltf_regime' => 'TRENDING',
    'confidence' => 0.85,
    'created_at' => gmdate('Y-m-d H:i:s', time() - 120),
    'updated_at' => gmdate('Y-m-d H:i:s', time() - 120),
));
$weakDisplacementState = $buildSymbolState->invoke($instance, 7, 'NZDCHF', array(
    'symbol' => 'NZDCHF',
    'bid' => 1.1134,
    'ask' => 1.1136,
    'mid' => 1.1135,
    'updatedAt' => gmdate('c', time() - 5),
    'state' => 'live',
    'source' => 'mt5',
));
assert_same('ARMED', $weakDisplacementState['signal']['status'] ?? null, 'Weak-displacement ACTIVE_PRE_ENTRY setup must remain ARMED');
assert_same('weak', $weakDisplacementState['signal']['engine']['displacement'] ?? null, 'Weak-displacement fixture must exercise a structural ARMED reason before lifecycle throttling');
assert_same('absent', $weakDisplacementState['signal']['engine']['mss'] ?? null, 'Weak-displacement fixture must not pass via MSS structural confirmation');
assert_same('OK', $weakDisplacementState['signal']['engineBlocker'] ?? null, 'Weak-displacement ARMED setups can still have no engine blocker');
assert_same('ACTIVE_PRE_ENTRY', $weakDisplacementState['diagnostic']['lifecycle']['state'] ?? null, 'Weak-displacement setup must still report the ACTIVE_PRE_ENTRY lifecycle');
assert_true(is_array($weakDisplacementState['plan'] ?? null), 'Sweep-present weak-displacement ARMED setups must expose a non-executable pending blueprint');
assert_same('pending-blueprint', $weakDisplacementState['plan']['source'] ?? null, 'Sweep-present weak-displacement ARMED setups must tag the plan as pending-blueprint');
$weakDisplacementTradePlanRows = array_filter($wpdb->tables[$wpdb->prefix . 'smc_sf_trade_plans'] ?? array(), function ($row) use ($weakDisplacementState) {
    return ($row['signal_id'] ?? null) === ($weakDisplacementState['signal']['id'] ?? null);
});
assert_same(0, count($weakDisplacementTradePlanRows), 'Weak-displacement pending blueprints must not be persisted as executable trade plan rows during build_symbol_state');

$openPositionFixture = seed_ready_build_symbol_state_fixture($wpdb, 7, 'EURCHF', 1.1141, 1.1143);
$wpdb->replace($buildLifecycleCandidateTable, array(
    'id' => 'mt5-eurchf-build-open-position',
    'user_id' => 7,
    'symbol' => 'EURCHF',
    'direction' => $openPositionFixture['direction'],
    'status' => 'READY',
    'verdict' => 'A',
    'entry_price' => $openPositionFixture['entryPrice'],
    'sl_price' => $openPositionFixture['slPrice'],
    'tp_price' => $openPositionFixture['tpPrice'],
    'fib_level' => $openPositionFixture['fibLevel'],
    'fib_ratio' => $openPositionFixture['fibRatio'],
    'fib_family' => 'LTF_SF',
    'htf_bias' => 'BULL',
    'ltf_regime' => 'TRENDING',
    'confidence' => 0.85,
    'created_at' => gmdate('Y-m-d H:i:s', time() - 120),
    'updated_at' => gmdate('Y-m-d H:i:s', time() - 120),
));
$wpdb->replace($buildLifecycleTradePositionsTable, array(
    'deterministic_key' => 'position:7:acct-1:term-1:build-eurchf',
    'user_id' => 7,
    'account_id' => 'acct-1',
    'terminal_id' => 'term-1',
    'position_id' => 'build-pos-eurchf',
    'symbol' => 'EURCHF',
    'normalized_symbol' => 'EURCHF',
    'direction' => 'BUY',
    'entry_price' => $openPositionFixture['entryPrice'],
    'current_price' => 1.1162,
    'sl' => $openPositionFixture['slPrice'],
    'tp' => $openPositionFixture['tpPrice'],
    'volume' => 0.1,
    'profit' => 0,
    'swap' => 0,
    'commission' => 0,
    'magic' => 123,
    'comment' => 'test',
    'opened_at' => $buildLifecycleSeenAt,
    'state' => 'open',
    'ea_version' => 'test',
    'last_seen_at' => $buildLifecycleSeenAt,
    'updated_at' => $buildLifecycleSeenAt,
    'raw_json' => '{}',
));
$openPositionState = $buildSymbolState->invoke($instance, 7, 'EURCHF', array(
    'symbol' => 'EURCHF',
    'bid' => 1.1141,
    'ask' => 1.1143,
    'mid' => 1.1142,
    'updatedAt' => gmdate('c', time() - 5),
    'state' => 'live',
    'source' => 'mt5',
));
assert_same('WATCH', $openPositionState['signal']['status'] ?? null, 'ACTIVE_OPEN_POSITION must still hard-suppress build_symbol_state to WATCH');
assert_same(false, $openPositionState['signal']['backendConfirmed'] ?? null, 'ACTIVE_OPEN_POSITION signals must not be backend-confirmed');
assert_same(null, $openPositionState['plan'] ?? null, 'ACTIVE_OPEN_POSITION signals must not generate executable trade plans');
assert_same('ACTIVE_OPEN_POSITION', $openPositionState['diagnostic']['lifecycle']['state'] ?? null, 'ACTIVE_OPEN_POSITION lifecycle diagnostics must remain visible');

$pendingOrderFixture = seed_ready_build_symbol_state_fixture($wpdb, 7, 'GBPCHF', 1.1141, 1.1143);
$wpdb->replace($buildLifecycleCandidateTable, array(
    'id' => 'mt5-gbpchf-build-pending-order',
    'user_id' => 7,
    'symbol' => 'GBPCHF',
    'direction' => $pendingOrderFixture['direction'],
    'status' => 'READY',
    'verdict' => 'A',
    'entry_price' => $pendingOrderFixture['entryPrice'],
    'sl_price' => $pendingOrderFixture['slPrice'],
    'tp_price' => $pendingOrderFixture['tpPrice'],
    'fib_level' => $pendingOrderFixture['fibLevel'],
    'fib_ratio' => $pendingOrderFixture['fibRatio'],
    'fib_family' => 'LTF_SF',
    'htf_bias' => 'BULL',
    'ltf_regime' => 'TRENDING',
    'confidence' => 0.85,
    'created_at' => gmdate('Y-m-d H:i:s', time() - 120),
    'updated_at' => gmdate('Y-m-d H:i:s', time() - 120),
));
$wpdb->replace($buildLifecycleTradeOrdersTable, array(
    'deterministic_key' => 'order:7:acct-1:term-1:build-gbpchf',
    'user_id' => 7,
    'account_id' => 'acct-1',
    'terminal_id' => 'term-1',
    'order_id' => 'build-ord-gbpchf',
    'symbol' => 'GBPCHF',
    'normalized_symbol' => 'GBPCHF',
    'order_type' => 'BUY_LIMIT',
    'direction' => 'BUY',
    'entry_price' => $pendingOrderFixture['entryPrice'],
    'sl' => $pendingOrderFixture['slPrice'],
    'tp' => $pendingOrderFixture['tpPrice'],
    'volume' => 0.1,
    'magic' => 123,
    'comment' => 'test',
    'placed_at' => $buildLifecycleSeenAt,
    'state' => 'active',
    'ea_version' => 'test',
    'last_seen_at' => $buildLifecycleSeenAt,
    'updated_at' => $buildLifecycleSeenAt,
    'raw_json' => '{}',
));
$pendingOrderState = $buildSymbolState->invoke($instance, 7, 'GBPCHF', array(
    'symbol' => 'GBPCHF',
    'bid' => 1.1141,
    'ask' => 1.1143,
    'mid' => 1.1142,
    'updatedAt' => gmdate('c', time() - 5),
    'state' => 'live',
    'source' => 'mt5',
));
assert_same('WATCH', $pendingOrderState['signal']['status'] ?? null, 'ACTIVE_PENDING_ORDER must still hard-suppress build_symbol_state to WATCH');
assert_same(false, $pendingOrderState['signal']['backendConfirmed'] ?? null, 'ACTIVE_PENDING_ORDER signals must not be backend-confirmed');
assert_same(null, $pendingOrderState['plan'] ?? null, 'ACTIVE_PENDING_ORDER signals must not generate executable trade plans');
assert_same('ACTIVE_PENDING_ORDER', $pendingOrderState['diagnostic']['lifecycle']['state'] ?? null, 'ACTIVE_PENDING_ORDER lifecycle diagnostics must remain visible');

$htfEquilibriumSymbol = 'AOVTEST';
$wpdb->replace($snapshotTable, array(
    'user_id' => 7,
    'symbol' => $htfEquilibriumSymbol,
    'bid' => 1.1018,
    'ask' => 1.1022,
    'mid' => 1.1020,
    'spread' => 2,
    'change_pct_1d' => 0,
    'source' => 'mt5',
    'state' => 'live',
    'updated_at' => gmdate('Y-m-d H:i:s', time() - 5),
));

$currentWeekStart = strtotime('monday this week 12:00 UTC');
$candleIndex = 0;
for ($weekOffset = 5; $weekOffset >= 0; $weekOffset--) {
    for ($dayOffset = 0; $dayOffset < 5; $dayOffset++) {
        $timestamp = $currentWeekStart - ($weekOffset * 7 * 86400) + ($dayOffset * 86400);
        if ($timestamp > time() - 900 || ($weekOffset === 0 && $dayOffset === 4)) {
            $timestamp = time() - 900;
        }
        $isAuthorityWeek = $weekOffset === 3;
        $open = $candleIndex === 0 ? 1.0000 : 1.0900 + ($candleIndex * 0.0002);
        $close = ($weekOffset === 0 && $dayOffset === 4) ? 1.1020 : $open + 0.0001;
        $wpdb->replace($candleTable, array(
            'user_id' => 7,
            'symbol' => $htfEquilibriumSymbol,
            'timeframe' => '15min',
            'candle_time' => gmdate('Y-m-d H:i:s', $timestamp),
            'open' => $open,
            'high' => $isAuthorityWeek ? 1.2000 : max($open, $close) + 0.0010,
            'low' => $isAuthorityWeek ? 1.0000 : min($open, $close) - 0.0010,
            'close' => $close,
            'volume' => '10',
            'source' => 'mt5',
            'created_at' => gmdate('Y-m-d H:i:s'),
        ));
        $candleIndex++;
    }
}

$htfEquilibriumState = $buildSymbolState->invoke($instance, 7, $htfEquilibriumSymbol, array(
    'symbol' => $htfEquilibriumSymbol,
    'mid' => 1.1020,
    'updatedAt' => gmdate('c', time() - 5),
    'state' => 'live',
));
assert_same('BLOCKED', $htfEquilibriumState['gate']['allow'] ?? null, 'build_symbol_state must block entries inside the HTF authority equilibrium buffer');
assert_same('AOV_EQUILIBRIUM_ZONE', $htfEquilibriumState['gate']['reason'] ?? null, 'build_symbol_state must report the AOV equilibrium-zone block reason');
assert_same('EQUILIBRIUM', $htfEquilibriumState['signal']['engine']['pdState'] ?? null, 'build_symbol_state must derive pdState from HTF authority range, not the local M15 range');
assert_true(($htfEquilibriumState['signal']['status'] ?? null) !== 'READY', 'AOV equilibrium-blocked signals must not remain READY');
assert_same(false, $htfEquilibriumState['signal']['backendConfirmed'] ?? null, 'AOV equilibrium-blocked signals must not be backend-confirmed');
assert_same('AOV_EQUILIBRIUM_ZONE', $htfEquilibriumState['signal']['engineBlocker'] ?? null, 'AOV equilibrium must surface as the signal engine blocker');
assert_same(null, $htfEquilibriumState['plan'] ?? null, 'AOV equilibrium-blocked signals must not generate executable trade plans');

$regimeResponse = $instance->post_ea_regime_snapshot(new WP_REST_Request(array(
    'regimes' => array(
        array(
            'symbol' => $htfEquilibriumSymbol,
            'htf_bias' => 'BULL',
            'ltf_regime' => 'RANGING',
            'chop_score' => 0.25,
            'ema20_d1' => 1.1000,
            'atr14_h1' => 0.0025,
            'htf_bias_high' => 1.1500,
            'htf_bias_low' => 1.0500,
        ),
    ),
)));
assert_true(is_array($regimeResponse) && !empty($regimeResponse['ok']), 'EA regime snapshot ingest should accept low-chop regime data for equilibrium blockers');
$lowChopEquilibriumState = $buildSymbolState->invoke($instance, 7, $htfEquilibriumSymbol, array(
    'symbol' => $htfEquilibriumSymbol,
    'mid' => 1.1020,
    'updatedAt' => gmdate('c', time() - 5),
    'state' => 'live',
));
assert_same('AOV_EQUILIBRIUM_ZONE', $lowChopEquilibriumState['signal']['engineBlocker'] ?? null, 'AOV equilibrium must still surface as the engine blocker at low chop');
assert_true(($lowChopEquilibriumState['signal']['status'] ?? null) !== 'ARMED', 'AOV equilibrium at low chop must not be forced to ARMED');

$regimeTable = $wpdb->prefix . 'smc_sf_regime_snapshots';
$wpdb->schemas[$regimeTable] = array_fill_keys(array(
    'id',
    'user_id',
    'symbol',
    'htf_bias',
    'ltf_regime',
    'chop_score',
    'ema20_d1',
    'atr14_h1',
    'source',
    'calculated_at',
), true);

$regimeResponse = $instance->post_ea_regime_snapshot(new WP_REST_Request(array(
    'regimes' => array(
        array(
            'symbol' => 'EURUSD',
            'htf_bias' => 'BULL',
            'ltf_regime' => 'TRENDING',
            'chop_score' => 0.25,
            'ema20_d1' => 1.1000,
            'atr14_h1' => 0.0025,
            'htf_bias_high' => 1.1500,
            'htf_bias_low' => 1.0500,
        ),
    ),
)));
assert_true(is_array($regimeResponse) && !empty($regimeResponse['ok']), 'EA regime snapshot ingest should accept HTF bias range fields');
assert_true(!empty($wpdb->schemas[$regimeTable]['htf_bias_high']), 'EA regime snapshot ingest must migrate old regime table before writing htf_bias_high');
assert_true(!empty($wpdb->schemas[$regimeTable]['htf_bias_low']), 'EA regime snapshot ingest must migrate old regime table before writing htf_bias_low');
$regimeRow = $wpdb->tables[$regimeTable]['7|EURUSD'] ?? null;
assert_true(is_array($regimeRow), 'EA regime snapshot row was not stored');
assert_true(abs((float) ($regimeRow['htf_bias_high'] ?? 0) - 1.1500) < 0.0000001, 'EA regime snapshot must persist htf_bias_high');
assert_true(abs((float) ($regimeRow['htf_bias_low'] ?? 0) - 1.0500) < 0.0000001, 'EA regime snapshot must persist htf_bias_low');

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

// Unix epoch seconds from MT5 SignalToJson() — must normalize without falling back to receipt time
$epochTs = (string) strtotime('2026-05-08 10:30:00 UTC');
assert_same('2026-05-08 10:30:00', $normalizeTs->invoke($instance, $epochTs, null), 'Unix epoch timestamps must normalize to UTC MySQL format');

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

$signalsTable = $wpdb->prefix . 'smc_sf_signals';
$wpdb->replace($signalsTable, array(
    'id' => 'pine-eurusd-1',
    'user_id' => 7,
    'symbol' => 'EURUSD',
    'direction' => 'LONG',
    'status' => 'READY',
    'verdict' => 'A',
    'confluence' => json_encode(array('HTA_SF', 'LTF_SF')),
    'engine' => json_encode(array('ltfLevel' => array('price' => 1.1000))),
    'backend_confirmed' => 1,
    'created_at' => '2026-05-08 10:29:00',
    'updated_at' => '2026-05-08 10:29:00',
));

$candidateResponse = $instance->post_ea_signal_candidates(new WP_REST_Request(array(
    'candidates' => array(
        array(
            'id' => 'mt5-eurusd-1',
            'symbol' => 'EURUSD',
            'direction' => 'LONG',
            'status' => 'READY',
            'verdict' => 'A',
            'entry_price' => 1.1015,
            'sl_price' => 1.0990,
            'tp_price' => 1.1065,
            'fib_level' => 1.1010,
            'fib_ratio' => 62.5,
            'fib_family' => 'LTF_SF',
            'htf_bias' => 'BULL',
            'ltf_regime' => 'TRENDING',
            'confidence' => 0.85,
            'created_at' => $epochTs,
        ),
    ),
)));
assert_true(is_array($candidateResponse) && !empty($candidateResponse['ok']), 'EA signal candidate ingest should accept a valid MT5 payload');

$candidateTable = $wpdb->prefix . 'smc_sf_mt5_signal_candidates';
$candidateRow = $wpdb->tables[$candidateTable]['mt5-eurusd-1'] ?? null;
assert_true(is_array($candidateRow), 'EA signal candidate row was not stored');
assert_same('2026-05-08 10:30:00', $candidateRow['created_at'], 'EA signal candidates must persist the MT5 created_at timestamp, not receipt time');
assert_same('EXACT', $candidateRow['pine_match'], 'EA signal candidates must classify Pine drift using the latest Pine signal row');
assert_true(abs((float) ($candidateRow['drift_pips'] ?? -1) - 15.0) < 0.0001, 'EA signal candidates must persist computed drift_pips for parity diagnostics');

$wpdb->replace($signalsTable, array(
    'id' => 'pine-eurusd-2',
    'user_id' => 7,
    'symbol' => 'EURUSD',
    'direction' => 'SHORT',
    'status' => 'READY',
    'verdict' => 'A',
    'confluence' => json_encode(array('HTA_SF', 'LTF_SF')),
    'engine' => json_encode(array()),
    'backend_confirmed' => 1,
    'created_at' => '2026-05-08 10:31:00',
    'updated_at' => '2026-05-08 10:31:00',
));

$mismatchResponse = $instance->post_ea_signal_candidates(new WP_REST_Request(array(
    'candidates' => array(
        array(
            'id' => 'mt5-eurusd-2',
            'symbol' => 'EURUSD',
            'direction' => 'LONG',
            'status' => 'READY',
            'verdict' => 'A',
            'entry_price' => 1.1015,
            'sl_price' => 1.0990,
            'tp_price' => 1.1065,
            'fib_level' => 1.1010,
            'fib_ratio' => 62.5,
            'fib_family' => 'LTF_SF',
            'htf_bias' => 'BULL',
            'ltf_regime' => 'TRENDING',
            'confidence' => 0.85,
            'created_at' => (string) strtotime('2026-05-08 10:32:00 UTC'),
        ),
    ),
)));
assert_true(is_array($mismatchResponse) && !empty($mismatchResponse['ok']), 'EA signal candidate ingest should accept a mismatched-direction payload');

$mismatchRow = $wpdb->tables[$candidateTable]['mt5-eurusd-2'] ?? null;
assert_true(is_array($mismatchRow), 'Mismatched-direction EA signal candidate row was not stored');
assert_same('MISMATCH', $mismatchRow['pine_match'], 'Opposite-direction Pine signals must stay classified as MISMATCH even when Pine engine JSON lacks ltfLevel.price');
assert_same(null, $mismatchRow['drift_pips'], 'Opposite-direction Pine signals without an entry price must not fabricate drift_pips');

$tradeTelemetrySeenAt = gmdate('Y-m-d H:i:s');
$accountTelemetryTable = $wpdb->prefix . 'smc_sf_account_telemetry';
$tradePositionsTable = $wpdb->prefix . 'smc_sf_trade_positions';
$tradeOrdersTable = $wpdb->prefix . 'smc_sf_trade_orders';

$wpdb->replace($accountTelemetryTable, array(
    'id' => 'acct-telemetry-1',
    'user_id' => 7,
    'account_id' => 'acct-1',
    'terminal_id' => 'term-1',
    'balance' => 10000,
    'equity' => 10000,
    'margin' => 0,
    'free_margin' => 10000,
    'margin_level' => 0,
    'floating_pl' => 0,
    'currency' => 'USD',
    'leverage' => 100,
    'ea_version' => 'test',
    'last_seen_at' => $tradeTelemetrySeenAt,
    'updated_at' => $tradeTelemetrySeenAt,
    'raw_json' => '{}',
));

$wpdb->replace($snapshotTable, array(
    'user_id' => 7,
    'symbol' => 'GBPUSD',
    'bid' => 1.2498,
    'ask' => 1.2500,
    'mid' => 1.2499,
    'change_pct_1d' => 0.1,
    'source' => 'mt5',
    'updated_at' => $tradeTelemetrySeenAt,
    'state' => 'live',
));

$preEntryCountBefore = count($wpdb->tables[$candidateTable] ?? array());
$preEntryFirstResponse = $instance->post_ea_signal_candidates(new WP_REST_Request(array(
    'candidates' => array(
        array(
            'id' => 'mt5-gbpusd-pre-1',
            'symbol' => 'GBPUSD',
            'direction' => 'LONG',
            'status' => 'READY',
            'verdict' => 'A',
            'entry_price' => 1.2505,
            'sl_price' => 1.2480,
            'tp_price' => 1.2555,
            'fib_level' => 1.2500,
            'fib_ratio' => 61.8,
            'fib_family' => 'LTF_SF',
            'htf_bias' => 'BULL',
            'ltf_regime' => 'TRENDING',
            'confidence' => 0.8,
            'created_at' => gmdate('Y-m-d H:i:s', time() - 120),
        ),
    ),
)));
assert_true(is_array($preEntryFirstResponse) && !empty($preEntryFirstResponse['ok']), 'Pre-entry MT5 candidate ingest should accept the first candidate');
$preEntrySecondResponse = $instance->post_ea_signal_candidates(new WP_REST_Request(array(
    'candidates' => array(
        array(
            'id' => 'mt5-gbpusd-pre-2',
            'symbol' => 'GBPUSD',
            'direction' => 'LONG',
            'status' => 'READY',
            'verdict' => 'A',
            'entry_price' => 1.2505,
            'sl_price' => 1.2480,
            'tp_price' => 1.2555,
            'fib_level' => 1.25005,
            'fib_ratio' => 61.8,
            'fib_family' => 'LTF_SF',
            'htf_bias' => 'BULL',
            'ltf_regime' => 'TRENDING',
            'confidence' => 0.82,
            'created_at' => gmdate('Y-m-d H:i:s', time() - 60),
        ),
    ),
)));
assert_true(is_array($preEntrySecondResponse) && !empty($preEntrySecondResponse['ok']), 'Pre-entry duplicate MT5 candidate should fail open at the response layer');
assert_true(isset($wpdb->tables[$candidateTable]['mt5-gbpusd-pre-1']), 'Pre-entry baseline candidate row should remain stored');
assert_true(!isset($wpdb->tables[$candidateTable]['mt5-gbpusd-pre-2']), 'Pre-entry duplicate MT5 candidate must be suppressed while the prior signal remains valid');
assert_same($preEntryCountBefore + 1, count($wpdb->tables[$candidateTable] ?? array()), 'Pre-entry suppression must keep one stored candidate for the same live range');


$wpdb->replace($snapshotTable, array(
    'user_id' => 7,
    'symbol' => 'USDCHF',
    'bid' => 0.9200,
    'ask' => 0.9202,
    'mid' => 0.9201,
    'change_pct_1d' => 0.1,
    'source' => 'mt5',
    'updated_at' => $tradeTelemetrySeenAt,
    'state' => 'live',
));
$directionFlipCountBefore = count($wpdb->tables[$candidateTable] ?? array());
$directionFlipShortResponse = $instance->post_ea_signal_candidates(new WP_REST_Request(array(
    'candidates' => array(
        array(
            'id' => 'mt5-usdchf-flip-short',
            'symbol' => 'USDCHF',
            'direction' => 'SHORT',
            'status' => 'READY',
            'verdict' => 'A',
            'entry_price' => 0.9195,
            'sl_price' => 0.9220,
            'tp_price' => 0.9145,
            'fib_level' => 0.9200,
            'fib_ratio' => 61.8,
            'fib_family' => 'LTF_SF',
            'htf_bias' => 'BEAR',
            'ltf_regime' => 'TRENDING',
            'confidence' => 0.8,
            'created_at' => gmdate('Y-m-d H:i:s', time() - 120),
        ),
    ),
)));
assert_true(is_array($directionFlipShortResponse) && !empty($directionFlipShortResponse['ok']), 'Direction-flip baseline MT5 candidate ingest should accept the first candidate');
$directionFlipLongResponse = $instance->post_ea_signal_candidates(new WP_REST_Request(array(
    'candidates' => array(
        array(
            'id' => 'mt5-usdchf-flip-long',
            'symbol' => 'USDCHF',
            'direction' => 'LONG',
            'status' => 'READY',
            'verdict' => 'A',
            'entry_price' => 0.9210,
            'sl_price' => 0.9185,
            'tp_price' => 0.9260,
            'fib_level' => 0.92005,
            'fib_ratio' => 61.8,
            'fib_family' => 'LTF_SF',
            'htf_bias' => 'BULL',
            'ltf_regime' => 'TRENDING',
            'confidence' => 0.82,
            'created_at' => gmdate('Y-m-d H:i:s', time() - 60),
        ),
    ),
)));
assert_true(is_array($directionFlipLongResponse) && !empty($directionFlipLongResponse['ok']), 'Opposite-direction MT5 candidate should return a successful response');
assert_true(isset($wpdb->tables[$candidateTable]['mt5-usdchf-flip-short']), 'Direction-flip baseline candidate row should remain stored');
assert_true(isset($wpdb->tables[$candidateTable]['mt5-usdchf-flip-long']), 'Opposite-direction READY candidate at the same fib range must be accepted');
assert_same($directionFlipCountBefore + 2, count($wpdb->tables[$candidateTable] ?? array()), 'MT5 lifecycle duplicate lookup must be scoped to the incoming direction');

$wpdb->replace($snapshotTable, array(
    'user_id' => 7,
    'symbol' => 'USDCAD',
    'bid' => 1.3498,
    'ask' => 1.3500,
    'mid' => 1.3499,
    'change_pct_1d' => 0.1,
    'source' => 'mt5',
    'updated_at' => $tradeTelemetrySeenAt,
    'state' => 'live',
));
$multiRangeCountBefore = count($wpdb->tables[$candidateTable] ?? array());
$multiRangeFirstResponse = $instance->post_ea_signal_candidates(new WP_REST_Request(array(
    'candidates' => array(
        array(
            'id' => 'mt5-usdcad-range-1',
            'symbol' => 'USDCAD',
            'direction' => 'LONG',
            'status' => 'READY',
            'verdict' => 'A',
            'entry_price' => 1.3505,
            'sl_price' => 1.3480,
            'tp_price' => 1.3555,
            'fib_level' => 1.3500,
            'fib_ratio' => 61.8,
            'fib_family' => 'LTF_SF',
            'htf_bias' => 'BULL',
            'ltf_regime' => 'TRENDING',
            'confidence' => 0.8,
            'created_at' => gmdate('Y-m-d H:i:s', time() - 180),
        ),
    ),
)));
assert_true(is_array($multiRangeFirstResponse) && !empty($multiRangeFirstResponse['ok']), 'Multi-range MT5 candidate ingest should accept the older in-range candidate');
$multiRangeOtherResponse = $instance->post_ea_signal_candidates(new WP_REST_Request(array(
    'candidates' => array(
        array(
            'id' => 'mt5-usdcad-range-2',
            'symbol' => 'USDCAD',
            'direction' => 'LONG',
            'status' => 'READY',
            'verdict' => 'A',
            'entry_price' => 1.3530,
            'sl_price' => 1.3505,
            'tp_price' => 1.3580,
            'fib_level' => 1.3525,
            'fib_ratio' => 61.8,
            'fib_family' => 'LTF_SF',
            'htf_bias' => 'BULL',
            'ltf_regime' => 'TRENDING',
            'confidence' => 0.81,
            'created_at' => gmdate('Y-m-d H:i:s', time() - 120),
        ),
    ),
)));
assert_true(is_array($multiRangeOtherResponse) && !empty($multiRangeOtherResponse['ok']), 'Multi-range MT5 candidate ingest should accept a newer candidate from a different fib range');
$multiRangeDuplicateResponse = $instance->post_ea_signal_candidates(new WP_REST_Request(array(
    'candidates' => array(
        array(
            'id' => 'mt5-usdcad-range-3',
            'symbol' => 'USDCAD',
            'direction' => 'LONG',
            'status' => 'READY',
            'verdict' => 'A',
            'entry_price' => 1.3505,
            'sl_price' => 1.3480,
            'tp_price' => 1.3555,
            'fib_level' => 1.35005,
            'fib_ratio' => 61.8,
            'fib_family' => 'LTF_SF',
            'htf_bias' => 'BULL',
            'ltf_regime' => 'TRENDING',
            'confidence' => 0.82,
            'created_at' => gmdate('Y-m-d H:i:s', time() - 60),
        ),
    ),
)));
assert_true(is_array($multiRangeDuplicateResponse) && !empty($multiRangeDuplicateResponse['ok']), 'Multi-range duplicate MT5 candidate should return a successful response');
assert_true(isset($wpdb->tables[$candidateTable]['mt5-usdcad-range-1']), 'Older in-range multi-range candidate row should remain stored');
assert_true(isset($wpdb->tables[$candidateTable]['mt5-usdcad-range-2']), 'Newer out-of-range multi-range candidate row should remain stored');
assert_true(!isset($wpdb->tables[$candidateTable]['mt5-usdcad-range-3']), 'Duplicate MT5 candidate must be suppressed by the older in-range tuple row even when a newer out-of-range tuple row exists');
assert_same($multiRangeCountBefore + 2, count($wpdb->tables[$candidateTable] ?? array()), 'Multi-range suppression must scan past newer out-of-range tuple rows before releasing duplicates');

$wpdb->replace($snapshotTable, array(
    'user_id' => 7,
    'symbol' => 'AUDUSD',
    'bid' => 0.6610,
    'ask' => 0.6612,
    'mid' => 0.6611,
    'change_pct_1d' => 0.1,
    'source' => 'mt5',
    'updated_at' => $tradeTelemetrySeenAt,
    'state' => 'live',
));
$openPositionCountBefore = count($wpdb->tables[$candidateTable] ?? array());
$openPositionFirstResponse = $instance->post_ea_signal_candidates(new WP_REST_Request(array(
    'candidates' => array(
        array(
            'id' => 'mt5-audusd-pos-1',
            'symbol' => 'AUDUSD',
            'direction' => 'LONG',
            'status' => 'READY',
            'verdict' => 'A',
            'entry_price' => 0.6605,
            'sl_price' => 0.6580,
            'tp_price' => 0.6655,
            'fib_level' => 0.6600,
            'fib_ratio' => 62.5,
            'fib_family' => 'HTF_AF',
            'htf_bias' => 'BULL',
            'ltf_regime' => 'TRENDING',
            'confidence' => 0.86,
            'created_at' => gmdate('Y-m-d H:i:s', time() - 50),
        ),
    ),
)));
assert_true(is_array($openPositionFirstResponse) && !empty($openPositionFirstResponse['ok']), 'Open-position MT5 candidate ingest should accept the first candidate');
$wpdb->replace($tradePositionsTable, array(
    'deterministic_key' => 'position:7:acct-1:term-1:pos-1',
    'user_id' => 7,
    'account_id' => 'acct-1',
    'terminal_id' => 'term-1',
    'position_id' => 'pos-1',
    'symbol' => 'AUDUSD',
    'normalized_symbol' => 'AUDUSD',
    'direction' => 'BUY',
    'entry_price' => 0.6605,
    'current_price' => 0.6611,
    'sl' => 0.6580,
    'tp' => 0.6655,
    'volume' => 0.1,
    'profit' => 0,
    'swap' => 0,
    'commission' => 0,
    'magic' => 123,
    'comment' => 'test',
    'opened_at' => $tradeTelemetrySeenAt,
    'state' => 'open',
    'ea_version' => 'test',
    'last_seen_at' => $tradeTelemetrySeenAt,
    'updated_at' => $tradeTelemetrySeenAt,
    'raw_json' => '{}',
));
$openPositionSecondResponse = $instance->post_ea_signal_candidates(new WP_REST_Request(array(
    'candidates' => array(
        array(
            'id' => 'mt5-audusd-pos-2',
            'symbol' => 'AUDUSD',
            'direction' => 'LONG',
            'status' => 'READY',
            'verdict' => 'A',
            'entry_price' => 0.6605,
            'sl_price' => 0.6580,
            'tp_price' => 0.6655,
            'fib_level' => 0.66005,
            'fib_ratio' => 62.5,
            'fib_family' => 'HTF_AF',
            'htf_bias' => 'BULL',
            'ltf_regime' => 'TRENDING',
            'confidence' => 0.84,
            'created_at' => gmdate('Y-m-d H:i:s', time() - 40),
        ),
    ),
)));
assert_true(is_array($openPositionSecondResponse) && !empty($openPositionSecondResponse['ok']), 'Open-position duplicate MT5 candidate should return a successful response');
assert_true(isset($wpdb->tables[$candidateTable]['mt5-audusd-pos-1']), 'Open-position baseline candidate row should remain stored');
assert_true(!isset($wpdb->tables[$candidateTable]['mt5-audusd-pos-2']), 'Duplicate MT5 candidate must be suppressed when a matching live open position exists');
assert_same($openPositionCountBefore + 1, count($wpdb->tables[$candidateTable] ?? array()), 'Open-position suppression must keep one stored candidate for the same live range');

$wpdb->replace($snapshotTable, array(
    'user_id' => 7,
    'symbol' => 'NZDUSD',
    'bid' => 0.6110,
    'ask' => 0.6112,
    'mid' => 0.6111,
    'change_pct_1d' => 0.1,
    'source' => 'mt5',
    'updated_at' => $tradeTelemetrySeenAt,
    'state' => 'live',
));
$pendingOrderCountBefore = count($wpdb->tables[$candidateTable] ?? array());
$pendingOrderFirstResponse = $instance->post_ea_signal_candidates(new WP_REST_Request(array(
    'candidates' => array(
        array(
            'id' => 'mt5-nzdusd-ord-1',
            'symbol' => 'NZDUSD',
            'direction' => 'LONG',
            'status' => 'READY',
            'verdict' => 'A',
            'entry_price' => 0.6105,
            'sl_price' => 0.6080,
            'tp_price' => 0.6155,
            'fib_level' => 0.6100,
            'fib_ratio' => 50.0,
            'fib_family' => 'LTF_SF',
            'htf_bias' => 'BULL',
            'ltf_regime' => 'RANGING',
            'confidence' => 0.78,
            'created_at' => gmdate('Y-m-d H:i:s', time() - 30),
        ),
    ),
)));
assert_true(is_array($pendingOrderFirstResponse) && !empty($pendingOrderFirstResponse['ok']), 'Pending-order MT5 candidate ingest should accept the first candidate');
$wpdb->replace($tradeOrdersTable, array(
    'deterministic_key' => 'order:7:acct-1:term-1:ord-1',
    'user_id' => 7,
    'account_id' => 'acct-1',
    'terminal_id' => 'term-1',
    'order_id' => 'ord-1',
    'symbol' => 'NZDUSD',
    'normalized_symbol' => 'NZDUSD',
    'order_type' => 'BUY_LIMIT',
    'direction' => 'BUY',
    'entry_price' => 0.6105,
    'sl' => 0.6080,
    'tp' => 0.6155,
    'volume' => 0.1,
    'magic' => 123,
    'comment' => 'test',
    'placed_at' => $tradeTelemetrySeenAt,
    'state' => 'active',
    'ea_version' => 'test',
    'last_seen_at' => $tradeTelemetrySeenAt,
    'updated_at' => $tradeTelemetrySeenAt,
    'raw_json' => '{}',
));
$pendingOrderSecondResponse = $instance->post_ea_signal_candidates(new WP_REST_Request(array(
    'candidates' => array(
        array(
            'id' => 'mt5-nzdusd-ord-2',
            'symbol' => 'NZDUSD',
            'direction' => 'LONG',
            'status' => 'READY',
            'verdict' => 'A',
            'entry_price' => 0.6105,
            'sl_price' => 0.6080,
            'tp_price' => 0.6155,
            'fib_level' => 0.61008,
            'fib_ratio' => 50.0,
            'fib_family' => 'LTF_SF',
            'htf_bias' => 'BULL',
            'ltf_regime' => 'RANGING',
            'confidence' => 0.79,
            'created_at' => gmdate('Y-m-d H:i:s', time() - 20),
        ),
    ),
)));
assert_true(is_array($pendingOrderSecondResponse) && !empty($pendingOrderSecondResponse['ok']), 'Pending-order duplicate MT5 candidate should return a successful response');
assert_true(isset($wpdb->tables[$candidateTable]['mt5-nzdusd-ord-1']), 'Pending-order baseline candidate row should remain stored');
assert_true(!isset($wpdb->tables[$candidateTable]['mt5-nzdusd-ord-2']), 'Duplicate MT5 candidate must be suppressed when a matching live pending order exists');
assert_same($pendingOrderCountBefore + 1, count($wpdb->tables[$candidateTable] ?? array()), 'Pending-order suppression must keep one stored candidate for the same live range');

$wpdb->replace($snapshotTable, array(
    'user_id' => 7,
    'symbol' => 'EURGBP',
    'bid' => 0.8510,
    'ask' => 0.8512,
    'mid' => 0.8511,
    'change_pct_1d' => 0.1,
    'source' => 'mt5',
    'updated_at' => $tradeTelemetrySeenAt,
    'state' => 'live',
));
$postEntryCountBefore = count($wpdb->tables[$candidateTable] ?? array());
$postEntryFirstResponse = $instance->post_ea_signal_candidates(new WP_REST_Request(array(
    'candidates' => array(
        array(
            'id' => 'mt5-eurgbp-release-1',
            'symbol' => 'EURGBP',
            'direction' => 'LONG',
            'status' => 'READY',
            'verdict' => 'A',
            'entry_price' => 0.8505,
            'sl_price' => 0.8480,
            'tp_price' => 0.8555,
            'fib_level' => 0.8500,
            'fib_ratio' => 70.5,
            'fib_family' => 'HTF_AF',
            'htf_bias' => 'BULL',
            'ltf_regime' => 'TRENDING',
            'confidence' => 0.88,
            'created_at' => gmdate('Y-m-d H:i:s', time() - 10),
        ),
    ),
)));
assert_true(is_array($postEntryFirstResponse) && !empty($postEntryFirstResponse['ok']), 'Post-entry MT5 candidate ingest should accept the first candidate');
$postEntrySecondResponse = $instance->post_ea_signal_candidates(new WP_REST_Request(array(
    'candidates' => array(
        array(
            'id' => 'mt5-eurgbp-release-2',
            'symbol' => 'EURGBP',
            'direction' => 'LONG',
            'status' => 'READY',
            'verdict' => 'A',
            'entry_price' => 0.8505,
            'sl_price' => 0.8480,
            'tp_price' => 0.8555,
            'fib_level' => 0.85006,
            'fib_ratio' => 70.5,
            'fib_family' => 'HTF_AF',
            'htf_bias' => 'BULL',
            'ltf_regime' => 'TRENDING',
            'confidence' => 0.9,
            'created_at' => gmdate('Y-m-d H:i:s', time() - 5),
        ),
    ),
)));
assert_true(is_array($postEntrySecondResponse) && !empty($postEntrySecondResponse['ok']), 'Post-entry replacement MT5 candidate should return a successful response');
assert_true(isset($wpdb->tables[$candidateTable]['mt5-eurgbp-release-1']), 'Post-entry baseline candidate row should remain stored');
assert_true(isset($wpdb->tables[$candidateTable]['mt5-eurgbp-release-2']), 'A new MT5 candidate must be accepted after entry is crossed when no fresh matching trade state exists');
assert_same($postEntryCountBefore + 2, count($wpdb->tables[$candidateTable] ?? array()), 'Post-entry replacement must store a new candidate once the prior lifecycle is no longer active');

fwrite(STDOUT, 'mt5 snapshot contract checks passed' . PHP_EOL);
