<?php
/**
 * Uninstall routine for PDF Smart Viewer.
 *
 * @package PDF_Smart_Viewer
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

/**
 * Remove this plugin's options, temporary rate-limit records and comments table.
 *
 * @return void
 */
function psv_uninstall_cleanup_site() {
    global $wpdb;

    $table = $wpdb->prefix . 'psv_comments';
    $wpdb->query("DROP TABLE IF EXISTS `{$table}`");

    delete_option('psv_settings');
    delete_option('psv_bootstrap_error');

    $transient_prefixes = array(
        '_transient_psv_rate_',
        '_transient_timeout_psv_rate_',
        '_transient_psv_ai_rate_',
        '_transient_timeout_psv_ai_rate_',
    );
    foreach ($transient_prefixes as $prefix) {
        $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s",
                $wpdb->esc_like($prefix) . '%'
            )
        );
    }
}

if (is_multisite()) {
    $site_ids = get_sites(array(
        'fields' => 'ids',
        'number' => 0,
    ));

    foreach ($site_ids as $site_id) {
        switch_to_blog($site_id);
        psv_uninstall_cleanup_site();
        restore_current_blog();
    }
} else {
    psv_uninstall_cleanup_site();
}
