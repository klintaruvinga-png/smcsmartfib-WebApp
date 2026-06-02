<?php
namespace SMC\SuperFib;

class Plugin {
    public static function boot(): void {
        if (!class_exists('SMC_SuperFib_Sniper_REST')) {
            require_once SMC_SF_PLUGIN_DIR . 'includes/Legacy_SMC_SuperFib_Sniper_REST.php';
        }

        if (method_exists('SMC_SuperFib_Sniper_REST', 'boot')) {
            \SMC_SuperFib_Sniper_REST::boot();
        }
    }

    public static function enqueue_rest_api_settings(): void {
        if (class_exists('SMC_SuperFib_Sniper_REST') && method_exists('SMC_SuperFib_Sniper_REST', 'enqueue_rest_api_settings')) {
            call_user_func(['SMC_SuperFib_Sniper_REST', 'enqueue_rest_api_settings']);
        }
    }
}
