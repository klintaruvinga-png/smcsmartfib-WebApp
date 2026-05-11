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

        public function __construct($params = array()) {
            $this->params = is_array($params) ? $params : array();
        }

        public function get_json_params() {
            return $this->params;
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
        public $last_error = '';
        public $insert_id = 0;
        public $fail_dbdelta = false;
        public $fail_baseline_lookup = false;
        private $auto_ids = array();

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

        public function query($sql) {
            $this->last_error = '';

            if ($sql === 'START TRANSACTION' || $sql === 'COMMIT' || $sql === 'ROLLBACK') {
                return 1;
            }

            if (preg_match('/^INSERT INTO ([^ ]+) \(checkpoint_type, snapshot_data, operator_notes, created_at\)/', $sql, $matches)) {
                $table = $matches[1];
                if (!isset($this->tables[$table])) {
                    $this->tables[$table] = array();
                }

                foreach ($this->tables[$table] as $row) {
                    if (($row['checkpoint_type'] ?? '') === 'baseline') {
                        return 0;
                    }
                }

                preg_match_all("/'((?:''|[^'])*)'/", $sql, $value_matches);
                $values = array_map(function ($value) {
                    return str_replace("''", "'", $value);
                }, $value_matches[1]);

                $row = array(
                    'id' => $this->next_id($table),
                    'checkpoint_type' => $values[0] ?? 'baseline',
                    'snapshot_data' => $values[1] ?? '{}',
                    'operator_notes' => $values[2] ?? '',
                    'created_at' => $values[3] ?? gmdate('Y-m-d H:i:s'),
                );
                $this->tables[$table][] = $row;
                $this->insert_id = (int) $row['id'];

                return 1;
            }

            return 1;
        }

        public function get_var($query) {
            $this->last_error = '';

            if (preg_match("/SELECT settings FROM ([^ ]+) WHERE user_id = (\\d+)/", $query, $matches)) {
                $table = $matches[1];
                $user_id = (int) $matches[2];
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) $row['user_id'] === $user_id) {
                        return $row['settings'];
                    }
                }
                return null;
            }

            if (preg_match("/SELECT key_status FROM ([^ ]+) WHERE user_id = (\\d+) AND provider = '([^']+)'/", $query, $matches)) {
                $table = $matches[1];
                $user_id = (int) $matches[2];
                $provider = $matches[3];
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) $row['user_id'] === $user_id && ($row['provider'] ?? '') === $provider) {
                        return $row['key_status'] ?? null;
                    }
                }
                return null;
            }

            if (preg_match("/SELECT MAX\\((updated_at|created_at)\\) FROM ([^ ]+) WHERE user_id = (\\d+)/", $query, $matches)) {
                $column = $matches[1];
                $table = $matches[2];
                $user_id = (int) $matches[3];
                $max = null;
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) !== $user_id) {
                        continue;
                    }
                    $value = $row[$column] ?? null;
                    if ($value !== null && ($max === null || strcmp($value, $max) > 0)) {
                        $max = $value;
                    }
                }
                return $max;
            }

            if (preg_match("/SELECT COUNT\\(\\*\\) FROM ([^ ]+) WHERE user_id = (\\d+) AND updated_at >= '([^']+)'/", $query, $matches)) {
                return $this->count_rows_since($matches[1], (int) $matches[2], 'updated_at', $matches[3]);
            }

            if (preg_match("/SELECT COUNT\\(\\*\\) FROM ([^ ]+) WHERE user_id = (\\d+) AND created_at >= '([^']+)'/", $query, $matches)) {
                return $this->count_rows_since($matches[1], (int) $matches[2], 'created_at', $matches[3]);
            }

            if (preg_match("/SELECT COUNT\\(\\*\\) FROM ([^ ]+) WHERE checkpoint_type = 'baseline'/", $query, $matches)) {
                $count = 0;
                foreach ($this->tables[$matches[1]] ?? array() as $row) {
                    if (($row['checkpoint_type'] ?? '') === 'baseline') {
                        $count++;
                    }
                }
                return $count;
            }

            return null;
        }

        public function get_row($query, $output = ARRAY_A) {
            $this->last_error = '';

            if (strpos($query, 'FROM ' . $this->prefix . 'smc_sf_engine_runs') !== false) {
                return array(
                    'total_24h' => 0,
                    'success_24h' => 0,
                    'error_24h' => 0,
                    'last_run_at' => null,
                );
            }

            if (strpos($query, 'FROM ' . $this->prefix . 'smc_sf_audit_events') !== false) {
                return array(
                    'total_24h' => 0,
                    'error_count_24h' => 0,
                    'warning_count_24h' => 0,
                );
            }

            if (strpos($query, 'FROM ' . $this->prefix . 'smc_sf_soak_checkpoints') !== false
                && strpos($query, "checkpoint_type = 'baseline'") !== false) {
                if ($this->fail_baseline_lookup) {
                    $this->last_error = 'Simulated baseline lookup failure';
                    return null;
                }

                $rows = $this->tables[$this->prefix . 'smc_sf_soak_checkpoints'] ?? array();
                usort($rows, function ($left, $right) {
                    return strcmp((string) $left['created_at'], (string) $right['created_at']);
                });
                foreach ($rows as $row) {
                    if (($row['checkpoint_type'] ?? '') === 'baseline') {
                        return $row;
                    }
                }

                return null;
            }

            return null;
        }

        public function get_results($query, $output = ARRAY_A) {
            $this->last_error = '';

            if (strpos($query, 'FROM ' . $this->prefix . 'smc_sf_soak_evidence') !== false) {
                return array_values($this->tables[$this->prefix . 'smc_sf_soak_evidence'] ?? array());
            }

            if (strpos($query, 'FROM ' . $this->prefix . 'smc_sf_soak_checkpoints') !== false
                && strpos($query, "checkpoint_type <> 'baseline'") !== false) {
                $rows = array_values(array_filter(
                    $this->tables[$this->prefix . 'smc_sf_soak_checkpoints'] ?? array(),
                    function ($row) {
                        return ($row['checkpoint_type'] ?? '') !== 'baseline';
                    }
                ));
                usort($rows, function ($left, $right) {
                    return strcmp((string) $right['created_at'], (string) $left['created_at']);
                });
                return $rows;
            }

            return array();
        }

        private function count_rows_since($table, $user_id, $column, $since) {
            $count = 0;
            foreach ($this->tables[$table] ?? array() as $row) {
                if ((int) ($row['user_id'] ?? 0) !== $user_id) {
                    continue;
                }
                if (isset($row[$column]) && strcmp((string) $row[$column], $since) >= 0) {
                    $count++;
                }
            }
            return $count;
        }

        private function next_id($table) {
            $this->auto_ids[$table] = ($this->auto_ids[$table] ?? 0) + 1;
            return $this->auto_ids[$table];
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
        unset($GLOBALS['test_user_meta'][$user_id][$key]);
        return true;
    }
}
if (!function_exists('is_wp_error')) {
    function is_wp_error($value) {
        return $value instanceof WP_Error;
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
if (!function_exists('wp_create_nonce')) {
    function wp_create_nonce($action) {
        return 'nonce';
    }
}
if (!function_exists('wp_register_script')) {
    function wp_register_script(...$args) {
        return true;
    }
}
if (!function_exists('wp_enqueue_script')) {
    function wp_enqueue_script(...$args) {
        return true;
    }
}
if (!function_exists('wp_add_inline_script')) {
    function wp_add_inline_script(...$args) {
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
if (!function_exists('dbDelta')) {
    function dbDelta($sql) {
        global $wpdb;
        if ($wpdb->fail_dbdelta) {
            $wpdb->last_error = 'Simulated dbDelta failure';
            return;
        }

        if (preg_match('/CREATE TABLE ([^ ]+)/', $sql, $matches)) {
            if (!isset($wpdb->tables[$matches[1]])) {
                $wpdb->tables[$matches[1]] = array();
            }
        }
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

class Test_Get_Soak_Report {
    private function reset_environment() {
        global $wpdb;

        $GLOBALS['test_transients'] = array();
        $GLOBALS['test_user_meta'] = array();
        $GLOBALS['test_current_user_id'] = 1;
        $GLOBALS['test_is_logged_in'] = true;
        $GLOBALS['test_capabilities'] = array(
            'read' => true,
            'manage_options' => true,
        );

        $wpdb = new TestWpdb();
        $wpdb->tables[$wpdb->prefix . 'smc_sf_user_settings'] = array(
            array(
                'user_id' => 1,
                'settings' => json_encode(array(
                    'watchlist' => array(),
                    'refreshIntervalSec' => 2,
                    'staleThresholdSec' => 60,
                )),
                'updated_at' => gmdate('Y-m-d H:i:s'),
            ),
        );
    }

    private function response_data($response, $expected_status, $message) {
        assert_true($response instanceof WP_REST_Response, $message . ' should return WP_REST_Response');
        assert_same($expected_status, $response->status, $message . ' returned unexpected status');
        $data = $response->get_data();
        assert_true(is_array($data), $message . ' should expose array data');
        return $data;
    }

    public function case_seeds_baseline_when_missing() {
        global $wpdb;

        $this->reset_environment();
        $instance = new SMC_SuperFib_Sniper_REST();

        $data = $this->response_data($instance->get_soak_report(), 200, 'Missing baseline soak report');
        assert_same(true, $data['seeded'] ?? null, 'Missing baseline should be seeded');
        assert_true(is_array($data['baseline_checkpoint'] ?? null), 'Seeded response must include baseline checkpoint');
        assert_same('baseline', $data['baseline_checkpoint']['checkpoint_type'] ?? null, 'Seeded checkpoint must be baseline');

        $baseline_rows = array_values(array_filter(
            $wpdb->tables[$wpdb->prefix . 'smc_sf_soak_checkpoints'] ?? array(),
            function ($row) {
                return ($row['checkpoint_type'] ?? '') === 'baseline';
            }
        ));
        assert_same(1, count($baseline_rows), 'Seeding should create exactly one baseline row');
    }

    public function case_returns_existing_baseline_without_seeding() {
        global $wpdb;

        $this->reset_environment();
        $wpdb->tables[$wpdb->prefix . 'smc_sf_soak_checkpoints'] = array(
            array(
                'id' => 7,
                'checkpoint_type' => 'baseline',
                'snapshot_data' => json_encode(array('status' => 'existing')),
                'operator_notes' => 'Operator baseline',
                'created_at' => '2026-05-11 08:00:00',
            ),
        );

        $instance = new SMC_SuperFib_Sniper_REST();
        $data = $this->response_data($instance->get_soak_report(), 200, 'Existing baseline soak report');

        assert_same(false, $data['seeded'] ?? null, 'Existing baseline must not be reseeded');
        assert_same(7, $data['baseline_checkpoint']['id'] ?? null, 'Existing baseline id should be preserved');
        assert_same('Operator baseline', $data['baseline_checkpoint']['operator_notes'] ?? null, 'Existing baseline notes should be preserved');
    }

    public function case_returns_structured_500_on_lookup_failure() {
        global $wpdb;

        $this->reset_environment();
        $wpdb->fail_baseline_lookup = true;

        $instance = new SMC_SuperFib_Sniper_REST();
        $data = $this->response_data($instance->get_soak_report(), 500, 'Lookup failure soak report');

        assert_same('baseline_checkpoint_lookup_failed', $data['error'] ?? null, 'Lookup failure must return structured error');
    }

    public function case_permission_admin_still_returns_401_for_unauthenticated_requests() {
        $this->reset_environment();
        $GLOBALS['test_is_logged_in'] = false;
        $GLOBALS['test_capabilities']['manage_options'] = false;
        $GLOBALS['test_current_user_id'] = 0;

        $instance = new SMC_SuperFib_Sniper_REST();
        $denied = $instance->permission_admin();

        assert_true($denied instanceof WP_Error, 'Unauthenticated admin check should return WP_Error');
        assert_same(401, $denied->data['status'] ?? null, 'Unauthenticated admin check must return 401');
    }

    public function run() {
        $this->case_seeds_baseline_when_missing();
        $this->case_returns_existing_baseline_without_seeding();
        $this->case_returns_structured_500_on_lookup_failure();
        $this->case_permission_admin_still_returns_401_for_unauthenticated_requests();
    }
}

$test = new Test_Get_Soak_Report();
$test->run();

fwrite(STDOUT, 'get soak report checks passed' . PHP_EOL);
