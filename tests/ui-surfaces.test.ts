import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const SKIP = ["components/ui", "components/Docs", "app/docs"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (SKIP.some((skip) => relative(ROOT, path).startsWith(skip))) return [];
    if (statSync(path).isDirectory()) return files(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

/**
 * Bordered cards and panels must paint their own background. Without one they
 * show whatever is behind them, which looks broken in light or dark mode.
 * Dashed empty states are intentionally transparent.
 */
describe("UI surfaces", () => {
  it("gives every bordered container an opaque background", () => {
    const offenders: string[] = [];
    for (const file of [...files(join(ROOT, "app")), ...files(join(ROOT, "components"))]) {
      for (const [, classes] of readFileSync(file, "utf8").matchAll(/["'`]([^"'`\n]*\brounded-(?:lg|xl|2xl)\b[^"'`\n]*)["'`]/g)) {
        const tokens = classes.split(/\s+/);
        const bordered = tokens.includes("border");
        const hasBackground = tokens.some((token) => /^bg-/.test(token));
        if (bordered && !hasBackground && !tokens.includes("border-dashed")) {
          offenders.push(`${relative(ROOT, file)}: ${classes}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
