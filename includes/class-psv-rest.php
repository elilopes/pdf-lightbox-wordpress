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

        register_rest_route('psv/v1', '/ai', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($this, 'ai_assistant'),
            'permission_callback' => '__return_true',
        ));

        register_rest_route('psv/v1', '/document', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($this, 'get_document'),
            'permission_callback' => '__return_true',
            'args' => array(
                'url' => array(
                    'required' => true,
                ),
            ),
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

    /**
     * Resolve every frontend URL through the same server-side canonicalizer and key.
     */
    public function get_document($request) {
        $raw_url = $request->get_param('url');
        $url = is_scalar($raw_url) ? PSV_Core::normalize_url($raw_url) : '';

        if (!$url) {
            return new WP_Error('psv_document', __('Endereço do PDF inválido.', 'pdf-smart-viewer'), array('status' => 400));
        }

        $response = new WP_REST_Response(array(
            'url' => $url,
            'key' => hash('sha256', $url),
        ));
        $response->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        $response->header('Pragma', 'no-cache');
        return $response;
    }


    /**
     * Server-side AI proxy. The provider key is never exposed to the browser.
     */
    public function ai_assistant($request) {
        $nonce = $request->get_header('X-WP-Nonce');
        if (!$nonce || !wp_verify_nonce(sanitize_text_field($nonce), 'wp_rest')) {
            return new WP_Error('psv_nonce', __('Código de segurança inválido. Atualize a página e tente novamente.', 'pdf-smart-viewer'), array('status' => 403));
        }
        $options = get_option('psv_settings', array());
        $api_key = isset($options['openai_api_key']) ? trim((string) $options['openai_api_key']) : '';
        if ('' === $api_key) {
            return new WP_Error('psv_ai_disabled', __('O assistente de IA não está configurado pelo administrador.', 'pdf-smart-viewer'), array('status' => 503));
        }
        $ip = sanitize_text_field(wp_unslash(isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown'));
        $rate_key = 'psv_ai_rate_' . md5($ip);
        if (get_transient($rate_key)) {
            return new WP_Error('psv_ai_rate', __('Aguarde um minuto antes de fazer outra solicitação ao assistente.', 'pdf-smart-viewer'), array('status' => 429));
        }
        $data = $request->get_json_params();
        if (!is_array($data)) {
            return new WP_Error('psv_ai_invalid', __('Solicitação inválida.', 'pdf-smart-viewer'), array('status' => 400));
        }
        $action = isset($data['action']) && is_scalar($data['action']) ? sanitize_key($data['action']) : '';
        $text = isset($data['text']) && is_scalar($data['text']) ? sanitize_textarea_field((string) $data['text']) : '';
        $question = isset($data['question']) && is_scalar($data['question']) ? sanitize_text_field((string) $data['question']) : '';
        $title = isset($data['title']) && is_scalar($data['title']) ? sanitize_text_field((string) $data['title']) : 'Documento PDF';
        if (!in_array($action, array('summary', 'question', 'explain'), true) || '' === $text || strlen($text) > 24000) {
            return new WP_Error('psv_ai_invalid', __('O conteúdo enviado é inválido ou excede o limite permitido.', 'pdf-smart-viewer'), array('status' => 400));
        }
        if ('summary' !== $action && ('' === $question || strlen($question) > 1000)) {
            return new WP_Error('psv_ai_question', __('Informe uma pergunta ou termo com até 1.000 caracteres.', 'pdf-smart-viewer'), array('status' => 400));
        }
        $system = 'Você é um assistente de leitura de documentos. Responda em português usando somente o texto fornecido. Se a informação não estiver no documento, diga claramente que não foi encontrada. Não invente citações nem números de página.';
        if ('summary' === $action) {
            $prompt = 'Resuma o documento "' . $title . '", destacando objetivo, ideias centrais e conclusões.\n\nDOCUMENTO:\n' . $text;
        } elseif ('explain' === $action) {
            $prompt = 'Explique o termo "' . $question . '" no contexto deste documento.\n\nDOCUMENTO:\n' . $text;
        } else {
            $prompt = 'Responda à pergunta "' . $question . '" com base neste documento. Não invente informações.\n\nDOCUMENTO:\n' . $text;
        }
        $response = wp_remote_post('https://api.openai.com/v1/chat/completions', array(
            'timeout' => 45,
            'headers' => array('Authorization' => 'Bearer ' . $api_key, 'Content-Type' => 'application/json'),
            'body' => wp_json_encode(array(
                'model' => 'gpt-4o-mini',
                'temperature' => 0.2,
                'max_tokens' => 1200,
                'messages' => array(
                    array('role' => 'system', 'content' => $system),
                    array('role' => 'user', 'content' => $prompt),
                ),
            )),
        ));
        if (is_wp_error($response)) {
            return new WP_Error('psv_ai_connection', __('Não foi possível conectar ao serviço de IA.', 'pdf-smart-viewer'), array('status' => 502));
        }
        $status = (int) wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);
        if ($status < 200 || $status >= 300 || empty($body['choices'][0]['message']['content'])) {
            error_log('[PDF Smart Viewer] AI provider returned HTTP ' . $status);
            return new WP_Error('psv_ai_provider', __('O serviço de IA não conseguiu processar esta solicitação.', 'pdf-smart-viewer'), array('status' => 502));
        }
        set_transient($rate_key, 1, MINUTE_IN_SECONDS);
        $result = sanitize_textarea_field($body['choices'][0]['message']['content']);
        $rest_response = new WP_REST_Response(array('answer' => $result));
        $rest_response->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        return $rest_response;
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

        $total_result = $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$table}
                WHERE document_key = %s AND status = 'approved' AND parent_id = 0",
                $key
            )
        );
        if ('' !== $wpdb->last_error) {
            error_log('[PDF Smart Viewer] Comment count query failed: ' . $wpdb->last_error);
            return new WP_Error('psv_database', __('Não foi possível consultar os comentários.', 'pdf-smart-viewer'), array('status' => 500));
        }
        $total = (int) $total_result;
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
        if ('' !== $wpdb->last_error) {
            error_log('[PDF Smart Viewer] Comment page query failed: ' . $wpdb->last_error);
            return new WP_Error('psv_database', __('Não foi possível consultar os comentários.', 'pdf-smart-viewer'), array('status' => 500));
        }

        $rows = array();
        if ($root_ids) {
            $root_ids = array_map('absint', $root_ids);
            $id_list = implode(',', $root_ids);
            $rows = $wpdb->get_results(
                "SELECT id, parent_id, page_number, author_name, comment_text, created_at
                FROM {$table}
                WHERE status = 'approved'
                AND (id IN ({$id_list}) OR parent_id IN ({$id_list}))
                ORDER BY created_at ASC, id ASC
                LIMIT 500",
                ARRAY_A
            );
            if ('' !== $wpdb->last_error) {
                error_log('[PDF Smart Viewer] Comment content query failed: ' . $wpdb->last_error);
                return new WP_Error('psv_database', __('Não foi possível carregar os comentários.', 'pdf-smart-viewer'), array('status' => 500));
            }
        }

        $response = new WP_REST_Response(array(
            'comments' => $rows,
            'page' => $page,
            'per_page' => $per_page,
            'total' => $total,
            'total_pages' => $total_pages,
            'has_previous' => $page > 1,
            'has_more' => $page < $total_pages,
        ));
        $response->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        return $response;
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
                    "SELECT id, document_key FROM " . PSV_Core::table() . " WHERE id = %d AND status = 'approved' AND parent_id = 0",
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
