<?php
if (!defined('ABSPATH')) { exit; }

class PSV_Elementor {
    private static $instance;

    public static function instance() {
        if (!self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action('elementor/widgets/register', array($this, 'register'));
    }

    public function register($manager) {
        if (!did_action('elementor/loaded') || !class_exists('\Elementor\Widget_Base')) {
            return;
        }

        $manager->register(new class extends \Elementor\Widget_Base {
            public function get_name() {
                return 'psv_pdf_viewer';
            }

            public function get_title() {
                return esc_html__('PDF Smart Viewer', 'pdf-smart-viewer');
            }

            public function get_icon() {
                return 'eicon-pdf-file';
            }

            public function get_categories() {
                return array('general');
            }

            protected function register_controls() {
                $this->start_controls_section('content', array('label' => esc_html__('Documento', 'pdf-smart-viewer')));
                $this->add_control('url', array(
                    'label' => esc_html__('URL do PDF', 'pdf-smart-viewer'),
                    'type' => \Elementor\Controls_Manager::TEXT,
                    'input_type' => 'url',
                ));
                $this->add_control('title', array(
                    'label' => esc_html__('Texto do botão', 'pdf-smart-viewer'),
                    'type' => \Elementor\Controls_Manager::TEXT,
                    'default' => 'Visualizar PDF',
                ));
                $this->end_controls_section();
            }

            protected function render() {
                $settings = $this->get_settings_for_display();
                $url = isset($settings['url']) ? PSV_Core::normalize_url($settings['url']) : '';
                $title = isset($settings['title']) ? sanitize_text_field($settings['title']) : 'Visualizar PDF';
                echo PSV_Core::instance()->shortcode(array('url' => $url, 'title' => $title));
            }
        });
    }
}
