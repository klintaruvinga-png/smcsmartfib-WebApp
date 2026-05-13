<?php

require_once __DIR__ . '/test-ea-bridge-bootstrap.php';

reset_ea_bridge_test_state();

$plugin = new SMC_SuperFib_Sniper_REST();
$plugin->register_routes();

$route = find_registered_route('/ea/license-check');
assert_true(is_array($route), 'License-check route must register under /ea/license-check.');
assert_same(WP_REST_Server::READABLE, $route['args']['methods'], 'License-check route must use GET.');

$allowed = dispatch_ea_request($plugin, 'permission_ea_bridge', 'get_ea_license_check', array(
    'user_id' => 7,
    'account_id' => '12345678',
    'terminal_id' => 'MT5-DESKTOP-ABC',
    'ea_version' => '13.0.3',
), ea_bridge_headers());
assert_true($allowed instanceof WP_REST_Response, 'License-check should return a REST response for valid requests.');
assert_same(true, $allowed->data['ok'], 'License-check response must set ok=true.');
assert_same(true, $allowed->data['allowed'], 'License-check should allow a valid authenticated request by default.');
assert_same('active', $allowed->data['status'], 'License-check allowed response must report active status.');
assert_same(7, $allowed->data['user_id'], 'License-check must echo the authenticated user_id.');
assert_same('12345678', $allowed->data['account_id'], 'License-check must echo account_id.');
assert_same('MT5-DESKTOP-ABC', $allowed->data['terminal_id'], 'License-check must echo terminal_id.');
assert_same('internal', $allowed->data['plan'], 'License-check must default to the internal operational plan.');
assert_true(array_key_exists('reason', $allowed->data), 'License-check must include a reason field in the response shape.');
assert_same(null, $allowed->data['reason'], 'License-check allowed response must carry a null reason.');
assert_true(isset($allowed->data['server_time']), 'License-check must include server_time.');

global $wpdb;
$wpdb->replace('wp_smc_sf_account_snapshots', array(
    'user_id' => 7,
    'data' => json_encode(array(
        'eaBridge' => array(
            'accounts' => array(
                '12345678|MT5-DESKTOP-ABC' => array(
                    'allowed' => false,
                    'status' => 'disabled',
                    'reason' => 'EA access disabled for this account',
                ),
            ),
        ),
    )),
    'updated_at' => gmdate('Y-m-d H:i:s'),
));

$blocked = dispatch_ea_request($plugin, 'permission_ea_bridge', 'get_ea_license_check', array(
    'user_id' => 7,
    'account_id' => '12345678',
    'terminal_id' => 'MT5-DESKTOP-ABC',
), ea_bridge_headers());
assert_true($blocked instanceof WP_REST_Response, 'Blocked license-check should still return a REST response.');
assert_same(true, $blocked->data['ok'], 'Blocked license-check must still set ok=true.');
assert_same(false, $blocked->data['allowed'], 'Blocked license-check must set allowed=false.');
assert_same('disabled', $blocked->data['status'], 'Blocked license-check must surface disabled status.');
assert_same('EA access disabled for this account', $blocked->data['reason'], 'Blocked license-check must preserve the block reason.');

$missing_key = dispatch_ea_request($plugin, 'permission_ea_bridge', 'get_ea_license_check', array(
    'user_id' => 7,
), array());
assert_true($missing_key instanceof WP_Error, 'License-check missing API key must fail safely.');
assert_same('smc_sf_api_key_missing', $missing_key->code, 'License-check missing API key must use the plugin auth error code.');

fwrite(STDOUT, "EA license-check checks passed\n");
