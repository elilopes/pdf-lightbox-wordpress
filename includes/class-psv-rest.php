<?php
if (!defined('ABSPATH')) exit;
class PSV_REST {
 private static $instance; public static function instance(){return self::$instance?:self::$instance=new self();}
 private function __construct(){add_action('rest_api_init',[$this,'routes']);}
 public function routes(){
  register_rest_route('psv/v1','/comments',[
   ['methods'=>WP_REST_Server::READABLE,'callback'=>[$this,'get_comments'],'permission_callback'=>'__return_true','args'=>['key'=>['required'=>true,'sanitize_callback'=>'sanitize_text_field']]],
   ['methods'=>WP_REST_Server::CREATABLE,'callback'=>[$this,'add_comment'],'permission_callback'=>'__return_true']]);
 }
 public function get_comments($r){
  global $wpdb; $key=sanitize_text_field($r->get_param('key'));
  if(!preg_match('/^[a-f0-9]{64}$/',$key)) return new WP_Error('psv_key','Documento inválido.',['status'=>400]);
  $rows=$wpdb->get_results($wpdb->prepare("SELECT id,parent_id,page_number,author_name,comment_text,created_at FROM ".PSV_Core::table()." WHERE document_key=%s AND status='approved' ORDER BY created_at ASC LIMIT 300",$key),ARRAY_A);
  return rest_ensure_response($rows);
 }
 public function add_comment($r){
  global $wpdb;
  $ip=sanitize_text_field(wp_unslash($_SERVER['REMOTE_ADDR']??'unknown')); $rk='psv_rate_'.md5($ip);
  if(get_transient($rk)) return new WP_Error('psv_rate','Aguarde 60 segundos antes de enviar outro comentário.',['status'=>429]);
  $d=$r->get_json_params(); if(!empty($d['website'])) return new WP_Error('psv_spam','Solicitação inválida.',['status'=>400]);
  $key=sanitize_text_field($d['key']??''); $url=esc_url_raw($d['url']??''); $page=absint($d['page']??1);
  $name=sanitize_text_field($d['name']??''); $email=sanitize_email($d['email']??''); $comment=sanitize_textarea_field($d['comment']??''); $parent=absint($d['parent']??0);
  if(!preg_match('/^[a-f0-9]{64}$/',$key)||!wp_http_validate_url($url)||!in_array(wp_parse_url($url,PHP_URL_SCHEME),['http','https'],true)||!$page||!$name||strlen($name)>100||!is_email($email)||!$comment||strlen($comment)>5000)
   return new WP_Error('psv_invalid','Preencha corretamente todos os campos.',['status'=>400]);
  if($parent){
   $parent_row=$wpdb->get_row($wpdb->prepare("SELECT id,document_key FROM ".PSV_Core::table()." WHERE id=%d AND status='approved'",$parent));
   if(!$parent_row||$parent_row->document_key!==$key) return new WP_Error('psv_parent','Comentário original inválido.',['status'=>400]);
  }
  $wpdb->insert(PSV_Core::table(),['parent_id'=>$parent,'document_key'=>$key,'document_url'=>$url,'page_number'=>$page,'author_name'=>$name,'author_email'=>$email,'comment_text'=>$comment,'status'=>'pending','created_at'=>current_time('mysql')],['%d','%s','%s','%d','%s','%s','%s','%s','%s']);
  if(!$wpdb->insert_id) return new WP_Error('psv_db','Erro ao registrar comentário.',['status'=>500]);
  set_transient($rk,1,60);
  return new WP_REST_Response(['message'=>'Comentário enviado e aguardando moderação.'],201);
 }
}
