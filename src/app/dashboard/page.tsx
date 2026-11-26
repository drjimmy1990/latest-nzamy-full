import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dashboardLandingFor } from "@/lib/auth/dashboardLanding";
import { FALLBACK_DASHBOARD_PATH } from "@/lib/auth/userTypes";

/**
 * /dashboard — not a screen: it sends each account to its own home (owner
 * package 25-Nov, D-33; the rules are src/lib/auth/dashboardLanding.ts).
 * Every "back to my dashboard" link and two notifications point here.
 *
 * A guest never reaches this file: /dashboard is PROTECTED in src/proxy.ts
 * (guest → /login) and dashboard/layout.tsx gates the session on the server
 * too; the redirect below is only the belt. The reads are the caller's own,
 * RLS-scoped (profiles: own row; firm_members: own row), exactly as
 * GET /api/v1/auth/session reads them. A failed profile read lands on the
 * home page, never on a guessed dashboard.
 */
export const dynamic = "force-dynamic";

export default async function DashboardHomeRedirect(): Promise<never> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?from=%2Fdashboard");

  const [profileRead, membershipRead] = await Promise.all([
    supabase.from("profiles").select("user_type, phone, onboarding_completed").eq("id", user.id).maybeSingle(),
    supabase.from("firm_members").select("id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle(),
  ]);
  if (profileRead.error) {
    console.error("[dashboard] profile read failed:", profileRead.error.code);
    redirect(FALLBACK_DASHBOARD_PATH);
  }
  const profile = profileRead.data as { user_type?: string | null; phone?: unknown; onboarding_completed?: unknown } | null;

  redirect(
    dashboardLandingFor({
      userType: profile?.user_type,
      onboardingCompleted: profile?.onboarding_completed,
      phone: profile?.phone,
      // A failed membership read counts as "not a member": the type's own dashboard.
      isActiveFirmMember: !membershipRead.error && !!membershipRead.data,
    }),
  );
}
