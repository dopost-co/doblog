import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), clientKeys: [] as string[] }));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: mocks.create } };
    constructor(options: { apiKey: string }) { mocks.clientKeys.push(options.apiKey); }
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const access = (apiKey: string) => ({ apiKey, paidBy: "owner" as const });
import { TranslationService } from "@/src/server/services/translations/TranslationService";

const reply = (content: string) => ({ choices: [{ message: { content } }] });

describe("TranslationService", () => {
  it("uses the key it is given and refuses to run without one", async () => {
    new TranslationService(access("owner-key"), "blog-1");
    expect(mocks.clientKeys).toContain("owner-key");
    await expect(new TranslationService(null, "blog-1").translateText("Hola", "en", "es")).rejects.toThrow("OpenAI API key is required");
  });

  it("never lets the model rewrite link URLs", async () => {
    mocks.create.mockImplementation(async ({ messages }) => {
      const input: string = messages[1].content;
      expect(input).not.toContain("/es/blog/como-limpiar");
      // A model that "translates" everything, including the placeholder's surroundings.
      return reply(input.replace("<text>", "").replace("</text>", "").replace("guía", "guida"));
    });
    const out = await new TranslationService(access("test"), "blog-1").translateText('Lee la <a href="/es/blog/como-limpiar">guía</a>', "it", "es");
    expect(out).toContain('href="/es/blog/como-limpiar"');
    expect(out).toContain("guida");
  });

  it("retries once when the model echoes the source text", async () => {
    mocks.create.mockReset();
    mocks.create.mockResolvedValueOnce(reply("Cómo elegir una butaca")).mockResolvedValueOnce(reply("Come scegliere una poltrona"));
    expect(await new TranslationService(access("test"), "blog-1").translateText("Cómo elegir una butaca", "it", "es")).toBe("Come scegliere una poltrona");
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it("translates table cells and nested list items, keeping their shape", async () => {
    mocks.create.mockImplementation(async ({ messages }) => reply(`IT:${messages[1].content.slice(6, -7)}`));
    const out = await new TranslationService(access("test"), "blog-1").translatePostContent({ blocks: [
      { type: "table", data: { withHeadings: true, content: [["Uso", ""]] } },
      { type: "list", data: { style: "unordered", items: [{ content: "Uno", meta: {}, items: [{ content: "Dos", meta: {}, items: [] }] }] } },
    ] }, "it", "es");
    expect(out.blocks[0].data.content).toEqual([["IT:Uso", ""]]);
    expect(out.blocks[1].data.items[0]).toEqual({ content: "IT:Uno", meta: {}, items: [{ content: "IT:Dos", meta: {}, items: [] }] });
    expect(out.blocks[1].data.items[0]).not.toHaveProperty("text");
  });
});
