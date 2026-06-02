<?php
/**
 * EA request helper utilities for SMC SuperFIB REST routes.
 */

if (!defined('ABSPATH')) {
    exit;
}

final class SMC_SuperFib_EA_Request_Service {
    public function request_value(WP_REST_Request $request, array $payload, $key, $default = null) {
        if (array_key_exists($key, $payload)) {
            return $payload[$key];
        }

        $value = $request->get_param($key);
        return $value !== null ? $value : $default;
    }

    public function resolve_ea_user_id(): int
    {
        // EA key is global — resolve to the admin user
        // who owns the plugin installation
        $admin = get_users(array(
            'role'    => 'administrator',
            'number'  => 1,
            'orderby' => 'ID',
            'order'   => 'ASC',
            'fields'  => array('ID'),
        ));
        return !empty($admin) ? (int) $admin[0]->ID : 1;
    }
}
