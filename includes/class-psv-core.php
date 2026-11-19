<?php
if (!defined('ABSPATH')) exit;
final class PSV_Core {
    private static $instance;
    public static function instance(){ if(!self::$instance) self::$instance=new self(); return self::$instance; }
    public static function table(){ global $wpdb; return $wpdb->prefix.'psv_comments'; }
    public static function activate(){
        global $wpdb; require_once ABSPATH.'wp-admin/includes/upgrade.php';
        $charset=$wpdb->get_charset_collate(); $table=self::table();
        $sql="CREATE TABLE {$table} (
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
          PRIMARY KEY  (id), KEY document_key (document_key), KEY status (status), KEY parent_id (parent_id)
        ) {$charset};";
        dbDelta($sql);
    }
    private function __construct(){
        add_action('wp_enqueue_scripts',[$this,'register_assets']);
        add_shortcode('pdf_viewer',[$this,'shortcode']);
        add_shortcode('pdf_lightbox',[$this,'button_shortcode']);
        add_action('init',[$this,'register_block']);
        add_filter('script_loader_tag',[$this,'script_tag'],10,3);
    }
    public function script_tag($tag,$handle,$src){
        if($handle==='psv-viewer') return '<script src="'.esc_url($src).'" id="psv-viewer-js" defer></script>';
        return $tag;
    }
    public function register_assets(){
        wp_register_style('psv-viewer',PSV_URL.'assets/css/viewer.css',[],PSV_VERSION);
        wp_register_script('psv-pdfjs','https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',[],'3.11.174',true);
        wp_register_script('psv-viewer',PSV_URL.'assets/js/viewer.js',['psv-pdfjs'],PSV_VERSION,true);
        $o=get_option('psv_settings',[]);
        wp_localize_script('psv-viewer','PSV_CONFIG',[
          'restUrl'=>esc_url_raw(rest_url('psv/v1/')),'nonce'=>wp_create_nonce('wp_rest'),
          'googleClientId'=>$o['google_client_id']??'','autoDetect'=>!empty($o['auto_detect']),
          'strings'=>['loading'=>__('Carregando PDF…','pdf-smart-viewer'),'loadError'=>__('Não foi possível abrir este PDF. Verifique o endereço e as permissões.','pdf-smart-viewer')]
        ]);
    }
    private function enqueue(){
        wp_enqueue_style('psv-viewer'); wp_enqueue_script('psv-pdfjs'); wp_enqueue_script('psv-viewer');
        wp_enqueue_script('google-identity','https://accounts.google.com/gsi/client',[],null,true);
    }
    private function pdf_url($url){
        $url=esc_url_raw($url); if(!$url||!wp_http_validate_url($url)) return '';
        return in_array(strtolower((string)wp_parse_url($url,PHP_URL_SCHEME)),['http','https'],true)?$url:'';
    }
    public function shortcode($atts){
        $a=shortcode_atts(['id'=>0,'url'=>'','title'=>'Visualizar PDF','button'=>'yes','comments'=>'yes','download'=>'yes'],(array)$atts,'pdf_viewer');
        $url=$a['url']; if(!$url&&$a['id']) $url=wp_get_attachment_url(absint($a['id']));
        $url=$this->pdf_url($url); if(!$url) return current_user_can('upload_files')?'<p class="psv-error">PDF inválido.</p>':'';
        $this->enqueue(); $key=hash('sha256',$url); $title=sanitize_text_field($a['title']);
        return $this->launcher($url,$key,$title,$a['comments']==='yes',$a['download']==='yes',$a['button']==='yes');
    }
    private function launcher($url,$key,$title,$comments=true,$download=true,$button=true){
        ob_start(); ?>
        <span class="psv-launcher" data-psv-url="<?php echo esc_url($url); ?>" data-psv-key="<?php echo esc_attr($key); ?>" data-psv-title="<?php echo esc_attr($title); ?>" data-psv-comments="<?php echo $comments?'1':'0'; ?>" data-psv-download="<?php echo $download?'1':'0'; ?>">
        <?php if($button): ?><button type="button" class="psv-open"><?php echo esc_html($title); ?></button><?php else: ?><a href="<?php echo esc_url($url); ?>" class="psv-open-link"><?php echo esc_html($title); ?></a><?php endif; ?></span>
        <?php return ob_get_clean();
    }
    public function button_shortcode($atts){
        $a=shortcode_atts(['url'=>'','text'=>'Visualizar PDF','comments'=>'yes'],(array)$atts,'pdf_lightbox');
        return $this->shortcode(['url'=>$a['url'],'title'=>$a['text'],'comments'=>$a['comments'],'button'=>'yes']);
    }
    public function register_block(){
        if(!function_exists('register_block_type')) return;
        wp_register_script('psv-block',PSV_URL.'assets/js/block.js',['wp-blocks','wp-element','wp-components','wp-block-editor'],PSV_VERSION,true);
        register_block_type('pdf-smart-viewer/viewer',['api_version'=>2,'editor_script'=>'psv-block',
          'render_callback'=>function($a){return do_shortcode('[pdf_viewer url="'.esc_url($a['url']??'').'" title="'.esc_attr($a['title']??'Visualizar PDF').'"]');},
          'attributes'=>['url'=>['type'=>'string','default'=>''],'title'=>['type'=>'string','default'=>'Visualizar PDF']]]);
    }
}
