import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { freeQuestionStatusWith } from "@/lib/ai/freeQuestion";

/**
 * GET /api/v1/ai/free-question — owner ٣٠ (18 Nov 2026, batch l7): the signed-in
 * user's free library-assistant questions, given ONCE per account (10 for a
 * lawyer, 5 for an individual; platform_settings free_questions_by_account_type).
 * `{ available, left, total }`. Read-only.
 *
 * The count is the database's (ai_free_question_status, 20261127_40); any error
 * — the SQL not run yet included — answers «none left», so the library
 * assistant shows its normal price and promises nothing.
 *
 * /api/v1/ai/* gets no 401 from the proxy, so the sign-in check is here.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };
const NONE = { available: false, left: 0, total: 0 };

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
    return NextResponse.json(NONE, { headers: NO_STORE });
  }
}
