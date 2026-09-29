import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/integrations/errors";

const mocks = vi.hoisted(() => ({ create: vi.fn(), createTranslation: vi.fn() }));
vi.mock("openai", () => ({
  default: class { chat = { completions: { create: mocks.create } }; },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { TranslationService } from "@/src/server/services/translations/TranslationService";

const reply = (content: string) => ({ choices: [{ message: { content } }] });

describe("TranslationService", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test");
  });

  it("never lets the model rewrite link URLs", async () => {
    mocks.create.mockImplementation(async ({ messages }) => {
      const input: string = messages[1].content;
      expect(input).not.toContain("/es/blog/como-limpiar");
      // A model that "translates" everything, including the placeholder's surroundings.
      return reply(input.replace("<text>", "").replace("</text>", "").replace("guía", "guida"));
    });
    const out = await new TranslationService().translateText('Lee la <a href="/es/blog/como-limpiar">guía</a>', "it", "es");
    expect(out).toContain('href="/es/blog/como-limpiar"');
    expect(out).toContain("guida");
  });

  it("retries once when the model echoes the source text", async () => {
    mocks.create.mockResolvedValueOnce(reply("Cómo elegir una butaca")).mockResolvedValueOnce(reply("Come scegliere una poltrona"));
    expect(await new TranslationService().translateText("Cómo elegir una butaca", "it", "es")).toBe("Come scegliere una poltrona");
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it("translates table cells and nested list items, keeping their shape", async () => {
    mocks.create.mockImplementation(async ({ messages }) => reply(`IT:${messages[1].content.slice(6, -7)}`));
    const out = await new TranslationService().translatePostContent({ blocks: [
      { type: "table", data: { withHeadings: true, content: [["Uso", ""]] } },
      { type: "list", data: { style: "unordered", items: [{ content: "Uno", meta: {}, items: [{ content: "Dos", meta: {}, items: [] }] }] } },
    ] }, "it", "es");
    expect(out.blocks[0].data.content).toEqual([["IT:Uso", ""]]);
    expect(out.blocks[1].data.items[0]).toEqual({ content: "IT:Uno", meta: {}, items: [{ content: "IT:Dos", meta: {}, items: [] }] });
    expect(out.blocks[1].data.items[0]).not.toHaveProperty("text");
  });
});

