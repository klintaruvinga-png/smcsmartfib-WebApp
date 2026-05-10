<?php

define('ABSPATH', __DIR__ . '/');
define('ARRAY_A', 'ARRAY_A');

$GLOBALS['test_registered_routes'] = array();
$GLOBALS['test_transients'] = array();
$GLOBALS['test_user_meta'] = array();
$GLOBALS['test_current_user_id'] = 7;
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

        public function __construct($params = array()) {
            $this->params = is_array($params) ? $params : array();
        }

        public function get_json_params() {
            return $this->params;
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
        public $insert_id = 0;
        public $last_error = '';
        public $queries = array();
        private $next_ids = array();

        public function replace($table, $data, $formats = array()) {
            if (!isset($this->tables[$table])) {
                $this->tables[$table] = array();
            }
            $key = $this->row_key($table, $data);
            if (!isset($data['id']) && $this->uses_auto_increment($table)) {
                $data['id'] = $this->next_id($table);
            }
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

            if ($this->uses_auto_increment($table)) {
                $data['id'] = $this->next_id($table);
                $this->insert_id = (int) $data['id'];
            }

            $this->tables[$table][] = $data;
            return 1;
        }

        public function query($sql) {
            $this->queries[] = $sql;

            if (preg_match("/^DELETE FROM ([^ ]+) WHERE created_at < '([^']+)'$/", $sql, $matches)) {
                $table = $matches[1];
                $cutoff = $matches[2];
                $rows = $this->tables[$table] ?? array();
                $kept = array();
                foreach ($rows as $row) {
                    if (($row['created_at'] ?? '') >= $cutoff) {
                        $kept[] = $row;
                    }
                }
                $this->tables[$table] = $kept;
                return count($rows) - count($kept);
            }

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
            if (preg_match("/SELECT settings FROM ([^ ]+) WHERE user_id = (\d+)/", $query, $matches)) {
                $table = $matches[1];
                $user_id = (int) $matches[2];
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) $row['user_id'] === $user_id) {
                        return $row['settings'];
                    }
                }
                return null;
            }

            if (preg_match("/SELECT key_status FROM ([^ ]+) WHERE user_id = (\d+) AND provider = '([^']+)'/", $query)) {
                return null;
            }

            if (preg_match("/SELECT MAX\((updated_at|created_at)\) FROM ([^ ]+) WHERE user_id = (\d+)/", $query, $matches)) {
                $column = $matches[1];
                $table = $matches[2];
                $user_id = (int) $matches[3];
                $values = array();
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) === $user_id && !empty($row[$column])) {
                        $values[] = $row[$column];
                    }
                }
                if (empty($values)) {
                    return null;
                }
                sort($values);
                return end($values);
            }

            if (preg_match("/SELECT COUNT\(\*\) FROM ([^ ]+) WHERE user_id = (\d+) AND symbol = '([^']+)' AND source = 'mt5'/", $query, $matches)) {
                $table = $matches[1];
                $user_id = (int) $matches[2];
                $symbol = $matches[3];
                $count = 0;
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) === $user_id && ($row['symbol'] ?? '') === $symbol && ($row['source'] ?? '') === 'mt5') {
                        $count++;
                    }
                }
                return $count;
            }

            if (preg_match("/SELECT COUNT\(\*\) FROM ([^ ]+) WHERE user_id = (\d+) AND symbol = '([^']+)' AND \(source = 'twelve-data' OR source IS NULL OR source = ''\)/", $query, $matches)) {
                return 0;
            }

            if (preg_match("/SELECT COUNT\(\*\) FROM ([^ ]+) WHERE user_id = (\d+) AND updated_at >= '([^']+)'/", $query, $matches)) {
                $table = $matches[1];
                $user_id = (int) $matches[2];
                $cutoff = $matches[3];
                $count = 0;
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) === $user_id && ($row['updated_at'] ?? '') >= $cutoff) {
                        $count++;
                    }
                }
                return $count;
            }

            if (preg_match("/SELECT COUNT\(\*\) FROM ([^ ]+) WHERE user_id = (\d+) AND created_at >= '([^']+)'/", $query, $matches)) {
                $table = $matches[1];
                $user_id = (int) $matches[2];
                $cutoff = $matches[3];
                $count = 0;
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) === $user_id && ($row['created_at'] ?? '') >= $cutoff) {
                        $count++;
                    }
                }
                return $count;
            }

            return null;
        }

        public function get_row($query, $output = ARRAY_A) {
            if (preg_match("/SELECT \* FROM ([^ ]+) WHERE user_id = (\d+) AND symbol = '([^']+)'(?: AND source = '([^']+)')?/", $query, $matches)) {
                $table = $matches[1];
                $user_id = (int) $matches[2];
                $symbol = $matches[3];
                $source = $matches[4] ?? null;
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) !== $user_id || ($row['symbol'] ?? '') !== $symbol) {
                        continue;
                    }
                    if ($source !== null && ($row['source'] ?? '') !== $source) {
                        continue;
                    }
                    return $row;
                }
                return null;
            }

            if (preg_match("/SELECT \* FROM ([^ ]+) WHERE evidence_key = '([^']+)'/", $query, $matches)) {
                $table = $matches[1];
                $evidence_key = $matches[2];
                foreach ($this->tables[$table] ?? array() as $row) {
                    if (($row['evidence_key'] ?? '') === $evidence_key) {
                        return $row;
                    }
                }
                return null;
            }

            if (preg_match("/SELECT COUNT\(\*\) AS total_24h,\s+SUM\(CASE WHEN status = 'complete' THEN 1 ELSE 0 END\) AS success_24h,\s+SUM\(CASE WHEN status NOT IN \('complete', 'heartbeat'\) THEN 1 ELSE 0 END\) AS error_24h,\s+MAX\(created_at\) AS last_run_at\s+FROM ([^ ]+)\s+WHERE user_id = (\d+) AND created_at >= '([^']+)'/s", $query, $matches)) {
                $table = $matches[1];
                $user_id = (int) $matches[2];
                $cutoff = $matches[3];
                $total = 0;
                $success = 0;
                $error = 0;
                $last_run_at = null;
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) !== $user_id || ($row['created_at'] ?? '') < $cutoff) {
                        continue;
                    }
                    $total++;
                    if (($row['status'] ?? '') === 'complete') {
                        $success++;
                    } elseif (($row['status'] ?? '') !== 'heartbeat') {
                        $error++;
                    }
                    if ($last_run_at === null || ($row['created_at'] ?? '') > $last_run_at) {
                        $last_run_at = $row['created_at'];
                    }
                }
                return array(
                    'total_24h' => $total,
                    'success_24h' => $success,
                    'error_24h' => $error,
                    'last_run_at' => $last_run_at,
                );
            }

            if (preg_match("/SELECT COUNT\(\*\) AS total_24h,\s+SUM\(CASE\s+WHEN event_type LIKE '%%error%%'\s+OR event_type LIKE '%%invalid%%'\s+OR event_type LIKE '%%failed%%'\s+OR event_type LIKE '%%rejected%%'\s+THEN 1 ELSE 0 END\) AS error_count_24h,\s+SUM\(CASE\s+WHEN event_type LIKE '%%warning%%'\s+OR event_type LIKE '%%stale%%'\s+OR event_type LIKE '%%rate_limit%%'\s+OR event_type LIKE '%%blocked%%'\s+THEN 1 ELSE 0 END\) AS warning_count_24h\s+FROM ([^ ]+)\s+WHERE user_id = (\d+) AND created_at >= '([^']+)'/s", $query, $matches)) {
                $table = $matches[1];
                $user_id = (int) $matches[2];
                $cutoff = $matches[3];
                $total = 0;
                $error = 0;
                $warning = 0;
                foreach ($this->tables[$table] ?? array() as $row) {
                    $event_type = (string) ($row['event_type'] ?? '');
                    if ((int) ($row['user_id'] ?? 0) !== $user_id || ($row['created_at'] ?? '') < $cutoff) {
                        continue;
                    }
                    $total++;
                    if (strpos($event_type, 'error') !== false || strpos($event_type, 'invalid') !== false || strpos($event_type, 'failed') !== false || strpos($event_type, 'rejected') !== false) {
                        $error++;
                    }
                    if (strpos($event_type, 'warning') !== false || strpos($event_type, 'stale') !== false || strpos($event_type, 'rate_limit') !== false || strpos($event_type, 'blocked') !== false) {
                        $warning++;
                    }
                }
                return array(
                    'total_24h' => $total,
                    'error_count_24h' => $error,
                    'warning_count_24h' => $warning,
                );
            }

            return null;
        }

        public function get_results($query, $output = ARRAY_A) {
            if (preg_match("/SELECT candle_time, open, high, low, close(?:, volume)?(?:, source)? FROM ([^ ]+) WHERE user_id = (\d+) AND symbol = '([^']+)' AND timeframe = '([^']+)'(?: AND source = '([^']+)')? ORDER BY candle_time (ASC|DESC)(?: LIMIT (\d+))?/", $query, $matches)) {
                $table = $matches[1];
                $user_id = (int) $matches[2];
                $symbol = $matches[3];
                $timeframe = $matches[4];
                $source = $matches[5] ?? null;
                $direction = $matches[6] ?? 'ASC';
                $limit = isset($matches[7]) && $matches[7] !== '' ? (int) $matches[7] : null;
                $rows = array();
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) !== $user_id || ($row['symbol'] ?? '') !== $symbol || ($row['timeframe'] ?? '') !== $timeframe) {
                        continue;
                    }
                    if ($source !== null && $source !== '' && ($row['source'] ?? '') !== $source) {
                        continue;
                    }
                    $rows[] = $row;
                }
                usort($rows, function ($a, $b) use ($direction) {
                    $cmp = strcmp($a['candle_time'], $b['candle_time']);
                    return $direction === 'DESC' ? -1 * $cmp : $cmp;
                });
                if ($limit !== null) {
                    $rows = array_slice($rows, 0, $limit);
                }
                return $rows;
            }

            if (preg_match("/SELECT \* FROM ([^ ]+) ORDER BY updated_at DESC/", $query, $matches)) {
                $table = $matches[1];
                $rows = array_values($this->tables[$table] ?? array());
                usort($rows, function ($a, $b) {
                    return strcmp($b['updated_at'] ?? '', $a['updated_at'] ?? '');
                });
                return $rows;
            }

            if (preg_match("/SELECT \* FROM ([^ ]+) WHERE created_at >= '([^']+)' ORDER BY created_at DESC/", $query, $matches)) {
                $table = $matches[1];
                $cutoff = $matches[2];
                $rows = array_values($this->tables[$table] ?? array());
                $rows = array_values(array_filter($rows, function ($row) use ($cutoff) {
                    return ($row['created_at'] ?? '') >= $cutoff;
                }));
                usort($rows, function ($a, $b) {
                    return strcmp($b['created_at'] ?? '', $a['created_at'] ?? '');
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
            if (substr($table, -13) === 'soak_evidence') {
                return (string) $data['evidence_key'];
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

        private function uses_auto_increment($table) {
            return preg_match('/(engine_runs|audit_events|soak_evidence|soak_checkpoints)$/', $table) === 1;
        }

        private function next_id($table) {
            if (!isset($this->next_ids[$table])) {
                $this->next_ids[$table] = 1;
            }
            return $this->next_ids[$table]++;
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
if (!function_exists('dbDelta')) {
    function dbDelta($sql) {
        return $sql;
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
if (!function_exists('sanitize_textarea_field')) {
    function sanitize_textarea_field($value) {
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
        return strtolower(preg_replace('/[^a-zA-Z0-9_\-]/', '', (string) $key));
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
        unset($GLOBALS['test_user_meta'][$user_id][$key]);
        return true;
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

$soakReportRoute = null;
$soakEvidenceRoute = null;
$soakCheckpointRoute = null;
foreach ($GLOBALS['test_registered_routes'] as $route) {
    if ($route['namespace'] !== 'sniper/v1') {
        continue;
    }
    if ($route['route'] === '/admin/soak-report' && $route['args']['methods'] === WP_REST_Server::READABLE) {
        $soakReportRoute = $route;
    }
    if ($route['route'] === '/admin/soak-evidence' && $route['args']['methods'] === WP_REST_Server::CREATABLE) {
        $soakEvidenceRoute = $route;
    }
    if ($route['route'] === '/admin/soak-checkpoint' && $route['args']['methods'] === WP_REST_Server::CREATABLE) {
        $soakCheckpointRoute = $route;
    }
}

assert_true(is_array($soakReportRoute), 'GET /admin/soak-report route was not registered');
assert_true(is_array($soakEvidenceRoute), 'POST /admin/soak-evidence route was not registered');
assert_true(is_array($soakCheckpointRoute), 'POST /admin/soak-checkpoint route was not registered');
assert_same('permission_admin', $soakReportRoute['args']['permission_callback'][1], '/admin/soak-report must use permission_admin');
assert_same('permission_admin', $soakEvidenceRoute['args']['permission_callback'][1], '/admin/soak-evidence must use permission_admin');
assert_same('permission_admin', $soakCheckpointRoute['args']['permission_callback'][1], '/admin/soak-checkpoint must use permission_admin');

$GLOBALS['test_is_logged_in'] = false;
$GLOBALS['test_capabilities']['manage_options'] = false;
$denied = $instance->permission_admin();
assert_true($denied instanceof WP_Error, 'Unauthenticated users must be denied from soak routes');
assert_same(401, $denied->data['status'], 'Unauthenticated soak-route access must return 401');

$GLOBALS['test_is_logged_in'] = true;
$GLOBALS['test_capabilities']['manage_options'] = false;
$denied = $instance->permission_admin();
assert_true($denied instanceof WP_Error, 'Authenticated non-admin users must be denied from soak routes');
assert_same(403, $denied->data['status'], 'Non-admin soak-route access must return 403');

$GLOBALS['test_capabilities']['manage_options'] = true;

$userSettingsTable = $wpdb->prefix . 'smc_sf_user_settings';
$snapshotTable = $wpdb->prefix . 'smc_sf_snapshots';
$candleTable = $wpdb->prefix . 'smc_sf_candles';
$engineRunsTable = $wpdb->prefix . 'smc_sf_engine_runs';
$auditEventsTable = $wpdb->prefix . 'smc_sf_audit_events';
$soakEvidenceTable = $wpdb->prefix . 'smc_sf_soak_evidence';
$soakCheckpointsTable = $wpdb->prefix . 'smc_sf_soak_checkpoints';

$wpdb->replace($userSettingsTable, array(
    'user_id' => 7,
    'settings' => json_encode(array(
        'backendUrl' => 'https://example.com/wp-json',
        'refreshIntervalSec' => 2,
        'staleThresholdSec' => 60,
        'watchlist' => array('EURUSD'),
        'riskAllocation' => array('perTradePct' => 0.5, 'dailyMaxPct' => 2.0, 'ddCapPct' => 6.0),
    )),
    'updated_at' => gmdate('Y-m-d H:i:s'),
));

$wpdb->replace($snapshotTable, array(
    'user_id' => 7,
    'symbol' => 'EURUSD',
    'bid' => 1.1010,
    'ask' => 1.1012,
    'mid' => 1.1011,
    'spread' => 2,
    'change_pct_1d' => 0,
    'source' => 'mt5',
    'state' => 'live',
    'updated_at' => gmdate('Y-m-d H:i:s', time() - 5),
));

$currentBucket = (int) (floor(time() / 900) * 900);
for ($i = 0; $i < 30; $i++) {
    $candleTime = $currentBucket - ((29 - $i) * 900);
    $price = 1.1000 + ($i * 0.0001);
    $wpdb->replace($candleTable, array(
        'user_id' => 7,
        'symbol' => 'EURUSD',
        'timeframe' => '15min',
        'candle_time' => gmdate('Y-m-d H:i:s', $candleTime),
        'open' => $price,
        'high' => $price + 0.0003,
        'low' => $price - 0.0003,
        'close' => $price + 0.0001,
        'volume' => '10',
        'source' => 'mt5',
        'created_at' => gmdate('Y-m-d H:i:s', $candleTime + 30),
    ));
}

$wpdb->insert($engineRunsTable, array(
    'user_id' => 7,
    'status' => 'heartbeat',
    'summary' => json_encode(array('symbols' => array('EURUSD'))),
    'created_at' => gmdate('Y-m-d H:i:s', strtotime('-45 minutes')),
));
$wpdb->insert($engineRunsTable, array(
    'user_id' => 7,
    'status' => 'complete',
    'summary' => json_encode(array('symbols' => array('EURUSD'))),
    'created_at' => gmdate('Y-m-d H:i:s', strtotime('-15 minutes')),
));
$wpdb->insert($auditEventsTable, array(
    'user_id' => 7,
    'event_type' => 'ea.market_stream.rejected',
    'payload' => json_encode(array('reason' => 'sample')),
    'created_at' => gmdate('Y-m-d H:i:s', strtotime('-20 minutes')),
));
$wpdb->insert($auditEventsTable, array(
    'user_id' => 7,
    'event_type' => 'health.warning.sample',
    'payload' => json_encode(array()),
    'created_at' => gmdate('Y-m-d H:i:s', strtotime('-10 minutes')),
));
$wpdb->insert($auditEventsTable, array(
    'user_id' => 7,
    'event_type' => 'signals.executed',
    'payload' => json_encode(array()),
    'created_at' => gmdate('Y-m-d H:i:s', strtotime('-5 minutes')),
));

$health = $instance->get_admin_health();
$soakReport = $instance->get_soak_report();
assert_true(is_array($soakReport), 'get_soak_report must return an array in the test harness');
foreach (array('health', 'watchlist_count', 'snapshots_24h', 'candles_24h', 'engine_runs_summary', 'audit_events_summary', 'manual_evidence', 'checkpoints', 'generated_at') as $key) {
    assert_true(array_key_exists($key, $soakReport), 'soak report missing key: ' . $key);
}
assert_same($health, $soakReport['health'], 'soak report health must reuse the admin health payload exactly');
assert_same(null, $soakReport['watchlist_count'], 'watchlist_count must be null when the plugin has no dedicated watchlist table');
assert_same(1, $soakReport['snapshots_24h'], 'snapshots_24h should count user-scoped snapshot rows from the last 24 hours');
assert_same(30, $soakReport['candles_24h'], 'candles_24h should count user-scoped candle rows from the last 24 hours');
assert_same(2, $soakReport['engine_runs_summary']['total_24h'], 'engine_runs_summary total_24h mismatch');
assert_same(1, $soakReport['engine_runs_summary']['success_24h'], 'engine_runs_summary success_24h mismatch');
assert_same(0, $soakReport['engine_runs_summary']['error_24h'], 'engine_runs_summary error_24h mismatch');
assert_same(3, $soakReport['audit_events_summary']['total_24h'], 'audit_events_summary total_24h mismatch');
assert_same(1, $soakReport['audit_events_summary']['error_count_24h'], 'audit_events_summary error_count_24h mismatch');
assert_same(1, $soakReport['audit_events_summary']['warning_count_24h'], 'audit_events_summary warning_count_24h mismatch');

$missingEvidence = $instance->upsert_soak_evidence(new WP_REST_Request(array(
    'evidence_type' => 'manual_note',
    'evidence_value' => 'missing key',
    'operator' => 'admin-user',
)));
assert_true($missingEvidence instanceof WP_Error, 'Missing evidence_key must fail validation');
assert_same(400, $missingEvidence->data['status'], 'Missing evidence_key must return 400');

$savedEvidence = $instance->upsert_soak_evidence(new WP_REST_Request(array(
    'evidence_key' => 'phase0-window-1',
    'evidence_type' => 'manual_note',
    'evidence_value' => 'Manual operator confirmation',
    'operator' => 'admin-user',
)));
assert_true(is_array($savedEvidence), 'Valid soak evidence should return the saved row');
assert_same('phase0-window-1', $savedEvidence['evidence_key'], 'Saved soak evidence key mismatch');
assert_same('admin-user', $savedEvidence['operator'], 'Saved soak evidence operator mismatch');

$updatedEvidence = $instance->upsert_soak_evidence(new WP_REST_Request(array(
    'evidence_key' => 'phase0-window-1',
    'evidence_type' => 'feed_stable_window',
    'evidence_value' => 'Stable for 12h window',
    'operator' => 'admin-user',
)));
assert_same('feed_stable_window', $updatedEvidence['evidence_type'], 'Soak evidence upsert must update existing keys');
assert_same(1, count($wpdb->tables[$soakEvidenceTable] ?? array()), 'Soak evidence upsert must not duplicate rows for the same evidence_key');

$wpdb->insert($soakCheckpointsTable, array(
    'snapshot_data' => json_encode(array('stale' => true)),
    'operator_notes' => 'old checkpoint',
    'created_at' => gmdate('Y-m-d H:i:s', strtotime('-80 hours')),
));

$checkpoint = $instance->create_soak_checkpoint(new WP_REST_Request(array(
    'operator_notes' => 'Checkpoint after stable window',
)));
assert_true(is_array($checkpoint), 'create_soak_checkpoint should return a checkpoint row');
assert_true(($checkpoint['id'] ?? 0) > 0, 'create_soak_checkpoint must return the inserted checkpoint id');
assert_same('Checkpoint after stable window', $checkpoint['operator_notes'], 'Checkpoint notes mismatch');
assert_true(is_array($checkpoint['snapshot_data']), 'Checkpoint snapshot_data must be a decoded report array');

$remainingCheckpoints = $wpdb->tables[$soakCheckpointsTable] ?? array();
assert_same(1, count($remainingCheckpoints), 'create_soak_checkpoint must prune rows older than 72 hours');

$refreshedSoakReport = $instance->get_soak_report();
assert_true(count($refreshedSoakReport['checkpoints']) >= 1, 'Soak report must include the new checkpoint');
assert_same('Checkpoint after stable window', $refreshedSoakReport['checkpoints'][0]['operator_notes'], 'Newest checkpoint notes must round-trip through get_soak_report');
assert_true(count($refreshedSoakReport['manual_evidence']) >= 1, 'Soak report must include saved manual evidence rows');

fwrite(STDOUT, 'admin soak report checks passed' . PHP_EOL);
