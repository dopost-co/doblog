<?php
class ZenexblogListModuleFrontController extends ModuleFrontController
{
    private $page = 1;
    private $result = array('posts' => array(), 'total' => 0, 'pages' => 1);

    public function init()
    {
        parent::init();
        $this->page = max(1, (int) Tools::getValue('page', 1));
        $this->result = $this->module->listPosts((int) $this->context->language->id, $this->page);
    }

    public function setMedia()
    {
        parent::setMedia();
        $this->registerStylesheet('zenexblog', 'modules/' . $this->module->name . '/views/css/front.css', array('media' => 'all', 'priority' => 200));
    }

    public function initContent()
    {
        parent::initContent();
        $this->context->smarty->assign(array(
            'zenex_posts' => $this->result['posts'],
            'zenex_page' => $this->page,
            'zenex_pages' => $this->result['pages'],
            'zenex_prev' => $this->page > 1 ? $this->module->listLink(null, $this->page - 1) : null,
            'zenex_next' => $this->page < $this->result['pages'] ? $this->module->listLink(null, $this->page + 1) : null,
        ));
        $this->setTemplate('module:zenexblog/views/templates/front/list.tpl');
    }

    public function getTemplateVarPage()
    {
        $page = parent::getTemplateVarPage();
        $page['meta']['title'] = $this->module->l('Blog', 'list') . ' | ' . Configuration::get('PS_SHOP_NAME');
        $page['body_classes']['zenexblog'] = true;
        return $page;
    }

    public function getCanonicalURL()
    {
        return $this->module->listLink(null, $this->page);
    }

    public function getBreadcrumbLinks()
    {
        $breadcrumb = parent::getBreadcrumbLinks();
        $breadcrumb['links'][] = array('title' => $this->module->l('Blog', 'list'), 'url' => $this->module->listLink());
        return $breadcrumb;
    }

    protected function getAlternativeLangsUrl()
    {
        $links = array();
        foreach (Language::getLanguages(true, $this->context->shop->id) as $language) {
            $links[$language['language_code']] = $this->module->listLink((int) $language['id_lang']);
        }
        return $links;
    }
}
