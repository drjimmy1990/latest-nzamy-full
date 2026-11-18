/**
 * challengeClient.ts — the pure rules LibraryChallengeHost applies to the
 * browser's fetch: which requests are library API calls, and which answers
 * ask for the Turnstile challenge (src/proxy.ts applyLibraryPublicGuard).
 *
 * Pure, relative imports only (`node --test` loads it); no imports at all so
 * the client bundle gains nothing.
 */

export const CHALLENGE_HEADER = "x-library-challenge";
export const CHALLENGE_PATH = "/api/library/challenge";

const LIBRARY_API_RE = /^\/api\/(?:v1\/)?library(?:\/|$)/;

/** The same-origin library API path of a fetch input, or null for anything else. */
export function libraryApiPath(input: unknown, origin: string): string | null {
  let raw: string | null = null;
  if (typeof input === "string") raw = input;
  else if (input && typeof input === "object") {
    const o = input as { href?: unknown; url?: unknown };
    if (typeof o.href === "string") raw = o.href;
    else if (typeof o.url === "string") raw = o.url;
  }
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  if (!LIBRARY_API_RE.test(url.pathname)) return null;
  if (url.pathname === CHALLENGE_PATH) return null;
  return url.pathname;
}

/** True when this answer is the guard asking for a human check. */
export function asksForChallenge(res: { status: number; headers: { get(name: string): string | null } }): boolean {
  return res.status === 429 && res.headers.get(CHALLENGE_HEADER) === "required";
}
