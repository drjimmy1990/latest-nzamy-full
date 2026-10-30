import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse, frozenAccountResponse } from "@/lib/auth/apiAuth";
import { isLibrarySaleRequest, libraryPurchaseEligibility } from "@/lib/library/libraryPurchaseEligibility";

/**
 * POST /api/v1/entitlement-requests — an authenticated user asks for a paid
 * entitlement (plan / credits / wallet / library / media). No charge happens;
 * this only records the ask for admin review (see /dashboard/admin/entitlements/requests).
 *
 * GET /api/v1/entitlement-requests — the caller's own requests.
 */

const VALID_KINDS = ["plan", "credits", "wallet", "library", "media"] as const;
type Kind = (typeof VALID_KINDS)[number];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  if (!user) {
    return NextResponse.json({ error: "غير مصرح — يرجى تسجيل الدخول" }, { status: 401 });
  }
  // D6 (owner ٢٩٨): a frozen account (a pending deletion) changes nothing.
  const frozen = frozenAccountResponse(user);
  if (frozen) return frozen;

  let body: { kind?: string; requested_ref?: string; amount?: number; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const kind = body.kind;
  if (!kind || !VALID_KINDS.includes(kind as Kind)) {
    return NextResponse.json(
      { error: `نوع الطلب غير صالح. القيم المسموحة: ${VALID_KINDS.join(", ")}` },
      { status: 400 },
    );
  }

  // LIVE-F05: the library is sold to legal professionals only. The admin
  // approval refuses an individual too (409); refusing here keeps the request
  // out of the admin queue. A failed read of the account type is refused.
  if (isLibrarySaleRequest(kind)) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_type")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) {
      return NextResponse.json({ error: "تعذّر التحقق من نوع الحساب" }, { status: 503 });
    }
    const eligibility = libraryPurchaseEligibility((profile as { user_type?: unknown } | null)?.user_type);
    if (!eligibility.eligible) {
      return NextResponse.json({ error: eligibility.messageAr, code: "library_not_eligible" }, { status: 403 });
    }
  }

  // Insert via the auth-aware client so the RLS insert-own policy applies
  // (user_id must equal auth.uid()).
  const { data, error } = await supabase
    .from("entitlement_requests")
    .insert({
      user_id: user.id,
      kind,
      requested_ref: body.requested_ref ?? null,
      amount: typeof body.amount === "number" ? body.amount : null,
      note: body.note ?? null,
    })
    .select("id, kind, status, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  if (!user) {
    return NextResponse.json({ error: "غير مصرح — يرجى تسجيل الدخول" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("entitlement_requests")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}
