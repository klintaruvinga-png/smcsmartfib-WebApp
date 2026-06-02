<?php
/**
 * Plugin Name: SMC SuperFIB Signal Engine & Account Manager
 * Description: WordPress REST backend for the SMC SuperFIB Dashboard.
 * Version: 13.0.3
 * Author: Kudzanai Lloyd Taruvinga For Munhumukapa Holdings Group
 */

if (!defined('ABSPATH')) {
    exit;
}

define('SMC_SF_VERSION', '13.0.3');
define('SMC_SF_NAMESPACE', 'sniper/v1');
define('SMC_SF_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('SMC_SF_PLUGIN_FILE', __FILE__);

if (!function_exists('plugin_dir_url')) {
    function plugin_dir_url($file) {
        return plugin_dir_path($file);
    }
}

define('SMC_SF_PLUGIN_URL', plugin_dir_url(__FILE__));

require_once SMC_SF_PLUGIN_DIR . 'includes/Autoloader.php';
SMC\SuperFib\Autoloader::register();
require_once SMC_SF_PLUGIN_DIR . 'includes/Legacy_SMC_SuperFib_Sniper_REST.php';

register_activation_hook(__FILE__, ['SMC_SuperFib_Sniper_REST', 'activate']);
register_deactivation_hook(__FILE__, ['SMC_SuperFib_Sniper_REST', 'deactivate']);

add_action('plugins_loaded', ['SMC\\SuperFib\\Plugin', 'boot']);
