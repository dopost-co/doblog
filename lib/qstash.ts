import { Client, Receiver } from "@upstash/qstash";

export const PUBLISH_SCHEDULED_PATH = "/api/qstash/publish-scheduled";
export const CONTENT_DISCOVERY_PATH = "/api/qstash/content-discovery";
export const GROWTH_DRAFTS_PATH = "/api/qstash/growth-drafts";
export const GENERATE_DRAFT_PATH = "/api/qstash/generate-draft";

export function isQStashConfigured() {
  return Boolean(process.env.QSTASH_TOKEN?.trim());
}

let client: Client | null = null;
export function getQStashClient() {
  if (!isQStashConfigured()) throw new Error("QSTASH_TOKEN is not configured");
  client ??= new Client({ token: process.env.QSTASH_TOKEN, baseUrl: process.env.QSTASH_URL || undefined });
  return client;
}

/** Public HTTPS origin QStash calls back. QStash cannot reach localhost. */
export function getQStashDestinationBaseUrl(environment: Record<string, string | undefined> = process.env) {
  const configured = environment.QSTASH_API_URL?.trim() || environment.NEXTAUTH_URL?.trim();
  if (!configured) throw new Error("QSTASH_API_URL or NEXTAUTH_URL must be configured");
  const url = new URL(configured);
  if (url.protocol !== "https:") throw new Error("The QStash destination must use HTTPS");
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

/**
 * Accepts either a QStash-signed request or `Authorization: Bearer $CRON_SECRET`
 * (for external schedulers). Signature checks are skipped only outside production.
 */
export async function verifyScheduledRequest(request: Request, body: string) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) return true;
  const signature = request.headers.get("upstash-signature");
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY?.trim();
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY?.trim();
  if (signature && currentSigningKey && nextSigningKey) {
    const receiver = new Receiver({ currentSigningKey, nextSigningKey });
    return receiver.verify({ signature, body }).catch(() => false);
  }
  return process.env.NODE_ENV !== "production";
}
