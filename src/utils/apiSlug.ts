/**
 * apiSlug — turn a route param into exactly one correctly-encoded path segment.
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * `useParams()` hands back the RAW path segment, still percent-encoded. Client
 * pages then built their API URL with `encodeURI(slug)` — and `encodeURI`
 * escapes `%` itself, so an already-encoded slug is encoded a second time:
 *
 *     encodeURI('%D9%85')            === '%25D9%2585'   ← wrong, 404
 *     encodeURIComponent('%D9%85')   === '%25D9%2585'   ← same trap
 *
 * The library's fiqh books are keyed by their Arabic title
 * (`feqh_books.id = "الأسس العامة للعقود الإدارية - دراسة مقارنة"`), so every
 * one of the 144 book pages requested a `%25…` URL and got a 404 — the reader
 * showed "عفواً، الكتاب غير موجود" for the entire fiqh section. Law, decree and
 * precedent slugs are ASCII transliterations, so the same call was harmless
 * there and the bug stayed hidden.
 *
 * Decoding first and then encoding once is correct for BOTH shapes, because
 * decoding a slug that is already plain text is a no-op:
 *
 *     apiSlug('%D9%85%D8%B5')  === '%D9%85%D8%B5'
 *     apiSlug('مص')            === '%D9%85%D8%B5'
 */

/**
 * decodeURIComponent throws on a malformed sequence (a bare `%`, `%zz`). A slug
 * is user-controlled via the URL bar, so a throw here would blank the page.
 * Falling back to the input treats it as already-decoded, which is the safe
 * reading — worst case the request 404s, exactly as it would have anyway.
 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Encode a route param for use as a single API path segment.
 *
 * @param slug value from `useParams()` — encoded or plain, both are handled.
 */
export function apiSlug(slug: string | string[] | undefined | null): string {
  if (slug === undefined || slug === null) return '';
  const raw = Array.isArray(slug) ? slug.join('/') : slug;
  return encodeURIComponent(safeDecode(raw));
}
