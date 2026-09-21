import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { needsOnboarding } from "@/lib/auth/onboardingGate";
import {
  dashboardPathFor,
  isDbUserType,
  FALLBACK_DASHBOARD_PATH,
} from "@/lib/auth/userTypes";
// Both tables moved to src/lib/auth/routeAccess.ts so they could be tested:
// this file imports next/server, so nothing could import it to make a claim
// about who is allowed where. See routeAccess.test.ts for what is pinned.
import { routeAccessRuleFor, isProtectedApiPath } from "@/lib/auth/routeAccess";
// Gate 2 asks this which membership table (if any) can additionally open a
// path. Pure — it imports routeAccess and nothing else — so it is safe in the
// edge bundle, and it is the SAME function the browser guard's membership
// arms read, which is what keeps the two gates from drifting apart.
import { entityMembershipKindForPath } from "@/lib/auth/entityMembership";
import { resolveAuthOutcome, AUTH_UNAVAILABLE_AR } from "@/lib/auth/resolveAuthOutcome";
import { isSupabaseMode, isDemoMode } from "@/lib/runtimeMode";
import {
  RateLimiter,
  resolveClientIp,
  type RateLimitDecision,
  type RateLimitPolicy,
} from "@/lib/rateLimit";
import {
  isStrictRateLimitedRoute,
  isGeneralRateLimitedApiPath,
} from "@/lib/rateLimitRoutes";
import { hasValidSaudiMobile } from "@/lib/services/saudiMobile";

// ─── Rate limiting (owner item ١٧٢) ─────────────────────────────────────────
//
// Before this, the only rate limiting anywhere in the app was a private,
// best-effort per-IP throttle inside one route
// (src/app/api/v1/leads/business-assessment/route.ts) — every other write
// endpoint, auth-adjacent or not, had none. This section is the first step of
// `proxy()` (see the call inside the function body) and applies to matching
// requests only; see src/lib/rateLimit.ts for the limiter itself, what its
// storage guarantee actually is, and why.
//
// Two buckets, both per client IP:
//   • "strict" — 10 requests per 10 minutes — on four sensitive POST actions
//     that a script could otherwise hammer: redeeming a share/invite/invitation
//     token, or spamming the public contact form.
//   • "general" — 120 requests per minute — on every mutating request
//     (POST/PUT/PATCH/DELETE) under /api/v1, except /api/v1/cron/* (hit only
//     by this app's own scheduled job, never a browser) and /api/v1/n8n/*
//     (hit only by the n8n automation backend, likewise never a browser).
// A request matching the strict list is checked against BOTH buckets — the
// strict bucket protects it specifically, the general bucket still counts it
// toward that IP's overall write budget, exactly as any other mutating
// /api/v1 call would be.
const rateLimiter = new RateLimiter();

const STRICT_RATE_LIMIT: RateLimitPolicy = { windowMs: 10 * 60 * 1000, max: 10 };
const GENERAL_RATE_LIMIT: RateLimitPolicy = { windowMs: 60 * 1000, max: 120 };

// The actual route tables (which paths/methods match which bucket) live in
// src/lib/rateLimitRoutes.ts, pure and tested on their own — see that file's
// header for why, same reasoning as src/lib/auth/routeAccess.ts above.

function rateLimitResponse(decision: RateLimitDecision): NextResponse {
  const response = NextResponse.json(
    { error: "طلبات كثيرة — حاول بعد قليل." },
    { status: 429 },
  );
  response.headers.set("Retry-After", String(decision.retryAfterSeconds));
  return response;
}

/**
 * Runs the rate limiter for `req` and returns a 429 response when a matching
 * bucket is exhausted, or `null` when the request should proceed unchanged —
 * whether because no bucket applies to it, or because every applicable
 * bucket still has room.
 *
 * FAILS OPEN. Any internal error here (a bug in this function, an unexpected
 * header shape) must never be the reason a real request is rejected — it is
 * caught and treated as "no bucket applies", identical to a path this limiter
 * was never meant to cover.
 */
function applyRateLimit(req: NextRequest, pathname: string): NextResponse | null {
  try {
    const method = req.method.toUpperCase();
    const isStrictMatch = isStrictRateLimitedRoute(method, pathname);
    const isGeneralMatch = isGeneralRateLimitedApiPath(method, pathname);

    if (!isStrictMatch && !isGeneralMatch) return null;

    const ip = resolveClientIp((name) => req.headers.get(name));

    if (isStrictMatch) {
      const decision = rateLimiter.check("strict", ip, STRICT_RATE_LIMIT);
      if (!decision.allowed) return rateLimitResponse(decision);
    }

    if (isGeneralMatch) {
      const decision = rateLimiter.check("general", ip, GENERAL_RATE_LIMIT);
      if (!decision.allowed) return rateLimitResponse(decision);
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Protected route prefixes (require authentication) ─────────────────────────
const PROTECTED = [
  "/dashboard",
  "/ai/settings",
  "/ai/vault",
  "/ai/secretary",
  "/ai/legal-opinion",
  "/ai/fee-calculator",
  "/ai/report-generator",
  "/ai/tracker",
  "/ai/draft",
  "/ai/direction-support",
  "/ai/contracts",
  "/ai/wargaming",
  "/settings",
  "/notifications",
  "/onboarding",
];

// ─── Deprecated route redirects ────────────────────────────────────────────────
const REDIRECTS: Record<string, string> = {
  "/ai/communicate":     "/ai/legal-opinion",
  "/ai/share-history":   "/settings",
  "/ai/corp/privacy":    "/ai/corp/compliance",
  "/dashboard/lawyer/ai/secretary": "/ai/secretary",
  "/law":                "/laws",
  "/law/":               "/laws",
};

// ─── Backend mode check ────────────────────────────────────────────────────────
// Was `process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND ?? "demo"` — one of five
// independent copies of that default. An unset variable therefore sent this
// file down the legacy cookie-name branch at the bottom, which looks for
// `nzamy_session` / `nzamy_demo_role`; a real Supabase login sets
// `sb-<ref>-auth-token*`, so every signed-in user was redirected to
// `/login?from=<path>` — the exact string in the UAT evidence. See
// docs/audits/2026-09-20-profiles-uat/02-auth-session-audit.md hypothesis H2.
// src/lib/runtimeMode.ts is now the only derivation: unset ⇒ "supabase",
// "demo" only outside production, anything else throws at module load.

// The edge runtime does not run src/instrumentation.ts (`register()` fires only
// where NEXT_RUNTIME === "nodejs"), so without this line a misconfigured
// production deploy would reach this file with no startup assertion having run
// at all. Module scope: it throws when the first request loads the proxy, not
// silently on the thousandth.
if (process.env.NODE_ENV === "production" && !isSupabaseMode) {
  throw new Error(
    '[proxy] NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND must resolve to "supabase" in production — ' +
      "refusing to serve the legacy cookie-name auth branch.",
  );
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 0. Rate limiting — first step, before anything else below, and only for
  //    requests a bucket above actually matches (see applyRateLimit). Every
  //    other request is unaffected: it returns null immediately and every
  //    existing behaviour beneath this point runs exactly as it did before.
  const rateLimited = applyRateLimit(req, pathname);
  if (rateLimited) return rateLimited;

  // 1. Handle deprecated route redirects (permanent 301)
  if (REDIRECTS[pathname]) {
    const url = req.nextUrl.clone();
    url.pathname = REDIRECTS[pathname];
    return NextResponse.redirect(url, 301);
  }

  // 1b. Protect sensitive API prefixes with a middleware-level JSON 401 when the
  //     session is missing (defense-in-depth on top of the handler assertRole()).
  if (isSupabaseMode && isProtectedApiPath(pathname)) {
    const apiResponse = NextResponse.next({ request: req });
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
            cookiesToSet.forEach(({ name, value, options }) =>
              apiResponse.cookies.set(name, value, options),
            );
          },
        },
      },
    );
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    // getUser() is a network round trip. Collapsing its transport failures into
    // `!user` is what turned an egress/TLS fault into a 401 across the app
    // (UAT-LIVE-SESSION-001): 503 says "ask again", 401 says "you are signed
    // out", and only one of those is true here.
    if (resolveAuthOutcome(user, authError) === "unavailable") {
      console.error("[auth] getUser transport failure (API branch)", {
        pathname,
        name: authError?.name,
        status: authError?.status,
        message: authError?.message,
      });
      return NextResponse.json({ error: AUTH_UNAVAILABLE_AR }, { status: 503 });
    }
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return apiResponse;
  }

  // 1c. /ai/orders redirect (owner item ١٠٠).
  //
  // This used to be a single permanent redirect in next.config.ts. It moved
  // here because next.config.ts's redirects() run BEFORE this file on every
  // request (Next's documented routing order: next.config headers → next.config
  // redirects → middleware/proxy → filesystem routes), so a rule left there
  // would answer every /ai/orders hit before the session-aware gates below
  // ever ran — this block would never run. See next.config.ts for the
  // Cache-Control header this split leaves in place and why.
  //
  // /ai/orders (bare) has no filesystem route any more — the list it
  // duplicated is «طلباتي» (/dashboard/client/requests) — so it always ends
  // in a redirect there, for every visitor, role included. This block is
  // deliberately role-AGNOSTIC: routeAccess.ts restricts that destination to
  // individual/corporate, but that is not this block's problem to solve —
  // Gate 2, a few dozen lines down in this same file, already answers "a
  // lawyer/firm/micro/provider/government/ngo account landed on a
  // /dashboard/* prefix it is not allowed on" by bouncing it to
  // `dashboardPathFor(that type)`, i.e. that role's OWN real dashboard home
  // (/dashboard/lawyer, /dashboard/firm, /dashboard/micro,
  // /dashboard/provider, /dashboard/government, /dashboard/ngo — all real,
  // built screens, not a «قريباً» template) rather than an error page. Two
  // redirects (browser: /ai/orders → /dashboard/client/requests → its own
  // dashboard) is the price of reusing that existing, already-tested
  // (routeAccess.test.ts) logic instead of duplicating a second role →
  // destination table here that could drift from it.
  //
  // An earlier version of this block looked up the caller's role directly
  // and sent lawyer/firm/micro/provider to a role-specific destination
  // instead of letting Gate 2 do it. That table is deleted: two of those four
  // destinations (`/dashboard/lawyer/marketplace`,
  // `/dashboard/firm/marketplace`) render nothing but a `DashboardComingSoon`
  // placeholder (src/components/marketplace/MyMarketplaceDashboard.tsx), and
  // the other two (`/dashboard/micro/requests`, `/dashboard/provider/requests`)
  // render hardcoded fixture rows unconditionally — routing a user AWAY from
  // their real, working dashboard home and INTO one of those would have been
  // a regression, not the fix owner item ١٠٠ asked for. No role has a real
  // "my AI orders" screen of its own yet; when one exists, point Gate 2's
  // `DASHBOARD_PATHS` (or a table here) at it instead.
  //
  // /ai/orders/[id] — the order-DETAIL screen, attachments and download link
  // included — is NEVER redirected by this block, for any role, and is not
  // in the PROTECTED list below either (unchanged from before this owner
  // item existed). It is not a stale link: legal-opinion, wargaming,
  // contracts and draft all send a signed-in user of ANY role straight to
  // `/ai/orders/${order.id}` the moment they submit a real order
  // (src/app/ai/legal-opinion/page.tsx:432,
  // src/app/ai/legal-opinion/_components/LetterWorkflow.tsx:198,
  // src/app/ai/wargaming/page.tsx:954, src/hooks/useContractsState.ts:228+285,
  // src/hooks/useDraftState.ts:169) — a live flow today for lawyer/firm
  // (navigation.sidebars.legal.ts:35-41) and micro/provider
  // (navigation.sidebars.business.ts:171-173), none of which routeAccess.ts
  // or PROTECTED restricts. Redirecting that path would drop the order id
  // and strand the user who just submitted a real order on a page with
  // nothing of theirs to show.
  if (pathname === "/ai/orders") {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard/client/requests";
    return NextResponse.redirect(url, 302);
  }

  // 2. Check if route requires authentication
  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  // ─── Supabase Mode: Real auth ──────────────────────────────────────────────
  if (isSupabaseMode) {
    // Next gives a server layout no way to ask which URL it is rendering, so
    // the pathname is stamped on the REQUEST here and read back with
    // `headers()` in src/components/auth/ServerSessionGate.tsx — that is how
    // /dashboard and /settings build `?from=<path>` when they redirect an
    // anonymous visitor to /login. Only PROTECTED pages reach this line, so no
    // public request carries it.
    //
    // `nextWithPathname()` replaces the bare `NextResponse.next({ request: req })`
    // this branch used at three points. It is the same forward: `{ request: req }`
    // reads `req.headers`, and `req.cookies.set()` in `setAll` below updates
    // that same Cookie header, so building `new Headers(req.headers)` at the
    // moment of the call captures exactly the cookies the old form did. The
    // @supabase/ssr double-write pattern itself is untouched.
    const nextWithPathname = () => {
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set("x-nzamy-pathname", pathname);
      return NextResponse.next({ request: { headers: requestHeaders } });
    };

    let supabaseResponse = nextWithPathname();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              req.cookies.set(name, value),
            );
            supabaseResponse = nextWithPathname();
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    // Refresh the session token
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    // The session check never completed — a TLS/DNS/egress fault, not a
    // statement about this visitor. Signing a real user out over a dropped
    // packet is the defect this branch exists to stop, and it is the same
    // fail-open choice already made for the `profiles` read below (see the
    // long note above `if (profileError) return supabaseResponse;`) — except
    // that this one is LOGGED, and it marks the response so a downstream
    // server component can say so rather than guess.
    //
    // What it does not weaken: nothing downstream trusts this pass-through.
    // The /dashboard and /settings server gates re-run getUser() on their own
    // request, assertRole()/requireAdmin() re-read `profiles` on theirs, and
    // RLS is what actually keeps one account's rows away from another.
    if (resolveAuthOutcome(user, authError) === "unavailable") {
      console.error("[auth] getUser transport failure (page branch)", {
        pathname,
        name: authError?.name,
        status: authError?.status,
        message: authError?.message,
      });
      const degraded = nextWithPathname();
      degraded.headers.set("x-nzamy-auth", "unavailable");
      return degraded;
    }

    // Not authenticated → redirect to login
    if (!user) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // ─── One read of `profiles`, shared by both gates below ─────────────────
    // Both gates used to read `user.user_metadata`. An OAuth provider never
    // writes that object, so for anyone who signs in with Google every field
    // below was `undefined`: the onboarding gate could not fire and the RBAC
    // block was skipped outright. `profiles` is the source of truth for
    // user_type, phone and onboarding_completed — the same row assertRole()
    // (src/lib/auth/assertRole.ts:36-40) and requireAdmin() already read.
    //
    // Cost: this is one SELECT per protected page request, on the session the
    // request already carries (RLS policy "users read own profile",
    // supabase/migrations/20260603_phase1_001_profiles.sql:66-68). It is
    // skipped whenever neither gate could act on the answer — which is exactly
    // the /onboarding pages, i.e. the pages a gated user loads most often.
    const rbacRule = routeAccessRuleFor(pathname);
    const onboardingGateApplies =
      // The wizard itself is exempt, or the redirect below would loop on it.
      !pathname.startsWith("/onboarding") &&
      // No PROTECTED prefix matches /api today, so this arm never fires; it
      // stays so that adding one later cannot answer a JSON request with an
      // HTML redirect.
      !pathname.startsWith("/api");

    if (!rbacRule && !onboardingGateApplies) return supabaseResponse;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_type, phone, onboarding_completed")
      .eq("id", user.id)
      .maybeSingle();

    // The read itself failed — a network blip, PostgREST, RLS. That is not the
    // same as "this account has no profile row", and the difference decides the
    // behaviour: we know nothing, so this middleware decides nothing and lets
    // the request through. What that costs, and what it does not cost, is set
    // out below rather than asserted.
    //
    // What this branch does NOT weaken. Both re-read `profiles` on their own
    // request, so neither inherits the failure that got us here:
    //   - /api/v1/admin — requireAdmin() returns 403 whenever the row comes
    //     back missing or unreadable (src/lib/access-control.ts:109-117).
    //   - /api/v1/lawyer, /api/v1/firm — assertRole() reads an unreadable
    //     user_type as '' and returns 403 for any non-empty allowed list
    //     (src/lib/auth/assertRole.ts:36-56).
    //
    // What the PAGE path offers is weaker than "a UserTypeGuard is in the
    // layout", and the difference is the whole point of writing it down:
    //   - <UserTypeGuard> is PRESENT in all nine dashboard layouts — admin,
    //     firm, business, micro, provider, government, ngo, and (since the
    //     2026-09-05 role-guard batch) src/app/dashboard/lawyer/layout.tsx and
    //     src/app/dashboard/client/layout.tsx as well — so no dashboard shell
    //     is reached unguarded on this branch.
    //   - Where it is present it REFUSES only when its own profiles read
    //     succeeds. That read is useUser's (src/hooks/useUser.ts:533-553) — a
    //     separate request from the one that just failed here, so it frequently
    //     does succeed, and then the guard is a real backstop.
    //   - When that read fails too it yields `unavailable`; a previously
    //     resolved type is carried forward only for a user already on screen
    //     (src/hooks/useUser.ts:688-691), so on a fresh sign-in there is
    //     nothing to carry and mapSupabaseUser falls back to
    //     user_metadata.user_type (src/hooks/useUser.ts:605-610). That object
    //     is writable by the account itself: supabase.auth.updateUser is an
    //     ordinary call any signed-in browser can make with the anon key, so a
    //     hand-rolled one can put user_type: "admin" there. Not via this app's
    //     own UI — the wizard's closing metadata mirror in
    //     src/app/onboarding/page.tsx guards its write with
    //     `isAssignableUserType` (src/lib/auth/userTypes.ts), which returns
    //     false for "admin" — but the endpoint is Supabase's, not the wizard's,
    //     and refusing to write a value is not the same as preventing it.
    //     UserTypeGuard then admits userType === "admin" outright
    //     (src/components/dashboard/UserTypeGuard.tsx:32). On that path the
    //     guard admits rather than refuses.
    //
    // Residual exposure of this line, stated plainly: while the profiles read
    // is failing for BOTH the edge and the browser, a signed-in user who has
    // put user_type: "admin" into their own metadata renders any dashboard
    // shell. profiles.user_type is not forgeable, and it takes two facts to say
    // so rather than one:
    //   - trg_lock_user_type raises 42501 on a self-edit
    //     (supabase/migrations/20260716_security_hardening.sql:123-156 — the
    //     latest definition of both function and trigger; no migration after it
    //     touches either).
    //   - No migration grants a user an INSERT or a DELETE policy on
    //     `profiles`, so the row cannot be dropped and re-created around that
    //     BEFORE UPDATE trigger. Every policy the table has ever carried, in
    //     full: "users read own profile" and "users update own profile"
    //     (20260603_phase1_001_profiles.sql:66-68 and :79-82) plus an
    //     admin-only SELECT, last redefined at
    //     supabase/migrations/20260625_fix_rls_recursion.sql:31-36. The row
    //     exists at all because public.handle_new_user() — the AFTER INSERT ON
    //     auth.users trigger function, redefined by several migrations and so
    //     named rather than pinned to a line — is SECURITY DEFINER, and needs
    //     no INSERT policy of its own.
    // That trigger and those policies are on `profiles`. They cover nothing in
    // user_metadata, which is the object the paragraph above is about.
    // Closing this means making useUser and UserTypeGuard stop falling back to
    // metadata; neither is this file, and this file cannot do it for them.
    //
    // Failing closed instead was considered and rejected, and the trade is
    // real, not free. It WOULD close the exposure above for every /dashboard/*
    // prefix, because a request redirected here never reaches the layout at
    // all. Its price is that every signed-in user — the admin and every lawyer
    // included, none of whom Gate 1 gates at all — is thrown out of their
    // workspace for the whole duration of any database hiccup, on a branch that
    // by definition cannot tell a real intruder from a dropped packet. That is
    // a certain, total outage weighed against an exposure that needs two reads
    // to fail at once AND a user who has already gone out of their way to plant
    // "admin" in their own metadata. This line takes the first
    // side of that trade; changing sides is one line here. Either way the fix
    // that actually removes the exposure is in useUser and UserTypeGuard, which
    // is where the metadata fallback lives.
    if (profileError) return supabaseResponse;

    // A missing row means `null` here (maybeSingle, not single). needsOnboarding
    // treats that as unfinished, and the RBAC block below treats it as no
    // authorization at all.
    const claimedType = profile?.user_type ?? "";
    const knownType = isDbUserType(claimedType) ? claimedType : null;

    // ─── Gate 1: onboarding ────────────────────────────────────────────────
    // lawyer, firm and admin are exempt inside needsOnboarding — see
    // src/lib/auth/onboardingGate.ts for why each one is. Everyone else must
    // have finished the wizard AND have a phone number, because profiles.phone
    // is the only number the outbound WhatsApp payload can carry.
    if (
      onboardingGateApplies &&
      needsOnboarding({
        userType: profile?.user_type,
        onboardingCompleted: profile?.onboarding_completed,
        // Format-aware, not merely non-blank: "" and "   " are unreachable,
        // and so is `letters-and-email@example.test`, which is what the row
        // the UAT wrote actually held. UAT-REG-002 / appendix 03 §5.
        hasPhone: hasValidSaudiMobile(profile?.phone),
      })
    ) {
      const url = req.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    // ─── Gate 2: RBAC — is this user's own dashboard? ───────────────────────
    // This used to sit behind `if (userType)` with userType read from metadata,
    // so an account without that key skipped the check on every /dashboard/*
    // prefix. It now runs for every authenticated request that matches a rule.
    //
    // `admin` is answered BEFORE any rule is consulted. That is the convention
    // already in force everywhere else this codebase authorizes: assertRole()
    // makes `userType !== 'admin'` a precondition of every 403 it returns
    // (src/lib/auth/assertRole.ts:46), and in the browser UserTypeGuard admits
    // an admin past allowedTypes (src/components/dashboard/UserTypeGuard.tsx:32),
    // which is why six dashboard layouts already list "admin" in their own
    // allowedTypes (firm, business, micro, provider, government, ngo).
    // One short-circuit here rather than an "admin" entry in each of the eight
    // non-admin rules above: eight lists drift apart, one line cannot.
    //
    // Without it, running this block unconditionally would redirect the single
    // live admin account off every dashboard but its own, and two of the admin
    // console's own controls would stop working: the mode-switch button at
    // src/app/dashboard/admin/page.tsx:160 links to /dashboard/lawyer, and the
    // back-link at src/app/dashboard/admin/business/page.tsx:397 links to
    // /dashboard/business.
    //
    // Gate 2 only. admin's exemption from Gate 1 is not here and is not this
    // file's to state: it is ONBOARDING_EXEMPT_USER_TYPES,
    // src/lib/auth/onboardingGate.ts:68-72.
    //
    // What is compared is profiles.user_type, never metadata, and that column
    // rejects a self-edit (trg_lock_user_type,
    // supabase/migrations/20260716_security_hardening.sql:123-156), so this is
    // not a claim a user can make about themselves.
    const isAdmin = knownType === "admin";

    if (
      rbacRule &&
      !isAdmin &&
      (knownType === null || !(rbacRule.allowedTypes as readonly string[]).includes(knownType))
    ) {
      // ─── The second key: an ACCEPTED membership ──────────────────────────
      // Review 2026-09-21 B3 / F08.
      //
      // Reached ONLY after the allowedTypes comparison above has already
      // failed, so nobody who belongs here by type pays a round trip for it:
      // an `individual` on /dashboard/client, a `lawyer` on /dashboard/lawyer,
      // a `corporate` on /dashboard/business never enter this branch at all.
      //
      // That includes every ENTITY OWNER, and it is worth deriving rather than
      // trusting, because an owner lookup here would otherwise be the obvious
      // missing half. A `business_profiles` row is created only for
      // `user_type = 'corporate'` and a `firm_profiles` row only for `'firm'`:
      // by `handle_new_user` at signup
      // (supabase/migrations/20260716_security_hardening.sql:58-75), and by
      // `sectorRowValuesFor` (src/lib/auth/accountTypeClaim.ts:435-446) when a
      // Google account claims its type afterwards. ROUTE_ACCESS gives
      // /dashboard/business exactly `["corporate"]` and /dashboard/firm exactly
      // `["firm"]` (src/lib/auth/routeAccess.ts:68, :78), so an owner is
      // admitted by the comparison above and never reaches this line. There is
      // a second, independent reason no owner branch is needed: every owner
      // ALSO holds an `active` row in the matching members table, written by a
      // trigger on the profiles row it belongs to —
      // `ensure_business_owner_membership`
      // (supabase/migrations/20260914_entity_memberships_and_business_requests.sql:21-41,
      // with a backfill of the rows that predate it at :43-48) and
      // `ensure_firm_owner_membership`
      // (supabase/migrations/20260903_phase2_clients_and_firm_membership.sql:249-266)
      // — so the read below would admit an owner even if the type check
      // somehow had not.
      //
      // WHAT THIS EXISTS TO FIX. A5/F03 turned an invitation into a real
      // consent decision: POST /api/v1/{business,firm}/members now writes
      // `status = 'invited'`, and the invited person accepts at POST
      // /api/v1/me/invitations/{kind}/{id}/accept. An `individual` or a
      // `lawyer` who accepts becomes an ACTIVE member of a company or a firm
      // while their own profiles.user_type stays exactly what it was —
      // membership is additive and nothing in this app rewrites that column
      // (it cannot: trg_lock_user_type). The browser already understood that:
      // UserTypeGuard asks `isAllowedByTypeOrMembership`
      // (src/components/dashboard/UserTypeGuard.tsx:68-75). The edge did not,
      // so it redirected the accepted member away BEFORE the page — and
      // therefore before that guard — ever rendered. The invitation could be
      // accepted and still lead nowhere, which is the whole of F08.
      //
      // WHICH PATHS. `entityMembershipKindForPath`
      // (src/lib/auth/entityMembership.ts:20-25) is the same table the browser
      // guard's membership arms read, which is why it is imported rather than
      // re-spelled here. /dashboard/firm → firm, /dashboard/business →
      // business, and the three shared client-intake prefixes → business,
      // because their rule admits `corporate` (routeAccess.ts:72-75) and
      // `isAllowedByTypeOrMembership` opens anything admitting `corporate` to a
      // business member. Every other prefix answers null and stays governed by
      // profiles.user_type alone, exactly as before. Pinned, path by path, in
      // src/proxy.membership.test.ts.
      //
      // HOW IT IS READ. One RLS-scoped read on the client already built above —
      // never a service client, which this file does not have and must not
      // acquire. The row is reached through the own-row disjunct
      // `user_id = auth.uid()` of "<x>_members: own row, co-member, owner or
      // admin can read"
      // (supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:285,
      // :353) — the same arm GET /api/v1/me/invitations relies on. The
      // `status = 'active'` filter is what every other membership reader in the
      // repo applies (useUser, resolveActiveEntityIds, is_active_business_member),
      // so a row still parked at `invited` — an invitation NOT yet accepted —
      // opens nothing here either.
      //
      // This adds no redirect target, so the no-loop derivation below is
      // untouched: the block either passes the request through or falls into
      // exactly the redirect that was already there.
      const membershipKind = entityMembershipKindForPath(pathname);
      if (membershipKind) {
        const { data: membership, error: membershipError } = await supabase
          .from(membershipKind === "firm" ? "firm_members" : "business_members")
          .select("id")
          .eq("user_id", user.id)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

        // The read itself failed — a blip, PostgREST, RLS. Same choice and the
        // same reason as `if (profileError) return supabaseResponse;` (:478):
        // we have learned nothing, so this middleware decides nothing. Stated
        // rather than assumed, because it is a fail-open on a branch that by
        // definition cannot tell a real member from a stranger while the read
        // is down. What stands behind it is not nothing: all three layouts this
        // block can pass into carry a <UserTypeGuard> that asks
        // `isAllowedByTypeOrMembership` on its OWN membership read — a separate
        // request from the one that just failed here, so it frequently does
        // succeed — and RLS is what actually keeps one entity's rows away from
        // another either way. Verified rather than inherited, because the note
        // above :478 has gone stale on exactly this point: it says the client
        // and lawyer layouts carry no guard, and both now do
        // (src/app/dashboard/client/layout.tsx:35 guards
        // ["individual","corporate","admin"], lawyer/layout.tsx:31 guards
        // ["lawyer","firm","provider","admin"]). Correcting that note is not
        // this block's job; leaning on its stale half would have been this
        // block's mistake.
        // Logged, unlike :478, because unlike that one this read has a table
        // and a kind worth naming in the log.
        if (membershipError) {
          console.error("[rbac] membership lookup failed (page branch)", {
            pathname,
            kind: membershipKind,
            code: membershipError.code,
            message: membershipError.message,
          });
          return supabaseResponse;
        }

        // An accepted membership. Additive: it opens the entity dashboard the
        // path asked about and changes nothing else about this account.
        if (membership) return supabaseResponse;
      }

      const url = req.nextUrl.clone();
      // A type outside the CHECK-constraint vocabulary (or a missing row) is
      // not an authorization for anything, so it goes to the fallback rather
      // than to a guessed dashboard: the old code interpolated the unknown
      // value into "/dashboard/<value>" and served a 404.
      //
      // Neither branch can loop. FALLBACK_DASHBOARD_PATH is "/", which no
      // PROTECTED prefix matches, so none of this runs there; and for each of
      // the eight known types that can reach this line — admin was answered by
      // the short-circuit above — DASHBOARD_PATHS sends it to a prefix whose
      // rule admits that type.
      //
      // Note the wording: "a prefix whose rule admits it", not "the one prefix
      // reserved for it". Since 2026-08-27 three /dashboard/client/* intake
      // subtrees admit BOTH `individual` and `corporate`
      // (src/lib/auth/routeAccess.ts), so the table is no longer one-prefix-
      // per-type. The no-loop property is unaffected and is worth re-deriving
      // rather than assuming: a corporate account refused at, say,
      // /dashboard/client/cases is sent to /dashboard/business, whose rule
      // admits `corporate`, so the redirected request passes this gate. The
      // property that matters is that DASHBOARD_PATHS[t] always resolves to a
      // rule that admits `t` — which routeAccess.test.ts pins.
      url.pathname = knownType ? dashboardPathFor(knownType) : FALLBACK_DASHBOARD_PATH;
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  }

  // ─── Demo Mode: Cookie-based auth (legacy) ────────────────────────────────
  //
  // Reachable ONLY when runtimeMode resolved an explicit "demo" outside
  // production (isDemoMode). Before, it was the fall-through for "the env var
  // is not exactly 'supabase'", which an unset variable satisfied — and since
  // it recognises only `nzamy_session` / `nzamy_demo_role`, never the
  // `sb-<ref>-auth-token*` cookies a real login writes, it bounced genuinely
  // signed-in users to /login (UAT-LIVE-SESSION-001, hypothesis H2). The
  // Supabase path above is now the default and the only production path; the
  // guard below makes that structural rather than conventional.
  if (!isDemoMode) return NextResponse.next();

  const isAuthenticated =
    req.cookies.has("nzamy_session") || req.cookies.has("nzamy_demo_role");

  if (!isAuthenticated) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt (metadata)
     * - Public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js)$).*)",
  ],
};
