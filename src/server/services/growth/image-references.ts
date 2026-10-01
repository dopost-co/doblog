import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { toFile } from "openai";
import sharp from "sharp";
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL, getBlogUploadPath, getPublicUrl } from "@/lib/r2";
import { ApiError } from "@/lib/integrations/errors";
import { imageExtension } from "@/src/server/services/media/upload";

/**
 * Images a blog owner uploads to guide generation: style references and the
 * brand logo. Each kind lives in its own folder of the blog's media storage
 * and is read back straight from storage, never fetched by URL.
 */
export type BrandAssetKind = "references" | "brand";

/** Style references per image kind (thumbnail, in-article). */
export const MAX_STYLE_REFERENCES = 2;
export const MAX_STYLE_REFERENCE_BYTES = 8 * 1024 * 1024;
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
/** Formats both the OpenAI image edit endpoint and sharp accept. */
const ASSET_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

const folder = (blogId: string, kind: BrandAssetKind) => getBlogUploadPath(blogId, `${kind}/`);

/** Longest side of an SVG once drawn as PNG. */
const SVG_MAX_SIDE = 1600;

/**
 * Draws an SVG as a transparent PNG. SVG files can carry scripts, so they are
 * never stored or served as SVG; ones that point to other files or define
 * entities are refused before drawing, so the renderer only reads the upload.
 */
export async function rasterizeSvg(bytes: Buffer) {
  const text = bytes.toString("utf8");
  if (!/<svg[\s>]/i.test(text)) throw new ApiError(400, "This is not a valid SVG");
  if (/<!ENTITY|<!DOCTYPE[^>]*\[|\bhref\s*=\s*["']\s*(?!#|data:image\/)/i.test(text)) throw new ApiError(400, "Use an SVG without links to other files");
  try {
    return await sharp(bytes, { density: 300 }).resize({ width: SVG_MAX_SIDE, height: SVG_MAX_SIDE, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  } catch {
    throw new ApiError(400, "This SVG could not be read");
  }
}

/** Stores an uploaded image in the blog's media storage and returns its URL. SVGs are stored as PNG. */
export async function uploadBrandAsset(blogId: string, kind: BrandAssetKind, upload: Buffer, mimeType: string) {
  const maxBytes = kind === "brand" ? MAX_LOGO_BYTES : MAX_STYLE_REFERENCE_BYTES;
  if (!upload.length || upload.length > maxBytes) throw new ApiError(413, `Use an image under ${maxBytes / 1024 / 1024} MB`);
  const svg = mimeType === "image/svg+xml";
  const bytes = svg ? await rasterizeSvg(upload) : upload;
  const type = svg ? "image/png" : mimeType === "image/jpg" ? "image/jpeg" : mimeType;
  if (!ASSET_TYPES.includes(type as typeof ASSET_TYPES[number])) throw new ApiError(400, "Use a PNG, JPEG, WebP or SVG image");
  if (!bytes.length || bytes.length > maxBytes) throw new ApiError(413, `Use an image under ${maxBytes / 1024 / 1024} MB`);
  if (!R2_BUCKET_NAME || !R2_PUBLIC_URL || !process.env.R2_ENDPOINT) throw new ApiError(503, "Media storage is not configured");
  const key = `${folder(blogId, kind)}${randomUUID()}.${imageExtension(bytes, type)}`;
  await r2Client.send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: bytes, ContentType: type, ContentDisposition: "inline" }));
  return getPublicUrl(key);
}

/** The storage key of an asset URL, or null when it is not one of this blog's assets of that kind. */
function assetKey(blogId: string, kind: BrandAssetKind, url: string) {
  const prefix = getPublicUrl(folder(blogId, kind));
  if (!R2_PUBLIC_URL || !url.startsWith(prefix)) return null;
  const key = url.slice(R2_PUBLIC_URL.length + 1);
  return /^[\w-]+\.(png|jpg|webp)$/.test(key.slice(folder(blogId, kind).length)) ? key : null;
}

/** Reads an asset straight from storage; null when it is missing. */
async function readAsset(blogId: string, kind: BrandAssetKind, url: string) {
  const key = assetKey(blogId, kind, url);
  if (!key) return null;
  try {
    const object = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    const bytes = Buffer.from(await object.Body!.transformToByteArray());
    const type = object.ContentType && ASSET_TYPES.includes(object.ContentType as typeof ASSET_TYPES[number]) ? object.ContentType : "image/png";
    return { key, bytes, type };
  } catch (error) {
    console.warn("[Growth] brand-asset-unavailable", { blogId, key, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function uploadStyleReference(blogId: string, bytes: Buffer, mimeType: string) {
  return uploadBrandAsset(blogId, "references", bytes, mimeType);
}

/** Keeps only this blog's own references, without duplicates, up to the limit. */
export function normalizeStyleReferences(blogId: string, urls: readonly string[]) {
  const unique = [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
  if (unique.some((url) => !assetKey(blogId, "references", url))) throw new ApiError(400, "Upload style references through Zenex");
  if (unique.length > MAX_STYLE_REFERENCES) throw new ApiError(400, `Add up to ${MAX_STYLE_REFERENCES} style references`);
  return unique;
}

/** Style references as files for the image edit endpoint; missing ones are skipped. */
export async function loadStyleReferences(blogId: string, urls: readonly string[]) {
  const files = [];
  for (const url of urls.slice(0, MAX_STYLE_REFERENCES)) {
    const asset = await readAsset(blogId, "references", url);
    if (asset) files.push(await toFile(asset.bytes, asset.key.split("/").pop(), { type: asset.type }));
  }
  return files;
}

/** The blog's logo URL if it is one it uploaded, otherwise an error (null clears it). */
export function normalizeLogoUrl(blogId: string, url: string | null | undefined) {
  if (!url?.trim()) return null;
  if (!assetKey(blogId, "brand", url.trim())) throw new ApiError(400, "Upload the logo through Zenex");
  return url.trim();
}

/** The logo's bytes, or null when there is none or it is missing. */
export async function loadLogo(blogId: string, url: string | null | undefined) {
  if (!url) return null;
  return (await readAsset(blogId, "brand", url))?.bytes ?? null;
}
