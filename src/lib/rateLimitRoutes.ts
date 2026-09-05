/**
 * src/lib/rateLimitRoutes.ts — the pure "which bucket, if any, applies to
 * this (method, pathname)" tables for the proxy's rate limiter.
 *
 * This lives beside src/lib/rateLimit.ts rather than inside src/proxy.ts for
 * the same reason src/lib/auth/routeAccess.ts was split out of that file:
 * proxy.ts imports next/server, so nothing can import proxy.ts itself to pin
 * a claim about which paths are rate-limited — the claim would be untestable.
 * These two functions perform no I/O and read nothing but their own
 * arguments; src/proxy.ts imports both and reads no table of its own.
 */

// POST-only, matched against `pathname`. Dynamic segments ([token]/[code])
// are matched with a single-segment wildcard, not a literal value.
export const STRICT_RATE_LIMITED_ROUTES: readonly RegExp[] = [
  /^\/api\/v1\/share\/[^/]+\/verify$/, // POST /api/v1/share/[token]/verify
  /^\/api\/v1\/library\/invitations\/redeem$/, // POST /api/v1/library/invitations/redeem
  /^\/api\/v1\/invite\/[^/]+\/accept$/, // POST /api/v1/invite/[code]/accept
  /^\/api\/v1\/contact$/, // POST /api/v1/contact
];

export const GENERAL_RATE_LIMITED_METHODS: ReadonlySet<string> = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

/** True when `method` + `pathname` is one of the four strict-bucket POST actions. */
export function isStrictRateLimitedRoute(method: string, pathname: string): boolean {
  return method === "POST" && STRICT_RATE_LIMITED_ROUTES.some((re) => re.test(pathname));
}

/**
 * True for any mutating request (POST/PUT/PATCH/DELETE) under /api/v1, except
 * the /api/v1/cron/* and /api/v1/n8n/* subtrees — hit only by this app's own
 * scheduled job and by the n8n automation backend respectively, never by a
 * browser.
 *
 * Subtree match only (`/api/v1/cron/`, trailing slash), not the bare
 * `/api/v1/cron` or `/api/v1/n8n` path — mirroring the trailing-slash
 * reasoning in src/lib/auth/routeAccess.ts. Verified against the actual route
 * tree rather than assumed: there is no route file at either bare path today
 * (only src/app/api/v1/cron/deadlines/route.ts and
 * src/app/api/v1/n8n/{callback,trigger}/route.ts), so the trailing-slash form
 * excludes everything that exists under both subtrees. If a route is ever
 * added directly at `/api/v1/cron` or `/api/v1/n8n` (no further segment), it
 * would NOT match either exclusion and so WOULD be rate-limited by the
 * general bucket — re-check this the day one is added.
 */
export function isGeneralRateLimitedApiPath(method: string, pathname: string): boolean {
  if (!GENERAL_RATE_LIMITED_METHODS.has(method)) return false;
  if (!pathname.startsWith("/api/v1/")) return false;
  if (pathname.startsWith("/api/v1/cron/")) return false;
  if (pathname.startsWith("/api/v1/n8n/")) return false;
  return true;
}
