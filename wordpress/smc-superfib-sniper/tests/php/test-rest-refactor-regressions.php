<?php

require_once __DIR__ . '/test-ea-bridge-bootstrap.php';

reset_ea_bridge_test_state();

$plugin = new SMC_SuperFib_Sniper_REST();
$plugin->register_routes();

$expected_routes = array(
    '/fundamentals/bias' => array(WP_REST_Server::READABLE, 'get_fundamentals_bias', 'permission_user'),
    '/ea/signal-candidates' => array(WP_REST_Server::CREATABLE, 'post_ea_signal_candidates', 'permission_ea_bridge'),
    '/market-data/signal-drift' => array(WP_REST_Server::READABLE, 'get_market_data_signal_drift', 'permission_user'),
    '/ea/execution-queue' => array(WP_REST_Server::READABLE, 'get_ea_execution_queue', 'permission_ea_bridge'),
    '/ea/execution-ack' => array(WP_REST_Server::CREATABLE, 'post_ea_execution_ack', 'permission_ea_bridge'),
    '/user/execution-request' => array(WP_REST_Server::CREATABLE, 'post_user_execution_request', 'permission_user'),
    '/user/execution-audit' => array(WP_REST_Server::READABLE, 'get_user_execution_audit', 'permission_user'),
    '/user/approval-queue' => array(WP_REST_Server::READABLE, 'get_user_approval_queue', 'permission_user'),
    '/user/approval-queue/review' => array(WP_REST_Server::CREATABLE, 'post_approval_queue_review', 'permission_user'),
    '/user/license' => array(WP_REST_Server::READABLE, 'get_user_license', 'permission_user'),
    '/admin/license/set-tier' => array(WP_REST_Server::CREATABLE, 'post_admin_set_license_tier', 'permission_admin'),
);

foreach ($expected_routes as $route_path => $expectation) {
    list($method, $callback, $permission_callback) = $expectation;
    $route = find_registered_route($route_path);
    assert_true(is_array($route), $route_path . ' must be registered.');
    assert_same($method, $route['args']['methods'], $route_path . ' must register the expected HTTP method.');
    assert_same($callback, $route['args']['callback'][1] ?? null, $route_path . ' must delegate to the expected handler.');
    assert_same($permission_callback, $route['args']['permission_callback'][1] ?? null, $route_path . ' must use the expected permission callback.');
}

$service_dir = dirname(__DIR__, 2) . '/includes/Service';
$legacy_methods = array();
foreach (glob($service_dir . '/*.php') as $service_file) {
    $contents = file_get_contents($service_file);
    preg_match_all('/\$this->legacy(?:->|::)([A-Za-z_][A-Za-z0-9_]*)\s*\(/', $contents, $matches);
    foreach ($matches[1] as $method_name) {
        $legacy_methods[$method_name] = true;
    }
}

foreach (array_keys($legacy_methods) as $method_name) {
    $method = new ReflectionMethod(SMC_SuperFib_Sniper_REST::class, $method_name);
    assert_true($method->isPublic(), $method_name . ' must be public so delegated service classes can call it.');
}

fwrite(STDOUT, "REST refactor regression checks passed\n");
