import { z } from "zod";

/** Autopilot studies this many competitor sites (sitemaps and keyword gaps); each one costs research. */
export const MAX_COMPETITORS = 2;

/**
 * The bare domain of a competitor as people paste it: "https://www.rival.com/blog"
 * becomes "rival.com". Returns null when it isn't a public domain.
 */
export function competitorDomain(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  let host: string;
  try { host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`).hostname; }
  catch { return null; }
  host = host.replace(/^www\./, "");
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ? host : null;
}

export const competitorDomainsSchema = z.array(z.string().max(2048)).transform((values, ctx) => {
  const domains: string[] = [];
  for (const value of values) {
    if (!value.trim()) continue;
    const domain = competitorDomain(value);
    if (!domain) {
      ctx.addIssue({ code: "custom", message: `"${value.trim().slice(0, 60)}" is not a website. Use a domain like rival.com` });
      return z.NEVER;
    }
    if (!domains.includes(domain)) domains.push(domain);
  }
  if (domains.length > MAX_COMPETITORS) {
    ctx.addIssue({ code: "custom", message: `Add up to ${MAX_COMPETITORS} competitors` });
    return z.NEVER;
  }
  return domains;
});
