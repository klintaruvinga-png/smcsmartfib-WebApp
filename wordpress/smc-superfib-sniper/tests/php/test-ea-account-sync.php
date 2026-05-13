<?php

require_once __DIR__ . '/test-ea-bridge-bootstrap.php';

reset_ea_bridge_test_state();

$plugin = new SMC_SuperFib_Sniper_REST();
$plugin->register_routes();

$route = find_registered_route('/ea/account-sync');
assert_true(is_array($route), 'Account-sync route must register under /ea/account-sync.');
assert_same(WP_REST_Server::CREATABLE, $route['args']['methods'], 'Account-sync route must use POST.');

global $wpdb;
$before_engine_runs = count($wpdb->tables['wp_smc_sf_engine_runs'] ?? array());

$payload = array(
    'user_id' => 7,
    'account_id' => '12345678',
    'terminal_id' => 'MT5-DESKTOP-ABC',
    'broker' => 'Deriv',
    'broker_server' => 'Deriv-Server',
    'currency' => 'USD',
    'balance' => 10500.12,
    'equity' => 10480.55,
    'margin' => 215.33,
    'free_margin' => 10265.22,
    'leverage' => 500,
    'trade_allowed' => true,
    'connected' => true,
    'ea_version' => '13.0.3',
    'terminal_build' => '4150',
    'timestamp' => '2026-05-13T10:05:00Z',
);

$response = dispatch_ea_request($plugin, 'permission_ea_bridge', 'post_ea_account_sync', $payload, ea_bridge_headers());
assert_true($response instanceof WP_REST_Response, 'Account-sync should return a REST response for valid requests.');
assert_same(true, $response->data['ok'], 'Account-sync response must set ok=true.');
assert_same(true, $response->data['synced'], 'Account-sync response must set synced=true.');
assert_same('12345678', $response->data['account_id'], 'Account-sync response must echo account_id.');
assert_same('MT5-DESKTOP-ABC', $response->data['terminal_id'], 'Account-sync response must echo terminal_id.');
assert_true(isset($response->data['server_time']), 'Account-sync response must include server_time.');

$snapshot_row = $wpdb->tables['wp_smc_sf_account_snapshots']['7'] ?? null;
assert_true(is_array($snapshot_row), 'Account-sync must write to the account_snapshots table.');
$blob = json_decode($snapshot_row['data'], true);
$record = $blob['eaBridge']['accounts']['12345678|MT5-DESKTOP-ABC'] ?? null;
assert_true(is_array($record), 'Account-sync must persist the EA bridge account record in account_snapshots.');
assert_same('Deriv', $record['broker'] ?? null, 'Account-sync must preserve broker.');
assert_same('Deriv-Server', $record['broker_server'] ?? null, 'Account-sync must preserve broker_server.');
assert_same('USD', $record['currency'] ?? null, 'Account-sync must preserve currency.');
assert_same(500, $record['leverage'] ?? null, 'Account-sync must preserve leverage.');
assert_same(true, $record['trade_allowed'] ?? null, 'Account-sync must preserve trade_allowed.');
assert_same(true, $record['connected'] ?? null, 'Account-sync must preserve connected.');
assert_same('13.0.3', $record['ea_version'] ?? null, 'Account-sync must preserve ea_version.');
assert_true(is_array($record['raw_json'] ?? null), 'Account-sync must preserve the raw payload inside raw_json.');

$after_engine_runs = count($wpdb->tables['wp_smc_sf_engine_runs'] ?? array());
assert_same($before_engine_runs, $after_engine_runs, 'Account-sync must not write to engine_runs.');

$minimal_response = dispatch_ea_request($plugin, 'permission_ea_bridge', 'post_ea_account_sync', array(
    'user_id' => 7,
), ea_bridge_headers());
assert_true($minimal_response instanceof WP_REST_Response, 'Account-sync must handle missing optional fields safely.');
assert_same(true, $minimal_response->data['synced'], 'Minimal account-sync payload should still sync.');

$missing_key = dispatch_ea_request($plugin, 'permission_ea_bridge', 'post_ea_account_sync', $payload, array());
assert_true($missing_key instanceof WP_Error, 'Account-sync missing API key must fail safely.');
assert_same('smc_sf_api_key_missing', $missing_key->code, 'Account-sync missing API key must use the plugin auth error code.');

fwrite(STDOUT, "EA account-sync checks passed\n");
