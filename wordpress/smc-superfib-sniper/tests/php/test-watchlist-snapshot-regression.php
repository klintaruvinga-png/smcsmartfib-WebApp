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
if (!function_exists('delete_user_meta')) {
    function delete_user_meta($user_id, $meta_key) {
        $GLOBALS['smc_watchlist_deleted_meta'][] = array(
            'user_id' => $user_id,
            'meta_key' => $meta_key,
        );
        return true;
    }
}

$GLOBALS['smc_watchlist_deleted_meta'] = array();

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

$ref = new ReflectionClass('SMC_SuperFib_Sniper_REST');
$instance = $ref->newInstanceWithoutConstructor();

$isCurrent = $ref->getMethod('is_engine_snapshot_current');
$isCurrent->setAccessible(true);
$deleteSnapshot = $ref->getMethod('delete_engine_snapshot');
$deleteSnapshot->setAccessible(true);

$freshSnapshot = array(
    'prices' => array(
        array('symbol' => 'EURUSD'),
        array('symbol' => 'USDJPY'),
    ),
    'meta' => array(
        'computedAt' => gmdate('c'),
    ),
);

assert_true(
    $isCurrent->invoke($instance, $freshSnapshot, array('EURUSD', 'USDJPY'), 30),
    'matching symbols with a fresh timestamp must keep the snapshot current'
);
assert_true(
    !$isCurrent->invoke($instance, $freshSnapshot, array('EURUSD'), 30),
    'symbol-set mismatch must invalidate a fresh snapshot before timestamp freshness is considered'
);

$deleteSnapshot->invoke($instance, 42);
assert_same(
    array(
        array(
            'user_id' => 42,
            'meta_key' => 'smc_sf_engine_snapshot',
        ),
    ),
    $GLOBALS['smc_watchlist_deleted_meta'],
    'watchlist snapshot invalidation must delete the cached engine snapshot user meta'
);

fwrite(STDOUT, 'watchlist snapshot regression checks passed' . PHP_EOL);
