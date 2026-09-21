<?php
    add_action('wp_ajax_ritcp_es_filter_presets', 'ritcp_es_filter_presets');

    function ritcp_es_filter_presets() {
        $presets = apply_filters('ritcp_es_filter_presets', [], get_current_user_id());

        wp_send_json(['results' => array_values($presets)]);
    }
?>