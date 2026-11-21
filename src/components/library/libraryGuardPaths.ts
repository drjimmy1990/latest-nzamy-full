/**
 * Which /laws paths are a law's reader (/laws/[slug]) — the one route of the
 * section that carries its OWN LibraryGuard (src/app/laws/[slug]/layout.tsx),
 * so its server-rendered «عن هذا النظام» block and JSON-LD reach the first
 * HTML (owner TODO P1-10). The section guard (src/app/laws/layout.tsx) lets
 * these paths through and guards every other /laws page as before.
 *
 * A static folder under src/app/laws wins over [slug] in Next's router, so
 * each one is listed here and stays under the section guard. A folder missing
 * from this list would lose its guard: library-guard-paths.test.ts fails
 * until every folder under src/app/laws is listed. Listing a folder that has
 * no page (components) only means a law with that slug is guarded twice.
 */
export const LAWS_STATIC_SEGMENTS: ReadonlySet<string> = new Set([
  "civil-procedure",
  "components",
  "feqh-preview",
  "my",
  "orders",
  "research",
  "subscribe",
]);

/** True for /laws/<slug> (one segment, a trailing slash allowed) that is not a static sibling. */
export function isLawReaderPath(pathname: string | null | undefined): boolean {
  const m = /^\/laws\/([^/?#]+)\/?$/.exec(String(pathname ?? ""));
  if (!m) return false;
  let segment = m[1];
  try {
    segment = decodeURIComponent(segment);
  } catch {
    // A malformed escape is not one of the static names either.
  }
  return !LAWS_STATIC_SEGMENTS.has(segment);
}

/**
 * Owner 18 Nov, item 4.1 — the same P1-10 pattern for a decree's reader
 * (/laws/orders/<id>) and a judicial collection's reader (/precedents/<slug>):
 * each one's own layout guards the reader and prints the public block and
 * JSON-LD OUTSIDE its guard, so they reach the first HTML. The section guards
 * let exactly these paths through.
 */
export function isOrderReaderPath(pathname: string | null | undefined): boolean {
  return /^\/laws\/orders\/[^/?#]+\/?$/.test(String(pathname ?? ""));
}

/** Static folders under src/app/precedents (they win over [slug]); each stays under the section guard. */
export const PRECEDENTS_STATIC_SEGMENTS: ReadonlySet<string> = new Set(["judgment"]);

/** True for /precedents/<slug> (one segment) that is not a static sibling. */
export function isCollectionReaderPath(pathname: string | null | undefined): boolean {
  const m = /^\/precedents\/([^/?#]+)\/?$/.exec(String(pathname ?? ""));
  if (!m) return false;
  let segment = m[1];
  try {
    segment = decodeURIComponent(segment);
  } catch {
    // A malformed escape is not one of the static names either.
  }
  return !PRECEDENTS_STATIC_SEGMENTS.has(segment);
}
