<?php
if (!defined('ABSPATH')) exit;
class PSV_Admin {
 private static $instance; public static function instance(){return self::$instance?:self::$instance=new self();}
 private function __construct(){add_action('admin_menu',[$this,'menu']);add_action('admin_init',[$this,'settings']);add_action('admin_post_psv_moderate',[$this,'moderate']);}
 public function menu(){add_menu_page('PDF Smart Viewer','PDF Smart Viewer','manage_options','psv-settings',[$this,'page'],'dashicons-pdf',59);add_submenu_page('psv-settings','Comentários','Comentários','moderate_comments','psv-comments',[$this,'comments_page']);}
 public function settings(){register_setting('psv_settings_group','psv_settings',['sanitize_callback'=>[$this,'sanitize']]);}
 public function sanitize($in){$in=is_array($in)?$in:[];return ['google_client_id'=>sanitize_text_field(wp_unslash($in['google_client_id']??'')),'auto_detect'=>empty($in['auto_detect'])?0:1];}
 public function page(){
  if(!current_user_can('manage_options'))return;$o=get_option('psv_settings',[]); ?>
  <div class="wrap"><h1>PDF Smart Viewer</h1><form method="post" action="options.php"><?php settings_fields('psv_settings_group'); ?>
  <table class="form-table">
  <tr><th>Detecção automática</th><td><label><input type="checkbox" name="psv_settings[auto_detect]" value="1" <?php checked(!empty($o['auto_detect'])); ?>> Abrir automaticamente no Lightbox links que apontam para arquivos .pdf</label><p class="description">Links com a classe <code>psv-ignore</code> serão ignorados. Links com <code>target="_blank"</code> também são ignorados.</p></td></tr>
  <tr><th>Google OAuth Client ID</th><td><input class="regular-text" name="psv_settings[google_client_id]" value="<?php echo esc_attr($o['google_client_id']??''); ?>" placeholder="xxxx.apps.googleusercontent.com"><p class="description">Configure Google Drive API e as origens JavaScript autorizadas no Google Cloud.</p></td></tr>
  </table><?php submit_button('Salvar configurações'); ?></form>
  <hr><h2>Gerador de shortcode</h2><p>Informe a URL do PDF e copie o shortcode gerado.</p>
  <p><input id="psv-shortcode-url" class="regular-text" type="url" placeholder="https://seusite.com/documento.pdf"> <button type="button" class="button" id="psv-generate">Gerar shortcode</button></p><input id="psv-shortcode-output" class="large-text code" readonly><p>Exemplo: <code>[pdf_viewer url="https://seusite.com/documento.pdf" title="Visualizar PDF"]</code></p>
  <h2>Integrações</h2><p><strong>Shortcode:</strong> <code>[pdf_viewer id="123"]</code></p><p><strong>HTML:</strong> <code>&lt;pdf-smart-viewer src="https://site.com/arquivo.pdf" title="Documento"&gt;&lt;/pdf-smart-viewer&gt;</code></p><p><strong>Div HTML:</strong> <code>&lt;div class="pdf-smart-viewer" data-pdf="https://site.com/arquivo.pdf" data-title="Documento"&gt;&lt;/div&gt;</code></p><p><strong>PHP:</strong> <code>echo do_shortcode('[pdf_viewer id="123"]');</code></p>
  <p>O PDF precisa ser acessível publicamente e, se estiver em outro domínio, permitir CORS para o domínio do site.</p></div>
  <script>document.getElementById('psv-generate').addEventListener('click',function(){var u=document.getElementById('psv-shortcode-url').value;if(!u)return;document.getElementById('psv-shortcode-output').value='[pdf_viewer url="'+u.replace(/"/g,'&quot;')+'" title="Visualizar PDF"]';document.getElementById('psv-shortcode-output').select();});</script>
 <?php }
 public function comments_page(){
  if(!current_user_can('moderate_comments'))return;global $wpdb;$rows=$wpdb->get_results("SELECT * FROM ".PSV_Core::table()." ORDER BY created_at DESC LIMIT 500");
  echo '<div class="wrap"><h1>Comentários dos PDFs</h1><p>Comentários e respostas aguardam aprovação.</p><table class="widefat striped"><thead><tr><th>Documento</th><th>Página</th><th>Autor</th><th>Comentário</th><th>Data</th><th>Ações</th></tr></thead><tbody>';
  foreach($rows as $r){echo '<tr><td><a target="_blank" rel="noopener" href="'.esc_url($r->document_url).'">Abrir PDF</a></td><td>'.absint($r->page_number).'</td><td>'.esc_html($r->author_name).'<br>'.esc_html($r->author_email).'</td><td>'.($r->parent_id?'<em>Resposta</em><br>':'').esc_html($r->comment_text).'</td><td>'.esc_html($r->created_at).'</td><td>';
   foreach(['approved'=>'Aprovar','rejected'=>'Rejeitar','delete'=>'Excluir'] as $status=>$label){echo '<form style="display:inline-block;margin:2px" method="post" action="'.esc_url(admin_url('admin-post.php')).'"><input type="hidden" name="action" value="psv_moderate"><input type="hidden" name="id" value="'.absint($r->id).'"><input type="hidden" name="status" value="'.esc_attr($status).'">';wp_nonce_field('psv_moderate_'.$r->id);submit_button($label,'small');echo '</form>';}
   echo '</td></tr>';
  }if(!$rows)echo '<tr><td colspan="6">Nenhum comentário.</td></tr>';echo '</tbody></table></div>';
 }
 public function moderate(){if(!current_user_can('moderate_comments'))wp_die('Acesso negado.');$id=absint($_POST['id']??0);check_admin_referer('psv_moderate_'.$id);$s=sanitize_key($_POST['status']??'');global $wpdb;if($s==='delete')$wpdb->delete(PSV_Core::table(),['id'=>$id],['%d']);elseif(in_array($s,['approved','rejected'],true))$wpdb->update(PSV_Core::table(),['status'=>$s],['id'=>$id],['%s'],['%d']);wp_safe_redirect(admin_url('admin.php?page=psv-comments'));exit;}
}
