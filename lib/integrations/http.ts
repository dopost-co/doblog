import { ApiError, apiError } from "./errors";

export const MAX_JSON_BYTES = 1024 * 1024;
export function privateJson(value: unknown, status = 200, wwwAuthenticateExtra?: string) {
  return Response.json(value, { status, headers: {
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    ...(status === 401 ? { "WWW-Authenticate": `Bearer realm="zenex"${wwwAuthenticateExtra ? `, ${wwwAuthenticateExtra}` : ""}` } : {}),
    ...(status === 429 ? { "Retry-After": "60" } : {}),
  } });
}
export function errorResponse(error: unknown, wwwAuthenticateExtra?: string) {
  const result = apiError(error);
  return privateJson({ error: result.error }, result.status, wwwAuthenticateExtra);
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // No browser CORS: private credentials belong in server-side clients.
  if (!origin) return;
  let originHost: string;
  try { originHost = new URL(origin).host; } catch { throw new ApiError(403, "Origin not allowed"); }
  // Behind a TLS-terminating proxy request.url is the internal address
  // (e.g. http://0.0.0.0:3000), so compare against the host the browser used.
  const allowed = new Set([new URL(request.url).host]);
  for (const header of ["x-forwarded-host", "host"]) {
    const value = request.headers.get(header)?.split(",")[0].trim();
    if (value) allowed.add(value);
  }
  if (process.env.NEXTAUTH_URL) { try { allowed.add(new URL(process.env.NEXTAUTH_URL).host); } catch {} }
  if (!allowed.has(originHost)) throw new ApiError(403, "Origin not allowed");
}
export async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError(415, "Content-Type must be application/json");
  }
  if (Number(request.headers.get("content-length")) > MAX_JSON_BYTES) throw new ApiError(413, "JSON body exceeds 1 MiB");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "JSON body required");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON_BYTES) {
        await reader.cancel();
        throw new ApiError(413, "JSON body exceeds 1 MiB");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Invalid JSON body");
  } finally { reader.releaseLock(); }
}
