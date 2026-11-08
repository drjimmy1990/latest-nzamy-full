import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { freeQuestionStatusWith } from "@/lib/ai/freeQuestion";

/**
 * GET /api/v1/ai/free-question — owner ٤١٢: is today's free quick question
 * open to the signed-in user? `{ available: boolean }`. Read-only.
 *
 * Open only to an individual account whose phone the server verified
 * (public.verified_phones), once per phone per Riyadh day
 * (src/lib/ai/freeQuestion.ts). Nobody is verified until phone OTP exists, so
 * this answers false for everyone, and on any error: /ai/quick-answer then
 * shows the normal price and promises nothing.
 *
 * /api/v1/ai/* gets no 401 from the proxy, so the sign-in check is here.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, { error: "سجّل الدخول لاستخدام أدوات الذكاء الاصطناعي" });
    if (auth instanceof NextResponse) return auth;
    const admin = await createServiceClient();
    const status = await freeQuestionStatusWith(admin, auth.user.id);
    return NextResponse.json(status, { headers: NO_STORE });
  } catch (err) {
    console.error("[ai/free-question] GET failed:", (err as { name?: string } | null)?.name ?? "error");
    return NextResponse.json({ available: false }, { headers: NO_STORE });
  }
}
