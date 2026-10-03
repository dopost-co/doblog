import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
import { createMcpServer } from "@/lib/integrations/mcp";
import { editorGuide } from "@/lib/integrations/editor-guide";
import { operationSchemas } from "@/src/server/services/content/service";
import { convertBlocksToHtml } from "@/lib/editorjs-to-html";
import type { ApiScope } from "@/lib/integrations/scopes";

describe("MCP rich content", () => {
  it.each(editorGuide.blocks)("accepts the documented $type block for create and update and renders it", ({ example }) => {
    const content = { blocks: [example] };
    const created = operationSchemas.create_posts.parse({ title: "Rich draft", slug: "rich-draft", content });
    const updated = operationSchemas.update_posts.parse({ id: "post", content });
    expect(created).toMatchObject({ content, status: "draft" });
    expect(updated).toEqual({ id: "post", content });
    expect(convertBlocksToHtml(content)).not.toBe("");
  });

  it.each<ApiScope[]>([["content:read"], ["content:write"], ["content:read", "content:write"]])("discovers and reads the guide over the MCP protocol with scopes %j", async (...scopes) => {
    const server = createMcpServer({ blogId: "blog", publicBlogId: "public", keyId: "test", scopes });
    const client = new Client({ name: "editor-guide-test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const { tools } = await client.listTools();
      expect(tools.find(tool => tool.name === "get_editor_guide")?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      for (const name of ["seo_get_settings", "seo_get_usage", "seo_discover_opportunities", "seo_analyze_intent", "seo_build_brief"]) {
        expect(tools.some(tool => tool.name === name)).toBe(true);
      }
      const result = await client.callTool({ name: "get_editor_guide", arguments: {} });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual(editorGuide);
      if (scopes.includes("content:write")) {
        for (const name of ["create_posts", "update_posts"]) {
          const contentSchema = tools.find(tool => tool.name === name)?.inputSchema.properties?.content;
          expect(contentSchema).toMatchObject({ description: expect.stringContaining("get_editor_guide") });
          expect(contentSchema).toMatchObject({ description: expect.stringContaining("replaces ALL blocks") });
        }
      } else {
        expect(tools.some(tool => tool.name === "create_posts")).toBe(false);
        expect((await client.callTool({ name: "create_posts", arguments: {} })).isError).toBe(true);
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("exposes all OAuth blogs and requires an authorized blogId for content tools", async () => {
    const server = createMcpServer({
      blogId: "internal-one",
      publicBlogId: "public-one",
      keyId: "oauth:test",
      scopes: ["content:read"],
      authorizedBlogs: [
        { blogId: "internal-one", publicBlogId: "public-one", name: "One", slug: "one" },
        { blogId: "internal-two", publicBlogId: "public-two", name: "Two", slug: "two" },
      ],
    });
    const client = new Client({ name: "multi-blog-test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const { tools } = await client.listTools();
      expect(tools.find((tool) => tool.name === "get_blog")?.inputSchema.required).toContain("blogId");
      expect(tools.find((tool) => tool.name === "seo_build_brief")?.inputSchema.required).toContain("blogId");
      const blogs = await client.callTool({ name: "list_blogs", arguments: {} });
      expect(blogs.structuredContent).toEqual({
        data: [
          { blogId: "public-one", name: "One", slug: "one" },
          { blogId: "public-two", name: "Two", slug: "two" },
        ],
      });
      const denied = await client.callTool({ name: "get_blog", arguments: { blogId: "not-authorized" } });
      expect(denied.isError).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("advertises ChatGPT file parameters only with media permission", async () => {
    const server = createMcpServer({ blogId: "blog", publicBlogId: "public", keyId: "test", scopes: ["media:write"] });
    const client = new Client({ name: "image-file-test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport); await client.connect(clientTransport);
      const tool = (await client.listTools()).tools.find(item => item.name === "upload_image_file");
      expect(tool?._meta).toMatchObject({ "openai/fileParams": ["image"] });
      expect(tool?.inputSchema.required).toContain("image");
    } finally { await client.close(); await server.close(); }
  });

  it("exposes editable brand and image guidance only with seo:write", async () => {
    const server = createMcpServer({ blogId: "blog", publicBlogId: "public", keyId: "test", scopes: ["seo:write"] });
    const client = new Client({ name: "seo-settings-test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport); await client.connect(clientTransport);
      const tool = (await client.listTools()).tools.find(item => item.name === "seo_update_settings");
      expect(tool?.inputSchema.properties).toHaveProperty("maxInlineImages");
      expect(tool?.inputSchema.properties).toHaveProperty("thumbnailStyle");
      expect(tool?.inputSchema.properties).toHaveProperty("inlineImageStyle");
      expect(tool?.inputSchema.properties).not.toHaveProperty("monthlyBudgetUsd");
      expect(tool?.inputSchema.properties).not.toHaveProperty("credentialId");
    } finally { await client.close(); await server.close(); }
  });

  it("does not let a non-admin OAuth member trigger paid SEO calls", async () => {
    const server = createMcpServer({
      blogId: "blog", publicBlogId: "public", keyId: "oauth:test", scopes: ["content:read"], canUsePaidSeo: false,
      authorizedBlogs: [{ blogId: "blog", publicBlogId: "public", name: "Shared", canUsePaidSeo: false }],
    });
    const client = new Client({ name: "member-seo-test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport); await client.connect(clientTransport);
      const result = await client.callTool({ name: "seo_get_usage", arguments: {} });
      expect(result.isError).toBe(true);
      expect(result.content).toEqual(expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining("Only blog admins") })]));
    } finally { await client.close(); await server.close(); }
  });
});
