<?php
// Removes the plugin's settings. Articles it published stay on the site.
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}
delete_option('zenex_key');
delete_option('zenex_author');
delete_option('zenex_last_delivery');
