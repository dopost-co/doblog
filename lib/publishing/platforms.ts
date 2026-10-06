/**
 * Where a blog's articles live, as the owner chooses it: first the kind of
 * website, then (only for sites built in code) how articles reach it.
 * Shared by onboarding, Settings → Web integration and the publishing engine.
 */

export const SITE_PLATFORMS = [
  { id: "wordpress", title: "WordPress", example: "Zenex publishes each article in your WordPress." },
  { id: "prestashop", title: "PrestaShop", example: "Zenex publishes a blog inside your shop." },
  { id: "nextjs", title: "Next.js", example: "A site built with Next.js." },
  { id: "astro", title: "Astro", example: "A site built with Astro." },
  { id: "other", title: "Another website", example: "Built in code, with any framework or language." },
] as const;

export type SitePlatform = typeof SITE_PLATFORMS[number]["id"];

/** Sites built in code choose how articles arrive; WordPress and PrestaShop always get a copy. */
export const CODE_PLATFORMS: readonly SitePlatform[] = ["nextjs", "astro", "other"];

export const DELIVERY_METHODS = [
  {
    id: "github",
    title: "Copied to your repository",
    example: "Zenex commits each article as a Markdown file. Your site deploys on its own and never depends on Zenex.",
    recommended: true,
  },
  {
    id: "webhook",
    title: "Sent to your server",
    example: "Zenex sends each article to an endpoint you build, and you store it wherever you like.",
    recommended: false,
  },
  {
    id: "api",
    title: "Read live from Zenex",
    example: "Your site asks Zenex for articles when it renders. Changes show up without a deploy.",
    recommended: false,
  },
] as const;

export type DeliveryMethod = typeof DELIVERY_METHODS[number]["id"] | "plugin";

export function isSitePlatform(value: unknown): value is SitePlatform {
  return typeof value === "string" && SITE_PLATFORMS.some((platform) => platform.id === value);
}

export function isCodePlatform(platform: string | null | undefined) {
  return CODE_PLATFORMS.includes(platform as SitePlatform);
}

/** The only way articles reach a platform that has no choice, or null when the owner picks. */
export function fixedMethod(platform: SitePlatform): DeliveryMethod | null {
  return isCodePlatform(platform) ? null : "plugin";
}

export function isDeliveryMethod(value: unknown, platform: SitePlatform): value is DeliveryMethod {
  const fixed = fixedMethod(platform);
  return fixed ? value === fixed : DELIVERY_METHODS.some((method) => method.id === value);
}

/** Every method but "api" copies articles to the site. */
export function copiesArticles(method: string | null | undefined) {
  return Boolean(method) && method !== "api";
}

export function platformName(platform: string) {
  return SITE_PLATFORMS.find((item) => item.id === platform)?.title ?? "your website";
}

/** Where copies go, as the dashboard names it: "WordPress", "GitHub", "your server". */
export function destinationName(destination: { platform: string; method: string }) {
  if (destination.method === "plugin") return platformName(destination.platform);
  if (destination.method === "github") return "GitHub";
  if (destination.method === "webhook") return "your server";
  return "your website";
}

/** The installable piece for platforms that need one. */
export const CONNECTORS = {
  wordpress: { name: "Zenex for WordPress", file: "/downloads/zenex-wordpress.zip", settings: "Settings → Zenex" },
  prestashop: { name: "Zenex Blog for PrestaShop", file: "/downloads/zenex-prestashop.zip", settings: "Modules → Module Manager → Zenex Blog → Configure" },
} as const;

/** The platform a homepage was built with, from tell-tale markup; null when unsure. */
export function detectPlatform(html: string): SitePlatform | null {
  const generator = html.match(/<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)/i)?.[1]?.toLowerCase() ?? "";
  if (generator.includes("wordpress") || /\/wp-(content|includes)\//i.test(html)) return "wordpress";
  if (generator.includes("prestashop") || /var prestashop\s*=|\/modules\/ps_[a-z]+\//i.test(html)) return "prestashop";
  if (generator.includes("astro") || /\/_astro\/|<astro-island/i.test(html)) return "astro";
  if (generator.includes("next.js") || /\/_next\/static\/|id=["']__NEXT_DATA__["']|self\.__next_f/i.test(html)) return "nextjs";
  return null;
}
