import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL, getBlogUploadPath, getPublicUrl } from "@/lib/r2";
import { ApiError } from "@/lib/integrations/errors";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

export function imageExtension(bytes: Buffer, mimeType: string) {
  if (mimeType === "image/png" && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "png";
  if (mimeType === "image/jpeg" && bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) return "jpg";
  if (mimeType === "image/gif" && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return "gif";
  if (mimeType === "image/webp" && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  throw new ApiError(400, "File signature must match JPEG, PNG, GIF or WebP; SVG is not supported");
}

/** Callers authorize the blog before invoking this shared storage adapter. */
export async function uploadBlogImage(blogId: string, bytes: Buffer, mimeType: string, maxBytes = 10 * 1024 * 1024) {
  if (!bytes.length || bytes.length > maxBytes) throw new ApiError(413, "Image exceeds the allowed size");
  const extension = imageExtension(bytes, mimeType);
  if (!R2_BUCKET_NAME || !R2_PUBLIC_URL || !process.env.R2_ENDPOINT) throw new ApiError(503, "Media storage is not configured");
  const path = getBlogUploadPath(blogId, `${randomUUID()}.${extension}`);
  await r2Client.send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: path, Body: bytes, ContentType: mimeType, ContentDisposition: "inline" }));
  return { url: getPublicUrl(path), size: bytes.length, mimeType };
}

function isPublicAddress(address: string) {
  const parsed = ipaddr.parse(address);
  return parsed.range() === "unicast";
}

function isAllowedFileHost(hostname: string) {
  const rules = (process.env.MCP_FILE_DOWNLOAD_HOSTS || "files.openai.com,.openai.com,.oaiusercontent.com,.chatgpt.com")
    .split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  const host = hostname.toLowerCase();
  return rules.some(rule => rule.startsWith(".") ? host.endsWith(rule) && host.length > rule.length : host === rule);
}

/** Download a client-provided MCP file without allowing redirects or private-network access. */
export async function downloadPublicImage(downloadUrl: string, maxBytes = 10 * 1024 * 1024) {
  const url = new URL(downloadUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new ApiError(400, "Image download URL must be public HTTPS without credentials or a custom port");
  if (!isAllowedFileHost(url.hostname)) throw new ApiError(400, "Image download host is not trusted");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new ApiError(400, "Image download URL cannot resolve to a private or reserved network");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20_000), headers: { Accept: "image/jpeg,image/png,image/gif,image/webp" }, cache: "no-store" });
  if (!response.ok) throw new ApiError(502, `Unable to download image (${response.status})`);
  const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!(["image/jpeg", "image/png", "image/gif", "image/webp"] as string[]).includes(mimeType)) throw new ApiError(400, "Downloaded file is not a supported image");
  if (Number(response.headers.get("content-length") || 0) > maxBytes) throw new ApiError(413, "Image exceeds the allowed size");
  if (!response.body) throw new ApiError(502, "Image download returned no body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new ApiError(413, "Image exceeds the allowed size"); }
    chunks.push(value);
  }
  return { bytes: Buffer.concat(chunks), mimeType };
}
