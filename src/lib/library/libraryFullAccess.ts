/**
 * The client's reading of GET /api/v1/library/access (src/app/api/v1/library/
 * access/route.ts): does the signed-in viewer have the full library? The rule
 * is the server's (a Pro+ tier, an active library grant, or an admin; owner
 * ٢٠٥/٢٠٩), not the client's tier-only feature gate.
 *
 * Pure (no "@/…" imports) so node --test can load it; the hook is
 * ./useLibraryFullAccess.ts.
 */

export const LIBRARY_ACCESS_ENDPOINT = "/api/v1/library/access";

/**
 * True only for a 2xx whose body says `hasFullAccess: true`. Anything else (a
 * 503 because the session could not be checked, a network error, an odd body)
 * is false, so the redeem offer shows: what a user without the full library
 * sees today.
 */
export function parseLibraryAccessResponse(ok: boolean, body: unknown): boolean {
  if (!ok || typeof body !== "object" || body === null) return false;
  return (body as { hasFullAccess?: unknown }).hasFullAccess === true;
}
