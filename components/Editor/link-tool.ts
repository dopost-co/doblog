import type { InlineTool } from "@editorjs/editorjs";
import type { MenuConfig } from "@editorjs/editorjs/types/tools/menu-config";

export const EDIT_LINK_EVENT = "zenex:edit-link";

function elementAt(node: Node) {
  return node instanceof Element ? node : node.parentElement;
}

export function linkInRange(range: Range): HTMLAnchorElement | null {
  const start = elementAt(range.startContainer)?.closest<HTMLAnchorElement>("a[href]");
  const end = elementAt(range.endContainer)?.closest<HTMLAnchorElement>("a[href]");
  if (start && start === end) return start;
  // Selecting the whole element can put both endpoints in its parent.
  if (range.startContainer === range.endContainer && range.endOffset === range.startOffset + 1) {
    const child = range.startContainer.childNodes[range.startOffset];
    if (child instanceof HTMLAnchorElement) return child;
  }
  return null;
}

/** The toolbar and direct clicks share one link editor, including explicit removal. */
export class ModalLinkTool implements InlineTool {
  static isInline = true;
  static get sanitize() {
    return { a: { href: true, target: true, rel: true } };
  }

  render(): MenuConfig {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    return {
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l2-2"/></svg>',
      title: "Edit link",
      isActive: Boolean(range && linkInRange(range)),
      onActivate: () => {
        if (!range) return;
        elementAt(range.commonAncestorContainer)?.dispatchEvent(new CustomEvent(EDIT_LINK_EVENT, {
          bubbles: true, detail: range.cloneRange(),
        }));
      },
    };
  }
}
