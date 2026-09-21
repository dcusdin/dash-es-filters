<?php
    // Marker other plugins can check with defined('RITCP_ES_FILTERS_ACTIVE') to tell
    // whether this plugin is included on the current site — e.g. dash-data-selectors'
    // selectize-options.php uses it to decide whether its JSON filter trigger button
    // should launch this plugin's modal or fall back to the old inline QueryBuilder one.
    define('RITCP_ES_FILTERS_ACTIVE', true);

    // Autoload all actions files
    foreach (glob(__DIR__ . '/actions/*.php') as $file) {
        require_once $file;
    }

    // Autoload all shortcode files
    foreach (glob(__DIR__ . '/shortcodes/*.php') as $file) {
        require_once $file;
    }
