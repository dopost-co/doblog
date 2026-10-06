import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { blocksToMarkdown, frontMatter } from "@/lib/publishing/markdown";
import { CONNECTORS } from "@/lib/publishing/platforms";
import { PROTOCOL_VERSION, signedHeaders, type DeliveryBody, type SiteInfo, type ZenexArticle } from "@/lib/publishing/protocol";
import type { ArticleSource } from "./article";

/**
 * One adapter per way of reaching a site. Each is idempotent: upserting the
 * same article twice leaves one copy, and removing a missing copy succeeds.
 */
export type Adapter = {
  /** Part of every article hash: bump it when what a destination receives changes. */
  version: string;
  check(): Promise<{ info: SiteInfo; config?: Record<string, unknown> }>;
  upsert(article: ZenexArticle, source: ArticleSource, remoteId: string | null): Promise<{ remoteId: string; url: string | null }>;
  remove(article: { id: string; language: string; translationGroupId: string | null }, remoteId: string | null): Promise<void>;
};

export type DestinationContext = {
  platform: string;
  method: string;
  siteUrl: string | null;
  config: Record<string, unknown>;
  /** Decrypted signing key or token. */
  secret: string | null;
  /** The blog writes in more than one language. */
  multilingual: boolean;
  /** Public URL of an article on the site, from the blog's article paths. */
  articleUrl: (article: { slug: string; language: string }) => string | null;
};

/**
 * A failure with a message the owner can act on. `connection` failures mean
 * the destination itself is broken (wrong key, plugin removed), so syncing
 * pauses until it is checked again; others are retried with backoff.
 */
export class PublishError extends Error {
  constructor(message: string, readonly options: { connection?: boolean; status?: number } = {}) {
    super(message);
    this.name = "PublishError";
  }
}

const USER_AGENT = "Zenex/1.0 (+https://zenex.dev)";
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** Local and private sites are only reachable while developing. */
function allowPrivateHosts() {
  return process.env.NODE_ENV !== "production" || process.env.ZENEX_ALLOW_PRIVATE_DESTINATIONS === "true";
}

export function normalizeSiteUrl(value: string) {
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`); }
  catch { throw new PublishError("Enter your website address, for example https://example.com"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new PublishError("Use your website address without a username or password in it");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/+$/, "");
}

/** A webhook endpoint keeps its path and query; only the fragment goes. */
export function normalizeEndpoint(value: string) {
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`); }
  catch { throw new PublishError("Enter the endpoint address, for example https://example.com/api/zenex"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new PublishError("Use an endpoint address without a username or password in it");
  }
  url.hash = "";
  return url.toString();
}

async function assertReachable(target: string) {
  const url = new URL(target);
  if (allowPrivateHosts()) return;
  if (url.protocol !== "https:") throw new PublishError("Zenex only sends articles over HTTPS. Use an https:// address.", { connection: true });
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = ipaddr.isValid(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new PublishError(`${url.hostname} doesn’t resolve. Check the address.`, { connection: true });
  if (addresses.some(({ address }) => { try { return ipaddr.parse(address).range() !== "unicast"; } catch { return true; } })) {
    throw new PublishError(`${url.hostname} points to a private network, which Zenex can’t reach.`, { connection: true });
  }
}

async function readLimited(response: Response, limit: number) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new PublishError("The response was too large"); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

const failureReason = (error: unknown) => {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "it took too long to answer";
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : error instanceof Error ? error.message : String(error);
  return cause.replace(/^fetch failed:?\s*/i, "") || "the connection failed";
};

type SignedResponse = { status: number; location: string | null; data: Record<string, unknown> | null; text: string };

async function deliver(endpoint: string, secret: string, body: DeliveryBody, timeoutMs: number): Promise<SignedResponse> {
  await assertReachable(endpoint);
  const json = JSON.stringify(body);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { ...signedHeaders(secret, body.event, json), "User-Agent": USER_AGENT, Accept: "application/json" },
      body: json,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new PublishError(`Couldn’t reach ${new URL(endpoint).host}: ${failureReason(error)}.`);
  }
  const text = Buffer.from(await readLimited(response, MAX_RESPONSE_BYTES)).toString("utf8");
  let data: Record<string, unknown> | null = null;
  // Some hosts print notices before the JSON; take the outermost object.
  const start = text.indexOf("{");
  if (start !== -1) {
    try { const parsed = JSON.parse(text.slice(start)); if (parsed && typeof parsed === "object") data = parsed; } catch { /* not JSON */ }
  }
  return { status: response.status, location: response.headers.get("location"), data, text };
}

const sameSite = (left: string, right: string) => {
  const host = (value: string) => new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  return host(left) === host(right);
};

const snippet = (text: string) => text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);

// ---------------------------------------------------------------------------
// WordPress plugin and PrestaShop module: the signed protocol on a known path.

const CONNECTOR_IDS = { wordpress: "zenex-wordpress", prestashop: "zenex-prestashop" } as const;

function connectorEndpoints(platform: string, siteUrl: string) {
  if (platform === "wordpress") return [`${siteUrl}/wp-json/zenex/v1/webhook`, `${siteUrl}/?rest_route=/zenex/v1/webhook`];
  if (platform === "prestashop") return [`${siteUrl}/index.php?fc=module&module=zenexblog&controller=webhook`];
  throw new PublishError("This platform has no Zenex connector");
}

function connectorFailure(platform: "wordpress" | "prestashop", response: SignedResponse): PublishError {
  const connector = CONNECTORS[platform];
  const code = typeof response.data?.code === "string" ? response.data.code : null;
  const message = typeof response.data?.message === "string" ? response.data.message : null;
  if (code === "zenex_not_configured") return new PublishError(`${connector.name} is installed but has no connection key yet. Paste it in ${connector.settings}.`, { connection: true, status: response.status });
  if (code === "zenex_bad_signature") return new PublishError(`The connection key on your site doesn’t match this blog. Copy it again and paste it in ${connector.settings}.`, { connection: true, status: response.status });
  if (code === "zenex_stale_request") return new PublishError("Your site’s clock is more than 5 minutes off, so it rejected the request. Check the server time.", { connection: true, status: response.status });
  if (message) return new PublishError(`Your site answered: ${message}`, { status: response.status });
  if (response.status === 401 || response.status === 403) {
    return new PublishError(`Your site blocked the request before it reached ${connector.name} (HTTP ${response.status}). A firewall or security plugin may be filtering it; allow requests from Zenex.`, { connection: true, status: response.status });
  }
  if (response.status >= 500) return new PublishError(`Your site had an error (HTTP ${response.status})${snippet(response.text) ? `: ${snippet(response.text)}` : ""}.`, { status: response.status });
  return new PublishError(`Your site answered something unexpected (HTTP ${response.status})${snippet(response.text) ? `: ${snippet(response.text)}` : ""}.`, { status: response.status });
}

function connectorAdapter(context: DestinationContext, platform: "wordpress" | "prestashop"): Adapter {
  const connector = CONNECTORS[platform];
  const secret = () => {
    if (!context.secret) throw new PublishError("This destination has no connection key", { connection: true });
    return context.secret;
  };
  const endpoint = () => {
    const saved = context.config.endpoint;
    if (typeof saved !== "string") throw new PublishError(`Check the connection to ${connector.name} first.`, { connection: true });
    return saved;
  };

  /** Tries each known path, following redirects within the site (http→https, www). */
  async function discover() {
    if (!context.siteUrl) throw new PublishError("Enter your website address first", { connection: true });
    let notFound = 0;
    let lastFailure: PublishError | null = null;
    for (const candidate of connectorEndpoints(platform, context.siteUrl)) {
      let current = candidate;
      for (let hop = 0; hop < 4; hop++) {
        const response = await deliver(current, secret(), { version: PROTOCOL_VERSION, event: "ping" }, 20_000);
        if (response.status >= 300 && response.status < 400 && response.location) {
          const next = new URL(response.location, current).toString();
          if (!sameSite(next, candidate)) throw new PublishError(`Your site redirects to another domain (${new URL(next).host}). Use that address instead.`, { connection: true });
          current = next;
          continue;
        }
        if (response.status >= 200 && response.status < 300 && response.data?.ok === true && response.data.connector === CONNECTOR_IDS[platform]) {
          return { endpoint: current, info: (response.data.site ?? {}) as SiteInfo, response };
        }
        if (response.status === 404 && !response.data?.code) notFound++;
        else if (response.status >= 200 && response.status < 300) lastFailure = new PublishError(`Your site answered with a page instead of ${connector.name}. Check that it’s activated.`, { connection: true });
        else lastFailure = connectorFailure(platform, response);
        break;
      }
    }
    if (lastFailure) throw lastFailure;
    throw new PublishError(notFound
      ? `Couldn’t find ${connector.name} on ${new URL(context.siteUrl).host}. Install and activate it, then check again.`
      : `Couldn’t reach ${connector.name} on your site.`, { connection: true });
  }

  return {
    version: `${platform}-1`,
    async check() {
      const found = await discover();
      const info = found.info;
      info.connector = String(found.response.data?.connector ?? CONNECTOR_IDS[platform]);
      if (typeof found.response.data?.version === "string") info.connectorVersion = found.response.data.version;
      return { info, config: { endpoint: found.endpoint } };
    },
    async upsert(article, _source, remoteId) {
      const response = await deliver(endpoint(), secret(), { version: PROTOCOL_VERSION, event: "post.upsert", article, remoteId }, 120_000);
      if (response.status === 404 && !response.data?.code) {
        throw new PublishError(`${connector.name} is no longer answering on your site. Check that it’s still activated.`, { connection: true, status: 404 });
      }
      if (response.status < 200 || response.status >= 300 || response.data?.ok !== true) throw connectorFailure(platform, response);
      const id = response.data.remoteId;
      if (typeof id !== "string" && typeof id !== "number") throw new PublishError("Your site saved the article but didn’t say where");
      return { remoteId: String(id), url: typeof response.data.url === "string" ? response.data.url : null };
    },
    async remove(article, remoteId) {
      const response = await deliver(endpoint(), secret(), { version: PROTOCOL_VERSION, event: "post.delete", article, remoteId }, 60_000);
      if (response.data?.code === "zenex_not_found") return;
      if (response.status < 200 || response.status >= 300 || response.data?.ok !== true) throw connectorFailure(platform, response);
    },
  };
}

// ---------------------------------------------------------------------------
// Webhook: the same signed protocol on an endpoint the owner builds.

function webhookAdapter(context: DestinationContext): Adapter {
  const endpoint = () => {
    const value = context.config.endpoint;
    if (typeof value !== "string" || !value) throw new PublishError("Enter the endpoint that receives the articles", { connection: true });
    return value;
  };
  const secret = () => {
    if (!context.secret) throw new PublishError("This destination has no signing key", { connection: true });
    return context.secret;
  };
  const failure = (response: SignedResponse, action: string) => {
    const status = response.status;
    const detail = snippet(response.text);
    return new PublishError(`Your endpoint answered HTTP ${status} to ${action}${detail ? `: ${detail}` : ""}.`, { status, connection: status === 401 || status === 403 || (status >= 300 && status < 400) });
  };
  return {
    version: "webhook-1",
    async check() {
      const response = await deliver(endpoint(), secret(), { version: PROTOCOL_VERSION, event: "ping" }, 20_000);
      if (response.status >= 300 && response.status < 400) {
        throw new PublishError(`Your endpoint redirects${response.location ? ` to ${response.location}` : ""}. Use the final address.`, { connection: true });
      }
      if (response.status < 200 || response.status >= 300) throw failure(response, "the test request");
      const site = response.data?.site;
      return { info: site && typeof site === "object" ? site as SiteInfo : {} };
    },
    async upsert(article, _source, remoteId) {
      const response = await deliver(endpoint(), secret(), { version: PROTOCOL_VERSION, event: "post.upsert", article, remoteId }, 60_000);
      if (response.status < 200 || response.status >= 300) throw failure(response, "the article");
      const id = response.data?.remoteId;
      const url = response.data?.url;
      return {
        remoteId: typeof id === "string" || typeof id === "number" ? String(id) : remoteId ?? article.id,
        url: typeof url === "string" ? url : context.articleUrl(article),
      };
    },
    async remove(article, remoteId) {
      const response = await deliver(endpoint(), secret(), { version: PROTOCOL_VERSION, event: "post.delete", article, remoteId }, 30_000);
      if (response.status === 404 || response.status === 410) return;
      if (response.status < 200 || response.status >= 300) throw failure(response, "the removal");
    },
  };
}

// ---------------------------------------------------------------------------
// GitHub: each article is a Markdown file committed to the site's repository.

export type GitHubConfig = { repo: string; branch: string; contentDir: string; imagesDir: string; imagesPath: string };

export function githubConfig(config: Record<string, unknown>): GitHubConfig {
  const text = (key: string, fallback: string) => typeof config[key] === "string" && config[key] ? String(config[key]) : fallback;
  const clean = (value: string) => value.trim().replace(/^\/+|\/+$/g, "");
  return {
    repo: clean(text("repo", "")),
    branch: text("branch", "main").trim(),
    contentDir: clean(text("contentDir", "content/blog")),
    imagesDir: clean(text("imagesDir", "public/blog")),
    imagesPath: `/${clean(text("imagesPath", "/blog"))}`.replace(/\/$/, ""),
  };
}

const IMAGE_EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/svg+xml": "svg" };

function githubAdapter(context: DestinationContext): Adapter {
  const config = githubConfig(context.config);
  const api = async (path: string, init: RequestInit & { allow?: number[] } = {}) => {
    if (!context.secret) throw new PublishError("Add a GitHub access token", { connection: true });
    let response: Response;
    try {
      response = await fetch(`https://api.github.com/repos/${config.repo}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${context.secret}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": USER_AGENT, ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new PublishError(`Couldn’t reach GitHub: ${failureReason(error)}.`);
    }
    const data = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (response.ok || init.allow?.includes(response.status)) return { status: response.status, data };
    const message = typeof data?.message === "string" ? data.message : `HTTP ${response.status}`;
    if (response.status === 401) throw new PublishError("GitHub rejected the access token. Create a new one and paste it again.", { connection: true, status: 401 });
    if (response.status === 403 && /rate limit/i.test(message)) throw new PublishError("GitHub’s rate limit was reached. Zenex will try again shortly.", { status: 403 });
    if (response.status === 403 || (response.status === 404 && init.method && init.method !== "GET")) {
      throw new PublishError(`The token can’t write to ${config.repo}. Give it “Contents: Read and write” on this repository.`, { connection: true, status: response.status });
    }
    if (response.status === 404) throw new PublishError(`Couldn’t find ${config.repo} or branch “${config.branch}”, or the token can’t see them.`, { connection: true, status: 404 });
    throw new PublishError(`GitHub answered: ${message}`, { status: response.status });
  };

  const filePath = (article: { slug: string; language: string }) =>
    [config.contentDir, context.multilingual ? article.language : null, `${article.slug}.md`].filter(Boolean).join("/");

  const exists = async (path: string) =>
    (await api(`/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(config.branch)}`, { allow: [404] })).status !== 404;

  /** Commits `entries` on top of the branch; retries once if the branch moved meanwhile. */
  async function commit(message: string, build: () => Promise<Array<Record<string, unknown>>>) {
    for (let attempt = 0; ; attempt++) {
      const ref = await api(`/git/ref/heads/${encodeURIComponent(config.branch)}`);
      const head = String((ref.data?.object as Record<string, unknown>)?.sha);
      const parent = await api(`/git/commits/${head}`);
      const baseTree = String((parent.data?.tree as Record<string, unknown>)?.sha);
      const entries = await build();
      if (!entries.length) return;
      const tree = await api("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: baseTree, tree: entries }) });
      if (tree.data?.sha === baseTree) return;
      const created = await api("/git/commits", { method: "POST", body: JSON.stringify({ message, tree: tree.data?.sha, parents: [head] }) });
      const update = await api(`/git/refs/heads/${encodeURIComponent(config.branch)}`, { method: "PATCH", body: JSON.stringify({ sha: created.data?.sha, force: false }), allow: [422] });
      if (update.status !== 422) return;
      if (attempt >= 2) throw new PublishError("The branch kept changing while Zenex committed. It will try again shortly.");
    }
  }

  async function downloadImage(url: string) {
    await assertReachable(url);
    let response: Response;
    try { response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000), headers: { "User-Agent": USER_AGENT } }); }
    catch (error) { throw new PublishError(`Couldn’t download an image (${url}): ${failureReason(error)}.`); }
    if (!response.ok) throw new PublishError(`Couldn’t download an image (${url}): HTTP ${response.status}.`);
    const type = response.headers.get("content-type")?.split(";")[0].trim() ?? "";
    return { bytes: Buffer.from(await readLimited(response, MAX_IMAGE_BYTES)), type };
  }

  return {
    version: "github-1",
    async check() {
      if (!/^[\w.-]+\/[\w.-]+$/.test(config.repo)) throw new PublishError("Enter the repository as owner/name", { connection: true });
      const repo = await api("");
      await api(`/branches/${encodeURIComponent(config.branch)}`);
      // Creating an unreferenced blob proves the token can write without changing the repository.
      await api("/git/blobs", { method: "POST", body: JSON.stringify({ content: "zenex", encoding: "utf-8" }) });
      return { info: { name: String(repo.data?.full_name ?? config.repo), url: typeof repo.data?.html_url === "string" ? repo.data.html_url : undefined } };
    },
    async upsert(article, source, remoteId) {
      const path = filePath(article);
      await commit(`${remoteId ? "Update" : "Publish"}: ${article.title}`, async () => {
        const images = new Map<string, string>();
        const entries: Array<Record<string, unknown>> = [];
        for (const url of article.images) {
          const digest = createHash("sha1").update(url).digest("hex").slice(0, 16);
          const known = /\.(jpe?g|png|webp|gif|avif|svg)$/i.exec(new URL(url).pathname)?.[1]?.toLowerCase().replace("jpeg", "jpg");
          let extension = known;
          let upload: { bytes: Buffer; type: string } | null = null;
          if (!extension) { upload = await downloadImage(url); extension = IMAGE_EXTENSIONS[upload.type] ?? "img"; }
          const name = `${digest}.${extension}`;
          images.set(url, `${config.imagesPath}/${name}`);
          const repoPath = `${config.imagesDir}/${name}`;
          if (await exists(repoPath)) continue;
          upload ??= await downloadImage(url);
          const blob = await api("/git/blobs", { method: "POST", body: JSON.stringify({ content: upload.bytes.toString("base64"), encoding: "base64" }) });
          entries.push({ path: repoPath, mode: "100644", type: "blob", sha: blob.data?.sha });
        }
        const image = (url: string) => images.get(url) ?? url;
        const markdown = `${frontMatter(article, image)}\n${blocksToMarkdown(source.content, image)}\n`;
        entries.push({ path, mode: "100644", type: "blob", content: markdown });
        if (remoteId && remoteId !== path && await exists(remoteId)) entries.push({ path: remoteId, mode: "100644", type: "blob", sha: null });
        return entries;
      });
      return { remoteId: path, url: context.articleUrl(article) ?? `https://github.com/${config.repo}/blob/${config.branch}/${path}` };
    },
    async remove(article, remoteId) {
      if (!remoteId) return;
      await commit(`Unpublish: ${remoteId.split("/").pop()}`, async () => (await exists(remoteId)) ? [{ path: remoteId, mode: "100644", type: "blob", sha: null }] : []);
    },
  };
}

export function adapterFor(context: DestinationContext): Adapter {
  if (context.method === "plugin" && (context.platform === "wordpress" || context.platform === "prestashop")) return connectorAdapter(context, context.platform);
  if (context.method === "webhook") return webhookAdapter(context);
  if (context.method === "github") return githubAdapter(context);
  throw new PublishError("This blog doesn’t copy articles to a website");
}
