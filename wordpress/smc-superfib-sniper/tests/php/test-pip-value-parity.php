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

require_once dirname(__DIR__, 2) . '/smc-superfib-sniper.php';

$ref = new ReflectionClass('SMC_SuperFib_Sniper_REST');
$instance = $ref->newInstanceWithoutConstructor();

$getSpec = $ref->getMethod('get_instrument_spec');
$getSpec->setAccessible(true);

$pipValue = $ref->getMethod('pip_value_from_market');
$pipValue->setAccessible(true);

$cases = array(
    array(
        'symbol' => 'GBPUSD',
        'refs' => array(),
        'expected' => 10.0,
    ),
    array(
        'symbol' => 'USDJPY',
        'refs' => array('USDJPY' => 156.435),
        'expected' => round((100000 * 0.01) / 156.435, 6),
    ),
    array(
        'symbol' => 'EURJPY',
        'refs' => array('USDJPY' => 156.435),
        'expected' => round((100000 * 0.01) / 156.435, 6),
    ),
    array(
        'symbol' => 'EURGBP',
        'refs' => array('GBPUSD' => 1.2675),
        'expected' => round((100000 * 0.0001) * 1.2675, 6),
    ),
    array(
        'symbol' => 'AUDCHF',
        'refs' => array('USDCHF' => 0.8812),
        'expected' => round((100000 * 0.0001) / 0.8812, 6),
    ),
    array(
        'symbol' => 'USDCAD',
        'refs' => array('USDCAD' => 1.3672),
        'expected' => round((100000 * 0.0001) / 1.3672, 6),
    ),
    array(
        'symbol' => 'EURCAD',
        'refs' => array('USDCAD' => 1.3672),
        'expected' => round((100000 * 0.0001) / 1.3672, 6),
    ),
);

$failures = array();
foreach ($cases as $case) {
    $spec = $getSpec->invoke($instance, $case['symbol']);
    $actual = $pipValue->invoke($instance, $case['symbol'], $spec, $case['refs']);
    if (abs($actual - $case['expected']) > 0.000001) {
        $failures[] = $case['symbol'] . ' expected ' . $case['expected'] . ' got ' . $actual;
    }
}

$fallbackSpec = $getSpec->invoke($instance, 'EURGBP');
$fallback = $pipValue->invoke($instance, 'EURGBP', $fallbackSpec, array());
if (abs($fallback - 10.0) > 0.000001) {
    $failures[] = 'EURGBP fallback expected 10 got ' . $fallback;
}

if ($failures) {
    fwrite(STDERR, implode(PHP_EOL, $failures) . PHP_EOL);
    exit(1);
}

fwrite(STDOUT, 'pip-value regression checks passed' . PHP_EOL);
