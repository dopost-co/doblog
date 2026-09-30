import { prisma } from "@/lib/prisma";
import { articleHref, articlePrefixFor, linkHrefsIn, normalizeArticlePath, rewriteContentLinks } from "@/src/server/services/growth/internal-links";

/** The address without its query or fragment, and that suffix. */
function splitHref(href: string) {
  const index = href.search(/[?#]/);
  return index === -1 ? { base: href, suffix: "" } : { base: href.slice(0, index), suffix: href.slice(index) };
}

/** The slug an address points to under an article path, or null when it is not an article URL. */
export function slugUnder(base: string, prefix: string) {
  let normalized: string;
  try { normalized = normalizeArticlePath(prefix); } catch { return null; }
  const start = `${normalized}/`;
  if (!base.startsWith(start)) return null;
  const slug = base.slice(start.length).replace(/\/+$/, "");
  return slug && !slug.includes("/") ? slug : null;
}

/**
 * Makes a translated document link to translated articles: each link to one of
 * the blog's articles in `from` points to its published translation in `to`
 * (at that language's article path), or loses its link when there is none.
 * Links that are not to the blog's articles are left as they are.
 */
export async function localizeArticleLinks<T>(blogId: string, content: T, from: string, to: string): Promise<T> {
  const hrefs = [...linkHrefsIn(content)];
  if (!hrefs.length || from === to) return content;

  const settings = await prisma.blogSeoSettings.findUnique({ where: { blogId }, select: { articleUrlPrefix: true, articlePaths: true } });
  const fromPrefix = articlePrefixFor(settings, from);
  const toPrefix = articlePrefixFor(settings, to);
  const links = hrefs.map((href) => {
    const { base, suffix } = splitHref(href);
    return { href, base, suffix, slug: slugUnder(base, fromPrefix) };
  });
  const slugs = [...new Set(links.flatMap((link) => (link.slug ? [link.slug] : [])))];
  const bases = [...new Set(links.map((link) => link.base))];

  const sources = await prisma.post.findMany({
    where: { blogId, language: from, OR: [{ slug: { in: slugs } }, { canonicalUrl: { in: bases } }] },
    select: { slug: true, canonicalUrl: true, translationGroupId: true },
  });
  if (!sources.length) return content;
  const groups = [...new Set(sources.flatMap((source) => (source.translationGroupId ? [source.translationGroupId] : [])))];
  const translations = groups.length
    ? await prisma.post.findMany({
        where: { blogId, language: to, status: "published", translationGroupId: { in: groups } },
        select: { slug: true, canonicalUrl: true, translationGroupId: true },
      })
    : [];
  const translationByGroup = new Map(translations.map((post) => [post.translationGroupId, post]));

  const replacements = new Map<string, string | null>();
  for (const link of links) {
    const source = sources.find((post) => (post.canonicalUrl && post.canonicalUrl === link.base) || (link.slug && post.slug === link.slug && !post.canonicalUrl));
    if (!source) continue;
    const translated = source.translationGroupId ? translationByGroup.get(source.translationGroupId) : undefined;
    replacements.set(link.href, translated ? `${articleHref(toPrefix, translated.slug, translated.canonicalUrl)}${link.suffix}` : null);
  }
  return rewriteContentLinks(content, replacements);
}
