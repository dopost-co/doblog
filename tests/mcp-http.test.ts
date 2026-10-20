import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createProxyApp } from "../mcp-server/src/transport/proxy";
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

// Exercise Express and the real CMS route without opening a listening socket.
// This also runs in restricted environments that prohibit binding ports.
function gatewayFetch(): typeof fetch {
  const app = createProxyApp({
    host: "127.0.0.1", port: 0, cmsUrl: "https://cms.test", requestTimeoutMs: 1000,
    allowedOrigins: new Set(),
  }, { info() {}, error() {} });
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const handler = { POST, GET, DELETE }[request.method];
    if (new URL(request.url).origin !== "https://cms.test" || !handler) throw new Error("Unexpected upstream request");
    return handler(request);
  });
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const body = Buffer.from(await request.arrayBuffer());
    return new Promise<Response>((resolve, reject) => {
      const req = new IncomingMessage(new Socket());
      req.method = request.method;
      req.url = new URL(request.url).pathname;
      req.headers = Object.fromEntries(request.headers);
      req.headers.host = new URL(request.url).host;
      req.headers["x-forwarded-proto"] = new URL(request.url).protocol.slice(0, -1);
      if (body.length) req.headers["content-length"] = String(body.length);
      const res = new ServerResponse(req);
      res.end = ((chunk?: string | Buffer) => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(res.getHeaders())) {
          if (value !== undefined) headers.set(key, String(value));
        }
        const empty = [204, 205, 304].includes(res.statusCode);
        const responseBody = typeof chunk === "string" ? chunk : chunk ? new Uint8Array(chunk) : null;
        resolve(new Response(empty ? null : responseBody, { status: res.statusCode, headers }));
        res.emit("finish");
        return res;
      }) as typeof res.end;
      app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1], reject);
      req.push(body.length ? body : null);
      if (body.length) req.push(null);
    });
  }) as typeof fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("MCP HTTP discovery through the gateway", () => {
  it("challenges GET probes with absent or expired credentials, but rejects authenticated SSE with 405", async () => {
    const fetchGateway = gatewayFetch();
    for (const path of ["/", "/mcp"]) {
      for (const token of [undefined, "expired", "valid"]) {
        const response = await fetchGateway(`https://gateway.test${path}`, {
          headers: token ? { Authorization: `Bearer znx_at_${token}` } : {},
        });
        expect(response.status).toBe(token === "valid" ? 405 : 401);
        if (token === "valid") expect(response.headers.get("allow")).toBe("POST");
        else expect(response.headers.get("www-authenticate")).toContain("https://gateway.test/.well-known/oauth-protected-resource/mcp");
      }
    }
  });

  it("advertises every supported scope", async () => {
    const response = await gatewayFetch()("https://gateway.test/.well-known/oauth-protected-resource/mcp");
    expect((await response.json()).scopes_supported).toEqual([...API_SCOPES]);
  });

  it("initializes, lists the complete OAuth tool catalog and calls a tool using the HTTP SDK client", async () => {
    const client = new Client({ name: "http-discovery-test", version: "1" });
    const transport = new StreamableHTTPClientTransport(new URL("https://gateway.test/mcp"), {
      fetch: gatewayFetch(), requestInit: { headers: { Authorization: "Bearer znx_at_valid" } },
    });
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining([
        "list_blogs", "create_blog", "get_editor_guide", "create_posts", "seo_update_settings", "growth_configure_discovery",
      ]));
      const blogs = await client.callTool({ name: "list_blogs", arguments: {} });
      expect(blogs.structuredContent).toEqual({ data: [{ blogId: "public", name: "Test" }] });
    } finally { await client.close(); }
  });
});
