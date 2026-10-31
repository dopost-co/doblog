import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { assertCanonicalResource } from "@/lib/integrations/oauth";
import { GET as pathMetadata } from "@/app/.well-known/oauth-protected-resource/[...resource]/route";

afterEach(() => vi.unstubAllEnvs());

describe("MCP OAuth resource indicator", () => {
  it("defaults a missing resource and normalizes a trailing slash", () => {
    vi.stubEnv("MCP_OAUTH_ISSUER", "https://cms.test");
    expect(assertCanonicalResource(null)).toBe("https://cms.test/api/mcp");
    expect(assertCanonicalResource("")).toBe("https://cms.test/api/mcp");
    expect(assertCanonicalResource("https://cms.test/api/mcp/")).toBe("https://cms.test/api/mcp");
    expect(() => assertCanonicalResource("https://other.test/api/mcp")).toThrow(/resource must be/);
  });

  it("accepts a configured gateway resource with or without a trailing slash", () => {
    vi.stubEnv("MCP_OAUTH_ISSUER", "https://cms.test");
    vi.stubEnv("MCP_OAUTH_EXTRA_RESOURCES", "https://mcp.cms.test/mcp/");
    expect(assertCanonicalResource("https://mcp.cms.test/mcp")).toBe("https://mcp.cms.test/mcp");
  });

  it("serves RFC 9728 path-inserted metadata only for the MCP endpoints", async () => {
    vi.stubEnv("MCP_OAUTH_ISSUER", "https://cms.test");
    const lookup = (path: string[]) => pathMetadata(new Request("https://cms.test/x"), { params: Promise.resolve({ resource: path }) });
    const found = await lookup(["api", "mcp"]);
    expect(found.status).toBe(200);
    expect((await found.json()).resource).toBe("https://cms.test/api/mcp");
    expect((await lookup(["mcp"])).status).toBe(200);
    expect((await lookup(["admin"])).status).toBe(404);
  });
});
