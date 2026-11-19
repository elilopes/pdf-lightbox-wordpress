<?php
if (!defined('ABSPATH')) { exit; }

final class PSV_Core {
    private static $instance;

    public static function instance() {
        if (!self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public static function table() {
        global $wpdb;
        return $wpdb->prefix . 'psv_comments';
    }

    /**
     * Canonical URL representation shared by all PDF entry points and REST validation.
     */
    public static function normalize_url($value) {
        if (!is_scalar($value)) {
            return '';
        }

        $value = trim((string) wp_unslash($value));
        if ($value === '') {
            return '';
        }

        $parts = wp_parse_url($value);
        if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            return '';
        }

        $scheme = strtolower($parts['scheme']);
        if (!in_array($scheme, array('http', 'https'), true) || isset($parts['user']) || isset($parts['pass'])) {
            return '';
        }

        $host = strtolower($parts['host']);
        if (function_exists('idn_to_ascii') && preg_match('/[^\x20-\x7e]/', $host)) {
            $ascii_host = idn_to_ascii($host, 0, defined('INTL_IDNA_VARIANT_UTS46') ? INTL_IDNA_VARIANT_UTS46 : 0);
            if ($ascii_host) {
                $host = strtolower($ascii_host);
            }
        }

        $port = isset($parts['port']) ? (int) $parts['port'] : null;
        if (($scheme === 'http' && $port === 80) || ($scheme === 'https' && $port === 443)) {
            $port = null;
        }

        $path = isset($parts['path']) && $parts['path'] !== '' ? $parts['path'] : '/';
        $url = $scheme . '://' . $host . ($port ? ':' . $port : '') . self::normalize_url_component($path);

        if (isset($parts['query'])) {
            $url .= '?' . self::normalize_url_component($parts['query']);
        }
        if (isset($parts['fragment'])) {
            $url .= '#' . self::normalize_url_component($parts['fragment']);
        }

        return wp_http_validate_url($url) ? $url : '';
    }

    private static function normalize_url_component($value) {
        $encoded = rawurlencode($value);
        $encoded = str_replace(
            array('%2F', '%3A', '%40', '%21', '%24', '%26', '%27', '%28', '%29', '%2A', '%2B', '%2C', '%3B', '%3D'),
            array('/', ':', '@', '!', '$', '&', "'", '(', ')', '*', '+', ',', ';', '='),
            $encoded
        );
        $encoded = preg_replace_callback('/%25([0-9a-f]{2})/i', function ($match) {
            return '%' . strtoupper($match[1]);
        }, $encoded);

        return preg_replace_callback('/%[0-9a-f]{2}/i', function ($match) {
            return strtoupper($match[0]);
        }, $encoded);
    }

    public static function activate() {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $charset = $wpdb->get_charset_collate();
        $table = self::table();
        $sql = "CREATE TABLE {$table} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            parent_id bigint(20) unsigned NOT NULL DEFAULT 0,
            document_key varchar(64) NOT NULL,
            document_url text NOT NULL,
            page_number int(10) unsigned NOT NULL DEFAULT 1,
            author_name varchar(100) NOT NULL,
            author_email varchar(190) NOT NULL,
            comment_text text NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'pending',
            created_at datetime NOT NULL,
            PRIMARY KEY  (id),
            KEY document_key (document_key),
            KEY status (status),
            KEY parent_id (parent_id)
        ) {$charset};";
        dbDelta($sql);

        $installed_table = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table));
        if ($installed_table !== $table) {
            throw new RuntimeException('A tabela de comentários do PDF Smart Viewer não foi criada.');
        }
    }

    private function __construct() {
        add_action('wp_enqueue_scripts', array($this, 'register_assets'));
        add_action('wp_enqueue_scripts', array($this, 'maybe_enqueue_assets'), 20);
        add_shortcode('pdf_viewer', array($this, 'shortcode'));
        add_shortcode('pdf_lightbox', array($this, 'button_shortcode'));
        add_action('init', array($this, 'register_block'));
        add_filter('script_loader_tag', array($this, 'script_tag'), 10, 3);
    }

    public function script_tag($tag, $handle, $src) {
        if ('psv-viewer' === $handle) {
            return '<script src="' . esc_url($src) . '" id="psv-viewer-js" defer></script>';
        }
        return $tag;
    }

    public function register_assets() {
        wp_register_style('psv-viewer', PSV_URL . 'assets/css/viewer.css', array(), PSV_VERSION);
        wp_register_script('psv-pdfjs', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', array(), '3.11.174', true);
        wp_register_script('psv-viewer', PSV_URL . 'assets/js/viewer.js', array('psv-pdfjs'), PSV_VERSION, true);

        $options = get_option('psv_settings', array());
        wp_localize_script('psv-viewer', 'PSV_CONFIG', array(
            'restUrl' => esc_url_raw(rest_url('psv/v1/')),
            'nonce' => wp_create_nonce('wp_rest'),
            'googleClientId' => isset($options['google_client_id']) ? sanitize_text_field($options['google_client_id']) : '',
            'autoDetect' => !empty($options['auto_detect']),
            'strings' => array(
                'loading' => __('Carregando PDF…', 'pdf-smart-viewer'),
                'loadError' => __('Não foi possível abrir este PDF. Verifique o endereço e as permissões.', 'pdf-smart-viewer'),
            ),
        ));
    }

    /**
     * Enqueue frontend assets only when the current queried page uses the viewer.
     * Auto-detection is also limited to content that contains a PDF link.
     */
    public function maybe_enqueue_assets() {
        if (is_admin() || !is_singular()) {
            return;
        }

        $post_id = get_queried_object_id();
        if (!$post_id) {
            return;
        }

        $post = get_post($post_id);
        if (!$post) {
            return;
        }

        $content = (string) $post->post_content;
        $uses_viewer = has_shortcode($content, 'pdf_viewer') || has_shortcode($content, 'pdf_lightbox');
        if (!$uses_viewer) {
            $uses_viewer = false !== strpos($content, '<pdf-smart-viewer') ||
                false !== strpos($content, 'class="pdf-smart-viewer"') ||
                false !== strpos($content, "class='pdf-smart-viewer'");
        }

        if (!$uses_viewer && function_exists('has_block')) {
            $uses_viewer = has_block('pdf-smart-viewer/viewer', $post);
        }

        if (!$uses_viewer && !empty(get_post_meta($post_id, '_elementor_data', true))) {
            $elementor_data = (string) get_post_meta($post_id, '_elementor_data', true);
            $uses_viewer = false !== strpos($elementor_data, 'psv_pdf_viewer');
        }

        $options = get_option('psv_settings', array());
        if (!$uses_viewer && !empty($options['auto_detect'])) {
            $uses_viewer = (bool) preg_match('/\.pdf/i', $content);
        }

        if ($uses_viewer) {
            $this->enqueue();
        }
    }

    private function enqueue() {
        wp_enqueue_style('psv-viewer');
        wp_enqueue_script('psv-pdfjs');
        wp_enqueue_script('psv-viewer');
        $options = get_option('psv_settings', array());
    }

    private function pdf_url($url) {
        return self::normalize_url($url);
    }

    public function shortcode($atts) {
        $atts = shortcode_atts(array(
            'id' => 0,
            'url' => '',
            'title' => 'Visualizar PDF',
            'button' => 'yes',
            'comments' => 'yes',
            'download' => 'yes',
        ), (array) $atts, 'pdf_viewer');

        $url = isset($atts['url']) ? $atts['url'] : '';
        $attachment_id = absint($atts['id']);
        if (!$url && $attachment_id) {
            $url = wp_get_attachment_url($attachment_id);
        }

        $url = $this->pdf_url($url);
        if (!$url) {
            return current_user_can('upload_files') ? '<p class="psv-error">' . esc_html__('PDF inválido.', 'pdf-smart-viewer') . '</p>' : '';
        }

        // Fallback for content rendered after wp_enqueue_scripts (e.g. some builders).
        $this->enqueue();
        $key = hash('sha256', $url);
        $title = sanitize_text_field($atts['title']);

        return $this->launcher(
            $url,
            $key,
            $title,
            'yes' === $atts['comments'],
            'yes' === $atts['download'],
            'yes' === $atts['button']
        );
    }

    private function launcher($url, $key, $title, $comments = true, $download = true, $button = true) {
        ob_start();
        ?>
        <span class="psv-launcher"
            data-psv-url="<?php echo esc_url($url); ?>"
            data-psv-key="<?php echo esc_attr($key); ?>"
            data-psv-title="<?php echo esc_attr($title); ?>"
            data-psv-comments="<?php echo $comments ? '1' : '0'; ?>"
            data-psv-download="<?php echo $download ? '1' : '0'; ?>">
            <?php if ($button) : ?>
                <button type="button" class="psv-open"><?php echo esc_html($title); ?></button>
            <?php else : ?>
                <a href="<?php echo esc_url($url); ?>" class="psv-open-link"><?php echo esc_html($title); ?></a>
            <?php endif; ?>
        </span>
        <?php
        return ob_get_clean();
    }

    public function button_shortcode($atts) {
        $atts = shortcode_atts(array(
            'url' => '',
            'text' => 'Visualizar PDF',
            'comments' => 'yes',
        ), (array) $atts, 'pdf_lightbox');

        return $this->shortcode(array(
            'url' => $atts['url'],
            'title' => sanitize_text_field($atts['text']),
            'comments' => 'yes' === $atts['comments'] ? 'yes' : 'no',
            'button' => 'yes',
        ));
    }

    public function register_block() {
        if (!function_exists('register_block_type')) {
            return;
        }

        wp_register_script(
            'psv-block',
            PSV_URL . 'assets/js/block.js',
            array('wp-blocks', 'wp-element', 'wp-components', 'wp-block-editor'),
            PSV_VERSION,
            true
        );

        register_block_type('pdf-smart-viewer/viewer', array(
            'api_version' => 2,
            'editor_script' => 'psv-block',
            'render_callback' => function ($attributes) {
                $url = isset($attributes['url']) ? PSV_Core::normalize_url($attributes['url']) : '';
                $title = isset($attributes['title']) ? sanitize_text_field($attributes['title']) : 'Visualizar PDF';
                return PSV_Core::instance()->shortcode(array('url' => $url, 'title' => $title));
            },
            'attributes' => array(
                'url' => array('type' => 'string', 'default' => ''),
                'title' => array('type' => 'string', 'default' => 'Visualizar PDF'),
            ),
        ));
    }
}
