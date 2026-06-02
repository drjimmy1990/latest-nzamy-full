import { NextRequest, NextResponse } from "next/server";

// ─── Route → required userTypes mapping ────────────────────────────────────────
// Only users with these types can access these route prefixes.
// Empty array = any authenticated user.

const ROUTE_ACCESS: { prefix: string; allowedTypes: string[] }[] = [
  { prefix: "/dashboard/lawyer",   allowedTypes: ["lawyer"] },
  { prefix: "/dashboard/firm",     allowedTypes: ["firm"] },
  { prefix: "/dashboard/client",   allowedTypes: ["individual"] },
  { prefix: "/dashboard/business", allowedTypes: ["corporate"] },
  { prefix: "/dashboard/micro",    allowedTypes: ["micro"] },
  { prefix: "/dashboard/provider", allowedTypes: ["provider"] },
];

// ─── Protected route prefixes (require authentication) ─────────────────────────
const PROTECTED = ["/dashboard", "/ai/settings", "/ai/vault", "/ai/secretary", "/ai/fee-calculator", "/ai/report-generator", "/ai/tracker"];

// ─── Deprecated route redirects ────────────────────────────────────────────────
const REDIRECTS: Record<string, string> = {
  // "/ai/memo-studio" removed — now active as the Litigation Studio (المحاكي الشامل)
  "/ai/communicate":     "/ai/legal-opinion", // المراسلات الذكية تحت الرأي القانوني
  "/ai/share-history":   "/settings",       // سجل المشاركات في الإعدادات
  "/ai/corp/privacy":    "/ai/corp/compliance", // PDPL مدمج مع الامتثال
  "/dashboard/lawyer/ai/secretary": "/ai/secretary", // إصلاح رابط قديم
};

// ─── Middleware ────────────────────────────────────────────────────────────────
export default function proxy(req: NextRequest) {
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

  // 3. Auth check
  // TODO(Backend-Phase-1): Replace this blind cookie check with real Supabase session validation
  // Example: 
  // const supabase = createServerClient(...)
  // const { data: { session } } = await supabase.auth.getSession()
  // if (!session) return NextResponse.redirect(...)
  const isAuthenticated = req.cookies.has("nzamy_session") || req.cookies.has("nzamy_demo_role");

  if (!isAuthenticated) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 4. RBAC: validate that user is accessing their own dashboard
  // TODO: In production, decode JWT from cookie to get userType,
  // then enforce ROUTE_ACCESS rules below.
  //
  // Example (with Supabase JWT):
  // const token = req.cookies.get("sb-access-token")?.value;
  // const { data: { user } } = await supabase.auth.getUser(token);
  // const userType = user?.user_metadata?.user_type;
  // const rule = ROUTE_ACCESS.find(r => pathname.startsWith(r.prefix));
  // if (rule && !rule.allowedTypes.includes(userType)) {
  //   return NextResponse.redirect(new URL(`/dashboard/${userType}`, req.url));
  // }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/ai/settings/:path*",
    "/ai/vault/:path*",
    "/ai/secretary/:path*",
    "/ai/fee-calculator/:path*",
    "/ai/report-generator/:path*",
    "/ai/tracker/:path*",
    "/ai/communicate",
    "/ai/share-history",
    "/ai/corp/privacy",
    "/dashboard/lawyer/ai/:path*",
  ],
};
