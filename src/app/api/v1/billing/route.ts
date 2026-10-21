import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { BILLING_UNAVAILABLE_AR, getBillingWith } from "@/lib/payments/billingCore";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const auth = await requireApiUser(await createClient(), { error: "سجّل الدخول لعرض الفوترة" });
    if (auth instanceof NextResponse) return auth;
    const result = await getBillingWith(await createServiceClient(), auth.user.id);
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: BILLING_UNAVAILABLE_AR }, { status: 503 });
  }
}
