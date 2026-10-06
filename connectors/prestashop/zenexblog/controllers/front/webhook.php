<?php
/**
 * Receives signed deliveries from Zenex. Skips everything a storefront page
 * does that could redirect or block a server-to-server POST (SSL and
 * canonical redirects, maintenance mode, geolocation).
 */
class ZenexblogWebhookModuleFrontController extends ModuleFrontController
{
    public $ajax = true;
    public $ssl = false;

    public function postProcess()
    {
        $this->module->handleWebhook();
    }

    public function initContent()
    {
    }

    protected function sslRedirection()
    {
    }

    protected function canonicalRedirection($canonical_url = '')
    {
    }

    protected function displayMaintenancePage()
    {
    }

    protected function displayRestrictedCountryPage()
    {
    }

    protected function geolocationManagement($default_country)
    {
        return false;
    }
}
