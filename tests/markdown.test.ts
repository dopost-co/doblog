import { describe, expect, it } from "vitest";
import { looksLikeMarkdown, markdownInlineToHtml, markdownToEditorJS } from "@/lib/markdown-parser";
import { convertBlocksToHtml } from "@/lib/editorjs-to-html";

describe("markdownInlineToHtml", () => {
  it("formats bold, italic, code, strikethrough and safe links", () => {
    expect(markdownInlineToHtml("**bold**, *italic*, _also_, `a*b*c`, ~~old~~ and [site](https://x.com)"))
      .toBe('<b>bold</b>, <i>italic</i>, <i>also</i>, <code class="inline-code">a*b*c</code>, <s>old</s> and <a href="https://x.com">site</a>');
  });
  it("escapes HTML and refuses unsafe link targets", () => {
    expect(markdownInlineToHtml('<script>x</script> [bad](javascript:alert(1))')).toBe("&lt;script&gt;x&lt;/script&gt; [bad](javascript:alert(1))");
  });
  it("leaves snake_case and lone asterisks alone", () => {
    expect(markdownInlineToHtml("snake_case_name costs 5 * 3")).toBe("snake_case_name costs 5 * 3");
  });
});

describe("markdownToEditorJS", () => {
  it("converts a typical pasted article into Editor.js blocks", () => {
    const { blocks } = markdownToEditorJS([
      "# Title", "", "Intro with **bold**", "continues here.", "",
      "## Section", "- one", "- two", "  - nested", "1. first", "2. second", "",
      "> quoted", "> line", "", "---", "", "```", "const a = 1;", "```", "",
      "![Alt text](https://img.example/a.png)", "", "#### Deep", "##### Deeper",
    ].join("\n"));
    expect(blocks.map((b) => b.type)).toEqual(["header", "paragraph", "header", "list", "list", "quote", "delimiter", "code", "image", "header", "header"]);
    expect(blocks[1].data.text).toBe("Intro with <b>bold</b> continues here.");
    expect(blocks[3].data).toEqual({ style: "unordered", meta: {}, items: [
      { content: "one", meta: {}, items: [] },
      { content: "two", meta: {}, items: [{ content: "nested", meta: {}, items: [] }] },
    ] });
    expect(blocks[4].data.style).toBe("ordered");
    expect(blocks[5].data.text).toBe("quoted<br>line");
    expect(blocks[7].data.code).toBe("const a = 1;");
    expect(blocks[8].data).toMatchObject({ file: { url: "https://img.example/a.png" }, caption: "Alt text" });
    expect(blocks[10].data.level).toBe(4);
  });
  it("renders converted Markdown as clean public HTML", () => {
    const html = convertBlocksToHtml(markdownToEditorJS("## Hi\n\n- **a**\n- [b](/es/blog/x)"));
    expect(html).toContain('<h2 class="zenex-cms__header zenex-cms__h2">Hi</h2>');
    expect(html).toContain("<b>a</b>");
    expect(html).toContain('<a href="/es/blog/x" rel="noopener noreferrer">b</a>');
  });
});

describe("looksLikeMarkdown", () => {
  it("detects block and inline syntax but not plain prose", () => {
    expect(looksLikeMarkdown("## Title\ntext")).toBe(true);
    expect(looksLikeMarkdown("- item\n- item")).toBe(true);
    expect(looksLikeMarkdown("some **bold** text", { only: "inline" })).toBe(true);
    expect(looksLikeMarkdown("some **bold** text", { only: "block" })).toBe(false);
    expect(looksLikeMarkdown("Just a normal sentence.\nAnd another one.")).toBe(false);
  });
});

describe("public rendering of legacy Markdown", () => {
  it("formats literal inline Markdown left in older content and drops caret anchors", () => {
    const html = convertBlocksToHtml([{ type: "paragraph", data: { text: "Use **this** and `code` or [docs](https://x.com)​" } }]);
    expect(html).toContain("<strong>this</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('href="https://x.com"');
    expect(html).not.toContain("​");
  });

  it("turns bare absolute URLs into links without nesting existing anchors", () => {
    const html = convertBlocksToHtml([{ type: "paragraph", data: {
      text: 'Descarga:&nbsp;https://example.com/app.<br><a href="https://example.com/help">https://example.com/help</a>',
    } }]);

    expect(html).toContain('Descarga:\u00A0<a href="https://example.com/app" rel="noopener noreferrer">https://example.com/app</a>.');
    expect(html.match(/href="https:\/\/example\.com\/help"/g)).toHaveLength(1);
  });
});
