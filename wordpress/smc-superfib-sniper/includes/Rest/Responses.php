<?php
namespace SMC\SuperFib\Rest;

class Responses {
    public static function rest_response_status_code($response) {
        if (!($response instanceof WP_REST_Response)) {
            return 200;
        }

        if (method_exists($response, 'get_status')) {
            return (int) $response->get_status();
        }

        if (property_exists($response, 'status')) {
            return (int) $response->status;
        }

        return 200;
    }

    public static function no_cache_response($payload) {
        $response = rest_ensure_response($payload);

        if ($response instanceof WP_REST_Response && method_exists($response, 'header')) {
            $response->header('Cache-Control', 'no-store, no-cache, must-revalidate');
            $response->header('Pragma', 'no-cache');
        }

        return $response;
    }

    public static function to_iso($mysql_time) {
        if (!$mysql_time) {
            return null;
        }

        return gmdate('c', strtotime($mysql_time . ' UTC'));
    }
}
