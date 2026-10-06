<?php
class ZenexblogPostModuleFrontController extends ModuleFrontController
{
    private $post = null;

    public function init()
    {
        parent::init();
        $this->post = $this->module->findPost((string) Tools::getValue('slug'), (int) $this->context->language->id);
    }

    public function setMedia()
    {
        parent::setMedia();
        $this->registerStylesheet('zenexblog', 'modules/' . $this->module->name . '/views/css/front.css', array('media' => 'all', 'priority' => 200));
    }

    public function initContent()
    {
        if (!$this->post) {
            header('HTTP/1.1 404 Not Found');
            header('Status: 404 Not Found');
            parent::initContent();
            $this->setTemplate('errors/404');
            return;
        }
        parent::initContent();
        $this->context->smarty->assign(array(
            'zenex_post' => $this->post,
            'zenex_blog_url' => $this->module->listLink(),
        ));
        $this->setTemplate('module:zenexblog/views/templates/front/post.tpl');
    }

    public function getTemplateVarPage()
    {
        $page = parent::getTemplateVarPage();
        if ($this->post) {
            $page['meta']['title'] = $this->post['meta_title'] ?: $this->post['title'];
            $page['meta']['description'] = $this->post['meta_description'] ?: (string) $this->post['excerpt'];
            $page['body_classes']['zenexblog'] = true;
        } else {
            $page['meta']['robots'] = 'noindex';
        }
        return $page;
    }

    public function getCanonicalURL()
    {
        if (!$this->post) {
            return '';
        }
        return $this->post['canonical'] ?: $this->post['url'];
    }

    public function getBreadcrumbLinks()
    {
        $breadcrumb = parent::getBreadcrumbLinks();
        $breadcrumb['links'][] = array('title' => $this->module->l('Blog', 'post'), 'url' => $this->module->listLink());
        if ($this->post) {
            $breadcrumb['links'][] = array('title' => $this->post['title'], 'url' => $this->post['url']);
        }
        return $breadcrumb;
    }

    /** Language switcher and hreflang point at the same article in each language. */
    protected function getAlternativeLangsUrl()
    {
        $links = array();
        $translations = $this->post ? $this->module->translations($this->post) : array();
        foreach (Language::getLanguages(true, $this->context->shop->id) as $language) {
            $id = (int) $language['id_lang'];
            $links[$language['language_code']] = isset($translations[$id]) ? $translations[$id] : $this->module->listLink($id);
        }
        return $links;
    }
}
