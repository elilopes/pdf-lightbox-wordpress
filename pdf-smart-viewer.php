<?php
/**
 * Plugin Name: PDF Smart Viewer
 * Description: Visualizador PDF em Lightbox com miniaturas, zoom, pesquisa, anotações locais, favoritos, histórico, comentários moderados e Google Drive.
 * Version: 1.2.0
 * Author: PDF Smart Viewer
 * Text Domain: pdf-smart-viewer
 * Requires at least: 6.0
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('PSV_VERSION')) {
    define('PSV_VERSION', '1.2.0');
}
if (!defined('PSV_FILE')) {
    define('PSV_FILE', __FILE__);
}
if (!defined('PSV_PATH')) {
    define('PSV_PATH', plugin_dir_path(__FILE__));
}
if (!defined('PSV_URL')) {
    define('PSV_URL', plugin_dir_url(__FILE__));
}

/**
 * Report initialization problems in wp-admin without taking down the public site.
 */
function psv_admin_error_notice() {
    if (!current_user_can('activate_plugins')) {
        return;
    }

    $message = get_option('psv_bootstrap_error');
    if (!$message) {
        return;
    }

    echo '<div class="notice notice-error"><p><strong>PDF Smart Viewer:</strong> ' .
        esc_html($message) . '</p></div>';
}
add_action('admin_notices', 'psv_admin_error_notice');

$psv_php_ok = version_compare(PHP_VERSION, '7.4', '>=');
$psv_wp_ok = isset($GLOBALS['wp_version']) && version_compare($GLOBALS['wp_version'], '6.0', '>=');

if (!$psv_php_ok || !$psv_wp_ok) {
    $psv_requirements_error = !$psv_php_ok
        ? 'Este plugin requer PHP 7.4 ou superior. Atualize o PHP para ativá-lo.'
        : 'Este plugin requer WordPress 6.0 ou superior. Atualize o WordPress para ativá-lo.';
    update_option('psv_bootstrap_error', $psv_requirements_error, false);
    return;
}

try {
    require_once PSV_PATH . 'includes/class-psv-core.php';
    require_once PSV_PATH . 'includes/class-psv-rest.php';
    require_once PSV_PATH . 'includes/class-psv-admin.php';
    require_once PSV_PATH . 'includes/class-psv-elementor.php';
    delete_option('psv_bootstrap_error');
} catch (Throwable $error) {
    update_option(
        'psv_bootstrap_error',
        'O plugin não pôde carregar seus componentes. Verifique os arquivos e o log de erros do PHP.',
        false
    );
    error_log('[PDF Smart Viewer] Bootstrap error: ' . $error->getMessage());
}

register_activation_hook(__FILE__, function () {
    if (!class_exists('PSV_Core')) {
        update_option(
            'psv_bootstrap_error',
            'A ativação foi interrompida porque os componentes do plugin não foram carregados. Verifique os requisitos e os arquivos.',
            false
        );
        return;
    }

    try {
        PSV_Core::activate();
        delete_option('psv_bootstrap_error');
    } catch (Throwable $error) {
        update_option(
            'psv_bootstrap_error',
            'Não foi possível concluir a instalação da tabela de comentários. Verifique o log de erros do PHP.',
            false
        );
        error_log('[PDF Smart Viewer] Activation error: ' . $error->getMessage());
    }
});

add_action('plugins_loaded', function () {
    try {
        if (class_exists('PSV_Core')) {
            PSV_Core::instance();
        }
        if (class_exists('PSV_REST')) {
            PSV_REST::instance();
        }
        if (class_exists('PSV_Admin')) {
            PSV_Admin::instance();
        }
        if (class_exists('PSV_Elementor')) {
            PSV_Elementor::instance();
        }
    } catch (Throwable $error) {
        update_option(
            'psv_bootstrap_error',
            'O plugin encontrou uma falha durante a inicialização e foi desativado nesta requisição para proteger o site. Verifique o log de erros do PHP.',
            false
        );
        error_log('[PDF Smart Viewer] Initialization error: ' . $error->getMessage());
    }
});
