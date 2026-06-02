<?php
/**
 * Shared formatting and WordPress utility helpers for SMC SuperFIB.
 */

if (!defined('ABSPATH')) {
    exit;
}

final class SMC_SuperFib_Plugin_Utils {
    public function table($name) {
        global $wpdb;
        return $wpdb->prefix . 'smc_sf_' . $name;
    }

    public function now_mysql() {
        return gmdate('Y-m-d H:i:s');
    }

    public function wpdb_last_error() {
        global $wpdb;
        if (is_object($wpdb) && property_exists($wpdb, 'last_error') && $wpdb->last_error !== '') {
            return (string) $wpdb->last_error;
        }
        return null;
    }

    public function rest_response_status_code($response) {
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

    public function to_iso($mysql_time) {
        if (!$mysql_time) {
            return null;
        }
        return gmdate('c', strtotime($mysql_time . ' UTC'));
    }
}
