<?php
if (!defined('ABSPATH')) {
    exit;
}

class PSV_Admin {
    private static $instance;

    public static function instance() {
        if (!self::$instance) {
            self::$instance = new self();
        }

        return self::$instance;
    }

    private function __construct() {
        add_action('admin_menu', array($this, 'menu'));
        add_action('admin_init', array($this, 'settings'));
        add_action('admin_post_psv_moderate', array($this, 'moderate'));
    }

    public function menu() {
        add_menu_page(
            __('PDF Smart Viewer', 'pdf-smart-viewer'),
            __('PDF Smart Viewer', 'pdf-smart-viewer'),
            'manage_options',
            'psv-settings',
            array($this, 'page'),
            'dashicons-pdf',
            59
        );

        add_submenu_page(
            'psv-settings',
            __('Comentários', 'pdf-smart-viewer'),
            __('Comentários', 'pdf-smart-viewer'),
            'moderate_comments',
            'psv-comments',
            array($this, 'comments_page')
        );
    }

    public function settings() {
        register_setting(
            'psv_settings_group',
            'psv_settings',
            array('sanitize_callback' => array($this, 'sanitize'))
        );
    }

    public function sanitize($input) {
        $input = is_array($input) ? wp_unslash($input) : array();

        return array(
            'google_client_id' => isset($input['google_client_id'])
                ? sanitize_text_field($input['google_client_id'])
                : '',
            'auto_detect' => empty($input['auto_detect']) ? 0 : 1,
        );
    }

    public function page() {
        if (!current_user_can('manage_options')) {
            return;
        }

        $options = get_option('psv_settings', array());
        ?>
        <div class="wrap">
            <h1><?php echo esc_html__('PDF Smart Viewer', 'pdf-smart-viewer'); ?></h1>

            <form method="post" action="options.php">
                <?php settings_fields('psv_settings_group'); ?>

                <table class="form-table">
                    <tr>
                        <th scope="row"><?php echo esc_html__('Detecção automática', 'pdf-smart-viewer'); ?></th>
                        <td>
                            <label>
                                <input
                                    type="checkbox"
                                    name="psv_settings[auto_detect]"
                                    value="1"
                                    <?php checked(!empty($options['auto_detect'])); ?>
                                >
                                <?php echo esc_html__('Abrir automaticamente no Lightbox links que apontam para arquivos .pdf', 'pdf-smart-viewer'); ?>
                            </label>
                            <p class="description">
                                <?php echo esc_html__('Links com a classe psv-ignore e links com target="_blank" serão ignorados.', 'pdf-smart-viewer'); ?>
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <th scope="row">
                            <label for="psv-google-client-id">
                                <?php echo esc_html__('Google OAuth Client ID', 'pdf-smart-viewer'); ?>
                            </label>
                        </th>
                        <td>
                            <input
                                id="psv-google-client-id"
                                class="regular-text"
                                name="psv_settings[google_client_id]"
                                value="<?php echo esc_attr($options['google_client_id'] ?? ''); ?>"
                                placeholder="xxxx.apps.googleusercontent.com"
                            >
                            <p class="description">
                                <?php echo esc_html__('Configure a Google Drive API e as origens JavaScript autorizadas no Google Cloud.', 'pdf-smart-viewer'); ?>
                            </p>
                        </td>
                    </tr>
                </table>

                <?php submit_button(__('Salvar configurações', 'pdf-smart-viewer')); ?>
            </form>

            <hr>

            <h2><?php echo esc_html__('Gerador de shortcode', 'pdf-smart-viewer'); ?></h2>
            <p><?php echo esc_html__('Informe a URL do PDF e copie o shortcode gerado.', 'pdf-smart-viewer'); ?></p>

            <p>
                <input
                    id="psv-shortcode-url"
                    class="regular-text"
                    type="url"
                    placeholder="https://seusite.com/documento.pdf"
                >
                <button type="button" class="button" id="psv-generate">
                    <?php echo esc_html__('Gerar shortcode', 'pdf-smart-viewer'); ?>
                </button>
            </p>

            <input id="psv-shortcode-output" class="large-text code" readonly>

            <p>
                <?php echo esc_html__('Exemplo:', 'pdf-smart-viewer'); ?>
                <code>[pdf_viewer url="https://seusite.com/documento.pdf" title="Visualizar PDF"]</code>
            </p>

            <h2><?php echo esc_html__('Integrações', 'pdf-smart-viewer'); ?></h2>
            <p><strong><?php echo esc_html__('Shortcode:', 'pdf-smart-viewer'); ?></strong> <code>[pdf_viewer id="123"]</code></p>
            <p><strong>HTML:</strong> <code>&lt;pdf-smart-viewer src="https://site.com/arquivo.pdf" title="Documento"&gt;&lt;/pdf-smart-viewer&gt;</code></p>
            <p><strong><?php echo esc_html__('Div HTML:', 'pdf-smart-viewer'); ?></strong> <code>&lt;div class="pdf-smart-viewer" data-pdf="https://site.com/arquivo.pdf" data-title="Documento"&gt;&lt;/div&gt;</code></p>
            <p><strong>PHP:</strong> <code>echo do_shortcode('[pdf_viewer id="123"]');</code></p>

            <p>
                <?php echo esc_html__('O PDF precisa ser acessível publicamente e, se estiver em outro domínio, permitir CORS para o domínio do site.', 'pdf-smart-viewer'); ?>
            </p>
        </div>

        <script>
        (function () {
            'use strict';

            var generateButton = document.getElementById('psv-generate');
            var urlField = document.getElementById('psv-shortcode-url');
            var outputField = document.getElementById('psv-shortcode-output');

            if (!generateButton || !urlField || !outputField) {
                return;
            }

            generateButton.addEventListener('click', function () {
                var url = urlField.value.trim();

                if (!url) {
                    return;
                }

                outputField.value = '[pdf_viewer url="' +
                    url.replace(/"/g, '&quot;') +
                    '" title="Visualizar PDF"]';
                outputField.select();
            });
        })();
        </script>
        <?php
    }

    public function comments_page() {
        if (!current_user_can('moderate_comments')) {
            return;
        }

        global $wpdb;

        $table = PSV_Core::table();
        $rows = $wpdb->get_results(
            "SELECT * FROM {$table} ORDER BY created_at DESC LIMIT 500"
        );
        ?>
        <div class="wrap">
            <h1><?php echo esc_html__('Comentários dos PDFs', 'pdf-smart-viewer'); ?></h1>
            <p><?php echo esc_html__('Comentários e respostas aguardam aprovação.', 'pdf-smart-viewer'); ?></p>

            <table class="widefat striped">
                <thead>
                    <tr>
                        <th><?php echo esc_html__('Documento', 'pdf-smart-viewer'); ?></th>
                        <th><?php echo esc_html__('Página', 'pdf-smart-viewer'); ?></th>
                        <th><?php echo esc_html__('Autor', 'pdf-smart-viewer'); ?></th>
                        <th><?php echo esc_html__('Comentário', 'pdf-smart-viewer'); ?></th>
                        <th><?php echo esc_html__('Data', 'pdf-smart-viewer'); ?></th>
                        <th><?php echo esc_html__('Ações', 'pdf-smart-viewer'); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php if ($rows) : ?>
                        <?php foreach ($rows as $row) : ?>
                            <tr>
                                <td>
                                    <a
                                        href="<?php echo esc_url($row->document_url); ?>"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <?php echo esc_html__('Abrir PDF', 'pdf-smart-viewer'); ?>
                                    </a>
                                </td>
                                <td><?php echo esc_html(absint($row->page_number)); ?></td>
                                <td>
                                    <?php echo esc_html($row->author_name); ?><br>
                                    <?php echo esc_html($row->author_email); ?>
                                </td>
                                <td>
                                    <?php if (!empty($row->parent_id)) : ?>
                                        <em><?php echo esc_html__('Resposta', 'pdf-smart-viewer'); ?></em><br>
                                    <?php endif; ?>
                                    <?php echo esc_html($row->comment_text); ?>
                                </td>
                                <td><?php echo esc_html($row->created_at); ?></td>
                                <td>
                                    <?php
                                    $actions = array(
                                        'approved' => __('Aprovar', 'pdf-smart-viewer'),
                                        'rejected' => __('Rejeitar', 'pdf-smart-viewer'),
                                        'delete' => __('Excluir', 'pdf-smart-viewer'),
                                    );
                                    ?>

                                    <?php foreach ($actions as $status => $label) : ?>
                                        <form
                                            style="display:inline-block;margin:2px"
                                            method="post"
                                            action="<?php echo esc_url(admin_url('admin-post.php')); ?>"
                                        >
                                            <input type="hidden" name="action" value="psv_moderate">
                                            <input type="hidden" name="id" value="<?php echo esc_attr(absint($row->id)); ?>">
                                            <input type="hidden" name="status" value="<?php echo esc_attr($status); ?>">
                                            <?php wp_nonce_field('psv_moderate_' . absint($row->id)); ?>
                                            <?php submit_button($label, 'small'); ?>
                                        </form>
                                    <?php endforeach; ?>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    <?php else : ?>
                        <tr>
                            <td colspan="6"><?php echo esc_html__('Nenhum comentário.', 'pdf-smart-viewer'); ?></td>
                        </tr>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
        <?php
    }

    public function moderate() {
        if (!current_user_can('moderate_comments')) {
            wp_die(esc_html__('Acesso negado.', 'pdf-smart-viewer'));
        }

        $id = isset($_POST['id']) ? absint(wp_unslash($_POST['id'])) : 0;
        check_admin_referer('psv_moderate_' . $id);

        $status = isset($_POST['status'])
            ? sanitize_key(wp_unslash($_POST['status']))
            : '';

        global $wpdb;
        $table = PSV_Core::table();

        if ('delete' === $status) {
            $wpdb->delete($table, array('id' => $id), array('%d'));
        } elseif (in_array($status, array('approved', 'rejected'), true)) {
            $wpdb->update(
                $table,
                array('status' => $status),
                array('id' => $id),
                array('%s'),
                array('%d')
            );
        }

        wp_safe_redirect(admin_url('admin.php?page=psv-comments'));
        exit;
    }
}
