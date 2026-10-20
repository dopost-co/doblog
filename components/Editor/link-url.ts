/** Accept only link schemes supported by the published article renderer. */
export function normalizeLinkUrl(value: string): string | null {
  const url = value.trim();
  if (!url || /[\s\u0000-\u001f\u007f\\]/.test(url)) return null;
  if (/^(\/|#|\?)/.test(url) && !url.startsWith("//")) return url;
  const absolute = /^[a-z][a-z\d+.-]*:/i.test(url) ? url : `https://${url}`;
  try {
    const parsed = new URL(absolute);
    if (!["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)) return null;
    if ((parsed.protocol === "mailto:" || parsed.protocol === "tel:") && !parsed.pathname) return null;
    return absolute;
  } catch {
    return null;
  }
}
