import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isTestAccountUser } from "@/lib/testAccounts/isTestAccount";
import { testDeviceCookieString } from "@/lib/analytics/testAccountExclusion";

/**
 * GET /api/v1/analytics/eligibility — may GA4 / Clarity load for this visitor?
 * (owner file 19 §1ج.2, batch l9-testinfra: a test account is never counted.)
 *
 *   200 { exclude: false }                 a real account, or nobody signed in
 *   200 { exclude: true }  + Set-Cookie    a test account: the browser is
 *                                          marked (nz_test_device, 180 days) so
 *                                          nothing loads there again, signed in
 *                                          or not
 *   503 { exclude: true }                  the check could not be made — the
 *                                          caller loads nothing (fail-closed)
 *
 * Asked by src/components/analytics/useTestAccountGate.ts only when a
 * Supabase session cookie is present, before any script is fetched. The
 * answer carries no personal data. Never cached.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ exclude: false }, { headers: NO_STORE });

    const test = await isTestAccountUser(await createServiceClient(), user.id);
    if (test === null) {
      console.error("[analytics/eligibility] the test-account check failed; analytics stays off for this page");
      return NextResponse.json({ exclude: true }, { status: 503, headers: NO_STORE });
    }
    if (!test) return NextResponse.json({ exclude: false }, { headers: NO_STORE });

    const res = NextResponse.json({ exclude: true }, { headers: NO_STORE });
    res.headers.append("Set-Cookie", testDeviceCookieString(request.nextUrl.protocol === "https:"));
    return res;
  } catch (err) {
    console.error("[analytics/eligibility] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ exclude: true }, { status: 503, headers: NO_STORE });
  }
}
