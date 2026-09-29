/**
 * Parse markdown content with frontmatter
 * 
 * Example markdown:
 * ---
 * title: "My Post"
 * publishedAt: 2025-01-21
 * ---
 * 
 * Post content here...
 */

export interface ParsedMarkdown {
  frontmatter: Record<string, string | boolean | number>;
  content: string;
}

export function parseMarkdownWithFrontmatter(markdown: string): ParsedMarkdown {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = markdown.match(frontmatterRegex);

  if (!match) {
    return {
      frontmatter: {},
      content: markdown,
    };
  }

  const [, frontmatterText, content] = match;
  const frontmatter: Record<string, string | boolean | number> = {};

  // Parse YAML-like frontmatter
  frontmatterText.split('\n').forEach((line) => {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return;

    const key = line.slice(0, colonIndex).trim();
    let value: string | boolean | number = line.slice(colonIndex + 1).trim();

    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Parse boolean
    if (value === 'true') {
      value = true;
    } else if (value === 'false') {
      value = false;
    }

    frontmatter[key] = value;
  });

  return {
    frontmatter,
    content: content.trim(),
  };
}

/**
 * Parse a markdown table to EditorJS table format
 */
function tableCells(row: string): string[] {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
}

function isTableSeparator(row: string): boolean {
  return tableCells(row).every(cell => /^:?-{3,}:?$/.test(cell));
}

function parseMarkdownTable(rows: string[]): { content: string[][]; withHeadings: boolean } | null {
  if (rows.length < 2) return null;

  const content: string[][] = [];
  const withHeadings = isTableSeparator(rows[1]);
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    // Skip separator row (contains ---, :-:, etc.)
    if (i === 1 && withHeadings) {
      continue;
    }

    // Parse cells
    const cells = tableCells(row);

    if (cells.length > 0) {
      content.push(cells);
    }
  }

  return content.length > 0 ? { content, withHeadings } : null;
}

type EditorBlock = { type: string; data: Record<string, unknown> };
type ListItem = { content: string; meta: Record<string, never>; items: ListItem[] };

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (character) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]!
));
const SAFE_URL = /^(https?:\/\/|mailto:|\/|#)/i;

/**
 * Converts inline Markdown (code, bold, italic, strikethrough, links) to the
 * HTML Editor.js stores. Text is escaped first, so raw HTML is never trusted.
 */
export function markdownInlineToHtml(markdown: string): string {
  const codes: string[] = [];
  let html = escapeHtml(markdown).replace(/`([^`\n]+)`/g, (_match, code: string) => {
    codes.push(`<code class="inline-code">${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  html = html
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (match, alt: string, url: string) => SAFE_URL.test(url) ? alt : match)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) => SAFE_URL.test(url) ? `<a href="${url}">${label}</a>` : match)
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "<b>$2</b>")
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?!\*)/g, "$1<i>$2</i>")
    .replace(/(^|[^\w])_(?=\S)([^_\n]+?)(?<=\S)_(?!\w)/g, "$1<i>$2</i>")
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "<s>$1</s>");
  return html.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => codes[Number(index)]);
}

const BLOCK_SYNTAX = /^\s{0,3}(#{1,6}\s|[-*+]\s+\S|\d+[.)]\s+\S|>\s?|```|\|.*\|\s*$|(-{3,}|\*{3,}|_{3,})\s*$|!\[)/m;
const INLINE_SYNTAX = /\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|~~[^~\n]+~~/;

/** Heuristic used by the editor to decide whether pasted text is Markdown. */
export function looksLikeMarkdown(text: string, options: { only?: "block" | "inline" } = {}) {
  if (options.only === "inline") return INLINE_SYNTAX.test(text);
  if (options.only === "block") return BLOCK_SYNTAX.test(text);
  return BLOCK_SYNTAX.test(text) || INLINE_SYNTAX.test(text);
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

function parseList(lines: string[], start: number): { block: EditorBlock; next: number } {
  const first = lines[start].match(LIST_ITEM)!;
  const ordered = /\d/.test(first[2]);
  const root: ListItem[] = [];
  const stack: { indent: number; items: ListItem[] }[] = [{ indent: first[1].length, items: root }];
  let i = start;
  for (; i < lines.length; i++) {
    const match = lines[i].match(LIST_ITEM);
    if (!match) {
      // Indented continuation lines belong to the previous item.
      const last = stack[stack.length - 1].items.at(-1);
      if (last && lines[i].trim() && /^\s{2,}/.test(lines[i])) {
        last.content += ` ${markdownInlineToHtml(lines[i].trim())}`;
        continue;
      }
      break;
    }
    const indent = match[1].length;
    // A top-level switch between bullets and numbers starts a new list.
    if (i > start && indent <= stack[0].indent && /\d/.test(match[2]) !== ordered) break;
    const item: ListItem = { content: markdownInlineToHtml(match[3].replace(/^\[[ xX]\]\s+/, "")), meta: {}, items: [] };
    while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop();
    const top = stack[stack.length - 1];
    if (indent > top.indent && top.items.length) {
      const parent = top.items[top.items.length - 1];
      parent.items.push(item);
      stack.push({ indent, items: parent.items });
    } else {
      top.items.push(item);
    }
  }
  return { block: { type: "list", data: { style: ordered ? "ordered" : "unordered", meta: {}, items: root } }, next: i };
}

/**
 * Converts Markdown to Editor.js blocks: headings, paragraphs, nested lists,
 * quotes, code fences, tables, images, separators and inline formatting.
 */
export function markdownToEditorJS(markdown: string): { time: number; blocks: EditorBlock[]; version: string } {
  const blocks: EditorBlock[] = [];
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", data: { text: paragraph.map(markdownInlineToHtml).join(" ") } });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushParagraph();
      const code: string[] = [];
      for (i += 1; i < lines.length && !lines[i].trim().startsWith("```"); i++) code.push(lines[i]);
      blocks.push({ type: "code", data: { code: code.join("\n") } });
      continue;
    }

    if (trimmed.startsWith("|") && trimmed.endsWith("|") && (isTableSeparator(lines[i + 1] ?? "") || paragraph.length === 0)) {
      flushParagraph();
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) rows.push(lines[i++]);
      i -= 1;
      const table = parseMarkdownTable(rows);
      if (table) {
        blocks.push({ type: "table", data: { ...table, content: table.content.map((row) => row.map(markdownInlineToHtml)) } });
      }
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      blocks.push({ type: "header", data: { text: markdownInlineToHtml(heading[2]), level: Math.min(heading[1].length, 4) } });
      continue;
    }

    if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line) && paragraph.length === 0) {
      blocks.push({ type: "delimiter", data: {} });
      continue;
    }

    const image = trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
    if (image && /^https?:\/\//i.test(image[2])) {
      flushParagraph();
      blocks.push({ type: "image", data: { file: { url: image[2] }, caption: escapeHtml(image[1]), withBorder: false, withBackground: false, stretched: false } });
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      flushParagraph();
      const quote: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) quote.push(lines[i++].replace(/^\s{0,3}>\s?/, ""));
      i -= 1;
      blocks.push({ type: "quote", data: { text: quote.map(markdownInlineToHtml).join("<br>"), caption: "", alignment: "left" } });
      continue;
    }

    if (LIST_ITEM.test(line)) {
      flushParagraph();
      const { block, next } = parseList(lines, i);
      blocks.push(block);
      i = next - 1;
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      continue;
    }
    paragraph.push(trimmed);
  }
  flushParagraph();

  return { time: Date.now(), blocks, version: "2.31.0" };
}
