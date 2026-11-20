/**
 * caseSearchFilter.ts — T10-F5 (batch l11): the case list's search box runs on
 * the server.
 *
 * Paging was already server-side (GET /api/v1/service-requests, «تحميل
 * المزيد»), but the search box filtered only the rows already loaded, so a case
 * past the first page could never be found. `?q=` now narrows the query itself
 * on the three fields the box always searched: the title, the client's name
 * (`requester.name`) and the court (`metadata.court`).
 *
 * The term goes into a PostgREST `or=(…)` logic tree. Every value is wrapped in
 * double quotes (so a comma, a dot or a parenthesis in the term cannot open a
 * new condition), and the characters that would still act there — the quote
 * and the backslash — are dropped, as are the LIKE wildcards `%`, `_`, `*`, so
 * the term is matched literally as a substring. Case-insensitive (`ilike`).
 *
 * Pure (no imports), so `node --test` loads it. The pages normalise with the
 * same function, so a term the server ignores is ignored on screen too.
 */

/** Longest term sent to the server (a pasted paragraph is cut, not refused). */
export const CASE_SEARCH_MAX_LENGTH = 80;

/** The fields the box searches, as PostgREST column paths. */
export const CASE_SEARCH_FIELDS = ["title", "requester->>name", "metadata->>court"] as const;

/** The term as it will be searched: trimmed, wildcards/quotes dropped, spaces collapsed, capped. */
export function normalizeCaseSearch(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[%_*"\\]/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CASE_SEARCH_MAX_LENGTH)
    .trim();
}

/**
 * The value for `query.or(…)`, or null when there is nothing to search.
 * Example: `title.ilike."*عقد*",requester->>name.ilike."*عقد*",metadata->>court.ilike."*عقد*"`.
 */
export function caseSearchOrFilter(raw: unknown): string | null {
  const term = normalizeCaseSearch(raw);
  if (!term) return null;
  return CASE_SEARCH_FIELDS.map((field) => `${field}.ilike."*${term}*"`).join(",");
}

/**
 * The ownership filter (a comma list for `query.or`) with the search ANDed in,
 * as ONE logic tree: `and(or(<own>),or(<search>))` — never two `or=` params,
 * so nothing depends on how PostgREST combines repeated keys. No term → the
 * ownership filter unchanged.
 */
export function withCaseSearch(ownOrFilter: string, raw: unknown): string {
  const search = caseSearchOrFilter(raw);
  return search ? `and(or(${ownOrFilter}),or(${search}))` : ownOrFilter;
}

/** The same match on a loaded row, for the instant narrowing on screen (case-insensitive). */
export function caseMatchesSearch(row: { title: string; client: string; court: string }, raw: unknown): boolean {
  const term = normalizeCaseSearch(raw).toLocaleLowerCase();
  if (!term) return true;
  return [row.title, row.client, row.court].some((v) => (v ?? "").toLocaleLowerCase().includes(term));
}
