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
if (!function_exists('register_deactivation_hook')) {
    function register_deactivation_hook(...$args) {}
}
if (!function_exists('plugin_dir_path')) {
    function plugin_dir_path($file) {
        return dirname($file) . DIRECTORY_SEPARATOR;
    }
}
if (!function_exists('is_user_logged_in')) {
    function is_user_logged_in() {
        return true;
    }
}
if (!function_exists('rest_url')) {
    function rest_url() {
        return 'https://example.test/wp-json/';
    }
}
if (!function_exists('esc_url_raw')) {
    function esc_url_raw($url) {
        return $url;
    }
}
if (!function_exists('wp_create_nonce')) {
    function wp_create_nonce($action) {
        return 'nonce-for-' . $action;
    }
}
if (!function_exists('wp_json_encode')) {
    function wp_json_encode($value) {
        return json_encode($value);
    }
}

$GLOBALS['smc_rest_bootstrap_registered'] = array();
$GLOBALS['smc_rest_bootstrap_enqueued'] = array();
$GLOBALS['smc_rest_bootstrap_inline'] = array();

if (!function_exists('wp_register_script')) {
    function wp_register_script($handle, $src, $deps = array(), $ver = false, $in_footer = false) {
        $GLOBALS['smc_rest_bootstrap_registered'][] = compact('handle', 'src', 'deps', 'ver', 'in_footer');
    }
}
if (!function_exists('wp_enqueue_script')) {
    function wp_enqueue_script($handle) {
        $GLOBALS['smc_rest_bootstrap_enqueued'][] = $handle;
    }
}
if (!function_exists('wp_add_inline_script')) {
    function wp_add_inline_script($handle, $data, $position = 'after') {
        $GLOBALS['smc_rest_bootstrap_inline'][] = compact('handle', 'data', 'position');
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

SMC_SuperFib_Sniper_REST::enqueue_rest_api_settings();

assert_same(1, count($GLOBALS['smc_rest_bootstrap_registered']), 'bootstrap script must be registered once');
assert_same(array('wp-api'), $GLOBALS['smc_rest_bootstrap_registered'][0]['deps'], 'bootstrap must depend on wp-api');
assert_same(array('smc-superfib-sniper-rest-bootstrap'), $GLOBALS['smc_rest_bootstrap_enqueued'], 'bootstrap handle must be enqueued');
assert_same(1, count($GLOBALS['smc_rest_bootstrap_inline']), 'bootstrap must add one inline merge script');
assert_same('before', $GLOBALS['smc_rest_bootstrap_inline'][0]['position'], 'inline merge must run before dependent reads');

$inline = $GLOBALS['smc_rest_bootstrap_inline'][0]['data'];
if (strpos($inline, 'window.wpApiSettings = Object.assign({}, window.wpApiSettings || {}, ') === false) {
    fail('bootstrap must merge existing wpApiSettings instead of overwriting it');
}
if (strpos($inline, '"root":"https:\\/\\/example.test\\/wp-json\\/"') === false) {
    fail('bootstrap inline payload missing REST root');
}
if (strpos($inline, '"nonce":"nonce-for-wp_rest"') === false) {
    fail('bootstrap inline payload missing REST nonce');
}

fwrite(STDOUT, 'rest bootstrap settings regression checks passed' . PHP_EOL);
