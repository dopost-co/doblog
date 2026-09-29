import type EditorJS from "@editorjs/editorjs";
import { looksLikeMarkdown, markdownInlineToHtml, markdownToEditorJS } from "@/lib/markdown-parser";

/** Block-level shortcuts typed at the start of an empty paragraph, applied when followed by a space. */
const SPACE_SHORTCUTS: Record<string, { type: string; data: Record<string, unknown> }> = {
  "#": { type: "header", data: { text: "", level: 1 } },
  "##": { type: "header", data: { text: "", level: 2 } },
  "###": { type: "header", data: { text: "", level: 3 } },
  "####": { type: "header", data: { text: "", level: 4 } },
  "-": { type: "list", data: { style: "unordered", meta: {}, items: [{ content: "", meta: {}, items: [] }] } },
  "*": { type: "list", data: { style: "unordered", meta: {}, items: [{ content: "", meta: {}, items: [] }] } },
  "1.": { type: "list", data: { style: "ordered", meta: {}, items: [{ content: "", meta: {}, items: [] }] } },
  ">": { type: "quote", data: { text: "", caption: "", alignment: "left" } },
  "```": { type: "code", data: { code: "" } },
};

/**
 * Inline patterns converted as soon as they are closed while typing. Group 1 is
 * text kept as typed before the mark (only italic needs it), group 2 the content.
 */
const INLINE_PATTERNS: { pattern: RegExp; build: (match: RegExpMatchArray) => HTMLElement }[] = [
  { pattern: /()\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, build: (m) => element("b", m[2]) },
  { pattern: /(^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*$/, build: (m) => element("i", m[2]) },
  { pattern: /()`([^`]+)`$/, build: (m) => element("code", m[2], "inline-code") },
  { pattern: /()\[([^\]]+)\]\(((?:https?:\/\/|mailto:|\/|#)[^)\s]+)\)$/, build: (m) => {
    const link = element("a", m[2]);
    link.setAttribute("href", m[3]);
    return link;
  } },
];

/** Placeholder that moves the caret out of a freshly formatted element; removed on the next keystroke. */
const CARET_ANCHOR = "\u200B";

function element(tag: string, text: string, className?: string) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function currentBlock(editor: EditorJS) {
  const index = editor.blocks.getCurrentBlockIndex();
  return index >= 0 ? { index, block: editor.blocks.getBlockByIndex(index) } : null;
}

/**
 * Lets writers use Markdown in the editor: pasted Markdown becomes real blocks,
 * block shortcuts (## , - , > , ```) convert the current paragraph, and inline
 * marks (**bold**, *italic*, `code`, [link](url)) are formatted when closed.
 * Returns a cleanup function.
 */
export function attachMarkdownSupport(editor: EditorJS, holder: HTMLElement) {
  async function onPaste(event: ClipboardEvent) {
    const plain = event.clipboardData?.getData("text/plain") ?? "";
    const html = event.clipboardData?.getData("text/html") ?? "";
    if (!plain.trim()) return;
    // Rich HTML from web pages already carries its structure; Editor.js handles it.
    if (/<(h[1-6]|ul|ol|table|blockquote|strong|b|em)\b/i.test(html)) return;

    const current = currentBlock(editor);
    if (current?.block?.name === "code") return;
    const singleLine = !plain.includes("\n");

    if (!looksLikeMarkdown(plain)) return;
    if (singleLine && !looksLikeMarkdown(plain, { only: "block" })) {
      event.preventDefault();
      event.stopImmediatePropagation();
      document.execCommand("insertHTML", false, markdownInlineToHtml(plain));
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    const { blocks } = markdownToEditorJS(plain);
    if (!blocks.length) return;

    let index = current ? current.index + 1 : editor.blocks.getBlocksCount();
    if (current?.block?.isEmpty) {
      editor.blocks.delete(current.index);
      index = current.index;
    }
    blocks.forEach((block, offset) => editor.blocks.insert(block.type, block.data, undefined, index + offset, false));
    editor.caret.setToBlock(index + blocks.length - 1, "end");
  }

  /** Converts the current paragraph when it only contains a block trigger followed by a space. */
  function applyBlockShortcut() {
    const current = currentBlock(editor);
    if (!current?.block || current.block.name !== "paragraph") return false;
    const raw = (current.block.holder.textContent ?? "").replace(/\u00A0/g, " ");
    const match = raw.match(/^(\S+) $/);
    const shortcut = match && SPACE_SHORTCUTS[match[1]];
    if (!shortcut) return false;
    editor.blocks.insert(shortcut.type, structuredClone(shortcut.data), undefined, current.index, true, true);
    editor.caret.setToBlock(current.index, "start");
    return true;
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Enter" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const current = currentBlock(editor);
    if (!current?.block || current.block.name !== "paragraph") return;
    const text = current.block.holder.textContent?.trim() ?? "";
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(text)) {
      event.preventDefault();
      event.stopPropagation();
      editor.blocks.insert("delimiter", {}, undefined, current.index, false, true);
      editor.blocks.insert("paragraph", { text: "" }, undefined, current.index + 1, true);
      editor.caret.setToBlock(current.index + 1, "start");
    }
  }

  function onInput(event: Event) {
    const target = event.target as HTMLElement | null;
    if (!target?.isContentEditable) return;
    if (applyBlockShortcut()) return;
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    if (!selection || !selection.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE) return;
    // Never format inside existing code or links.
    if (node.parentElement?.closest("code, a, pre")) return;

    let offset = selection.anchorOffset;
    const value = node.textContent ?? "";
    if (value.includes(CARET_ANCHOR) && value.length > 1) {
      const removedBefore = value.slice(0, offset).split(CARET_ANCHOR).length - 1;
      node.textContent = value.replaceAll(CARET_ANCHOR, "");
      offset -= removedBefore;
      selection.collapse(node, offset);
    }

    const before = (node.textContent ?? "").slice(0, offset);
    for (const { pattern, build } of INLINE_PATTERNS) {
      const match = before.match(pattern);
      if (!match || match.index === undefined) continue;
      const range = document.createRange();
      range.setStart(node, match.index + match[1].length);
      range.setEnd(node, offset);
      range.deleteContents();
      const replacement = build(match);
      range.insertNode(replacement);
      const anchor = document.createTextNode(CARET_ANCHOR);
      replacement.after(anchor);
      selection.collapse(anchor, 1);
      return;
    }
  }

  holder.addEventListener("paste", onPaste, true);
  holder.addEventListener("keydown", onKeyDown, true);
  holder.addEventListener("input", onInput);
  return () => {
    holder.removeEventListener("paste", onPaste, true);
    holder.removeEventListener("keydown", onKeyDown, true);
    holder.removeEventListener("input", onInput);
  };
}
