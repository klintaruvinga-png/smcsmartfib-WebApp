<?php

require_once __DIR__ . '/fib-test-helpers.php';

fib_test_reset_env(11);

$registrar = new SMC_SuperFib_Route_Registrar();
$ref = new ReflectionMethod('SMC_SuperFib_Route_Registrar', 'route_definitions');
$ref->setAccessible(true);
$routes = $ref->invoke($registrar);

$found = false;
foreach ($routes as $route) {
    if (($route['path'] ?? '') === '/market-data/candles') {
        $found = true;
        fib_test_assert_same(WP_REST_Server::READABLE, $route['methods'], 'Phase 4 candle export route must be readable');
        fib_test_assert_same('get_market_data_candles', $route['callback'], 'Phase 4 candle export route must use the candle callback');
        fib_test_assert_same('user', $route['permission'] ?? 'user', 'Phase 4 candle export route must require normal WordPress auth');
    }
}
fib_test_assert_true($found, 'Route registrar must expose /market-data/candles');

$rest = fib_test_make_rest_instance();
fib_test_assert_true(method_exists($rest, 'get_market_data_candles'), 'REST plugin must implement get_market_data_candles');

fwrite(STDOUT, 'phase4 candle export route contract passed' . PHP_EOL);
