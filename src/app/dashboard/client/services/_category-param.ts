/**
 * `?cat=<categoryId>` on /dashboard/client/services: the category the page
 * opens expanded. The individual's top menu links each service family here
 * (live check of 13 Nov, row 11 — the four old links were 404s).
 *
 * Only an id the page actually shows is honoured; anything else (a typo, a
 * category hidden for this viewer) opens the page with nothing expanded, as
 * before.
 */
export function categoryFromSearch(search: string, visibleIds: readonly string[]): string | null {
  let raw: string | null = null;
  try {
    raw = new URLSearchParams(search).get("cat");
  } catch {
    return null;
  }
  if (!raw) return null;
  return visibleIds.includes(raw) ? raw : null;
}
