import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { needsOnboarding } from "@/lib/auth/onboardingGate";
import {
  dashboardPathFor,
  isDbUserType,
  FALLBACK_DASHBOARD_PATH,
} from "@/lib/auth/userTypes";

// ─── Route → required userTypes mapping ────────────────────────────────────────
// The types below are `profiles.user_type` values, read from the database — not
// from `auth.user_metadata`, which an OAuth provider never writes.
const ROUTE_ACCESS: { prefix: string; allowedTypes: string[] }[] = [
  { prefix: "/dashboard/lawyer",   allowedTypes: ["lawyer"] },
  { prefix: "/dashboard/firm",     allowedTypes: ["firm"] },
  { prefix: "/dashboard/client",   allowedTypes: ["individual"] },
  { prefix: "/dashboard/business", allowedTypes: ["corporate"] },
  { prefix: "/dashboard/micro",    allowedTypes: ["micro"] },
  { prefix: "/dashboard/provider", allowedTypes: ["provider"] },
  { prefix: "/dashboard/government", allowedTypes: ["government"] },
  { prefix: "/dashboard/ngo",      allowedTypes: ["ngo"] },
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
  // reaches the comparison — the `isAdmin` short-circuit in Gate 2 answers
  // first — so the value is spelled out to say who the prefix is for, not
  // because this list is what lets the admin in.
  { prefix: "/dashboard/admin",    allowedTypes: ["admin"] },
];

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
  "/ai/contracts",
  "/ai/wargaming",
  "/settings",
  "/notifications",
  "/onboarding",
];

// ─── Protected API prefixes (require an authenticated session) ─────────────────
// Defense-in-depth: unauthenticated hits get a JSON 401 here; per-endpoint role
// authorization (lawyer/firm/admin) is enforced by assertRole() in the handlers.
const PROTECTED_API = ["/api/v1/lawyer", "/api/v1/admin", "/api/v1/firm"];

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
const BACKEND_MODE = process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND ?? "demo";
const isSupabaseMode = BACKEND_MODE === "supabase";

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Handle deprecated route redirects (permanent 301)
  if (REDIRECTS[pathname]) {
    const url = req.nextUrl.clone();
    url.pathname = REDIRECTS[pathname];
    return NextResponse.redirect(url, 301);
  }

  // 1b. Protect sensitive API prefixes with a middleware-level JSON 401 when the
  //     session is missing (defense-in-depth on top of the handler assertRole()).
  if (isSupabaseMode && PROTECTED_API.some((p) => pathname.startsWith(p))) {
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
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return apiResponse;
  }

  // 2. Check if route requires authentication
  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  // ─── Supabase Mode: Real auth ──────────────────────────────────────────────
  if (isSupabaseMode) {
    let supabaseResponse = NextResponse.next({ request: req });

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
            supabaseResponse = NextResponse.next({ request: req });
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
    } = await supabase.auth.getUser();

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
    const rbacRule = ROUTE_ACCESS.find((r) => pathname.startsWith(r.prefix));
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
    //   - <UserTypeGuard> is PRESENT in seven of the nine dashboard layouts —
    //     admin, firm, business, micro, provider, government, ngo. It is absent
    //     from src/app/dashboard/lawyer/layout.tsx and
    //     src/app/dashboard/client/layout.tsx, which carry no type check at
    //     all, so on this branch any signed-in user reaches those two shells.
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
        // Trimmed, not merely truthy: a phone of "" or "   " is exactly as
        // unreachable as a NULL one.
        hasPhone: (profile?.phone ?? "").trim() !== "",
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
      (knownType === null || !rbacRule.allowedTypes.includes(knownType))
    ) {
      const url = req.nextUrl.clone();
      // A type outside the CHECK-constraint vocabulary (or a missing row) is
      // not an authorization for anything, so it goes to the fallback rather
      // than to a guessed dashboard: the old code interpolated the unknown
      // value into "/dashboard/<value>" and served a 404.
      //
      // Neither branch can loop. FALLBACK_DASHBOARD_PATH is "/", which no
      // PROTECTED prefix matches, so none of this runs there; and for each of
      // the eight known types that can reach this line — admin was answered by
      // the short-circuit above — DASHBOARD_PATHS sends it to the one prefix
      // above whose rule allows exactly that type.
      url.pathname = knownType ? dashboardPathFor(knownType) : FALLBACK_DASHBOARD_PATH;
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  }

  // ─── Demo Mode: Cookie-based auth (legacy) ────────────────────────────────
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
