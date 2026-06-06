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
if (!function_exists('home_url')) {
    function home_url() {
        return 'https://example.test';
    }
}
if (!function_exists('apply_filters')) {
    function apply_filters($tag, $value) {
        return $value;
    }
}
if (!function_exists('wp_parse_url')) {
    function wp_parse_url($url, $component = -1) {
        return parse_url($url, $component);
    }
}
if (!function_exists('esc_url_raw')) {
    function esc_url_raw($url) {
        return $url;
    }
}
if (!function_exists('wp_unslash')) {
    function wp_unslash($value) {
        return $value;
    }
}
if (!function_exists('untrailingslashit')) {
    function untrailingslashit($string) {
        return rtrim($string, '/');
    }
}

require_once dirname(__DIR__, 2) . '/smc-superfib-sniper.php';

$ref = new ReflectionClass('SMC_SuperFib_Sniper_REST');

$allowedMethod = $ref->getMethod('get_allowed_origins');
$allowedMethod->setAccessible(true);
$isAllowedMethod = $ref->getMethod('is_allowed_origin');
$isAllowedMethod->setAccessible(true);
$validateMethod = $ref->getMethod('validate_cors_origins_consistency');
$validateMethod->setAccessible(true);

$allowed = $allowedMethod->invoke(null);
$errors = [];

if (!$validateMethod->invoke(null)) {
    $errors[] = 'CORS regression guard validation failed.';
}

$headersMethod = $ref->getMethod('get_cors_allowed_headers');
$headersMethod->setAccessible(true);
$allowedHeaders = $headersMethod->invoke(null);

// Regression guard: original headers must still be present.
if (strpos($allowedHeaders, 'X-Sniper-Secret') === false) {
    $errors[] = 'CORS regression guard missing X-Sniper-Secret in allowed headers.';
}
// New required headers.
if (strpos($allowedHeaders, 'X-Requested-With') === false) {
    $errors[] = 'CORS missing X-Requested-With in allowed headers.';
}
if (strpos($allowedHeaders, 'X-SMC-Token') === false) {
    $errors[] = 'CORS missing X-SMC-Token in allowed headers.';
}
if (strpos($allowedHeaders, 'X-SMC-Auth') === false) {
    $errors[] = 'CORS missing X-SMC-Auth in allowed headers.';
}

$cases = [
    // Existing allowed origins - must not regress.
    ['origin' => 'https://example.test', 'allowed' => true],
    ['origin' => 'https://smcsuperfibwebapp.klintaruvinga.workers.dev', 'allowed' => true],
    ['origin' => 'https://another-test.workers.dev', 'allowed' => false],
    ['origin' => 'https://id-preview--97eda4a2-efed-4b50-8b90-e9ac49043f57.lovable.app', 'allowed' => true],
    ['origin' => 'https://smcsmartfib.lovable.app', 'allowed' => true],
    ['origin' => 'https://malicious.example.com', 'allowed' => false],
    // New localhost/dev origins
    ['origin' => 'http://localhost:5173', 'allowed' => true],
    ['origin' => 'http://127.0.0.1:5173', 'allowed' => true],
    ['origin' => 'http://localhost:5174', 'allowed' => true],
    ['origin' => 'http://127.0.0.1:5174', 'allowed' => true],
    // Must not allow arbitrary localhost ports
    ['origin' => 'http://localhost:9999', 'allowed' => false],
];

foreach ($cases as $case) {
    $actual = $isAllowedMethod->invoke(null, $case['origin'], $allowed);
    if ($actual !== $case['allowed']) {
        $errors[] = sprintf('Origin %s expected %s but got %s', $case['origin'], $case['allowed'] ? 'allowed' : 'denied', $actual ? 'allowed' : 'denied');
    }
}

if ($errors) {
    fwrite(STDERR, implode(PHP_EOL, $errors) . PHP_EOL);
    exit(1);
}

fwrite(STDOUT, 'CORS regression checks passed' . PHP_EOL);
