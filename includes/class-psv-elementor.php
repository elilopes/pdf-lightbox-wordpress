<?php
if (!defined('ABSPATH')) exit;
class PSV_Elementor {
 private static $instance;public static function instance(){return self::$instance?:self::$instance=new self();}
 private function __construct(){add_action('elementor/widgets/register',[$this,'register']);}
 public function register($manager){if(!did_action('elementor/loaded')||!class_exists('\Elementor\Widget_Base'))return;
  $manager->register(new class extends \Elementor\Widget_Base{
   public function get_name(){return 'psv_pdf_viewer';}public function get_title(){return 'PDF Smart Viewer';}public function get_icon(){return 'eicon-pdf-file';}public function get_categories(){return ['general'];}
   protected function register_controls(){$this->start_controls_section('content',['label'=>'Documento']);$this->add_control('url',['label'=>'URL do PDF','type'=>\Elementor\Controls_Manager::TEXT,'input_type'=>'url']);$this->add_control('title',['label'=>'Texto do botão','type'=>\Elementor\Controls_Manager::TEXT,'default'=>'Visualizar PDF']);$this->end_controls_section();}
   protected function render(){$s=$this->get_settings_for_display();echo do_shortcode('[pdf_viewer url="'.esc_url($s['url']).'" title="'.esc_attr($s['title']).'"]');}
  });
 }
}
