<?php

require_once __DIR__ . '/test-ea-bridge-bootstrap.php';

reset_ea_bridge_test_state();

$plugin = new SMC_SuperFib_Sniper_REST();
$plugin->register_routes();

$route = find_registered_route('/ea/symbol-sync');
assert_true(is_array($route), 'Symbol-sync route must register under /ea/symbol-sync.');
assert_same(WP_REST_Server::CREATABLE, $route['args']['methods'], 'Symbol-sync route must use POST.');

$payload = array(
    'user_id' => 7,
    'account_id' => '12345678',
    'terminal_id' => 'MT5-DESKTOP-ABC',
    'broker' => 'Deriv',
    'broker_server' => 'Deriv-Server',
    'timestamp' => '2026-05-13T10:10:00Z',
    'symbols' => array(
        array(
            'broker_symbol' => 'EURUSDm',
            'normalized_symbol' => 'EURUSD',
            'base_symbol' => 'EURUSD',
            'visible' => true,
            'selected' => true,
            'digits' => 5,
            'point' => 0.00001,
            'contract_size' => 100000,
            'trade_mode' => 'full',
            'min_lot' => 0.01,
            'max_lot' => 100,
            'lot_step' => 0.01,
            'spread' => 12,
            'currency_profit' => 'USD',
            'currency_margin' => 'USD',
        ),
        array(
            'broker_symbol' => 'USTEC',
            'normalized_symbol' => 'NAS100',
            'base_symbol' => 'NAS100',
            'visible' => true,
            'selected' => false,
            'digits' => 2,
            'point' => 0.01,
            'contract_size' => 1,
            'trade_mode' => 'full',
            'min_lot' => 0.1,
            'max_lot' => 50,
            'lot_step' => 0.1,
            'spread' => 18,
            'currency_profit' => 'USD',
            'currency_margin' => 'USD',
        ),
    ),
);

$response = dispatch_ea_request($plugin, 'permission_ea_bridge', 'post_ea_symbol_sync', $payload, ea_bridge_headers());
assert_true($response instanceof WP_REST_Response, 'Symbol-sync should return a REST response for valid requests.');
assert_same(true, $response->data['ok'], 'Symbol-sync response must set ok=true.');
assert_same(true, $response->data['synced'], 'Symbol-sync response must set synced=true.');
assert_same(2, $response->data['symbols_received'], 'Symbol-sync must report the number of symbols received.');
assert_same(2, $response->data['symbols_upserted'], 'Symbol-sync must report the number of symbols upserted.');

global $wpdb;
$table = $wpdb->tables['wp_smc_sf_symbol_sync'] ?? array();
assert_same(2, count($table), 'Symbol-sync must persist two symbol rows.');
$eurusd = $table['7|12345678|MT5-DESKTOP-ABC|EURUSDm'] ?? null;
assert_true(is_array($eurusd), 'Symbol-sync must key rows by broker_symbol within the account/terminal identity.');
assert_same('EURUSDm', $eurusd['broker_symbol'] ?? null, 'Symbol-sync must preserve the exact broker symbol.');
assert_same('EURUSD', $eurusd['normalized_symbol'] ?? null, 'Symbol-sync must preserve the normalized symbol.');

$upsert_response = dispatch_ea_request($plugin, 'permission_ea_bridge', 'post_ea_symbol_sync', array(
    'user_id' => 7,
    'account_id' => '12345678',
    'terminal_id' => 'MT5-DESKTOP-ABC',
    'symbols' => array(
        array(
            'broker_symbol' => 'EURUSDm',
            'normalized_symbol' => 'EURUSD',
            'selected' => false,
            'spread' => 14,
        ),
    ),
), ea_bridge_headers());
assert_true($upsert_response instanceof WP_REST_Response, 'Symbol-sync upsert request must return a REST response.');
assert_same(1, $upsert_response->data['symbols_upserted'], 'Symbol-sync upsert must report one updated row.');

$table = $wpdb->tables['wp_smc_sf_symbol_sync'] ?? array();
assert_same(2, count($table), 'Symbol-sync upsert must not create duplicate rows for the same broker symbol identity.');
$eurusd = $table['7|12345678|MT5-DESKTOP-ABC|EURUSDm'] ?? null;
assert_same(0, $eurusd['selected'] ?? null, 'Symbol-sync upsert must update mutable fields on the existing row.');
assert_same(14.0, $eurusd['spread'] ?? null, 'Symbol-sync upsert must update numeric fields on the existing row.');

$invalid = dispatch_ea_request($plugin, 'permission_ea_bridge', 'post_ea_symbol_sync', array(
    'user_id' => 7,
    'symbols' => array(
        array(
            'broker_symbol' => 'GBPUSDm',
        ),
    ),
), ea_bridge_headers());
assert_true($invalid instanceof WP_Error, 'Symbol-sync missing normalized_symbol must fail safely.');
assert_same('smc_sf_symbol_sync_symbol_invalid', $invalid->code, 'Symbol-sync invalid payload must use the route validation error code.');

$missing_user = dispatch_ea_request($plugin, 'permission_ea_bridge', 'post_ea_symbol_sync', array(
    'symbols' => array(
        array(
            'broker_symbol' => 'EURUSDm',
            'normalized_symbol' => 'EURUSD',
        ),
    ),
), ea_bridge_headers());
assert_true($missing_user instanceof WP_Error, 'Symbol-sync missing user_id must fail safely.');
assert_same('smc_sf_user_required', $missing_user->code, 'Symbol-sync missing user_id must preserve the backend auth guard.');

$zero_user = dispatch_ea_request($plugin, 'permission_ea_bridge', 'post_ea_symbol_sync', array(
    'user_id' => 0,
    'symbols' => array(
        array(
            'broker_symbol' => 'EURUSDm',
            'normalized_symbol' => 'EURUSD',
        ),
    ),
), ea_bridge_headers());
assert_true($zero_user instanceof WP_Error, 'Symbol-sync zero user_id must fail safely.');
assert_same('smc_sf_user_required', $zero_user->code, 'Symbol-sync zero user_id must preserve the backend auth guard.');

$missing_key = dispatch_ea_request($plugin, 'permission_ea_bridge', 'post_ea_symbol_sync', $payload, array());
assert_true($missing_key instanceof WP_Error, 'Symbol-sync missing API key must fail safely.');
assert_same('smc_sf_api_key_missing', $missing_key->code, 'Symbol-sync missing API key must use the plugin auth error code.');

fwrite(STDOUT, "EA symbol-sync checks passed\n");

