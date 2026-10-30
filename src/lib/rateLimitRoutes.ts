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

// POST /api/v1/coupons/validate (P7) answers whether a coupon code exists for
// this buyer — a guessing oracle. Its own bucket, not the strict one: the
// strict bucket is shared per address by the four routes above, so ten coupon
// tries would also lock a visitor out of the contact form and invite
// acceptance. The proxy's bucket is only a per-address ceiling (X-Real-IP);
// the real budget is per signed-in user inside the route
// (src/lib/payments/couponAttempts.ts), and checkout's coupon refusals spend
// the same budget, so guessing through checkout is limited too. Checkout
// itself stays in the general bucket at the proxy.
export const COUPON_VALIDATE_RE = /^\/api\/v1\/coupons\/validate$/;

/** True for POST /api/v1/coupons/validate. */
export function isCouponValidateRoute(method: string, pathname: string): boolean {
  return method === "POST" && COUPON_VALIDATE_RE.test(pathname);
}

// The law reader, search, scoped search and autocomplete read article text with the service
// role since 20260929_01 (article text is server-only), which also drops the
// database's anon statement timeout. A per-client ceiling keeps one client
// from walking the corpus or queueing slow searches (plan P0-27).
// Search is a POST (search/route.ts exports only POST); the others are GETs.
export const LIBRARY_READ_RATE_LIMITED_ROUTES: ReadonlyArray<{ method: string; re: RegExp }> = [
  { method: "POST", re: /^\/api\/library\/search$/ }, // POST /api/library/search
  { method: "GET", re: /^\/api\/library\/autocomplete$/ }, // GET /api/library/autocomplete
  { method: "GET", re: /^\/api\/library\/laws\/[^/]+$/ }, // GET /api/library/laws/[slug]
  // N2.6: search inside one law / collection series / book series — the
  // same server-only text, read as the service role.
  { method: "POST", re: /^\/api\/library\/scoped-search$/ }, // POST /api/library/scoped-search
];

/** True for a request to one of the article-text library routes above. */
export function isLibraryReadRateLimitedRoute(method: string, pathname: string): boolean {
  return LIBRARY_READ_RATE_LIMITED_ROUTES.some((r) => r.method === method && r.re.test(pathname));
}

// Owner note ١٣ C03: EVERY library route, the library invitations and the
// library AI are under a per-visitor budget — not only the four article-text
// routes above. Four extra buckets, each paired in src/proxy.ts with a wider
// ceiling on the proxy-resolved IP (CF-Connecting-IP alone is forgeable by
// anyone reaching the origin directly):
//   library-any   every method under /api/library/ and /api/v1/library/ — a
//                 catch-all, so a route added later (search/suggest,
//                 folders/titles, v1/library/my-grant on the open library
//                 branch) is covered from the day it exists. Folder writes
//                 live under /api/library/, outside the general /api/v1 bucket.
//   library-doc   GET of one document: laws/[slug], books/[slug],
//                 precedents/[slug], decrees/[id] (the heavy reads; the
//                 durable per-user quota, src/lib/library/readQuota.ts, is
//                 counted on the same four)
//   library-init  GET /api/library/init — the catalogue, up to 200 rows a page
//   library-ai    every /api/ai/* route (explain-article, library-chat today)
// /api/v1/library/invitations/redeem keeps the strict bucket as well.
export type LibraryBudgetBucket = "library-any" | "library-doc" | "library-init" | "library-ai";

export const LIBRARY_ANY_RE = /^\/api\/(?:v1\/)?library(?:\/|$)/;
export const LIBRARY_DOC_RE = /^\/api\/library\/(?:laws|books|precedents|decrees)\/[^/]+$/;
export const LIBRARY_INIT_RE = /^\/api\/library\/init$/;
export const LIBRARY_AI_RE = /^\/api\/ai(?:\/|$)/;

/** The note-١٣ buckets this request counts against (empty: none). Every method. */
export function libraryBudgetBuckets(method: string, pathname: string): LibraryBudgetBucket[] {
  const m = method.toUpperCase();
  const out: LibraryBudgetBucket[] = [];
  if (LIBRARY_ANY_RE.test(pathname)) out.push("library-any");
  if ((m === "GET" || m === "HEAD") && LIBRARY_DOC_RE.test(pathname)) out.push("library-doc");
  if ((m === "GET" || m === "HEAD") && LIBRARY_INIT_RE.test(pathname)) out.push("library-init");
  if (LIBRARY_AI_RE.test(pathname)) out.push("library-ai");
  return out;
}

// The client's case tracking page (N3.6, /track/[token]) is public and keyed
// only by an unguessable 256-bit token. A per-client ceiling keeps a script
// from walking tokens or hammering the service-role read behind it; a client
// opening his link a few times a day never comes near it. GET and HEAD.
export const TRACKING_PAGE_RE = /^\/track\/[^/]+$/;

/** True for a GET/HEAD of /track/<one segment>. */
export function isTrackingPageRoute(method: string, pathname: string): boolean {
  return (method === "GET" || method === "HEAD") && TRACKING_PAGE_RE.test(pathname);
}

// The client's 4-digit check on a tracking link (D2, owner ٢٧٦). The database
// locks a link after 5 wrong tries; this pair of buckets caps one visitor
// walking many links. It is NOT the strict bucket: that one keys on the
// proxy-resolved IP alone, which may be one Cloudflare edge shared by many
// clients (see libraryReadClientKey), so the proxy keys it like the tracking
// page — the visitor key plus a wider per-IP ceiling. POST only.
export const TRACKING_UNLOCK_RE = /^\/api\/v1\/track\/[^/]+\/unlock$/;

/** True for a POST of /api/v1/track/<one segment>/unlock. */
export function isTrackingUnlockRoute(method: string, pathname: string): boolean {
  return method === "POST" && TRACKING_UNLOCK_RE.test(pathname);
}

// «تحميل الكل (ZIP)» (D3, owner ٢٥٦): one GET reads up to 200 files / 500 MB
// out of Storage, so it gets its own bucket — the general bucket counts only
// writes. Keyed like the tracking buckets (visitor key plus a wider per-IP
// ceiling), for the same shared-edge reason. The exact path only.
export const ATTACHMENTS_ZIP_RE = /^\/api\/v1\/attachments\/zip$/;

/** True for a GET/HEAD of /api/v1/attachments/zip. */
export function isAttachmentsZipRoute(method: string, pathname: string): boolean {
  return (method === "GET" || method === "HEAD") && ATTACHMENTS_ZIP_RE.test(pathname);
}

/**
 * The key for the library-read bucket. nezamy.sa is served through Cloudflare
 * (Server: cloudflare, CF-RAY on every response, 2026-09-29), and nothing in
 * the repo shows nginx restoring the visitor's address — so X-Real-IP may be a
 * Cloudflare edge shared by many readers, and one busy edge would throttle
 * them all. Cloudflare puts the visitor's address in CF-Connecting-IP; prefer
 * it here. A client that reaches the origin directly can forge the header,
 * which only lets it pick its own bucket — no worse than rotating addresses.
 */
export function libraryReadClientKey(
  getHeader: (name: string) => string | null | undefined,
  fallback: string,
): string {
  const cf = getHeader("cf-connecting-ip");
  if (cf && cf.trim() !== "") return cf.trim().slice(0, 64);
  return fallback;
}

/**
 * Exact paths outside the general bucket. POST /api/v1/payments/webhook is hit
 * only by Moyasar's servers (a few shared addresses, retrying each event up to
 * six times) and is guarded by the webhook secret instead. The exact path only
 * — the rest of /api/v1/payments/ (checkout included) stays limited.
 */
export const RATE_LIMIT_EXEMPT_API_PATHS: ReadonlySet<string> = new Set([
  "/api/v1/payments/webhook",
  // n8n's AI job results (20261027_10): one address, key-authenticated;
  // throttling it would leave paid runs to time out and be refunded.
  "/api/v1/ai/callback",
]);

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
 *
 * Exact paths in RATE_LIMIT_EXEMPT_API_PATHS (above) are excluded too.
 */
export function isGeneralRateLimitedApiPath(method: string, pathname: string): boolean {
  if (!GENERAL_RATE_LIMITED_METHODS.has(method)) return false;
  if (!pathname.startsWith("/api/v1/")) return false;
  if (pathname.startsWith("/api/v1/cron/")) return false;
  if (pathname.startsWith("/api/v1/n8n/")) return false;
  if (RATE_LIMIT_EXEMPT_API_PATHS.has(pathname)) return false;
  return true;
}
