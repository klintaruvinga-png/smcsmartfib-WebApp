<?php

require_once __DIR__ . '/test-ea-bridge-bootstrap.php';

reset_ea_bridge_test_state();

$plugin = new SMC_SuperFib_Sniper_REST();
$plugin->register_routes();

$route = find_registered_route('/ea/heartbeat');
assert_true(is_array($route), 'Heartbeat route must register under /ea/heartbeat.');
assert_same(WP_REST_Server::CREATABLE, $route['args']['methods'], 'Heartbeat route must use POST.');

$valid_payload = array(
    'user_id' => 7,
    'account_id' => '12345678',
    'terminal_id' => 'MT5-DESKTOP-ABC',
    'broker' => 'Deriv',
    'broker_server' => 'Deriv-Server',
    'ea_version' => '13.0.3',
    'terminal_build' => '4150',
    'connected' => true,
    'timestamp' => '2026-05-13T10:00:00Z',
);

$response = dispatch_ea_request($plugin, 'permission_ea_bridge', 'post_ea_heartbeat', $valid_payload, ea_bridge_headers());
assert_true($response instanceof WP_REST_Response, 'Heartbeat should return a REST response for valid requests.');
assert_same(true, $response->data['ok'], 'Heartbeat response must set ok=true.');
assert_same(true, $response->data['received'], 'Heartbeat response must acknowledge receipt.');
assert_same('live', $response->data['status'], 'Heartbeat response must report live status.');
assert_true(isset($response->data['server_time']), 'Heartbeat response must include server_time.');

global $wpdb;
$engine_runs = $wpdb->tables['wp_smc_sf_engine_runs'] ?? array();
assert_same(1, count($engine_runs), 'Heartbeat must append one engine_runs row.');
$row = end($engine_runs);
assert_same('heartbeat', $row['status'], 'Heartbeat engine_runs row must use heartbeat status.');
$summary = json_decode($row['summary'], true);
assert_same('explicit_heartbeat', $summary['source'] ?? null, 'Heartbeat engine_runs row must use explicit_heartbeat source.');
assert_same('12345678', $summary['account_id'] ?? null, 'Heartbeat summary must preserve account_id.');
assert_same('MT5-DESKTOP-ABC', $summary['terminal_id'] ?? null, 'Heartbeat summary must preserve terminal_id.');

$missing_key = dispatch_ea_request($plugin, 'permission_ea_bridge', 'post_ea_heartbeat', $valid_payload, array());
assert_true($missing_key instanceof WP_Error, 'Missing EA API key must fail safely.');
assert_same('smc_sf_api_key_missing', $missing_key->code, 'Missing EA API key must use the plugin auth error code.');

$missing_user = dispatch_ea_request($plugin, 'permission_ea_bridge', 'post_ea_heartbeat', array(
    'account_id' => '12345678',
), ea_bridge_headers());
assert_true($missing_user instanceof WP_Error, 'Missing user_id must fail safely.');
assert_same('smc_sf_user_required', $missing_user->code, 'Missing user_id must use the plugin auth error code.');

$zero_user = dispatch_ea_request($plugin, 'permission_ea_bridge', 'post_ea_heartbeat', array(
    'user_id' => 0,
    'account_id' => '12345678',
), ea_bridge_headers());
assert_true($zero_user instanceof WP_Error, 'Zero user_id must fail safely.');
assert_same('smc_sf_user_required', $zero_user->code, 'Zero user_id must preserve the backend auth guard.');

fwrite(STDOUT, "EA heartbeat checks passed\n");
