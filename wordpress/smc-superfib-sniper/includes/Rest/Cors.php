<?php
namespace SMC\SuperFib\Rest;

class Cors {
    public static function is_allowed_origin($origin, $allowed) {
        $normalized = untrailingslashit($origin);
        $allowed_normalized = array_map('untrailingslashit', $allowed);

        if (in_array($normalized, $allowed_normalized, true)) {
            return true;
        }

        $host = wp_parse_url($origin, PHP_URL_HOST);
        if (!$host) {
            return false;
        }

        if (preg_match('/^(?:[0-9a-f\-]+\.lovableproject\.com|id-preview--[0-9a-z\-]+\.lovable\.app)$/', $host)) {
            return true;
        }

        return false;
    }

    public static function get_allowed_origins() {
        return apply_filters('smc_sf_allowed_origins', array(
            home_url(),
            'https://trader.stokvelsociety.co.za',
            'https://smcsuperfibwebapp.klintaruvinga.workers.dev',
            'https://smcsmartfib.lovable.app',
            'https://id-preview--97eda4a2-efed-4b50-8b90-e9ac49043f57.lovable.app',
        ));
    }

    public static function get_cors_allowed_headers() {
        return 'Authorization, Content-Type, X-WP-Nonce, X-Sniper-Secret, X-EA-API-Key, X-API-KEY';
    }

    public static function send_cors_headers_for_origin($origin) {
        header('Vary: Origin', false);
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: ' . self::get_cors_allowed_headers());
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Max-Age: 86400');
    }

    public static function handle_options_preflight_request() {
        if (isset($_SERVER['REQUEST_METHOD']) && strtoupper($_SERVER['REQUEST_METHOD']) === 'OPTIONS') {
            $request_uri = $_SERVER['REQUEST_URI'] ?? '';
            if (strpos($request_uri, '/wp-json/sniper/v1/') !== false) {
                $allowed = self::get_allowed_origins();
                $origin  = isset($_SERVER['HTTP_ORIGIN']) ? sanitize_text_field(wp_unslash($_SERVER['HTTP_ORIGIN'])) : '';
                if ($origin && self::is_allowed_origin($origin, $allowed)) {
                    self::send_cors_headers_for_origin($origin);
                    header('Content-Length: 0');
                    http_response_code(204);
                    exit;
                }
            }
        }
    }

    public static function validate_cors_origins_consistency() {
        $allowed_origins = self::get_allowed_origins();
        $normalized_origins = array_map('untrailingslashit', $allowed_origins);

        foreach ($allowed_origins as $origin) {
            if (!wp_parse_url($origin, PHP_URL_SCHEME)) {
                return false;
            }
        }

        if (count($normalized_origins) !== count(array_unique($normalized_origins))) {
            return false;
        }

        return true;
    }
}
