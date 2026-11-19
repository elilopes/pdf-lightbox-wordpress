<?php
/**
 * Plugin Name: PDF Smart Viewer
 * Description: Visualizador PDF em Lightbox com miniaturas, zoom, pesquisa, anotações locais, favoritos, histórico, comentários moderados e Google Drive.
 * Version: 1.1.0
 * Author: PDF Smart Viewer
 * Text Domain: pdf-smart-viewer
 * Requires at least: 6.0
 * Requires PHP: 7.4
 */
if (!defined('ABSPATH')) exit;
define('PSV_VERSION', '1.1.0');
define('PSV_FILE', __FILE__);
define('PSV_PATH', plugin_dir_path(__FILE__));
define('PSV_URL', plugin_dir_url(__FILE__));
require_once PSV_PATH . 'includes/class-psv-core.php';
require_once PSV_PATH . 'includes/class-psv-rest.php';
require_once PSV_PATH . 'includes/class-psv-admin.php';
require_once PSV_PATH . 'includes/class-psv-elementor.php';
register_activation_hook(__FILE__, ['PSV_Core', 'activate']);
add_action('plugins_loaded', function () {
    PSV_Core::instance(); PSV_REST::instance(); PSV_Admin::instance(); PSV_Elementor::instance();
});
