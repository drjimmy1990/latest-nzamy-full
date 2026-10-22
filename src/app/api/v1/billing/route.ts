import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { BILLING_UNAVAILABLE_AR, getBillingWith, logBillingError } from "@/lib/payments/billingCore";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    // The user's own rows go through the user's RLS client, never the service client.
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, { error: "سجّل الدخول لعرض الفوترة" });
    if (auth instanceof NextResponse) return auth;
    const result = await getBillingWith(supabase, auth.user.id);
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    logBillingError(`billing_route_exception:${err instanceof Error ? err.message : "unknown"}`);
    return NextResponse.json({ error: BILLING_UNAVAILABLE_AR }, { status: 503 });
  }
}
