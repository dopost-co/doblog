// Simple per-instance sliding window for the unauthenticated OAuth endpoints
// (register/authorize/token), which have no API key yet to key a DB-backed
// limiter on. Not distributed; good enough to blunt casual abuse.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const requestLog = new Map<string, number[]>();
let lastCleanup = Date.now();

export function rateLimited(key: string): boolean {
  const now = Date.now();
  if (now - lastCleanup > 300_000) {
    lastCleanup = now;
    const cutoff = now - WINDOW_MS;
    for (const [k, timestamps] of requestLog) {
      const kept = timestamps.filter((t) => t > cutoff);
      if (kept.length === 0) requestLog.delete(k);
      else requestLog.set(k, kept);
    }
  }
  const cutoff = now - WINDOW_MS;
  const timestamps = (requestLog.get(key) ?? []).filter((t) => t > cutoff);
  if (timestamps.length >= MAX_REQUESTS) return true;
  timestamps.push(now);
  requestLog.set(key, timestamps);
  return false;
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
