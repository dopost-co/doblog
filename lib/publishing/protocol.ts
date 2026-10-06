import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * How Zenex delivers articles to a site. The WordPress plugin, the PrestaShop
 * module and custom webhooks all speak this: a signed JSON POST per event.
 *
 *   X-Zenex-Event:     ping | post.upsert | post.delete
 *   X-Zenex-Timestamp: unix seconds
 *   X-Zenex-Signature: v1=<hex HMAC-SHA256 of "<timestamp>.<raw body>" with the signing key>
 *   X-Zenex-Delivery:  unique id of this delivery
 *
 * Receivers verify the signature and reject timestamps older than
 * SIGNATURE_TOLERANCE_SECONDS. Every event is idempotent: the article id is
 * the key, so retries and duplicates are harmless.
 */
export const PROTOCOL_VERSION = 1;
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type DeliveryEvent = "ping" | "post.upsert" | "post.delete";

export type ZenexArticle = {
  /** Stable Zenex id; receivers key their copy on it. */
  id: string;
  /** Shared by the translations of one article. */
  translationGroupId: string | null;
  /** ISO 639-1 code. */
  language: string;
  slug: string;
  title: string;
  excerpt: string | null;
  /** Sanitized HTML of the body. */
  html: string;
  /** ISO 8601. */
  publishedAt: string;
  updatedAt: string;
  featured: boolean;
  coverImage: { url: string; alt: string } | null;
  author: { name: string; slug: string } | null;
  categories: Array<{ name: string; slug: string }>;
  tags: Array<{ name: string; slug: string }>;
  seo: {
    title: string | null;
    description: string | null;
    canonicalUrl: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImage: string | null;
    keywords: string | null;
  };
  /** The other published languages of this article. */
  translations: Array<{ id: string; language: string; slug: string }>;
  /** Every image the body and cover use, so the receiver can store its own copies. */
  images: string[];
};

export type UpsertBody = { version: number; event: "post.upsert"; article: ZenexArticle; remoteId: string | null };
export type DeleteBody = { version: number; event: "post.delete"; article: { id: string; language: string; translationGroupId: string | null }; remoteId: string | null };
export type PingBody = { version: number; event: "ping" };
export type DeliveryBody = UpsertBody | DeleteBody | PingBody;

/** What a connector answers to a ping, so Zenex can adapt to the site. */
export type SiteInfo = {
  connector?: string;
  connectorVersion?: string;
  platformVersion?: string;
  name?: string;
  url?: string;
  /** Languages the site can publish in (ISO 639-1). */
  languages?: string[];
  /** Whether the site can hold several languages (e.g. Polylang on WordPress). */
  multilingual?: boolean;
  /** Where each language's articles are served, e.g. { "es": "https://shop.com/es/blog" }. */
  articleBase?: Record<string, string>;
  seoPlugin?: string | null;
};

/** A new signing key: shown once to paste into the plugin, stored encrypted. */
export function generateSigningKey() {
  return `zx_${randomBytes(32).toString("base64url")}`;
}

export function signPayload(secret: string, timestamp: number, body: string) {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export function signedHeaders(secret: string, event: DeliveryEvent, body: string, now = Date.now()) {
  const timestamp = Math.floor(now / 1000);
  return {
    "Content-Type": "application/json",
    "X-Zenex-Event": event,
    "X-Zenex-Timestamp": String(timestamp),
    "X-Zenex-Signature": signPayload(secret, timestamp, body),
    "X-Zenex-Delivery": randomBytes(12).toString("hex"),
  };
}

/** Receiver side, for Node handlers (the docs show the same in other languages). */
export function verifySignature(secret: string, timestamp: string | null, signature: string | null, body: string, now = Date.now()) {
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(signPayload(secret, Number(timestamp), body));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
