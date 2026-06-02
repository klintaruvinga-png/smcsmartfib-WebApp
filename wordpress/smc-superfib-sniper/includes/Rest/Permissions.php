<?php
namespace SMC\SuperFib\Rest;

use WP_Error;
use WP_REST_Request;

class Permissions {
    public static function permission_user() {
        $logged_in = is_user_logged_in();
        $can_read = current_user_can('read');
        $user_id = get_current_user_id();

        if (!$logged_in || !$can_read) {
            error_log(sprintf(
                'SMC SuperFIB auth failed: user_id=%s logged_in=%s can_read=%s request_uri=%s method=%s remote_addr=%s',
                $user_id,
                $logged_in ? 'true' : 'false',
                $can_read ? 'true' : 'false',
                isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : 'unknown',
                isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'unknown',
                isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown'
            ));

            return new WP_Error('smc_sf_auth_required', 'Authentication required.', array('status' => 401));
        }

        return true;
    }

    public static function permission_admin() {
        $logged_in = is_user_logged_in();
        $can_manage = current_user_can('manage_options');
        $user_id = get_current_user_id();

        if (!$logged_in) {
            error_log(sprintf(
                'SMC SuperFIB admin auth failed: user_id=%s logged_in=%s can_manage_options=%s request_uri=%s method=%s remote_addr=%s',
                $user_id,
                $logged_in ? 'true' : 'false',
                $can_manage ? 'true' : 'false',
                isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : 'unknown',
                isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'unknown',
                isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown'
            ));

            return new WP_Error('smc_sf_auth_required', 'Authentication required.', array('status' => 401));
        }

        if (!$can_manage) {
            error_log(sprintf(
                'SMC SuperFIB admin auth failed: user_id=%s logged_in=%s can_manage_options=%s request_uri=%s method=%s remote_addr=%s',
                $user_id,
                $logged_in ? 'true' : 'false',
                $can_manage ? 'true' : 'false',
                isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : 'unknown',
                isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'unknown',
                isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown'
            ));

            return new WP_Error('smc_sf_admin_required', 'Administrator access required.', array('status' => 403));
        }

        return true;
    }

    public static function permission_ea_market_stream(WP_REST_Request $request) {
        return self::permission_ea_bridge($request);
    }

    public static function permission_ea_bridge(WP_REST_Request $request) {
        $provided = trim((string) self::get_ea_api_key($request));
        if ($provided === '') {
            error_log('SMC SuperFIB EA bridge auth failed: missing API key.');
            return new WP_Error('smc_sf_api_key_missing', 'X-EA-API-Key or X-API-KEY header required.', array('status' => 401));
        }

        $configured = trim((string) (defined('SMC_SF_EA_API_KEY') ? SMC_SF_EA_API_KEY : getenv('SMC_SF_EA_API_KEY')));
        if ($configured === '') {
            error_log('SMC SuperFIB EA bridge auth failed: SMC_SF_EA_API_KEY is not configured.');
            return new WP_Error('smc_sf_api_key_unconfigured', 'EA ingest key not configured.', array('status' => 503));
        }

        if (!hash_equals($configured, $provided)) {
            error_log('SMC SuperFIB EA bridge auth failed: invalid API key.');
            return new WP_Error('smc_sf_api_key_invalid', 'Invalid API key.', array('status' => 403));
        }

        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            $payload = array();
        }

        $ea_user_id = (int) self::ea_request_value($request, $payload, 'user_id', 0);
        if ($ea_user_id <= 0) {
            error_log('SMC SuperFIB EA bridge auth failed: missing user_id.');
            return new WP_Error('smc_sf_user_required', 'user_id is required for EA ingest.', array('status' => 400));
        }

        $user = get_userdata($ea_user_id);
        if (!$user || !user_can($user, 'read')) {
            error_log('SMC SuperFIB EA bridge auth failed: invalid readable user_id=' . $ea_user_id);
            return new WP_Error('smc_sf_user_invalid', 'user_id must reference a valid readable user.', array('status' => 403));
        }

        wp_set_current_user($ea_user_id);

        if (defined('WP_DEBUG') && WP_DEBUG) {
            $route = method_exists($request, 'get_route') ? (string) $request->get_route() : '';
            $method = method_exists($request, 'get_method') ? (string) $request->get_method() : '';
            error_log(
                'SMC SuperFIB EA bridge auth success: user_id=' . $ea_user_id
                . ($method !== '' ? ' method=' . $method : '')
                . ($route !== '' ? ' route=' . $route : '')
            );
        }

        return true;
    }

    public static function get_ea_api_key(WP_REST_Request $request): string {
        $header_names = array(
            'x-ea-api-key',
            'x_ea_api_key',
            'x-api-key',
            'x_api_key',
        );

        foreach ($header_names as $name) {
            $value = trim((string) $request->get_header($name));
            if ($value !== '') {
                return $value;
            }
        }

        return '';
    }

    public static function ea_request_value(WP_REST_Request $request, array $payload, $key, $default = null) {
        if (array_key_exists($key, $payload)) {
            return $payload[$key];
        }

        $value = $request->get_param($key);
        return $value !== null ? $value : $default;
    }

    public static function resolve_ea_user_id(): int {
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
