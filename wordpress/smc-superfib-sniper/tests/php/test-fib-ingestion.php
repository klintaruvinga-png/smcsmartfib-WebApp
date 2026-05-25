<?php
/**
 * Phase 4 — Fib Ingestion Contract Tests
 *
 * Validates that POST /ea/fib-levels correctly stores all 16 ratios for
 * both LTF_SF and HTF_AF families per timeframe, and that
 * GET /market-data/fib-levels returns the stored data intact.
 */

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
if (!function_exists('wp_json_encode')) {
    function wp_json_encode($value) {
        return json_encode($value);
    }
}
if (!function_exists('rest_ensure_response')) {
    function rest_ensure_response($data) {
        return $data;
    }
}
if (!function_exists('is_user_logged_in')) {
    function is_user_logged_in() { return true; }
}
if (!function_exists('get_current_user_id')) {
    function get_current_user_id() { return 1; }
}
if (!function_exists('set_transient')) {
    function set_transient($key, $value, $ttl) { return true; }
}
if (!function_exists('get_transient')) {
    function get_transient($key) { return false; }
}
if (!function_exists('wp_clear_scheduled_hook')) {
    function wp_clear_scheduled_hook($hook) {}
}
if (!function_exists('wp_unschedule_hook')) {
    function wp_unschedule_hook($hook) {}
}
if (!function_exists('wp_next_scheduled')) {
    function wp_next_scheduled($hook) { return false; }
}
if (!function_exists('wp_schedule_event')) {
    function wp_schedule_event($timestamp, $recurrence, $hook) {}
}

// ---- In-memory wpdb stub ----
class FibIngestionTestWpdb {
    public $prefix   = 'wp_';
    public $last_error = '';
    private $store   = array(); // keyed by table+unique_key

    public function replace($table, $data, $formats) {
        // Build a unique key from user_id, symbol, timeframe, family, ratio
        $ukey = implode('|', array(
            $data['user_id'] ?? '',
            $data['symbol'] ?? '',
            $data['timeframe'] ?? '',
            $data['family'] ?? '',
            $data['ratio'] ?? '',
        ));
        $this->store[$table][$ukey] = $data;
        return true;
    }

    public function get_results($sql, $output) {
        // Parse SELECT ... WHERE user_id=? AND symbol=? from $sql minimally.
        // Return all rows matching user_id and symbol, respecting optional timeframe/family filters.
        preg_match('/user_id = \'(\d+)\'/', $sql, $uid_m);
        preg_match('/symbol = \'([A-Z0-9]+)\'/', $sql, $sym_m);
        preg_match('/timeframe = \'([A-Z0-9]+)\'/', $sql, $tf_m);
        preg_match('/family = \'([A-Z0-9_]+)\'/', $sql, $fam_m);

        $user_id   = isset($uid_m[1]) ? (int) $uid_m[1] : null;
        $symbol    = isset($sym_m[1]) ? $sym_m[1] : null;
        $timeframe = isset($tf_m[1])  ? $tf_m[1]  : null;
        $family    = isset($fam_m[1]) ? $fam_m[1] : null;

        $table = $this->prefix . 'smc_sf_fib_levels';
        if (!isset($this->store[$table])) {
            return array();
        }

        $out = array();
        foreach ($this->store[$table] as $row) {
            if ($user_id !== null && (int) $row['user_id'] !== $user_id)    continue;
            if ($symbol   !== null && $row['symbol']    !== $symbol)        continue;
            if ($timeframe !== null && $row['timeframe'] !== $timeframe)    continue;
            if ($family    !== null && $row['family']    !== $family)       continue;

            $out[] = array(
                'timeframe'     => $row['timeframe'],
                'family'        => $row['family'],
                'ratio'         => $row['ratio'],
                'price'         => $row['price'],
                'calculated_at' => $row['calculated_at'],
            );
        }
        return $out;
    }

    public function prepare($sql, ...$args) {
        // Minimal prepare: replace %d/%s/%f placeholders with quoted values
        $result = '';
        $i = 0;
        $len = strlen($sql);
        $argIdx = 0;
        while ($i < $len) {
            if ($sql[$i] === '%' && $i + 1 < $len) {
                $spec = $sql[$i + 1];
                $val  = isset($args[$argIdx]) ? $args[$argIdx] : '';
                if ($spec === 'd') {
                    $result .= (int) $val;
                } elseif ($spec === 'f') {
                    $result .= (float) $val;
                } else {
                    $result .= "'" . addslashes((string) $val) . "'";
                }
                $argIdx++;
                $i += 2;
                continue;
            }
            $result .= $sql[$i];
            $i++;
        }
        return $result;
    }

    public function get_row($sql, $output) { return null; }
    public function get_var($sql) { return null; }
    public function query($sql) { return true; }
    public function insert($table, $data, $formats) { return true; }
}

// ---- WP_REST_Request base stub (PHP type system requires this exact class name) ----
if (!class_exists('WP_REST_Request')) {
    class WP_REST_Request {
        public function get_json_params() { return array(); }
        public function get_param($key)   { return null; }
    }
}

// ---- Concrete test request ----
class FibTestWPRestRequest extends WP_REST_Request {
    private $body_params;
    private $query_params;

    public function __construct($body = array(), $query = array()) {
        $this->body_params  = $body;
        $this->query_params = $query;
    }
    public function get_json_params() { return $this->body_params; }
    public function get_param($key)   { return isset($this->query_params[$key]) ? $this->query_params[$key] : null; }
}

// ---- WP_Error stub ----
class WP_Error {
    public $code; public $message; public $data;
    public function __construct($code, $message, $data = array()) {
        $this->code    = $code;
        $this->message = $message;
        $this->data    = $data;
    }
}

// ---- Setup ----
global $wpdb;
$wpdb = new FibIngestionTestWpdb();

require_once dirname(__DIR__, 2) . '/smc-superfib-sniper.php';

// ---- Helpers ----
function fib_ingest_fail($msg) {
    fwrite(STDERR, 'FAIL: ' . $msg . PHP_EOL);
    exit(1);
}
function fib_ingest_assert($cond, $msg) {
    if (!$cond) fib_ingest_fail($msg);
}
function fib_ingest_assert_eq($expected, $actual, $msg) {
    if ($expected !== $actual) {
        fib_ingest_fail($msg . ' expected=' . var_export($expected, true) . ' actual=' . var_export($actual, true));
    }
}

// Build a canonical 16-level fib array for a given family/timeframe
function fib_build_levels($high, $low, $family) {
    $ratios = array(-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300);
    $out = array();
    foreach ($ratios as $r) {
        $out[] = array(
            'family' => $family,
            'ratio'  => $r,
            'price'  => round($high - (($r / 100) * ($high - $low)), 8),
        );
    }
    return $out;
}

// ---- GET/POST handler instances ----
$ref  = new ReflectionClass('SMC_SuperFib_Sniper_REST');
$inst = $ref->newInstanceWithoutConstructor();

// ---- Test 1: POST with valid M15 payload ----
$ltf = fib_build_levels(1.12345, 1.10000, 'LTF_SF');
$htf = fib_build_levels(1.15000, 1.08000, 'HTF_AF');

$post_req = new FibTestWPRestRequest(array(
    'symbol' => 'EURUSD',
    'levels' => array(
        array(
            'timeframe'      => 'M15',
            'chart_tf_seconds' => 900,
            'ltf_sf'         => $ltf,
            'htf_af'         => $htf,
        ),
    ),
));

$post_method = $ref->getMethod('post_ea_fib_levels');
$post_method->setAccessible(true);
$result = $post_method->invoke($inst, $post_req);

fib_ingest_assert(!($result instanceof WP_Error), 'POST should not return WP_Error for valid payload');
fib_ingest_assert(isset($result['ok']) && $result['ok'] === true, 'POST ok must be true');
// 16 LTF + 16 HTF = 32 levels written
fib_ingest_assert_eq(32, (int) $result['levels_written'], 'M15 levels_written should be 32');
fib_ingest_assert_eq('EURUSD', $result['symbol'], 'symbol should be EURUSD');

// ---- Test 2: POST with M15 + H1 + D1 payload ----
$post_req_multi = new FibTestWPRestRequest(array(
    'symbol' => 'XAUUSD',
    'levels' => array(
        array('timeframe' => 'M15', 'ltf_sf' => fib_build_levels(2000, 1980, 'LTF_SF'), 'htf_af' => fib_build_levels(2010, 1970, 'HTF_AF')),
        array('timeframe' => 'H1',  'ltf_sf' => fib_build_levels(2005, 1975, 'LTF_SF'), 'htf_af' => fib_build_levels(2020, 1960, 'HTF_AF')),
        array('timeframe' => 'D1',  'ltf_sf' => fib_build_levels(2050, 1950, 'LTF_SF'), 'htf_af' => fib_build_levels(2100, 1900, 'HTF_AF')),
    ),
));
$result_multi = $post_method->invoke($inst, $post_req_multi);
fib_ingest_assert(!($result_multi instanceof WP_Error), 'Multi-TF POST should succeed');
// 3 timeframes * 32 each = 96
fib_ingest_assert_eq(96, (int) $result_multi['levels_written'], 'Multi-TF levels_written should be 96');

// ---- Test 3: POST with missing symbol → 400 ----
$bad_req = new FibTestWPRestRequest(array('levels' => array()));
$bad_result = $post_method->invoke($inst, $bad_req);
fib_ingest_assert($bad_result instanceof WP_Error, 'Missing symbol must return WP_Error');
fib_ingest_assert_eq('missing_fields', $bad_result->code, 'WP_Error code should be missing_fields');

// ---- Test 4: POST with unknown ratio → skipped, no crash ----
$bad_ratio_req = new FibTestWPRestRequest(array(
    'symbol' => 'GBPUSD',
    'levels' => array(
        array(
            'timeframe' => 'M15',
            'ltf_sf'    => array(array('family' => 'LTF_SF', 'ratio' => 999.0, 'price' => 1.25)),
            'htf_af'    => array(),
        ),
    ),
));
$bad_ratio_result = $post_method->invoke($inst, $bad_ratio_req);
fib_ingest_assert(!($bad_ratio_result instanceof WP_Error), 'Unknown ratio should not crash POST');
fib_ingest_assert_eq(0, (int) $bad_ratio_result['levels_written'], 'Unknown ratio should write 0 levels');

// ---- Test 5: GET returns grouped fib data for EURUSD ----
$get_req = new FibTestWPRestRequest(array(), array('symbol' => 'EURUSD'));
$get_method = $ref->getMethod('get_market_data_fib_levels');
$get_method->setAccessible(true);
$get_result = $get_method->invoke($inst, $get_req);

fib_ingest_assert(!($get_result instanceof WP_Error), 'GET should not return WP_Error');
fib_ingest_assert(isset($get_result['ok']) && $get_result['ok'] === true, 'GET ok must be true');
fib_ingest_assert_eq('EURUSD', $get_result['symbol'], 'GET symbol must be EURUSD');
fib_ingest_assert(isset($get_result['fibs']['M15']), 'GET fibs must include M15');
fib_ingest_assert(isset($get_result['fibs']['M15']['LTF_SF']), 'GET fibs M15 must include LTF_SF');
fib_ingest_assert(isset($get_result['fibs']['M15']['HTF_AF']), 'GET fibs M15 must include HTF_AF');
fib_ingest_assert_eq(16, count($get_result['fibs']['M15']['LTF_SF']), 'GET M15 LTF_SF must have 16 levels');
fib_ingest_assert_eq(16, count($get_result['fibs']['M15']['HTF_AF']), 'GET M15 HTF_AF must have 16 levels');

// ---- Test 6: GET with missing symbol → 400 ----
$no_sym_req = new FibTestWPRestRequest(array(), array());
$no_sym_result = $get_method->invoke($inst, $no_sym_req);
fib_ingest_assert($no_sym_result instanceof WP_Error, 'GET without symbol must return WP_Error');
fib_ingest_assert_eq('missing_symbol', $no_sym_result->code, 'WP_Error code must be missing_symbol');

// ---- Test 7: Price accuracy round-trip ----
$high = 1.12345;
$low  = 1.10000;
$ratio_0   = round($high - (0.0   / 100 * ($high - $low)), 8);  // at 0 = high
$ratio_100 = round($high - (100.0 / 100 * ($high - $low)), 8);  // at 100 = low
// Find ratio=0 level in GET result for EURUSD M15 LTF_SF
$ltf_levels = $get_result['fibs']['M15']['LTF_SF'];
$found_0 = null;
$found_100 = null;
foreach ($ltf_levels as $lv) {
    if ((float) $lv['ratio'] === 0.0)   $found_0   = $lv;
    if ((float) $lv['ratio'] === 100.0) $found_100 = $lv;
}
fib_ingest_assert($found_0 !== null, 'Ratio 0 level must be present in M15 LTF_SF');
fib_ingest_assert($found_100 !== null, 'Ratio 100 level must be present in M15 LTF_SF');
fib_ingest_assert(abs((float) $found_0['price']   - $ratio_0)   < 0.00001, 'Ratio 0 price round-trip within tolerance');
fib_ingest_assert(abs((float) $found_100['price'] - $ratio_100) < 0.00001, 'Ratio 100 price round-trip within tolerance');

fwrite(STDOUT, 'fib ingestion contract tests passed' . PHP_EOL);
