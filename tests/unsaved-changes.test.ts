import { describe, expect, it } from "vitest";
import { inAppDestination, snapshot } from "@/lib/unsaved-changes";

const click = (overrides: Partial<Parameters<typeof inAppDestination>[0]> = {}) => ({
  button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, ...overrides,
});
const anchor = (href: string, attributes: Record<string, string> = {}) => ({
  href, target: attributes.target ?? "", hasAttribute: (name: string) => name in attributes,
});
const here = { origin: "https://app.test", pathname: "/dashboard/blogs/1/autopilot", search: "?view=settings" };

describe("Unsaved changes guard", () => {
  it("asks before in-app navigation, including tabs on the same page", () => {
    expect(inAppDestination(click(), anchor("https://app.test/dashboard/blogs/1"), here)).toBe("/dashboard/blogs/1");
    expect(inAppDestination(click(), anchor("/dashboard/blogs/1/autopilot?view=ideas"), here)).toBe("/dashboard/blogs/1/autopilot?view=ideas");
  });

  it("lets through links that do not leave the page or open elsewhere", () => {
    expect(inAppDestination(click(), anchor("/dashboard/blogs/1/autopilot?view=settings#logo"), here)).toBeNull();
    expect(inAppDestination(click(), anchor("https://docs.example.com"), here)).toBeNull();
    expect(inAppDestination(click(), anchor("/dashboard", { target: "_blank" }), here)).toBeNull();
    expect(inAppDestination(click(), anchor("/export.csv", { download: "" }), here)).toBeNull();
    expect(inAppDestination(click({ metaKey: true }), anchor("/dashboard"), here)).toBeNull();
    expect(inAppDestination(click({ ctrlKey: true }), anchor("/dashboard"), here)).toBeNull();
    expect(inAppDestination(click({ button: 1 }), anchor("/dashboard"), here)).toBeNull();
    expect(inAppDestination(click({ defaultPrevented: true }), anchor("/dashboard"), here)).toBeNull();
  });

  it("compares values, so changing something back is not a change", () => {
    const saved = snapshot({ name: "Zenex", days: [1, 3] });
    expect(snapshot({ name: "Zenex 2", days: [1, 3] })).not.toBe(saved);
    expect(snapshot({ name: "Zenex", days: [1, 3] })).toBe(saved);
  });
});
