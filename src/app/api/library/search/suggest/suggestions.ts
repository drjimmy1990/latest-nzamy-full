/**
 * Pure mapping for GET /api/library/search/suggest (owner note ١٢-٣): the
 * rows of library.search_title_suggestions → the page's «هل تقصد …؟» list.
 * Tested in suggestions.test.ts without a network.
 */

export const SUGGEST_LIMIT = 10;
/** A longer «query» is not a typo of a title; no suggestion is looked up. */
export const SUGGEST_MAX_QUERY = 100;

export type SuggestSection = 'laws' | 'precedents' | 'feqh';

export interface TitleSuggestion {
  section: SuggestSection;
  id: string;
  title: string;
  /** The document's own page. */
  href: string;
  /** A repealed law (listed after the laws in force). */
  repealed: boolean;
}

const REPEALED = new Set(['repealed', 'ملغى', 'ملغي', 'ملغاة']);

function hrefFor(section: SuggestSection, id: string): string {
  const slug = encodeURIComponent(id);
  if (section === 'laws') return `/laws/${slug}`;
  if (section === 'precedents') return `/precedents/${slug}`;
  return `/book/${slug}`;
}

export function suggestionsFromRows(rows: unknown): TitleSuggestion[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const out: TitleSuggestion[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const section = r.section;
    if (section !== 'laws' && section !== 'precedents' && section !== 'feqh') continue;
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    const title = typeof r.title === 'string' ? r.title.replace(/\s+/g, ' ').trim() : '';
    if (!id || !title) continue;
    const key = `${section}\u0000${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const status = typeof r.status === 'string' ? r.status.trim().toLowerCase() : '';
    out.push({ section, id, title, href: hrefFor(section, id), repealed: section === 'laws' && REPEALED.has(status) });
    if (out.length >= SUGGEST_LIMIT) break;
  }
  return out;
}
