/**
 * staffMfaRoute.ts — the shared opening of the /api/v1/auth/mfa/* routes
 * (owner item 18, batch l7). These routes live OUTSIDE /api/v1/admin on
 * purpose: they are what an aal1 or an unenrolled staff session uses to
 * clear the gate, so the gate must not stand in front of them. Each route
 * says itself what level it needs.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse } from "@/lib/auth/apiAuth";
import { aalFromAccessToken, hasVerifiedFactor, type Aal } from "@/lib/auth/staffMfa";
import { currentAccessToken } from "@/lib/auth/staffMfaServer";

export type StaffMfaCaller =
  | {
      ok: true;
      user: User;
      supabase: SupabaseClient;
      isStaff: boolean;
      accessToken: string | null;
      aal: Aal;
      enrolled: boolean;
    }
  | { ok: false; response: NextResponse };

export const NOT_STAFF_AR = "هذه الصفحة لحسابات الإدارة فقط.";

export function noStore(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** The signed-in caller, whether it is staff, and its session level. */
export async function readStaffMfaCaller(): Promise<StaffMfaCaller> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (isAuthUnavailable(user, error)) return { ok: false, response: authUnavailableResponse() };
  if (!user) {
    return { ok: false, response: noStore({ error: "غير مصرح — يرجى تسجيل الدخول" }, 401) };
  }
  const { data: profile } = await supabase.from("profiles").select("user_type").eq("id", user.id).maybeSingle();
  const accessToken = await currentAccessToken(supabase);
  return {
    ok: true,
    user,
    supabase,
    isStaff: (profile as { user_type?: string } | null)?.user_type === "admin",
    accessToken,
    aal: aalFromAccessToken(accessToken),
    enrolled: hasVerifiedFactor(user),
  };
}
