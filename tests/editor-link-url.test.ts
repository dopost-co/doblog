import { describe, expect, it } from "vitest";
import { normalizeLinkUrl } from "@/components/Editor/link-url";

describe("editor link URLs", () => {
  it.each([
    [" example.com/article ", "https://example.com/article"],
    ["https://example.com/?q=hello%20world", "https://example.com/?q=hello%20world"],
    ["/articles/example", "/articles/example"],
    ["#details", "#details"],
    ["?page=2", "?page=2"],
    ["mailto:hello@example.com", "mailto:hello@example.com"],
    ["tel:+34123456789", "tel:+34123456789"],
  ])("accepts %s", (input, expected) => {
    expect(normalizeLinkUrl(input)).toBe(expected);
  });

  it.each(["", "javascript:alert(1)", "data:text/html,test", "file:///tmp/test", "https://", "mail\nto:test@example.com", "https://example.com/a b", "mailto:", "/\\example.com"]) ("rejects %s", (input) => {
    expect(normalizeLinkUrl(input)).toBeNull();
  });
});
