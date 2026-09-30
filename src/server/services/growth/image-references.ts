import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { toFile } from "openai";
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL, getBlogUploadPath, getPublicUrl } from "@/lib/r2";
import { ApiError } from "@/lib/integrations/errors";
import { imageExtension } from "@/src/server/services/media/upload";

/** Style references per image kind (thumbnail, in-article). */
export const MAX_STYLE_REFERENCES = 2;
export const MAX_STYLE_REFERENCE_BYTES = 8 * 1024 * 1024;
/** Formats the OpenAI image edit endpoint accepts as input images. */
const REFERENCE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

const referenceFolder = (blogId: string) => getBlogUploadPath(blogId, "references/");

/** Stores an uploaded style reference in the blog's media storage. */
export async function uploadStyleReference(blogId: string, bytes: Buffer, mimeType: string) {
  const type = mimeType === "image/jpg" ? "image/jpeg" : mimeType;
  if (!REFERENCE_TYPES.includes(type as typeof REFERENCE_TYPES[number])) throw new ApiError(400, "Use a PNG, JPEG or WebP image");
  if (!bytes.length || bytes.length > MAX_STYLE_REFERENCE_BYTES) throw new ApiError(413, "Use an image under 8 MB");
  if (!R2_BUCKET_NAME || !R2_PUBLIC_URL || !process.env.R2_ENDPOINT) throw new ApiError(503, "Media storage is not configured");
  const key = `${referenceFolder(blogId)}${randomUUID()}.${imageExtension(bytes, type)}`;
  await r2Client.send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: bytes, ContentType: type, ContentDisposition: "inline" }));
  return getPublicUrl(key);
}

/** The storage key of a reference URL, or null when it is not one of this blog's references. */
function referenceKey(blogId: string, url: string) {
  const prefix = getPublicUrl(referenceFolder(blogId));
  if (!R2_PUBLIC_URL || !url.startsWith(prefix)) return null;
  const key = url.slice(R2_PUBLIC_URL.length + 1);
  return /^[\w-]+\.(png|jpg|webp)$/.test(key.slice(referenceFolder(blogId).length)) ? key : null;
}

/** Keeps only this blog's own references, without duplicates, up to the limit. */
export function normalizeStyleReferences(blogId: string, urls: readonly string[]) {
  const unique = [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
  if (unique.some((url) => !referenceKey(blogId, url))) throw new ApiError(400, "Upload style references through Zenex");
  if (unique.length > MAX_STYLE_REFERENCES) throw new ApiError(400, `Add up to ${MAX_STYLE_REFERENCES} style references`);
  return unique;
}

/**
 * Reads references straight from storage (never over the network by URL) as
 * files for the image edit endpoint. Missing ones are skipped.
 */
export async function loadStyleReferences(blogId: string, urls: readonly string[]) {
  const files = [];
  for (const url of urls.slice(0, MAX_STYLE_REFERENCES)) {
    const key = referenceKey(blogId, url);
    if (!key) continue;
    try {
      const object = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
      const bytes = Buffer.from(await object.Body!.transformToByteArray());
      const type = object.ContentType && REFERENCE_TYPES.includes(object.ContentType as typeof REFERENCE_TYPES[number]) ? object.ContentType : "image/png";
      files.push(await toFile(bytes, key.split("/").pop(), { type }));
    } catch (error) {
      console.warn("[Growth] style-reference-unavailable", { blogId, key, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return files;
}
