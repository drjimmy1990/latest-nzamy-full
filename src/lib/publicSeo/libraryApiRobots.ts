/**
 * libraryApiRobots.ts — O5 (batch l11-sec; spec 16.13(9b), register R61): the
 * library's JSON API (`/api/library/*`, which serves article text) is never
 * indexed or archived by a search engine. src/proxy.ts sets the header on
 * every response of those paths, its own early refusals (429 / 423 / the
 * challenge) included. The reader pages (`/laws/[slug]`) stay indexable.
 *
 * Pure: `node --test` loads it.
 */

export const LIBRARY_API_ROBOTS_HEADER = "X-Robots-Tag";
export const LIBRARY_API_ROBOTS_VALUE = "noindex, noarchive";

export function isLibraryApiPath(pathname: string): boolean {
  return pathname === "/api/library" || pathname.startsWith("/api/library/");
}
