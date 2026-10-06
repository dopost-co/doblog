<?php
/**
 * Zenex Blog: a blog inside your PrestaShop store, written in Zenex.
 *
 * Zenex sends signed requests to
 *   index.php?fc=module&module=zenexblog&controller=webhook
 * (ping, post.upsert, post.delete). Articles are stored in this shop's
 * database and served at /blog and /blog/{slug} in each language.
 */
if (!defined('_PS_VERSION_')) {
    exit;
}

class ZenexBlog extends Module
{
    const TOLERANCE = 300;
    const PER_PAGE = 12;

    public function __construct()
    {
        $this->name = 'zenexblog';
        $this->tab = 'content_management';
        $this->version = '1.0.0';
        $this->author = 'Zenex';
        $this->need_instance = 0;
        $this->bootstrap = true;
        $this->ps_versions_compliancy = array('min' => '1.7.6', 'max' => _PS_VERSION_);
        parent::__construct();
        $this->displayName = $this->l('Zenex Blog');
        $this->description = $this->l('A blog for your store, written and published from Zenex.');
    }

    public function install()
    {
        return parent::install()
            && $this->createTable()
            && $this->registerHook('moduleRoutes')
            && $this->registerHook('gSitemapAppendUrls')
            && Configuration::updateGlobalValue('ZENEXBLOG_ROUTE', 'blog')
            && $this->imageDir() !== null;
    }

    /** Articles are kept on uninstall: reinstalling brings the blog back as it was. */
    public function uninstall()
    {
        Configuration::deleteByName('ZENEXBLOG_KEY');
        Configuration::deleteByName('ZENEXBLOG_LAST');
        return parent::uninstall();
    }

    private function createTable()
    {
        return Db::getInstance()->execute('CREATE TABLE IF NOT EXISTS `' . _DB_PREFIX_ . 'zenexblog_post` (
            `id_zenexblog_post` INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `zenex_id` VARCHAR(64) NOT NULL,
            `translation_group` VARCHAR(64) NULL,
            `id_shop` INT UNSIGNED NOT NULL,
            `id_lang` INT UNSIGNED NOT NULL,
            `slug` VARCHAR(255) NOT NULL,
            `title` VARCHAR(255) NOT NULL,
            `excerpt` TEXT NULL,
            `content` LONGTEXT NOT NULL,
            `cover` VARCHAR(512) NULL,
            `cover_alt` VARCHAR(255) NULL,
            `author` VARCHAR(255) NULL,
            `categories` TEXT NULL,
            `tags` TEXT NULL,
            `meta_title` VARCHAR(255) NULL,
            `meta_description` TEXT NULL,
            `canonical` VARCHAR(512) NULL,
            `og_title` VARCHAR(255) NULL,
            `og_description` TEXT NULL,
            `featured` TINYINT(1) NOT NULL DEFAULT 0,
            `date_published` DATETIME NOT NULL,
            `date_upd` DATETIME NOT NULL,
            PRIMARY KEY (`id_zenexblog_post`),
            UNIQUE KEY `zenex_shop` (`zenex_id`, `id_shop`),
            KEY `lang_slug` (`id_shop`, `id_lang`, `slug`),
            KEY `lang_date` (`id_shop`, `id_lang`, `date_published`)
        ) ENGINE=' . _MYSQL_ENGINE_ . ' DEFAULT CHARSET=utf8mb4');
    }

    // ------------------------------------------------------------------
    // Routes and links

    public function route()
    {
        $route = trim((string) Configuration::get('ZENEXBLOG_ROUTE'), '/');
        return $route !== '' ? $route : 'blog';
    }

    public function hookModuleRoutes()
    {
        $route = $this->route();
        $params = array('fc' => 'module', 'module' => $this->name);
        return array(
            'module-zenexblog-list' => array('controller' => 'list', 'rule' => $route, 'keywords' => array(), 'params' => $params),
            'module-zenexblog-post' => array(
                'controller' => 'post',
                'rule' => $route . '/{slug}',
                'keywords' => array('slug' => array('regexp' => '[_a-zA-Z0-9\pL\pS-]+', 'param' => 'slug')),
                'params' => $params,
            ),
        );
    }

    public function listLink($id_lang = null, $page = 1)
    {
        return $this->context->link->getModuleLink($this->name, 'list', $page > 1 ? array('page' => (int) $page) : array(), null, $id_lang);
    }

    public function postLink($slug, $id_lang = null)
    {
        return $this->context->link->getModuleLink($this->name, 'post', array('slug' => $slug), null, $id_lang);
    }

    // ------------------------------------------------------------------
    // Reading articles

    private function shopId()
    {
        return (int) $this->context->shop->id;
    }

    public function findPost($slug, $id_lang)
    {
        $row = Db::getInstance()->getRow('SELECT * FROM `' . _DB_PREFIX_ . 'zenexblog_post`
            WHERE `id_shop` = ' . $this->shopId() . ' AND `id_lang` = ' . (int) $id_lang . " AND `slug` = '" . pSQL($slug) . "'");
        return $row ? $this->present($row) : null;
    }

    public function listPosts($id_lang, $page)
    {
        $where = 'WHERE `id_shop` = ' . $this->shopId() . ' AND `id_lang` = ' . (int) $id_lang;
        $total = (int) Db::getInstance()->getValue('SELECT COUNT(*) FROM `' . _DB_PREFIX_ . 'zenexblog_post` ' . $where);
        $rows = Db::getInstance()->executeS('SELECT * FROM `' . _DB_PREFIX_ . 'zenexblog_post` ' . $where
            . ' ORDER BY `featured` DESC, `date_published` DESC LIMIT ' . (int) (($page - 1) * self::PER_PAGE) . ', ' . self::PER_PAGE);
        return array('posts' => array_map(array($this, 'present'), $rows ?: array()), 'total' => $total, 'pages' => max(1, (int) ceil($total / self::PER_PAGE)));
    }

    /** The other languages of an article: id_lang => URL. */
    public function translations($post)
    {
        $links = array();
        if (empty($post['translation_group'])) {
            return $links;
        }
        $rows = Db::getInstance()->executeS('SELECT `id_lang`, `slug` FROM `' . _DB_PREFIX_ . 'zenexblog_post`
            WHERE `id_shop` = ' . $this->shopId() . " AND `translation_group` = '" . pSQL($post['translation_group']) . "'");
        foreach ($rows ?: array() as $row) {
            $links[(int) $row['id_lang']] = $this->postLink($row['slug'], (int) $row['id_lang']);
        }
        return $links;
    }

    public function present($row)
    {
        $row['url'] = $this->postLink($row['slug'], (int) $row['id_lang']);
        $row['categories'] = json_decode((string) $row['categories'], true) ?: array();
        $row['tags'] = json_decode((string) $row['tags'], true) ?: array();
        $row['date'] = Tools::displayDate($row['date_published']);
        return $row;
    }

    // ------------------------------------------------------------------
    // Webhook

    private function respond($status, $data)
    {
        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store');
        }
        echo json_encode($data);
        exit;
    }

    private function fail($status, $code, $message)
    {
        $this->respond($status, array('ok' => false, 'code' => $code, 'message' => $message));
    }

    private function remember($event, $ok, $message)
    {
        Configuration::updateGlobalValue('ZENEXBLOG_LAST', json_encode(array('time' => time(), 'event' => $event, 'ok' => $ok, 'message' => Tools::substr((string) $message, 0, 300))));
    }

    public function handleWebhook()
    {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            $this->fail(405, 'zenex_bad_request', 'Zenex sends POST requests here.');
        }
        $key = trim((string) Configuration::getGlobalValue('ZENEXBLOG_KEY'));
        if ($key === '') {
            $this->fail(401, 'zenex_not_configured', 'Paste the connection key from Zenex in the module settings.');
        }
        $body = (string) file_get_contents('php://input');
        $timestamp = isset($_SERVER['HTTP_X_ZENEX_TIMESTAMP']) ? (string) $_SERVER['HTTP_X_ZENEX_TIMESTAMP'] : '';
        $signature = isset($_SERVER['HTTP_X_ZENEX_SIGNATURE']) ? (string) $_SERVER['HTTP_X_ZENEX_SIGNATURE'] : '';
        if (!ctype_digit($timestamp) || abs(time() - (int) $timestamp) > self::TOLERANCE) {
            $this->fail(401, 'zenex_stale_request', 'The request is too old or this server\'s clock is off.');
        }
        if (!hash_equals('v1=' . hash_hmac('sha256', $timestamp . '.' . $body, $key), $signature)) {
            $this->fail(401, 'zenex_bad_signature', 'The connection key does not match.');
        }
        $data = json_decode($body, true);
        if (!is_array($data) || empty($data['event'])) {
            $this->fail(400, 'zenex_bad_request', 'The request has no event.');
        }

        try {
            switch ($data['event']) {
                case 'ping':
                    $result = array('ok' => true, 'connector' => 'zenex-prestashop', 'version' => $this->version, 'site' => $this->siteInfo());
                    $summary = 'Connection checked';
                    break;
                case 'post.upsert':
                    $result = $this->upsert(isset($data['article']) ? $data['article'] : null);
                    $summary = $data['article']['title'];
                    break;
                case 'post.delete':
                    $id = isset($data['article']['id']) ? (string) $data['article']['id'] : '';
                    $deleted = Db::getInstance()->delete('zenexblog_post', "`zenex_id` = '" . pSQL($id) . "' AND `id_shop` = " . $this->shopId());
                    if (!$deleted || !Db::getInstance()->Affected_Rows()) {
                        $this->remember('post.delete', true, 'Already removed');
                        $this->fail(404, 'zenex_not_found', 'This article is not in the shop.');
                    }
                    $result = array('ok' => true);
                    $summary = 'Article removed';
                    break;
                default:
                    $this->fail(400, 'zenex_unknown_event', 'Unknown event.');
            }
        } catch (Exception $error) {
            $this->remember($data['event'], false, $error->getMessage());
            $this->fail(500, 'zenex_error', $error->getMessage());
        }
        $this->remember($data['event'], true, $summary);
        $this->respond(200, $result);
    }

    private function siteInfo()
    {
        $languages = array();
        $bases = array();
        $rewriting = (bool) Configuration::get('PS_REWRITING_SETTINGS');
        foreach (Language::getLanguages(true, $this->shopId()) as $language) {
            $iso = Tools::strtolower($language['iso_code']);
            $languages[] = $iso;
            if ($rewriting) {
                $bases[$iso] = rtrim($this->listLink((int) $language['id_lang']), '/');
            }
        }
        return array(
            'name' => Configuration::get('PS_SHOP_NAME'),
            'url' => $this->context->link->getBaseLink(),
            'platformVersion' => _PS_VERSION_,
            'languages' => $languages,
            'multilingual' => count($languages) > 1,
            'articleBase' => (object) $bases,
            'seoPlugin' => null,
        );
    }

    private function text($array, $key)
    {
        return isset($array[$key]) && is_string($array[$key]) ? $array[$key] : '';
    }

    private function upsert($article)
    {
        if (!is_array($article) || $this->text($article, 'id') === '' || $this->text($article, 'title') === '' || $this->text($article, 'slug') === '') {
            throw new Exception('The article is missing its id, title or slug.');
        }
        $iso = Tools::strtolower($this->text($article, 'language'));
        $id_lang = (int) Language::getIdByIso($iso);
        if (!$id_lang || !Language::isInstalled($iso)) {
            throw new Exception(sprintf('The shop has no “%s” language installed. Add it in International → Localization → Languages.', $iso));
        }

        $warnings = array();
        $images = array();
        $urls = isset($article['images']) && is_array($article['images']) ? $article['images'] : array();
        foreach ($urls as $url) {
            if (!is_string($url) || !preg_match('#^https?://#i', $url)) continue;
            try {
                $images[$url] = $this->storeImage($url);
            } catch (Exception $error) {
                $warnings[] = 'Image kept at its original address: ' . $url . ' (' . $error->getMessage() . ')';
            }
        }
        $html = $this->text($article, 'html');
        foreach ($images as $url => $local) {
            $html = str_replace(array($url, str_replace('&', '&amp;', $url)), $local, $html);
        }

        $published = strtotime($this->text($article, 'publishedAt'));
        if (!$published || $published > time()) {
            $published = time();
        }
        $seo = isset($article['seo']) && is_array($article['seo']) ? $article['seo'] : array();
        $cover = isset($article['coverImage']['url']) ? (string) $article['coverImage']['url'] : '';
        $names = function ($items) {
            $out = array();
            foreach (is_array($items) ? $items : array() as $item) {
                if (!empty($item['name'])) $out[] = array('name' => (string) $item['name'], 'slug' => isset($item['slug']) ? (string) $item['slug'] : '');
            }
            return json_encode($out);
        };
        $slug = Tools::str2url($this->text($article, 'slug')) ?: $this->text($article, 'slug');
        $values = array(
            'zenex_id' => pSQL($this->text($article, 'id')),
            'translation_group' => pSQL($this->text($article, 'translationGroupId')),
            'id_shop' => $this->shopId(),
            'id_lang' => $id_lang,
            'slug' => pSQL($slug),
            'title' => pSQL(Tools::substr($this->text($article, 'title'), 0, 255)),
            'excerpt' => pSQL($this->text($article, 'excerpt')),
            'content' => pSQL($html, true),
            'cover' => pSQL($cover !== '' ? (isset($images[$cover]) ? $images[$cover] : $cover) : ''),
            'cover_alt' => pSQL(isset($article['coverImage']['alt']) ? Tools::substr((string) $article['coverImage']['alt'], 0, 255) : ''),
            'author' => pSQL(isset($article['author']['name']) ? (string) $article['author']['name'] : ''),
            'categories' => pSQL($names(isset($article['categories']) ? $article['categories'] : array())),
            'tags' => pSQL($names(isset($article['tags']) ? $article['tags'] : array())),
            'meta_title' => pSQL(Tools::substr($this->text($seo, 'title'), 0, 255)),
            'meta_description' => pSQL($this->text($seo, 'description')),
            'canonical' => pSQL($this->text($seo, 'canonicalUrl')),
            'og_title' => pSQL(Tools::substr($this->text($seo, 'ogTitle'), 0, 255)),
            'og_description' => pSQL($this->text($seo, 'ogDescription')),
            'featured' => !empty($article['featured']) ? 1 : 0,
            'date_published' => date('Y-m-d H:i:s', $published),
            'date_upd' => date('Y-m-d H:i:s'),
        );

        $db = Db::getInstance();
        $existing = (int) $db->getValue('SELECT `id_zenexblog_post` FROM `' . _DB_PREFIX_ . 'zenexblog_post`
            WHERE `zenex_id` = \'' . $values['zenex_id'] . '\' AND `id_shop` = ' . $this->shopId());
        // Another article can't keep the slug in this language; Zenex makes slugs unique, so it is stale.
        $db->delete('zenexblog_post', '`id_shop` = ' . $this->shopId() . ' AND `id_lang` = ' . $id_lang . " AND `slug` = '" . $values['slug'] . "'"
            . ($existing ? ' AND `id_zenexblog_post` <> ' . $existing : ''));
        $saved = $existing
            ? $db->update('zenexblog_post', $values, '`id_zenexblog_post` = ' . $existing)
            : $db->insert('zenexblog_post', $values);
        if (!$saved) {
            throw new Exception('The shop could not save the article: ' . $db->getMsgError());
        }
        $id = $existing ?: (int) $db->Insert_ID();
        return array('ok' => true, 'remoteId' => $id, 'url' => $this->postLink($slug, $id_lang), 'warnings' => $warnings);
    }

    /** img/zenexblog, created on demand. */
    public function imageDir()
    {
        $dir = _PS_IMG_DIR_ . 'zenexblog/';
        if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
            return null;
        }
        if (!file_exists($dir . 'index.php')) {
            @file_put_contents($dir . 'index.php', "<?php\nheader('Location: ../');\nexit;\n");
        }
        return $dir;
    }

    /** Copies an image into the shop once; the file name comes from its address. */
    private function storeImage($url)
    {
        $dir = $this->imageDir();
        if ($dir === null) {
            throw new Exception('img/zenexblog is not writable');
        }
        $hash = sha1($url);
        foreach (array('jpg', 'png', 'gif', 'webp', 'avif') as $extension) {
            if (file_exists($dir . $hash . '.' . $extension)) {
                return $this->imageUrl($hash . '.' . $extension);
            }
        }
        $curl = curl_init($url);
        curl_setopt_array($curl, array(
            CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3,
            CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => 60, CURLOPT_USERAGENT => 'ZenexBlog/' . $this->version,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        ));
        $bytes = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $error = curl_error($curl);
        curl_close($curl);
        if ($bytes === false || $status >= 400) {
            throw new Exception($error ?: 'HTTP ' . $status);
        }
        if (strlen($bytes) > 15 * 1024 * 1024) {
            throw new Exception('the image is larger than 15 MB');
        }
        $info = function_exists('getimagesizefromstring') ? @getimagesizefromstring($bytes) : false;
        $types = array('image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp', 'image/avif' => 'avif');
        $mime = $info && isset($info['mime']) ? $info['mime'] : null;
        if (!$mime || !isset($types[$mime])) {
            throw new Exception('not a supported image');
        }
        $file = $hash . '.' . $types[$mime];
        if (file_put_contents($dir . $file, $bytes) === false) {
            throw new Exception('img/zenexblog is not writable');
        }
        return $this->imageUrl($file);
    }

    private function imageUrl($file)
    {
        return $this->context->link->getMediaLink(_PS_IMG_ . 'zenexblog/' . $file);
    }

    // ------------------------------------------------------------------
    // Sitemap (Google sitemap module)

    public function hookGSitemapAppendUrls($params)
    {
        $id_lang = isset($params['lang']['id_lang']) ? (int) $params['lang']['id_lang'] : (int) $this->context->language->id;
        $links = array(array('link' => $this->listLink($id_lang), 'lastmod' => date('Y-m-d')));
        $rows = Db::getInstance()->executeS('SELECT `slug`, `date_upd` FROM `' . _DB_PREFIX_ . 'zenexblog_post`
            WHERE `id_shop` = ' . $this->shopId() . ' AND `id_lang` = ' . $id_lang);
        foreach ($rows ?: array() as $row) {
            $links[] = array('link' => $this->postLink($row['slug'], $id_lang), 'lastmod' => Tools::substr($row['date_upd'], 0, 10));
        }
        return $links;
    }

    // ------------------------------------------------------------------
    // Configuration page

    public function getContent()
    {
        $output = '';
        if (Tools::isSubmit('submitZenexBlog')) {
            $key = preg_replace('/\s+/', '', (string) Tools::getValue('ZENEXBLOG_KEY'));
            $route = trim(Tools::str2url((string) Tools::getValue('ZENEXBLOG_ROUTE')), '/');
            Configuration::updateGlobalValue('ZENEXBLOG_KEY', $key);
            Configuration::updateGlobalValue('ZENEXBLOG_ROUTE', $route !== '' ? $route : 'blog');
            $output .= $this->displayConfirmation($key !== ''
                ? $this->l('Saved. Now go back to Zenex and click “Check connection”.')
                : $this->l('Saved.'));
        }

        $last = json_decode((string) Configuration::getGlobalValue('ZENEXBLOG_LAST'), true);
        if (is_array($last)) {
            $ago = max(1, (int) round((time() - (int) $last['time']) / 60));
            $line = sprintf($this->l('Last delivery %d min ago: %s'), $ago, $last['message']);
            $output .= $last['ok'] ? $this->displayConfirmation($line) : $this->displayError($line);
        } elseif (!Configuration::getGlobalValue('ZENEXBLOG_KEY')) {
            $output .= $this->displayWarning($this->l('Not connected yet. In Zenex, open your blog → Settings → Web integration, copy the connection key and paste it below.'));
        }

        $helper = new HelperForm();
        $helper->module = $this;
        $helper->name_controller = $this->name;
        $helper->token = Tools::getAdminTokenLite('AdminModules');
        $helper->currentIndex = AdminController::$currentIndex . '&configure=' . $this->name;
        $helper->submit_action = 'submitZenexBlog';
        $helper->default_form_language = (int) Configuration::get('PS_LANG_DEFAULT');
        $helper->fields_value = array(
            'ZENEXBLOG_KEY' => (string) Configuration::getGlobalValue('ZENEXBLOG_KEY'),
            'ZENEXBLOG_ROUTE' => $this->route(),
        );
        $form = array('form' => array(
            'legend' => array('title' => $this->l('Connection'), 'icon' => 'icon-link'),
            'description' => $this->l('Articles you publish in Zenex appear in your store’s blog. Edit them in Zenex.'),
            'input' => array(
                array('type' => 'text', 'label' => $this->l('Connection key'), 'name' => 'ZENEXBLOG_KEY', 'required' => true, 'class' => 'fixed-width-xxl',
                    'desc' => $this->l('From Zenex → your blog → Settings → Web integration.')),
                array('type' => 'text', 'label' => $this->l('Blog address'), 'name' => 'ZENEXBLOG_ROUTE', 'prefix' => $this->context->link->getBaseLink(), 'class' => 'fixed-width-lg',
                    'desc' => $this->l('Articles are served at this path, e.g. /blog/my-article. Zenex updates its links when you check the connection again.')),
            ),
            'submit' => array('title' => $this->l('Save')),
        ));
        $output .= $helper->generateForm(array($form));
        $output .= '<p class="help-block">' . sprintf($this->l('Your blog: %s'), '<a href="' . htmlspecialchars($this->listLink()) . '" target="_blank" rel="noopener">' . htmlspecialchars($this->listLink()) . '</a>') . '</p>';
        return $output;
    }
}
