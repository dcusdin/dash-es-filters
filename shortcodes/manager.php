<?php
    function ritcp_ES_Filter_Manager($atts) {
        $atts = shortcode_atts([
            'id' => null,
        ], $atts);

        ob_start();

        include __DIR__ . '/../templates/manager.php';

        return ob_get_clean();
    }
    add_shortcode('ritcp_es_filter_manager', 'ritcp_ES_Filter_Manager');
