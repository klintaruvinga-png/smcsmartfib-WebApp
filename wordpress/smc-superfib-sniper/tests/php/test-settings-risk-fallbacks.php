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
if (!function_exists('plugin_dir_path')) {
    function plugin_dir_path($file) {
        return dirname($file) . DIRECTORY_SEPARATOR;
    }
}

require_once dirname(__DIR__, 2) . '/smc-superfib-sniper.php';

function fail($message) {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function assert_same($expected, $actual, $message) {
    if ($expected !== $actual) {
        fail($message . ' expected=' . var_export($expected, true) . ' actual=' . var_export($actual, true));
    }
}

$ref = new ReflectionClass('SMC_SuperFib_Sniper_REST');
$instance = $ref->newInstanceWithoutConstructor();

$intBetween = $ref->getMethod('int_between');
$intBetween->setAccessible(true);
$floatBetween = $ref->getMethod('float_between');
$floatBetween->setAccessible(true);
$sanitizeRisk = $ref->getMethod('sanitize_risk_allocation');
$sanitizeRisk->setAccessible(true);

$fallbackRisk = array(
    'perTradePct' => 0.5,
    'dailyMaxPct' => 2.0,
    'ddCapPct' => 6.0,
);

assert_same(7, $intBetween->invoke($instance, array(), 'refreshIntervalSec', 2, 60, 7), 'int_between must preserve fallback when key missing');
assert_same(60, $intBetween->invoke($instance, array('refreshIntervalSec' => 99), 'refreshIntervalSec', 2, 60, 7), 'int_between must clamp upper bound');
assert_same(0.5, $floatBetween->invoke($instance, array(), 'perTradePct', 0.1, 5.0, 0.5), 'float_between must preserve fallback when key missing');
assert_same(0.1, $floatBetween->invoke($instance, array('perTradePct' => 0.01), 'perTradePct', 0.1, 5.0, 0.5), 'float_between must clamp lower bound');
assert_same($fallbackRisk, $sanitizeRisk->invoke($instance, 'invalid', $fallbackRisk), 'sanitize_risk_allocation must preserve fallback object when payload is invalid');
assert_same(
    array(
        'perTradePct' => 5.0,
        'dailyMaxPct' => 2.0,
        'ddCapPct' => 6.0,
    ),
    $sanitizeRisk->invoke($instance, array('perTradePct' => 9), $fallbackRisk),
    'sanitize_risk_allocation must clamp provided values and preserve missing fallback fields'
);

fwrite(STDOUT, 'settings/risk fallback regression checks passed' . PHP_EOL);
