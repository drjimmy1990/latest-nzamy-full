/**
 * Keep a redirect target on this site. Used by src/app/auth/callback/route.ts
 * for its `?next=` override before it goes into a relative Location header.
 *
 * Browsers strip tabs and newlines from a URL before resolving it, and treat
 * "\" like "/", so a prefix check alone is not enough: "/\t/evil.example"
 * starts with a single "/" yet lands on https://evil.example. Anything with a
 * control character or a backslash is refused outright, and what is left must
 * still resolve to the same origin as a dummy base.
 */
const BASE = "https://same-origin.invalid";

export function safeLocalPath(candidate: string | null | undefined, fallback: string): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  if (/[\u0000-\u001F\u007F\\]/.test(candidate)) return fallback;
  let resolved: URL;
  try {
    resolved = new URL(candidate, BASE);
  } catch {
    return fallback;
  }
  if (resolved.origin !== BASE) return fallback;
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
