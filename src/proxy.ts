import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// ─── Route → required userTypes mapping ────────────────────────────────────────
const ROUTE_ACCESS: { prefix: string; allowedTypes: string[] }[] = [
  { prefix: "/dashboard/lawyer",   allowedTypes: ["lawyer"] },
  { prefix: "/dashboard/firm",     allowedTypes: ["firm"] },
  { prefix: "/dashboard/client",   allowedTypes: ["individual"] },
  { prefix: "/dashboard/business", allowedTypes: ["corporate"] },
  { prefix: "/dashboard/micro",    allowedTypes: ["micro"] },
  { prefix: "/dashboard/provider", allowedTypes: ["provider"] },
  { prefix: "/dashboard/government", allowedTypes: ["government"] },
  { prefix: "/dashboard/ngo",      allowedTypes: ["ngo"] },
];

// ─── Protected route prefixes (require authentication) ─────────────────────────
const PROTECTED = [
  "/dashboard",
  "/ai/settings",
  "/ai/vault",
  "/ai/secretary",
  "/ai/fee-calculator",
  "/ai/report-generator",
  "/ai/tracker",
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

    // Check onboarding status — skip for lawyers/firms/providers (they have their own registration flow)
    const userType = user.user_metadata?.user_type as string | undefined;
    const skipOnboarding = !['lawyer', 'firm'].includes(userType ?? '');
    if (
      !skipOnboarding &&
      !pathname.startsWith("/onboarding") &&
      !pathname.startsWith("/api") &&
      user.user_metadata?.onboarding_completed === false
    ) {
      const url = req.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    // RBAC: validate that user is accessing their correct dashboard
    if (userType) {
      const rule = ROUTE_ACCESS.find((r) => pathname.startsWith(r.prefix));
      if (rule && !rule.allowedTypes.includes(userType)) {
        const url = req.nextUrl.clone();
        url.pathname = `/dashboard/${userType === "individual" ? "client" : userType}`;
        return NextResponse.redirect(url);
      }
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
