/**
 * The edge routing tables — who may load which prefix, and which API prefixes
 * demand a session.
 *
 * These two tables used to live inside `src/proxy.ts`. That file imports
 * `next/server`, so nothing could test it: every claim about who is allowed
 * where was a claim about a file no test could import. Both tables are pure
 * data plus a prefix match, so they live here and `proxy.ts` reads them.
 *
 * Nothing in this module performs I/O, reads a session, or decides anything
 * about a *particular* user. It answers "what does this path require", and the
 * proxy compares that against the `profiles.user_type` it read.
 */

import { DB_USER_TYPES, type DbUserType } from "./userTypes.ts";

// ─── Route → required userTypes ──────────────────────────────────────────────
//
// The types below are `profiles.user_type` values, read from the database — not
// from `auth.user_metadata`, which an OAuth provider never writes.
//
// ORDER MATTERS. `allowedTypesFor` returns the FIRST entry whose prefix
// matches, so a narrower prefix must come before the broader one it sits
// under. The three `/dashboard/client/...` entries below are exactly that
// case, and putting them after `/dashboard/client` would silently disable
// them.
export interface RouteAccessRule {
  prefix: string;
  allowedTypes: readonly DbUserType[];
}

/**
 * The intake path a corporate account shares with an individual client.
 *
 * Owner ruling س٢, 26 August: «الشركة تستخدم نفس النموذج ذي الثلاث خطوات» —
 * a company files a request through the same three-step form, not a second one
 * built beside it. The form was already account-type aware (it stamps
 * `requester.role` from the caller's own user_type and the queue renders an
 * «منشأة تجارية» badge for it), and owner item ٧ made corporate identity
 * persist. The only thing standing between a company and an order was this
 * table: `/dashboard/client` was restricted to `individual`, and every working
 * intake form in the app lives under that prefix.
 *
 * Scoped to the three intake subtrees rather than opening `/dashboard/client`
 * wholesale. A company must not land in an individual's dashboard, cases,
 * wallet, referral programme or personal document store — those are a
 * different account's screens, and several of them read individual-only data.
 *
 *   /services      — the catalogue the order is chosen from
 *   /requests      — the three-step form AND «طلباتي», where its answer arrives
 *   /consultation  — the booking wizard; four of the priced services are
 *                    consultations, so withholding it would leave a company
 *                    able to order documents but not to speak to anyone
 */
const CLIENT_INTAKE_PREFIXES = [
  "/dashboard/client/services",
  "/dashboard/client/requests",
  "/dashboard/client/consultation",
] as const;

export const ROUTE_ACCESS: readonly RouteAccessRule[] = [
  { prefix: "/dashboard/lawyer", allowedTypes: ["lawyer"] },
  { prefix: "/dashboard/firm", allowedTypes: ["firm"] },

  // The shared intake — listed BEFORE /dashboard/client, which would otherwise
  // match first and refuse the corporate account these three exist for.
  ...CLIENT_INTAKE_PREFIXES.map((prefix) => ({
    prefix,
    allowedTypes: ["individual", "corporate"] as const,
  })),

  { prefix: "/dashboard/client", allowedTypes: ["individual"] },
  { prefix: "/dashboard/business", allowedTypes: ["corporate"] },
  { prefix: "/dashboard/micro", allowedTypes: ["micro"] },
  { prefix: "/dashboard/provider", allowedTypes: ["provider"] },
  { prefix: "/dashboard/government", allowedTypes: ["government"] },
  { prefix: "/dashboard/ngo", allowedTypes: ["ngo"] },

  // /dashboard/admin had no rule here, so this middleware had no opinion on the
  // highest-privilege prefix in the app: any signed-in user could load the
  // route's HTML and JavaScript. No admin data was exposed by that — every admin
  // API goes through requireAdmin() (src/lib/access-control.ts:101-120) — and the
  // layout renders a refusal instead of the page (UserTypeGuard,
  // src/app/dashboard/admin/layout.tsx:14), but that check runs in the browser
  // after the page is served. This rule makes the same decision at the edge.
  //
  // `admin` here is a value being CHECKED, never one being assigned: nothing in
  // this file writes user_type. What this entry actually does is refuse
  // everyone whose profiles.user_type is not 'admin'. The admin itself never
  // reaches the comparison — the `isAdmin` short-circuit in the proxy's Gate 2
  // answers first — so the value is spelled out to say who the prefix is for,
  // not because this list is what lets the admin in.
  { prefix: "/dashboard/admin", allowedTypes: ["admin"] },
];

/**
 * The rule governing `pathname`, or `null` when no rule covers it.
 *
 * Returns the whole rule rather than just the type list so a caller can report
 * which prefix answered.
 */
export function routeAccessRuleFor(pathname: string): RouteAccessRule | null {
  return ROUTE_ACCESS.find((rule) => pathname.startsWith(rule.prefix)) ?? null;
}

/** True when `userType` may load `pathname`. A path with no rule is open. */
export function isRouteAllowedFor(pathname: string, userType: string | null): boolean {
  const rule = routeAccessRuleFor(pathname);
  if (!rule) return true;
  if (userType === null) return false;
  return (rule.allowedTypes as readonly string[]).includes(userType);
}

// ─── Protected API prefixes (require an authenticated session) ───────────────
//
// Defense-in-depth: unauthenticated hits get a JSON 401 at the edge; per-endpoint
// role authorization is enforced by assertRole()/requireAdmin() in the handlers.
//
// EVERY ENTRY ENDS IN A SLASH, and that is the whole point of this list being
// here with a test beside it. The prefixes used to be written bare —
// `"/api/v1/lawyer"` — and matched with `startsWith`, which also matches
// `/api/v1/lawyers`. That is the PUBLIC lawyer directory: two routes
// (src/app/api/v1/lawyers/route.ts and .../[id]/route.ts) that deliberately use
// the service-role client precisely so a logged-out visitor can read them, with
// their own hand-written allow-list projection instead of RLS. The edge answered
// both with `{"error":"Unauthorized"}` before the handler ever ran, so the
// public directory was 401 for the public — verified against production on
// 2026-08-27. A trailing slash cannot collide with a sibling segment.
//
// There is no route file at `/api/v1/lawyer`, `/api/v1/admin` or `/api/v1/firm`
// itself (only subtrees), so requiring the slash withholds protection from
// nothing that exists. `matchesProtectedApiPrefix` still matches the bare path
// exactly, so adding one later is covered from the moment it is created.
export const PROTECTED_API_PREFIXES = [
  "/api/v1/lawyer/",
  "/api/v1/admin/",
  "/api/v1/firm/",
] as const;

/** True when `pathname` sits inside one of the protected API subtrees. */
export function isProtectedApiPath(
  pathname: string,
  prefixes: readonly string[] = PROTECTED_API_PREFIXES,
): boolean {
  return prefixes.some((prefix) => {
    if (pathname.startsWith(prefix)) return true;
    // The subtree root itself, written without the trailing slash.
    return pathname === prefix.slice(0, -1);
  });
}

/** Re-exported so a test can assert every allowed type is a real DB value. */
export { DB_USER_TYPES };
