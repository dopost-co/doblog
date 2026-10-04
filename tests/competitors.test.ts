import { describe, expect, it } from "vitest";
import { competitorDomain, competitorDomainsSchema, MAX_COMPETITORS } from "@/lib/autopilot/competitors";
import { competitorSites } from "@/src/server/services/growth/discovery";

describe("Competitor domains", () => {
  it("reduces what people paste to the bare domain", () => {
    expect(competitorDomain("https://www.Rival.com/blog?x=1")).toBe("rival.com");
    expect(competitorDomain("rival.co.uk/")).toBe("rival.co.uk");
    expect(competitorDomain("not a site")).toBeNull();
    expect(competitorDomain("192.168.1.1")).toBeNull();
  });

  it(`accepts up to ${MAX_COMPETITORS}, dropping blanks and repeats`, () => {
    expect(competitorDomainsSchema.parse(["rival.com", " ", "https://www.rival.com", "other.io"])).toEqual(["rival.com", "other.io"]);
    expect(competitorDomainsSchema.safeParse(["a-site.com", "b-site.com", "c-site.com"]).error?.issues[0].message).toBe(`Add up to ${MAX_COMPETITORS} competitors`);
    expect(competitorDomainsSchema.safeParse(["nope"]).success).toBe(false);
  });

  it("studies only the first ones of older settings, cleaned up", () => {
    expect(competitorSites(["https://www.one.com/blog", "one.com", "two.com", "three.com"])).toEqual(["one.com", "two.com"]);
  });
});
