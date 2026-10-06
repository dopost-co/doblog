<?php
/**
 * Plugin Name:       Zenex
 * Plugin URI:        https://zenex.dev
 * Description:       Publishes the articles you write in Zenex on this site, with their images, categories, tags and SEO.
 * Version:           1.0.0
 * Requires at least: 5.6
 * Requires PHP:      7.4
 * Author:            Zenex
 * License:           GPLv2 or later
 * Text Domain:       zenex
 */

if (!defined('ABSPATH')) {
    exit;
}

define('ZENEX_VERSION', '1.0.0');
define('ZENEX_TOLERANCE', 300);

/**
 * Zenex sends signed requests to /wp-json/zenex/v1/webhook (or
 * ?rest_route=/zenex/v1/webhook without pretty permalinks):
 *   ping         answers with what this site supports
 *   post.upsert  creates or updates the article (keyed by its Zenex id)
 *   post.delete  moves the article to the trash
 * Requests are signed with the connection key from Zenex → Settings → Web integration.
 */
final class Zenex_Plugin
{
    const OPTION_KEY = 'zenex_key';
    const OPTION_AUTHOR = 'zenex_author';
    const OPTION_LAST = 'zenex_last_delivery';

    public static function boot()
    {
        add_action('rest_api_init', array(__CLASS__, 'routes'));
        add_action('admin_menu', array(__CLASS__, 'menu'));
        add_action('admin_init', array(__CLASS__, 'settings'));
        add_action('admin_notices', array(__CLASS__, 'managed_notice'));
        add_filter('plugin_action_links_' . plugin_basename(__FILE__), array(__CLASS__, 'action_links'));
        add_action('wp_head', array(__CLASS__, 'head'), 1);
        add_filter('pre_get_document_title', array(__CLASS__, 'document_title'), 20);
        add_filter('get_canonical_url', array(__CLASS__, 'canonical'), 10, 2);
    }

    // ------------------------------------------------------------------
    // Webhook

    public static function routes()
    {
        register_rest_route('zenex/v1', '/webhook', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'handle'),
            // Requests are authenticated by their signature, not by a WordPress login.
            'permission_callback' => '__return_true',
        ));
    }

    private static function reply($status, $data)
    {
        $response = new WP_REST_Response($data, $status);
        $response->header('Cache-Control', 'no-store');
        return $response;
    }

    private static function fail($status, $code, $message)
    {
        return self::reply($status, array('ok' => false, 'code' => $code, 'message' => $message));
    }

    public static function handle(WP_REST_Request $request)
    {
        $key = trim((string) get_option(self::OPTION_KEY, ''));
        if ($key === '') {
            return self::fail(401, 'zenex_not_configured', 'Paste the connection key from Zenex in Settings → Zenex.');
        }
        $body = $request->get_body();
        $timestamp = (string) $request->get_header('x_zenex_timestamp');
        $signature = (string) $request->get_header('x_zenex_signature');
        if (!ctype_digit($timestamp) || abs(time() - (int) $timestamp) > ZENEX_TOLERANCE) {
            return self::fail(401, 'zenex_stale_request', 'The request is too old or this server\'s clock is off.');
        }
        $expected = 'v1=' . hash_hmac('sha256', $timestamp . '.' . $body, $key);
        if (!hash_equals($expected, $signature)) {
            return self::fail(401, 'zenex_bad_signature', 'The connection key does not match.');
        }

        $data = json_decode($body, true);
        if (!is_array($data) || empty($data['event'])) {
            return self::fail(400, 'zenex_bad_request', 'The request has no event.');
        }

        try {
            switch ($data['event']) {
                case 'ping':
                    $result = array('ok' => true, 'connector' => 'zenex-wordpress', 'version' => ZENEX_VERSION, 'site' => self::site_info());
                    break;
                case 'post.upsert':
                    $result = self::upsert(isset($data['article']) ? $data['article'] : null);
                    break;
                case 'post.delete':
                    $result = self::delete(isset($data['article']['id']) ? (string) $data['article']['id'] : '');
                    if ($result === null) {
                        self::remember('post.delete', true, 'Already removed');
                        return self::fail(404, 'zenex_not_found', 'This article is not on the site.');
                    }
                    break;
                default:
                    return self::fail(400, 'zenex_unknown_event', 'Unknown event.');
            }
        } catch (Throwable $error) {
            self::remember($data['event'], false, $error->getMessage());
            return self::fail(500, 'zenex_error', $error->getMessage());
        }

        $summary = $data['event'] === 'post.upsert' && isset($data['article']['title']) ? $data['article']['title'] : ($data['event'] === 'ping' ? 'Connection checked' : 'Article removed');
        self::remember($data['event'], true, $summary);
        return self::reply(200, $result);
    }

    private static function remember($event, $ok, $message)
    {
        update_option(self::OPTION_LAST, array('time' => time(), 'event' => $event, 'ok' => $ok, 'message' => mb_substr((string) $message, 0, 300)), false);
    }

    // ------------------------------------------------------------------
    // What this site supports

    private static function polylang()
    {
        return function_exists('pll_set_post_language') && function_exists('pll_languages_list');
    }

    /** Zenex language code (ISO 639-1) => Polylang language slug. */
    private static function polylang_languages()
    {
        $map = array();
        if (!self::polylang()) {
            return $map;
        }
        $slugs = pll_languages_list(array('fields' => 'slug'));
        $locales = pll_languages_list(array('fields' => 'locale'));
        foreach ($slugs as $index => $slug) {
            $code = strtolower(substr(isset($locales[$index]) ? $locales[$index] : $slug, 0, 2));
            if (!isset($map[$code])) {
                $map[$code] = $slug;
            }
        }
        return $map;
    }

    private static function seo_plugin()
    {
        if (defined('WPSEO_VERSION')) return 'yoast';
        if (class_exists('RankMath')) return 'rankmath';
        if (defined('SEOPRESS_VERSION')) return 'seopress';
        if (defined('AIOSEO_VERSION')) return 'aioseo';
        return null;
    }

    /** The path articles are served under, when the permalink structure is /%postname%/ with an optional base. */
    private static function article_path()
    {
        $structure = (string) get_option('permalink_structure');
        if ($structure === '') {
            return null;
        }
        if (preg_match('#^(/[^%]*?)?/%postname%/?$#', $structure, $match)) {
            return isset($match[1]) ? rtrim($match[1], '/') : '';
        }
        return null;
    }

    private static function site_info()
    {
        global $wp_version;
        $path = self::article_path();
        $languages = array();
        $bases = array();
        if (self::polylang()) {
            foreach (self::polylang_languages() as $code => $slug) {
                $languages[] = $code;
                if ($path !== null && function_exists('pll_home_url')) {
                    $bases[$code] = rtrim(pll_home_url($slug), '/') . $path;
                }
            }
        } else {
            $code = strtolower(substr(get_locale(), 0, 2));
            $languages[] = $code;
            if ($path !== null) {
                $bases[$code] = rtrim(home_url('/'), '/') . $path;
            }
        }
        return array(
            'name' => get_bloginfo('name'),
            'url' => home_url('/'),
            'platformVersion' => $wp_version,
            'languages' => $languages,
            'multilingual' => self::polylang(),
            'articleBase' => (object) $bases,
            'seoPlugin' => self::seo_plugin(),
        );
    }

    // ------------------------------------------------------------------
    // Articles

    private static function find($zenex_id)
    {
        if ($zenex_id === '') {
            return 0;
        }
        $ids = get_posts(array(
            'post_type' => 'post',
            'post_status' => array('publish', 'future', 'draft', 'pending', 'private', 'trash'),
            'meta_key' => '_zenex_id',
            'meta_value' => $zenex_id,
            'numberposts' => 1,
            'fields' => 'ids',
            'suppress_filters' => true,
            'lang' => '',
        ));
        return $ids ? (int) $ids[0] : 0;
    }

    private static function author_id()
    {
        $chosen = (int) get_option(self::OPTION_AUTHOR, 0);
        if ($chosen && get_userdata($chosen)) {
            return $chosen;
        }
        $admins = get_users(array('role' => 'administrator', 'number' => 1, 'orderby' => 'ID', 'fields' => 'ID'));
        return $admins ? (int) $admins[0] : 0;
    }

    private static function text($article, $key)
    {
        return isset($article[$key]) && is_string($article[$key]) ? $article[$key] : '';
    }

    private static function upsert($article)
    {
        if (!is_array($article) || self::text($article, 'id') === '' || self::text($article, 'title') === '' || self::text($article, 'slug') === '') {
            throw new RuntimeException('The article is missing its id, title or slug.');
        }
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';

        $author = self::author_id();
        // Act as the author, so WordPress applies their capabilities (and keeps tables, figures and captions).
        wp_set_current_user($author);

        $language = strtolower(self::text($article, 'language'));
        $polylang = self::polylang() ? self::polylang_languages() : array();
        $pll_slug = $polylang && isset($polylang[$language]) ? $polylang[$language] : null;

        $warnings = array();
        $images = array();
        $urls = isset($article['images']) && is_array($article['images']) ? $article['images'] : array();
        foreach ($urls as $url) {
            if (!is_string($url) || !preg_match('#^https?://#i', $url)) continue;
            $attachment = self::image($url);
            if (is_wp_error($attachment)) {
                $warnings[] = 'Image kept at its original address: ' . $url . ' (' . $attachment->get_error_message() . ')';
                continue;
            }
            $images[$url] = $attachment;
        }

        $html = self::text($article, 'html');
        foreach ($images as $url => $attachment) {
            $local = wp_get_attachment_url($attachment);
            if ($local) {
                $html = str_replace(array($url, esc_attr($url), str_replace('&', '&amp;', $url)), $local, $html);
            }
        }

        $published = strtotime(self::text($article, 'publishedAt'));
        // A date in the future would turn the article into a scheduled one; Zenex only sends published articles.
        if (!$published || $published > time()) {
            $published = time();
        }

        $existing = self::find(self::text($article, 'id'));
        if ($existing && get_post_status($existing) === 'trash') {
            wp_untrash_post($existing);
        }
        $post = array(
            'post_type' => 'post',
            'post_status' => 'publish',
            'post_title' => wp_slash(self::text($article, 'title')),
            'post_name' => sanitize_title(self::text($article, 'slug')),
            'post_content' => wp_slash($html),
            'post_excerpt' => wp_slash(self::text($article, 'excerpt')),
            'post_author' => $author,
            'post_date_gmt' => gmdate('Y-m-d H:i:s', $published),
            'post_date' => get_date_from_gmt(gmdate('Y-m-d H:i:s', $published)),
            'edit_date' => true,
        );
        if ($existing) {
            $post['ID'] = $existing;
        }
        $id = $existing ? wp_update_post($post, true) : wp_insert_post($post, true);
        if (is_wp_error($id)) {
            throw new RuntimeException('WordPress could not save the article: ' . $id->get_error_message());
        }
        $id = (int) $id;

        update_post_meta($id, '_zenex_id', self::text($article, 'id'));
        update_post_meta($id, '_zenex_group', self::text($article, 'translationGroupId'));
        update_post_meta($id, '_zenex_language', $language);
        update_post_meta($id, '_zenex_seo', isset($article['seo']) && is_array($article['seo']) ? wp_slash($article['seo']) : array());

        if ($pll_slug) {
            pll_set_post_language($id, $pll_slug);
        }
        wp_set_post_terms($id, self::terms(isset($article['categories']) ? $article['categories'] : array(), 'category', $pll_slug), 'category', false);
        wp_set_post_terms($id, self::terms(isset($article['tags']) ? $article['tags'] : array(), 'post_tag', $pll_slug), 'post_tag', false);

        $cover = isset($article['coverImage']['url']) ? (string) $article['coverImage']['url'] : '';
        if ($cover !== '' && isset($images[$cover])) {
            set_post_thumbnail($id, $images[$cover]);
            if (!empty($article['coverImage']['alt'])) {
                update_post_meta($images[$cover], '_wp_attachment_image_alt', sanitize_text_field($article['coverImage']['alt']));
            }
        } elseif ($cover === '') {
            delete_post_thumbnail($id);
        }

        if (!empty($article['featured'])) {
            stick_post($id);
        } else {
            unstick_post($id);
        }

        $seo = isset($article['seo']) && is_array($article['seo']) ? $article['seo'] : array();
        $og_image = self::text($seo, 'ogImage');
        self::write_seo($id, $seo, $og_image !== '' && isset($images[$og_image]) ? $images[$og_image] : 0);

        if ($pll_slug && function_exists('pll_save_post_translations')) {
            self::link_translations(self::text($article, 'translationGroupId'));
        }

        clean_post_cache($id);
        return array('ok' => true, 'remoteId' => $id, 'url' => get_permalink($id), 'warnings' => $warnings);
    }

    private static function delete($zenex_id)
    {
        $id = self::find($zenex_id);
        if (!$id) {
            return null;
        }
        if (get_post_status($id) !== 'trash') {
            wp_trash_post($id);
        }
        return array('ok' => true, 'remoteId' => $id);
    }

    /** Copies an image into the media library once; later articles reuse it. */
    private static function image($url)
    {
        $found = get_posts(array(
            'post_type' => 'attachment',
            'post_status' => 'inherit',
            'meta_key' => '_zenex_source',
            'meta_value' => $url,
            'numberposts' => 1,
            'fields' => 'ids',
            'suppress_filters' => true,
            'lang' => '',
        ));
        if ($found) {
            return (int) $found[0];
        }
        $tmp = download_url($url, 60);
        if (is_wp_error($tmp)) {
            return $tmp;
        }
        $name = sanitize_file_name(wp_basename((string) wp_parse_url($url, PHP_URL_PATH)));
        $mime = function_exists('wp_get_image_mime') ? wp_get_image_mime($tmp) : false;
        $extensions = array('image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp', 'image/avif' => 'avif');
        if (!preg_match('/\.(jpe?g|png|gif|webp|avif)$/i', $name)) {
            $name = ($name !== '' ? $name : 'zenex-image') . '.' . ($mime && isset($extensions[$mime]) ? $extensions[$mime] : 'jpg');
        }
        $attachment = media_handle_sideload(array('name' => $name, 'tmp_name' => $tmp), 0);
        if (is_wp_error($attachment)) {
            @unlink($tmp);
            return $attachment;
        }
        update_post_meta($attachment, '_zenex_source', $url);
        return (int) $attachment;
    }

    /** Finds or creates each term; with Polylang, in the article's language. */
    private static function terms($items, $taxonomy, $pll_slug)
    {
        $ids = array();
        if (!is_array($items)) {
            return $ids;
        }
        foreach ($items as $item) {
            $name = isset($item['name']) ? trim((string) $item['name']) : '';
            if ($name === '') continue;
            $slug = sanitize_title(isset($item['slug']) && $item['slug'] !== '' ? $item['slug'] : $name);
            $candidates = $pll_slug ? array($slug, $slug . '-' . $pll_slug) : array($slug);
            $term_id = 0;
            foreach ($candidates as $candidate) {
                $term = get_term_by('slug', $candidate, $taxonomy);
                if ($term && (!$pll_slug || !function_exists('pll_get_term_language') || pll_get_term_language($term->term_id) === $pll_slug || !pll_get_term_language($term->term_id))) {
                    $term_id = (int) $term->term_id;
                    break;
                }
            }
            if (!$term_id) {
                $slug_to_use = $slug;
                if ($pll_slug && get_term_by('slug', $slug, $taxonomy)) {
                    $slug_to_use = $slug . '-' . $pll_slug;
                }
                $created = wp_insert_term($name, $taxonomy, array('slug' => $slug_to_use));
                if (is_wp_error($created)) {
                    $existing = $created->get_error_data('term_exists');
                    if (!$existing) continue;
                    $term_id = (int) $existing;
                } else {
                    $term_id = (int) $created['term_id'];
                }
            }
            if ($pll_slug && function_exists('pll_set_term_language') && !pll_get_term_language($term_id)) {
                pll_set_term_language($term_id, $pll_slug);
            }
            $ids[] = $term_id;
        }
        return $ids;
    }

    private static function link_translations($group)
    {
        if ($group === '') return;
        $ids = get_posts(array(
            'post_type' => 'post',
            'post_status' => array('publish', 'future', 'draft', 'pending', 'private'),
            'meta_key' => '_zenex_group',
            'meta_value' => $group,
            'numberposts' => 50,
            'fields' => 'ids',
            'suppress_filters' => true,
            'lang' => '',
        ));
        $map = array();
        foreach ($ids as $post_id) {
            $slug = pll_get_post_language($post_id);
            if ($slug && !isset($map[$slug])) {
                $map[$slug] = (int) $post_id;
            }
        }
        if (count($map) > 1) {
            pll_save_post_translations($map);
        }
    }

    private static function write_seo($id, $seo, $og_image_id)
    {
        $value = function ($key) use ($seo) {
            return isset($seo[$key]) && is_string($seo[$key]) ? $seo[$key] : '';
        };
        $keyword = trim(explode(',', $value('keywords'))[0]);
        $fields = array();
        switch (self::seo_plugin()) {
            case 'yoast':
                $fields = array(
                    '_yoast_wpseo_title' => $value('title'),
                    '_yoast_wpseo_metadesc' => $value('description'),
                    '_yoast_wpseo_canonical' => $value('canonicalUrl'),
                    '_yoast_wpseo_opengraph-title' => $value('ogTitle'),
                    '_yoast_wpseo_opengraph-description' => $value('ogDescription'),
                    '_yoast_wpseo_opengraph-image' => $og_image_id ? wp_get_attachment_url($og_image_id) : '',
                    '_yoast_wpseo_opengraph-image-id' => $og_image_id ? (string) $og_image_id : '',
                    '_yoast_wpseo_focuskw' => $keyword,
                );
                break;
            case 'rankmath':
                $fields = array(
                    'rank_math_title' => $value('title'),
                    'rank_math_description' => $value('description'),
                    'rank_math_canonical_url' => $value('canonicalUrl'),
                    'rank_math_facebook_title' => $value('ogTitle'),
                    'rank_math_facebook_description' => $value('ogDescription'),
                    'rank_math_facebook_image' => $og_image_id ? wp_get_attachment_url($og_image_id) : '',
                    'rank_math_facebook_image_id' => $og_image_id ? (string) $og_image_id : '',
                    'rank_math_focus_keyword' => $keyword,
                );
                break;
            case 'seopress':
                $fields = array(
                    '_seopress_titles_title' => $value('title'),
                    '_seopress_titles_desc' => $value('description'),
                    '_seopress_robots_canonical' => $value('canonicalUrl'),
                    '_seopress_social_fb_title' => $value('ogTitle'),
                    '_seopress_social_fb_desc' => $value('ogDescription'),
                    '_seopress_social_fb_img' => $og_image_id ? wp_get_attachment_url($og_image_id) : '',
                    '_seopress_analysis_target_kw' => $keyword,
                );
                break;
        }
        foreach ($fields as $key => $field) {
            if ($field === '') {
                delete_post_meta($id, $key);
            } else {
                update_post_meta($id, $key, wp_slash($field));
            }
        }
    }

    // ------------------------------------------------------------------
    // SEO on the page, when no SEO plugin handles it

    private static function seo_for_current()
    {
        if (self::seo_plugin() || !is_singular('post')) {
            return null;
        }
        $seo = get_post_meta(get_queried_object_id(), '_zenex_seo', true);
        return is_array($seo) ? $seo : null;
    }

    public static function head()
    {
        $seo = self::seo_for_current();
        if (!$seo) return;
        $description = isset($seo['description']) ? (string) $seo['description'] : '';
        if ($description !== '') {
            printf("<meta name=\"description\" content=\"%s\" />\n", esc_attr($description));
        }
        $og = array(
            'og:title' => !empty($seo['ogTitle']) ? $seo['ogTitle'] : (isset($seo['title']) ? $seo['title'] : ''),
            'og:description' => !empty($seo['ogDescription']) ? $seo['ogDescription'] : $description,
            'og:type' => 'article',
            'og:url' => get_permalink(),
        );
        $image = get_the_post_thumbnail_url(null, 'full');
        if ($image) {
            $og['og:image'] = $image;
        }
        foreach ($og as $property => $content) {
            if ($content) {
                printf("<meta property=\"%s\" content=\"%s\" />\n", esc_attr($property), esc_attr($content));
            }
        }
    }

    public static function document_title($title)
    {
        $seo = self::seo_for_current();
        return $seo && !empty($seo['title']) ? $seo['title'] : $title;
    }

    public static function canonical($url, $post)
    {
        if (self::seo_plugin() || !$post) return $url;
        $seo = get_post_meta($post->ID, '_zenex_seo', true);
        return is_array($seo) && !empty($seo['canonicalUrl']) ? $seo['canonicalUrl'] : $url;
    }

    // ------------------------------------------------------------------
    // Admin

    public static function menu()
    {
        add_options_page('Zenex', 'Zenex', 'manage_options', 'zenex', array(__CLASS__, 'page'));
    }

    public static function action_links($links)
    {
        array_unshift($links, '<a href="' . esc_url(admin_url('options-general.php?page=zenex')) . '">' . esc_html__('Settings', 'zenex') . '</a>');
        return $links;
    }

    public static function settings()
    {
        register_setting('zenex', self::OPTION_KEY, array('type' => 'string', 'sanitize_callback' => function ($value) {
            return preg_replace('/\s+/', '', (string) $value);
        }));
        register_setting('zenex', self::OPTION_AUTHOR, array('type' => 'integer', 'sanitize_callback' => 'absint'));
    }

    public static function page()
    {
        if (!current_user_can('manage_options')) return;
        $last = get_option(self::OPTION_LAST);
        $key = (string) get_option(self::OPTION_KEY, '');
        ?>
        <div class="wrap">
            <h1>Zenex</h1>
            <p><?php esc_html_e('Articles you publish in Zenex appear here as posts, with their images, categories, tags and SEO. Edit them in Zenex: changes made here are replaced the next time an article is updated there.', 'zenex'); ?></p>

            <?php if (is_array($last)) : ?>
                <div class="notice <?php echo $last['ok'] ? 'notice-success' : 'notice-error'; ?> inline"><p>
                    <strong><?php echo $last['ok'] ? esc_html__('Connected.', 'zenex') : esc_html__('The last delivery failed.', 'zenex'); ?></strong>
                    <?php
                    /* translators: 1: time ago, 2: what happened */
                    printf(esc_html__('Last delivery %1$s ago: %2$s', 'zenex'), esc_html(human_time_diff((int) $last['time'])), esc_html($last['message']));
                    ?>
                </p></div>
            <?php elseif ($key === '') : ?>
                <div class="notice notice-warning inline"><p><?php esc_html_e('Not connected yet. In Zenex, open your blog → Settings → Web integration, copy the connection key and paste it below.', 'zenex'); ?></p></div>
            <?php else : ?>
                <div class="notice notice-info inline"><p><?php esc_html_e('Key saved. Now go back to Zenex and click “Check connection”.', 'zenex'); ?></p></div>
            <?php endif; ?>

            <form method="post" action="options.php">
                <?php settings_fields('zenex'); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="zenex_key"><?php esc_html_e('Connection key', 'zenex'); ?></label></th>
                        <td>
                            <input name="<?php echo esc_attr(self::OPTION_KEY); ?>" id="zenex_key" type="password" class="regular-text code" value="<?php echo esc_attr($key); ?>" autocomplete="off" spellcheck="false" placeholder="zx_…" />
                            <p class="description"><?php esc_html_e('From Zenex → your blog → Settings → Web integration.', 'zenex'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="zenex_author"><?php esc_html_e('Publish as', 'zenex'); ?></label></th>
                        <td>
                            <?php wp_dropdown_users(array(
                                'name' => self::OPTION_AUTHOR,
                                'id' => 'zenex_author',
                                'selected' => self::author_id(),
                                'capability' => array('publish_posts'),
                            )); ?>
                            <p class="description"><?php esc_html_e('The WordPress user shown as the author of articles from Zenex.', 'zenex'); ?></p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
            <p class="description">
                <?php
                /* translators: %s: endpoint URL */
                printf(esc_html__('Zenex sends articles to %s', 'zenex'), '<code>' . esc_html(rest_url('zenex/v1/webhook')) . '</code>');
                ?>
            </p>
        </div>
        <?php
    }

    /** Reminds editors that Zenex owns these posts. */
    public static function managed_notice()
    {
        $screen = function_exists('get_current_screen') ? get_current_screen() : null;
        if (!$screen || $screen->base !== 'post' || $screen->post_type !== 'post') return;
        $post_id = isset($_GET['post']) ? absint($_GET['post']) : 0;
        if (!$post_id || !get_post_meta($post_id, '_zenex_id', true)) return;
        echo '<div class="notice notice-info"><p>' . esc_html__('This article is published from Zenex. Edit it there: changes made here are replaced the next time it’s updated in Zenex.', 'zenex') . '</p></div>';
    }
}

Zenex_Plugin::boot();
