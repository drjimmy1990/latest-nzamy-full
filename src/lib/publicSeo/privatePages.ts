/**
 * privatePages.ts — the pages a search engine must not index (owner message
 * 18 Nov, item 4.3; SEO audit ع2): dashboards, sign-in and registration
 * flows, the admin console, settings, payment results, token links and every
 * page src/proxy.ts sends a guest to /login from.
 *
 * One list, three uses:
 *   - next.config.ts sends `X-Robots-Tag: noindex, follow` on every path
 *     under it (privateRobotsHeaderRules) — this reaches the client pages that
 *     have no server layout of their own, and crawlers that read no HTML;
 *   - the server layouts of the top-level private sections print the same
 *     rule as `<meta name="robots">` (PRIVATE_ROBOTS);
 *   - src/app/sitemap.ts drops any listed path (isPrivatePath), and
 *     privatePages.test.ts fails if the sitemap source names one.
 *
 * noindex + follow: the page stays out of the index, its links still count.
 * Do not add more of these paths to robots.txt's Disallow (/dashboard/ and a
 * few /ai/ pages already are): a crawler that may not fetch a page never
 * reads its noindex.
 *
 * Pure: no imports, so next.config.ts and `node --test` load it.
 */

export const PRIVATE_PATH_PREFIXES: readonly string[] = Object.freeze([
  // Accounts, dashboards (the admin console is /dashboard/admin), settings.
  "/dashboard",
  "/settings",
  "/notifications",
  "/onboarding",
  "/account-frozen",
  "/account-suspended",
  // Sign-in and registration flows.
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/demo-login",
  "/verify",
  "/invite",
  "/group",
  // Payment.
  "/checkout",
  "/payments",
  // Token links and a member's own records.
  "/track",
  "/share",
  "/review",
  "/cases",
  "/laws/my",
  "/academy/my-courses",
  "/academy/certificates",
  "/services/lawyers/vault",
  // Every sign-in page of src/proxy.ts's PROTECTED list (privatePages.test.ts
  // reads that list and fails on one missing here).
  "/ai/settings",
  "/ai/quick-answer",
  "/ai/vault",
  "/ai/share-history",
  "/ai/secretary",
  "/ai/legal-opinion",
  "/ai/fee-calculator",
  "/ai/report-generator",
  "/ai/tracker",
  "/ai/draft",
  "/ai/direction-support",
  "/ai/contracts",
  "/ai/wargaming",
  "/ai/runs",
  "/ai/contract-negotiator",
  "/ai/contract-drafter",
  "/ai/simple-contract",
  "/ai/analyze-strength",
  "/ai/najiz-optimizer",
  "/ai/brief-check",
  "/ai/communicate",
  "/ai/assistant",
  "/ai/corp",
  "/ai/consult",
  "/ai/templates",
  "/marketplace/post",
  "/marketplace/order",
  "/marketplace/workspace",
  "/marketplace/collaborate",
]);

/** The X-Robots-Tag value and the <meta name="robots"> rule of a private page. */
export const PRIVATE_ROBOTS_HEADER = "noindex, follow";
export const PRIVATE_ROBOTS = Object.freeze({ index: false, follow: true });

/** The path part of a URL or path: no origin, query or hash; no trailing slash (except "/"). */
function pathOf(urlOrPath: string): string {
  let p = String(urlOrPath ?? "");
  p = p.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, "");
  p = p.split(/[?#]/)[0] || "/";
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}

/** True for a listed prefix itself or anything under it — segment-wise (/login, /login/x; never /loginx). */
export function isPrivatePath(urlOrPath: string): boolean {
  const p = pathOf(urlOrPath);
  return PRIVATE_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/** next.config.ts headers(): the prefix itself and everything under it. */
export function privateRobotsHeaderRules(): Array<{ source: string; headers: Array<{ key: string; value: string }> }> {
  const headers = [{ key: "X-Robots-Tag", value: PRIVATE_ROBOTS_HEADER }];
  return PRIVATE_PATH_PREFIXES.flatMap((prefix) => [
    { source: prefix, headers },
    { source: `${prefix}/:path*`, headers },
  ]);
}
