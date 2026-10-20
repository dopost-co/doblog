import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  contentPlanItem: { findUnique: vi.fn(), create: vi.fn() },
  postSeoTarget: { findUnique: vi.fn() },
  post: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/server/services/growth/planning", () => ({ schedulePendingDrafts: vi.fn() }));

import { addContentPlanItem, planItemInputSchema } from "@/src/server/services/growth/service";

describe("manual ideas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.contentPlanItem.findUnique.mockResolvedValue(null);
    db.postSeoTarget.findUnique.mockResolvedValue(null);
    db.post.findFirst.mockResolvedValue(null);
    db.contentPlanItem.create.mockResolvedValue({ id: "idea" });
  });

  it("keeps editorial direction separate from optional search terms", async () => {
    await addContentPlanItem("blog", {
      keyword: "Choosing a CRM", language: "en",
      notes: "Focus on freelancers. Avoid enterprise software.",
      keywords: ["client management", "affordable CRM", "client management"],
    });
    expect(db.contentPlanItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      primaryKeyword: "Choosing a CRM",
      notes: "Focus on freelancers. Avoid enterprise software.",
      secondaryKeywords: ["client management", "affordable CRM"],
    }) });
  });

  it("accepts a simple idea without a title or keywords", async () => {
    await addContentPlanItem("blog", { keyword: "Choosing a CRM", language: "en" });
    expect(db.contentPlanItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      title: null, notes: null, secondaryKeywords: [],
    }) });
  });

  it("rejects excessive keywords before writing", async () => {
    await expect(addContentPlanItem("blog", {
      keyword: "Choosing a CRM", language: "en", keywords: Array(13).fill("CRM"),
    })).rejects.toThrow();
    expect(db.contentPlanItem.create).not.toHaveBeenCalled();
    expect(planItemInputSchema.safeParse({ keyword: "Choosing a CRM", language: "en", keywords: ["x".repeat(101)] }).success).toBe(false);
  });
});
