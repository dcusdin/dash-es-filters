<?php
    // Cache-busting ?ver= for this plugin's own assets — each file's last-
    // modified time, so every save/rollout (see the client-sync skill) is
    // picked up by browsers without a hard refresh.
    //
    // Stamped onto already-registered handles rather than passed to
    // wp_enqueue_script()/_style(): WordPress keeps whichever registration of
    // a handle came first, and dash-data-selectors' selectize-options.php
    // enqueues these same handles with ver null — when it runs first, a ver
    // passed at enqueue time is silently ignored.
    //
    // $assets is [handle => path relative to this plugin's root].
    if (!function_exists('dash_es_filters_version_assets')) {
        function dash_es_filters_version_assets($assets) {
            foreach ($assets as $handle => $path) {
                $mtime = @filemtime(dirname(__DIR__) . '/' . $path);
                if (!$mtime) continue;
                $asset = wp_scripts()->query($handle, 'registered') ?: wp_styles()->query($handle, 'registered');
                if ($asset) $asset->ver = (string) $mtime;
            }
        }
    }
?>
