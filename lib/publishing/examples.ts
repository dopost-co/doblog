/** Code shown in the publishing docs. */

export const WEBHOOK_HANDLER = `// app/api/zenex/route.ts
import { createHmac, timingSafeEqual } from "node:crypto";

export async function POST(request: Request) {
  const body = await request.text();
  const timestamp = request.headers.get("x-zenex-timestamp") ?? "";
  const signature = request.headers.get("x-zenex-signature") ?? "";
  const expected = \`v1=\${createHmac("sha256", process.env.ZENEX_SIGNING_KEY!)
    .update(\`\${timestamp}.\${body}\`).digest("hex")}\`;
  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 300;
  const valid = fresh && expected.length === signature.length
    && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  if (!valid) return Response.json({ error: "Invalid signature" }, { status: 401 });

  const delivery = JSON.parse(body);
  if (delivery.event === "post.upsert") {
    const { article } = delivery;
    // Store it however you like; article.id is the key, so retries are harmless.
    await db.article.upsert({
      where: { zenexId: article.id },
      create: { zenexId: article.id, slug: article.slug, language: article.language, title: article.title, html: article.html },
      update: { slug: article.slug, language: article.language, title: article.title, html: article.html },
    });
    return Response.json({ url: \`https://example.com/blog/\${article.slug}\` });
  }
  if (delivery.event === "post.delete") {
    await db.article.deleteMany({ where: { zenexId: delivery.article.id } });
  }
  return Response.json({ ok: true });
}`;

export const UPSERT_EXAMPLE = `{
  "version": 1,
  "event": "post.upsert",
  "remoteId": null,
  "article": {
    "id": "clx1234567890",
    "translationGroupId": "6f1c…",
    "language": "en",
    "slug": "how-to-plan-a-content-calendar",
    "title": "How to plan a content calendar",
    "excerpt": "A short summary.",
    "html": "<h2 class=\\"zenex-cms__header zenex-cms__h2\\">…</h2><p class=\\"zenex-cms__paragraph\\">…</p>",
    "publishedAt": "2026-10-05T09:00:00.000Z",
    "updatedAt": "2026-10-05T09:12:00.000Z",
    "featured": false,
    "coverImage": { "url": "https://media.zenex.dev/…/cover.webp", "alt": "How to plan a content calendar" },
    "author": { "name": "Ada Lovelace", "slug": "ada-lovelace" },
    "categories": [{ "name": "Guides", "slug": "guides" }],
    "tags": [{ "name": "Planning", "slug": "planning" }],
    "seo": {
      "title": "Plan a content calendar in 5 steps",
      "description": "…",
      "canonicalUrl": null,
      "ogTitle": null,
      "ogDescription": null,
      "ogImage": "https://media.zenex.dev/…/cover.webp",
      "keywords": "content calendar"
    },
    "translations": [{ "id": "clx0987654321", "language": "es", "slug": "como-planificar-un-calendario-de-contenidos" }],
    "images": ["https://media.zenex.dev/…/cover.webp", "https://media.zenex.dev/…/diagram.webp"]
  }
}`;

export const MARKDOWN_EXAMPLE = `---
title: "How to plan a content calendar"
description: "A short summary."
slug: "how-to-plan-a-content-calendar"
language: "en"
translationKey: "6f1c…"
date: "2026-10-05T09:00:00.000Z"
updated: "2026-10-05T09:12:00.000Z"
author: "Ada Lovelace"
cover: "/blog/3f9a1c2b7d4e5f60.webp"
categories:
  - "Guides"
tags:
  - "Planning"
featured: false
zenexId: "clx1234567890"
---

## Why plan ahead

Body in **Markdown**, with images copied to public/blog.`;

export const ASTRO_COLLECTION = `// src/content.config.ts
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    cover: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { blog };`;
