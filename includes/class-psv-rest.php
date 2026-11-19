<?php
if (!defined('ABSPATH')) { exit; }

class PSV_REST {
    private static $instance;

    public static function instance() {
        if (!self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action('rest_api_init', array($this, 'routes'));
    }

    public function routes() {
        register_rest_route('psv/v1', '/comments', array(
            array(
                'methods' => WP_REST_Server::READABLE,
                'callback' => array($this, 'get_comments'),
                'permission_callback' => '__return_true',
                'args' => array(
                    'key' => array(
                        'required' => true,
                        'sanitize_callback' => 'sanitize_text_field',
                    ),
                    'page' => array(
                        'default' => 1,
                        'sanitize_callback' => 'absint',
                    ),
                    'per_page' => array(
                        'default' => 20,
                        'sanitize_callback' => 'absint',
                    ),
                ),
            ),
            array(
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => array($this, 'add_comment'),
                'permission_callback' => '__return_true',
            ),
        ));

        register_rest_route('psv/v1', '/nonce', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($this, 'refresh_nonce'),
            'permission_callback' => '__return_true',
        ));
    }

    /**
     * Return a fresh REST nonce and explicitly prevent intermediary caching.
     */
    public function refresh_nonce() {
        $response = new WP_REST_Response(array('nonce' => wp_create_nonce('wp_rest')));
        $response->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        $response->header('Pragma', 'no-cache');
        $response->header('Expires', 'Wed, 11 Jan 1984 05:00:00 GMT');
        return $response;
    }

    public function get_comments($request) {
        global $wpdb;

        $raw_key = $request->get_param('key');
        $key = is_scalar($raw_key) ? sanitize_text_field((string) $raw_key) : '';
        if (!preg_match('/^[a-f0-9]{64}$/', $key)) {
            return new WP_Error('psv_key', __('Documento inválido.', 'pdf-smart-viewer'), array('status' => 400));
        }

        $page = max(1, absint($request->get_param('page')));
        $per_page = min(50, max(1, absint($request->get_param('per_page')) ?: 20));
        $table = PSV_Core::table();

        $total = (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$table}
                WHERE document_key = %s AND status = 'approved' AND parent_id = 0",
                $key
            )
        );
        $total_pages = max(1, (int) ceil($total / $per_page));
        $page = min($page, $total_pages);
        $offset = ($page - 1) * $per_page;

        $root_ids = $wpdb->get_col(
            $wpdb->prepare(
                "SELECT id FROM {$table}
                WHERE document_key = %s AND status = 'approved' AND parent_id = 0
                ORDER BY created_at ASC, id ASC
                LIMIT %d OFFSET %d",
                $key,
                $per_page,
                $offset
            )
        );

        $rows = array();
        if ($root_ids) {
            $root_ids = array_map('absint', $root_ids);
            $id_list = implode(',', $root_ids);
            $rows = $wpdb->get_results(
                "SELECT id, parent_id, page_number, author_name, comment_text, created_at
                FROM {$table}
                WHERE status = 'approved'
                AND (id IN ({$id_list}) OR parent_id IN ({$id_list}))
                ORDER BY created_at ASC, id ASC",
                ARRAY_A
            );
        }

        return rest_ensure_response(array(
            'comments' => $rows,
            'page' => $page,
            'per_page' => $per_page,
            'total' => $total,
            'total_pages' => $total_pages,
            'has_previous' => $page > 1,
            'has_more' => $page < $total_pages,
        ));
    }

    public function add_comment($request) {
        global $wpdb;

        $nonce = $request->get_header('X-WP-Nonce');
        if (!$nonce || !wp_verify_nonce(sanitize_text_field($nonce), 'wp_rest')) {
            return new WP_Error('psv_nonce', __('O código de segurança expirou. Estamos atualizando; tente enviar novamente.', 'pdf-smart-viewer'), array('status' => 403));
        }

        $ip = sanitize_text_field(wp_unslash(isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown'));
        $rate_key = 'psv_rate_' . md5($ip);
        if (get_transient($rate_key)) {
            return new WP_Error('psv_rate', __('Aguarde 60 segundos antes de enviar outro comentário.', 'pdf-smart-viewer'), array('status' => 429));
        }

        $data = $request->get_json_params();
        if (!is_array($data)) {
            return new WP_Error('psv_invalid', __('Solicitação inválida.', 'pdf-smart-viewer'), array('status' => 400));
        }
        if (!empty($data['website'])) {
            return new WP_Error('psv_spam', __('Solicitação inválida.', 'pdf-smart-viewer'), array('status' => 400));
        }

        $key = isset($data['key']) && is_scalar($data['key'])
            ? sanitize_text_field((string) $data['key'])
            : '';
        $url = isset($data['url']) && is_scalar($data['url'])
            ? PSV_Core::normalize_url($data['url'])
            : '';
        $page = isset($data['page']) && is_scalar($data['page']) ? absint($data['page']) : 1;
        $name = isset($data['name']) && is_scalar($data['name'])
            ? sanitize_text_field((string) $data['name'])
            : '';
        $email = isset($data['email']) && is_scalar($data['email'])
            ? sanitize_email((string) $data['email'])
            : '';
        $comment = isset($data['comment']) && is_scalar($data['comment'])
            ? sanitize_textarea_field((string) $data['comment'])
            : '';
        $parent = isset($data['parent']) && is_scalar($data['parent']) ? absint($data['parent']) : 0;

        if (
            !preg_match('/^[a-f0-9]{64}$/', $key) ||
            !$url ||
            !hash_equals(hash('sha256', $url), $key) ||
            !$page ||
            !$name ||
            strlen($name) > 100 ||
            !is_email($email) ||
            !$comment ||
            strlen($comment) > 5000
        ) {
            return new WP_Error('psv_invalid', __('Preencha corretamente todos os campos.', 'pdf-smart-viewer'), array('status' => 400));
        }

        if ($parent) {
            $parent_row = $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT id, document_key FROM " . PSV_Core::table() . " WHERE id = %d AND status = 'approved'",
                    $parent
                )
            );
            if (!$parent_row || !hash_equals($parent_row->document_key, $key)) {
                return new WP_Error('psv_parent', __('Comentário original inválido.', 'pdf-smart-viewer'), array('status' => 400));
            }
        }

        $inserted = $wpdb->insert(
            PSV_Core::table(),
            array(
                'parent_id' => $parent,
                'document_key' => $key,
                'document_url' => $url,
                'page_number' => $page,
                'author_name' => $name,
                'author_email' => $email,
                'comment_text' => $comment,
                'status' => 'pending',
                'created_at' => current_time('mysql'),
            ),
            array('%d', '%s', '%s', '%d', '%s', '%s', '%s', '%s', '%s')
        );

        if (!$inserted) {
            return new WP_Error('psv_db', __('Erro ao registrar comentário.', 'pdf-smart-viewer'), array('status' => 500));
        }

        set_transient($rate_key, 1, MINUTE_IN_SECONDS);
        return new WP_REST_Response(
            array('message' => __('Comentário enviado e aguardando moderação.', 'pdf-smart-viewer')),
            201
        );
    }
}
