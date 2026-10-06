import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const state = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/lib/prisma", () => ({ get prisma() { return state.db; } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

process.env.INTEGRATION_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");

import { encryptSecret } from "@/lib/crypto/secrets";
import { verifySignature } from "@/lib/publishing/protocol";
import { syncDestination, syncDueDestinations } from "@/src/server/services/publishing/sync";

type Delivery = { event: string; article: { id: string; title?: string; translations?: Array<{ id: string }> } };

const connection = process.env.ZENEX_TEST_DATABASE_URL;
describe.runIf(!!connection)("copying articles to a website (PostgreSQL + a webhook)", () => {
  const key = "zx_test_signing_key";
  let server: Server;
  let endpoint: string;
  let deliveries: Delivery[] = [];
  /** What the fake site answers next: a status, or a function of the delivery. */
  let answer: (delivery: Delivery) => number = () => 200;
  let blog: { id: string };
  let destinationId: string;

  beforeAll(async () => {
    const url = new URL(connection!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/zenex_integration_test") throw new Error("Tests require the dedicated local zenex_integration_test database");
    state.db = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: connection, max: 5 })) });
    server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        const signed = verifySignature(key, String(request.headers["x-zenex-timestamp"] ?? ""), String(request.headers["x-zenex-signature"] ?? ""), body);
        if (!signed) { response.writeHead(401).end("bad signature"); return; }
        const delivery = JSON.parse(body) as Delivery;
        const status = answer(delivery);
        if (status === 200) deliveries.push(delivery);
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(status === 200 && delivery.event === "post.upsert" ? { url: `https://site.test/blog/${delivery.article.id}` } : { ok: status === 200 }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    endpoint = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/zenex`;
  });

  beforeEach(async () => {
    await state.db.user.deleteMany({ where: { email: { endsWith: "@zenex-publishing.test" } } });
    deliveries = [];
    answer = () => 200;
    const owner = await state.db.user.create({ data: { email: "owner@zenex-publishing.test", name: "Owner" } });
    blog = await state.db.blog.create({ data: { userId: owner.id, name: "Copies", slug: "copies", languages: ["en", "es"] }, select: { id: true } });
    const destination = await state.db.publishDestination.create({
      data: { blogId: blog.id, platform: "other", method: "webhook", siteUrl: "https://site.test", status: "connected", secret: encryptSecret(key), config: { endpoint } },
    });
    destinationId = destination.id;
  });

  afterAll(async () => {
    server?.close();
    if (state.db) {
      await state.db.user.deleteMany({ where: { email: { endsWith: "@zenex-publishing.test" } } });
      await state.db.$disconnect();
    }
  });

  const createPost = (data: { title: string; slug: string; status: string; language?: string; translationGroupId?: string }) =>
    state.db.post.create({ data: { blogId: blog.id, content: { blocks: [{ type: "paragraph", data: { text: data.title } }] }, publishedAt: new Date(Date.now() - 60_000), language: "en", ...data } });
  const publications = () => state.db.postPublication.findMany({ where: { destinationId }, orderBy: { language: "asc" } });

  it("sends published articles once, resends changes and removes unpublished and deleted ones", async () => {
    const english = await createPost({ title: "Hello", slug: "hello", status: "published", translationGroupId: "g1" });
    const spanish = await createPost({ title: "Hola", slug: "hola", status: "published", language: "es", translationGroupId: "g1" });
    await createPost({ title: "Draft", slug: "draft", status: "draft" });

    const first = await syncDestination(destinationId);
    expect(first).toMatchObject({ sent: 2, failed: 0, remaining: false });
    expect(deliveries.map((delivery) => delivery.event)).toEqual(["post.upsert", "post.upsert"]);
    expect(deliveries.find((delivery) => delivery.article.id === english.id)?.article.translations?.map((item) => item.id)).toEqual([spanish.id]);
    expect((await publications()).map((row) => [row.state, row.remoteUrl])).toEqual([
      ["synced", `https://site.test/blog/${english.id}`],
      ["synced", `https://site.test/blog/${spanish.id}`],
    ]);

    deliveries = [];
    expect(await syncDestination(destinationId)).toMatchObject({ sent: 0 });
    expect(await syncDestination(destinationId, { full: true })).toMatchObject({ sent: 0 });
    expect(deliveries).toEqual([]);

    await state.db.post.update({ where: { id: english.id }, data: { title: "Hello again" } });
    expect(await syncDestination(destinationId)).toMatchObject({ sent: 1 });
    expect(deliveries[0].article.title).toBe("Hello again");

    deliveries = [];
    await state.db.post.update({ where: { id: spanish.id }, data: { status: "draft" } });
    expect(await syncDestination(destinationId)).toMatchObject({ removed: 1 });
    expect(deliveries).toMatchObject([{ event: "post.delete", article: { id: spanish.id } }]);

    deliveries = [];
    await state.db.post.delete({ where: { id: english.id } });
    expect(await syncDestination(destinationId)).toMatchObject({ removed: 1 });
    expect(deliveries).toMatchObject([{ event: "post.delete", article: { id: english.id } }]);
    expect(await publications()).toEqual([]);
  });

  it("retries failures later and pauses when the site rejects the connection", async () => {
    const post = await createPost({ title: "Flaky", slug: "flaky", status: "published" });
    answer = () => 503;
    expect(await syncDestination(destinationId)).toMatchObject({ sent: 0, failed: 1 });
    const failed = (await publications())[0];
    expect(failed).toMatchObject({ postId: post.id, state: "failed", attempts: 1 });
    expect(failed.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    expect(failed.lastError).toContain("503");

    // Not due yet: nothing is sent, even though the site works again.
    answer = () => 200;
    expect(await syncDestination(destinationId)).toMatchObject({ sent: 0, failed: 0 });
    await state.db.postPublication.updateMany({ where: { destinationId }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    expect(await syncDueDestinations()).toMatchObject({ sent: 1 });
    expect((await publications())[0]).toMatchObject({ state: "synced", attempts: 0, lastError: null });

    answer = () => 401;
    await state.db.post.update({ where: { id: post.id }, data: { title: "Flaky, edited" } });
    expect(await syncDestination(destinationId)).toMatchObject({ failed: 1 });
    expect(await state.db.publishDestination.findUnique({ where: { id: destinationId } })).toMatchObject({ status: "error" });
    expect(await syncDestination(destinationId)).toMatchObject({ skipped: "not-connected" });
  });

  it("lets only one run work on a destination at a time", async () => {
    await createPost({ title: "One", slug: "one", status: "published" });
    await createPost({ title: "Two", slug: "two", status: "published" });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let first = true;
    answer = () => 200;
    const slowServerAnswer = vi.fn();
    // Hold the first delivery until the second run has tried and given up.
    const runA = (async () => {
      const original = globalThis.fetch;
      vi.stubGlobal("fetch", async (...args: Parameters<typeof fetch>) => {
        if (first) { first = false; slowServerAnswer(); await gate; }
        return original(...args);
      });
      try { return await syncDestination(destinationId); } finally { vi.unstubAllGlobals(); }
    })();
    await vi.waitFor(() => expect(slowServerAnswer).toHaveBeenCalled());
    expect(await syncDestination(destinationId)).toMatchObject({ skipped: "locked" });
    release();
    expect(await runA).toMatchObject({ sent: 2 });
    expect(new Set(deliveries.map((delivery) => delivery.article.id)).size).toBe(2);
  });
});
