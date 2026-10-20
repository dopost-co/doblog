import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { API_SCOPES } from "@/lib/integrations/scopes";
import { ApiError } from "@/lib/integrations/errors";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/integrations/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/integrations/auth")>(),
  authenticateApiKey: async (request: Request) => {
    if (request.headers.get("authorization") !== "Bearer znx_at_valid") throw new ApiError(401, "Invalid or expired access token");
    return {
      blogId: "internal", publicBlogId: "public", keyId: "oauth:test", scopes: [...API_SCOPES],
      authorizedBlogs: [{ blogId: "internal", publicBlogId: "public", name: "Test" }],
    };
  },
}));
import { POST, GET, DELETE } from "@/app/api/mcp/route";

// Test the CMS route without pulling the separate gateway's dev dependencies
// into the CMS build or opening listening sockets in restricted environments.
const cmsFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  const handler = { POST, GET, DELETE }[request.method];
  if (!handler) throw new Error("Unexpected request method");
  return handler(request);
};

afterEach(() => vi.unstubAllEnvs());

describe("CMS MCP HTTP discovery", () => {
  it("uses the public OAuth issuer in challenges behind the TLS proxy", async () => {
    vi.stubEnv("MCP_OAUTH_ISSUER", "https://cms.test");
    for (const handler of [GET, POST]) {
      const response = await handler(new Request("http://0.0.0.0:3000/api/mcp", { method: handler === POST ? "POST" : "GET" }));
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain('resource_metadata="https://cms.test/.well-known/oauth-protected-resource"');
    }
  });

  it("challenges GET probes with expired credentials and rejects authenticated SSE with 405", async () => {
    for (const token of [undefined, "expired", "valid"]) {
      const response = await cmsFetch("https://cms.test/api/mcp", {
        headers: token ? { Authorization: `Bearer znx_at_${token}` } : {},
      });
      expect(response.status).toBe(token === "valid" ? 405 : 401);
      if (token === "valid") expect(response.headers.get("allow")).toBe("POST");
      else expect(response.headers.get("www-authenticate")).toContain("resource_metadata=");
    }
  });

  it("initializes, lists the OAuth tool catalog and calls a tool using the HTTP SDK client", async () => {
    const client = new Client({ name: "http-discovery-test", version: "1" });
    const transport = new StreamableHTTPClientTransport(new URL("https://cms.test/api/mcp"), {
      fetch: cmsFetch, requestInit: { headers: { Authorization: "Bearer znx_at_valid" } },
    });
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining([
        "list_blogs", "create_blog", "get_editor_guide", "create_posts", "seo_update_settings", "growth_configure_discovery",
      ]));
      // Unicode property escapes require JavaScript's `u` flag, which JSON
      // Schema cannot encode, and are rejected by Python's regex engine.
      expect(JSON.stringify(tools.map(tool => tool.inputSchema))).not.toMatch(/\\\\[pP]\{/);
      expect(tools.find(tool => tool.name === "update_blog")?.inputSchema.properties?.slug).toMatchObject({ type: "string" });
      const blogs = await client.callTool({ name: "list_blogs", arguments: {} });
      expect(blogs.structuredContent).toEqual({ data: [{ blogId: "public", name: "Test" }] });
    } finally { await client.close(); }
  });
});
