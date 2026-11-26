import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dashboardLandingFor } from "@/lib/auth/dashboardLanding";
import { FALLBACK_DASHBOARD_PATH } from "@/lib/auth/userTypes";

/**
 * GET /dashboard — not a screen: it sends each account to its own home (owner
 * package 25-Nov, D-33; the rules are src/lib/auth/dashboardLanding.ts).
 * Every "back to my dashboard" link and two notifications point here.
 *
 * A route handler, not a page: a page here would render inside
 * dashboard/loading.tsx's boundary, so the shell would stream as a 200 and the
 * redirect would arrive later in the browser. This answers a real 307.
 *
 * A guest never reaches this file: /dashboard is PROTECTED in src/proxy.ts
 * (guest → /login); the redirect below is only the belt. The reads are the
 * caller's own, RLS-scoped (profiles: own row; firm_members: own row),
 * exactly as GET /api/v1/auth/session reads them. A failed profile read lands
 * on the home page, never on a guessed dashboard. Never cached.
 */
export const dynamic = "force-dynamic";

function go(req: NextRequest, path: string) {
  const res = NextResponse.redirect(new URL(path, req.url));
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return go(req, "/login?from=%2Fdashboard");

  const [profileRead, membershipRead] = await Promise.all([
    supabase.from("profiles").select("user_type, phone, onboarding_completed").eq("id", user.id).maybeSingle(),
    supabase.from("firm_members").select("id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle(),
  ]);
  if (profileRead.error) {
    console.error("[dashboard] profile read failed:", profileRead.error.code);
    return go(req, FALLBACK_DASHBOARD_PATH);
  }
  const profile = profileRead.data as { user_type?: string | null; phone?: unknown; onboarding_completed?: unknown } | null;

  return go(
    req,
    dashboardLandingFor({
      userType: profile?.user_type,
      onboardingCompleted: profile?.onboarding_completed,
      phone: profile?.phone,
      // A failed membership read counts as "not a member": the type's own dashboard.
      isActiveFirmMember: !membershipRead.error && !!membershipRead.data,
    }),
  );
}
