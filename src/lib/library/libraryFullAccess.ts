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

/**
 * Owner item 9 (batch l8): true only for a 2xx whose body says
 * `accountLocked: true` — the library is locked for this account's type. A
 * failed read is false (the menu keeps its library row; the pages themselves
 * show the lock, and the server enforces it).
 */
export function parseLibraryAccountLocked(ok: boolean, body: unknown): boolean {
  if (!ok || typeof body !== "object" || body === null) return false;
  return (body as { accountLocked?: unknown }).accountLocked === true;
}

/** Register 14 item 48: a library subscriber below the points minimum (the route's `pointsLock`). */
export interface LibraryAccessPointsLock {
  message: string;
  balance: number;
  minPoints: number;
  topupHref: string;
}

/**
 * LIVE-10 (batch l19): the `pointsLock` of a 2xx answer — {message, balance,
 * minPoints, topupHref} — or null (no lock, an odd body, a failed read; the
 * server is the enforcement). The link must be a same-site path; anything
 * else falls back to the price page, as useLibraryStatus reads the same field.
 * An account locked by type has no points lock (the route sends null then).
 */
export function parseLibraryPointsLock(ok: boolean, body: unknown): LibraryAccessPointsLock | null {
  if (!ok || typeof body !== "object" || body === null) return null;
  if ((body as { accountLocked?: unknown }).accountLocked === true) return null;
  const v = (body as { pointsLock?: unknown }).pointsLock;
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const lock = v as Record<string, unknown>;
  if (typeof lock.message !== "string" || lock.message.trim() === "") return null;
  const balance = lock.balance;
  const minPoints = lock.minPoints;
  if (typeof balance !== "number" || !Number.isFinite(balance) || typeof minPoints !== "number" || !Number.isFinite(minPoints)) return null;
  const topupHref = typeof lock.topupHref === "string" && /^\/(?!\/)/.test(lock.topupHref) ? lock.topupHref : "/pricing";
  return { message: lock.message, balance, minPoints, topupHref };
}
