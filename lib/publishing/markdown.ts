import type { ZenexArticle } from "@/lib/publishing/protocol";

/**
 * Editor.js content as Markdown with YAML front matter, for sites that keep
 * articles as files (the GitHub destination). Inline formatting Markdown has
 * no syntax for stays as HTML, which every Markdown renderer accepts.
 */

type Data = Record<string, unknown>;
const record = (value: unknown): Data => value && typeof value === "object" ? value as Data : {};
const text = (value: unknown) => typeof value === "string" ? value.replace(/​/g, "") : "";

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'" };

/** Editor.js inline HTML to Markdown. */
export function inlineMarkdown(value: unknown) {
  return text(value)
    .replace(/<br\s*\/?>/gi, "  \n")
    .replace(/<(b|strong)>([\s\S]*?)<\/\1>/gi, (_, _tag, inner) => inner.trim() ? `**${inner}**` : inner)
    .replace(/<(i|em)>([\s\S]*?)<\/\1>/gi, (_, _tag, inner) => inner.trim() ? `*${inner}*` : inner)
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, inner) => `\`${inner}\``)
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => `[${label}](${href.replace(/\)/g, "%29")})`)
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity);
}

function listMarkdown(items: unknown, ordered: boolean, depth = 0): string[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item, index) => {
    const data = record(item);
    const content = inlineMarkdown(typeof item === "string" ? item : text(data.content) || text(data.text));
    const marker = ordered ? `${index + 1}.` : "-";
    return [`${"  ".repeat(depth)}${marker} ${content}`, ...listMarkdown(data.items, ordered, depth + 1)];
  });
}

const cell = (value: unknown) => inlineMarkdown(value).replace(/\|/g, "\\|").replace(/\n/g, " ");

/** `image` maps an image URL to the one the site serves (e.g. a copy in the repository). */
export function blocksToMarkdown(content: unknown, image: (url: string) => string = (url) => url) {
  const blocks = Array.isArray(content) ? content : record(content).blocks;
  if (!Array.isArray(blocks)) return "";
  return blocks.map((value) => {
    const block = record(value);
    const data = record(block.data);
    switch (block.type) {
      case "header": {
        const level = [2, 3, 4, 5, 6].includes(Number(data.level)) ? Number(data.level) : 2;
        return `${"#".repeat(level)} ${inlineMarkdown(data.text)}`;
      }
      case "paragraph": return inlineMarkdown(data.text);
      case "list": return listMarkdown(data.items, data.style === "ordered").join("\n");
      case "quote": {
        const lines = inlineMarkdown(data.text).split("\n").map((line) => `> ${line}`);
        return data.caption ? [...lines, ">", `> — ${inlineMarkdown(data.caption)}`].join("\n") : lines.join("\n");
      }
      case "code": {
        const code = text(data.code);
        const fence = code.includes("```") ? "````" : "```";
        return `${fence}\n${code}\n${fence}`;
      }
      case "image": {
        const url = text(record(data.file).url) || text(data.url);
        if (!url) return "";
        const caption = inlineMarkdown(data.caption);
        const alt = (text(data.caption) || text(data.alt)).replace(/<[^>]+>/g, "").replace(/[[\]]/g, "");
        return `![${alt}](${image(url)})${caption ? `\n*${caption}*` : ""}`;
      }
      case "table": {
        const rows = Array.isArray(data.content) ? data.content.filter(Array.isArray) as unknown[][] : [];
        if (!rows.length) return "";
        const width = Math.max(...rows.map((row) => row.length));
        const line = (row: unknown[]) => `| ${Array.from({ length: width }, (_, i) => cell(row[i])).join(" | ")} |`;
        const [head, ...body] = data.withHeadings === true ? rows : [Array(width).fill(""), ...rows];
        return [line(head), `| ${Array(width).fill("---").join(" | ")} |`, ...body.map(line)].join("\n");
      }
      case "delimiter": return "---";
      case "raw": return text(data.html);
      case "linkTool": {
        const meta = record(data.meta);
        const link = text(data.link);
        return link ? `[${text(meta.title) || text(data.title) || link}](${link})` : "";
      }
      case "embed": {
        const source = text(data.source) || text(data.embed);
        return source ? `[${text(data.caption) || source}](${source})` : "";
      }
      default: return "";
    }
  }).filter(Boolean).join("\n\n");
}

/** A YAML scalar: JSON strings are valid double-quoted YAML. */
const yaml = (value: unknown) => JSON.stringify(value);

export function frontMatter(article: ZenexArticle, image: (url: string) => string = (url) => url) {
  const fields: Array<[string, unknown]> = [
    ["title", article.title],
    ["description", article.seo.description ?? article.excerpt],
    ["excerpt", article.excerpt],
    ["slug", article.slug],
    ["language", article.language],
    ["translationKey", article.translationGroupId],
    ["date", article.publishedAt],
    ["updated", article.updatedAt],
    ["author", article.author?.name],
    ["cover", article.coverImage ? image(article.coverImage.url) : null],
    ["coverAlt", article.coverImage?.alt],
    ["categories", article.categories.map((category) => category.name)],
    ["tags", article.tags.map((tag) => tag.name)],
    ["featured", article.featured],
    ["metaTitle", article.seo.title],
    ["canonicalUrl", article.seo.canonicalUrl],
    ["ogImage", article.seo.ogImage ? image(article.seo.ogImage) : null],
    ["keywords", article.seo.keywords],
    ["zenexId", article.id],
  ];
  const lines = fields
    .filter(([, value]) => value !== null && value !== undefined && value !== "" && !(Array.isArray(value) && !value.length))
    .map(([key, value]) => Array.isArray(value)
      ? `${key}:\n${value.map((item) => `  - ${yaml(item)}`).join("\n")}`
      : `${key}: ${typeof value === "string" ? yaml(value) : String(value)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}
