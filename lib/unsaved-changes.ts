/**
 * Pure helpers for the unsaved changes guard (see
 * components/UnsavedChanges/UnsavedChangesProvider.tsx).
 */

/** A stable text form of a value, for comparing it with a saved snapshot. */
export function snapshot(value: unknown) {
  return JSON.stringify(value) ?? "";
}

/** The values of a form's named fields (files skipped), for forms with uncontrolled inputs. */
export function formSnapshot(form: HTMLFormElement | null | undefined) {
  if (!form) return "";
  const entries: [string, string][] = [];
  new FormData(form).forEach((value, name) => {
    if (typeof value === "string") entries.push([name, value]);
  });
  return snapshot(entries);
}

type ClickLike = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
};
type AnchorLike = { href: string; target: string; hasAttribute(name: string): boolean };

/**
 * Where a click on a link would take the app, when it leaves the current page
 * inside the app; null when it opens elsewhere (new tab, download, another
 * site) or only moves to an anchor on the same page.
 */
export function inAppDestination(event: ClickLike, anchor: AnchorLike, current: { origin: string; pathname: string; search: string }) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return null;
  let url: URL;
  try { url = new URL(anchor.href, current.origin); } catch { return null; }
  if (url.origin !== current.origin) return null;
  if (url.pathname === current.pathname && url.search === current.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
