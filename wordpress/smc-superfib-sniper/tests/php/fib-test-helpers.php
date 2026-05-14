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
if (!function_exists('wp_json_encode')) {
    function wp_json_encode($value) {
        return json_encode($value);
    }
}

if (!class_exists('TestWpdb')) {
    class TestWpdb {
        public $prefix = 'wp_';
        public $last_error = '';
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
