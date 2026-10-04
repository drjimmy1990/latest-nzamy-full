/**
 * likePattern.ts — make a user-supplied string safe as a LITERAL inside a
 * PostgREST `like` / `ilike` filter.
 *
 * PostgREST rewrites `*` to `%` and hands the value to SQL (I)LIKE, where `%`
 * and `_` are wildcards and `\` is the escape character. An e-mail address is a
 * literal, so every one of those characters is escaped; otherwise an owner
 * posting `{"email":"ahmed%@%"}` to an invite endpoint turns the lookup into an
 * enumeration oracle over other accounts (review 2026-09-20, MUST FIX 1).
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_*]/g, (c) => `\\${c}`);
}
