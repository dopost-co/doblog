#!/usr/bin/env bash
# Packs the WordPress plugin and the PrestaShop module into the zips the
# Web integration settings offer for download (public/downloads). Run after changing them.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/public/downloads"
mkdir -p "$out"
rm -f "$out/zenex-wordpress.zip" "$out/zenex-prestashop.zip"
(cd "$root/connectors/wordpress" && zip -qr -X "$out/zenex-wordpress.zip" zenex -x '*.DS_Store')
(cd "$root/connectors/prestashop" && zip -qr -X "$out/zenex-prestashop.zip" zenexblog -x '*.DS_Store' -x 'zenexblog/config*.xml')
echo "Built $out/zenex-wordpress.zip and $out/zenex-prestashop.zip"
