import { describe, expect, it, vi } from "vitest";
import { COVER_TITLE_MAX_CHARS, storedCoverTitle } from "@/lib/autopilot/cover-title";
import { resolveCoverTitle } from "@/src/server/services/growth/cover-title";

const client = (parsed: unknown) =>
  ({ responses: { parse: vi.fn().mockResolvedValue({ output_parsed: parsed }) } }) as never;

describe("cover headline", () => {
  it("trims and bounds a stored headline", () => {
    expect(storedCoverTitle("  Content batching  ")).toBe("Content batching");
    expect(storedCoverTitle("")).toBeNull();
    expect(storedCoverTitle("   ")).toBeNull();
    expect(storedCoverTitle(null)).toBeNull();
    expect(storedCoverTitle("x".repeat(200))?.length).toBe(COVER_TITLE_MAX_CHARS);
  });

  it("draws the stored headline and never calls the model for it", async () => {
    const openai = client({ coverTitle: "Should not be used" });
    const result = await resolveCoverTitle(openai, { coverTitle: "Content batching", title: "The Complete Guide to Content Batching" });
    expect(result).toEqual({ title: "Content batching", written: null });
    expect((openai as { responses: { parse: ReturnType<typeof vi.fn> } }).responses.parse).not.toHaveBeenCalled();
  });

  it("writes one when the article has none, and reports it so the caller can store it", async () => {
    const result = await resolveCoverTitle(client({ coverTitle: "Batching de contenido" }), {
      coverTitle: null, title: "La Guía Completa de Batching de Contenido para Redes Sociales",
    });
    expect(result).toEqual({ title: "Batching de contenido", written: "Batching de contenido" });
  });

  it("falls back to the article title with no model available", async () => {
    // A plain brand card is generated without AI at all.
    const result = await resolveCoverTitle(null, { coverTitle: null, title: "Planning a content month" });
    expect(result).toEqual({ title: "Planning a content month", written: null });
  });

  it("never fails a cover when the model errors or answers with nothing", async () => {
    const broken = { responses: { parse: vi.fn().mockRejectedValue(new Error("rate limited")) } } as never;
    await expect(resolveCoverTitle(broken, { coverTitle: null, title: "Planning a content month" }))
      .resolves.toEqual({ title: "Planning a content month", written: null });

    await expect(resolveCoverTitle(client({}), { coverTitle: null, title: "Planning a content month" }))
      .resolves.toEqual({ title: "Planning a content month", written: null });
  });
});
