import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";

/**
 * /api/v1/firm/reviews-visibility — owner decision ٢٠: «تقييمات المكاتب لا
 * تُعرض علناً إلا بموافقة مدير المكتب (Opt-in)».
 *
 *   GET    { publicReviews, changedAt } for the caller's own firm
 *   PATCH  { publicReviews: boolean } — the firm manager switches it
 *
 * The flag is `firm_profiles.public_reviews` (20261017_31), default OFF. The
 * firm manager is the firm account itself (`firm_profiles.owner_user_id`):
 * the column carries no grant, and its only writer for the API roles is
 * `public.set_firm_public_reviews(boolean)`, which updates the caller's own
 * firm and refuses everyone else. The database enforces who may switch it and
 * what "public" means (the restrictive SELECT policy on reviews); this route
 * only carries the request.
 */

const AR = {
  readFailed: "تعذّر قراءة إعداد ظهور التقييمات.",
  saveFailed: "تعذّر حفظ إعداد ظهور التقييمات.",
  notReady: "إعداد ظهور التقييمات غير مفعّل بعد على الخادم.",
  noFirm: "لا يوجد مكتب مرتبط بهذا الحساب.",
  ownerOnly: "تغيير ظهور التقييمات متاح لحساب المكتب نفسه فقط.",
  badBody: "حدّد هل تُعرض التقييمات علناً أم لا.",
} as const;

const MISSING = new Set(["42703", "PGRST204", "PGRST202", "42883"]);

export async function GET() {
  try {
    const auth = await assertRole(["firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const { data, error } = await supabase
      .from("firm_profiles")
      .select("public_reviews, public_reviews_changed_at")
      .eq("owner_user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (error) {
      if (MISSING.has(error.code ?? "")) return NextResponse.json({ error: AR.notReady, reason: "not_ready" }, { status: 503 });
      console.error("[firm/reviews-visibility GET] read failed:", error.message, error.code);
      return NextResponse.json({ error: AR.readFailed }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: AR.noFirm }, { status: 404 });

    return NextResponse.json({
      publicReviews: data.public_reviews === true,
      changedAt: (data.public_reviews_changed_at as string | null) ?? null,
    });
  } catch (err) {
    console.error("[firm/reviews-visibility GET] Unexpected error:", err);
    return NextResponse.json({ error: AR.readFailed }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await assertRole(["firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const body = (await request.json().catch(() => null)) as { publicReviews?: unknown } | null;
    if (typeof body?.publicReviews !== "boolean") {
      return NextResponse.json({ error: AR.badBody }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("set_firm_public_reviews", { p_enabled: body.publicReviews });
    if (error) {
      if (error.code === "42501") return NextResponse.json({ error: AR.ownerOnly }, { status: 403 });
      if (MISSING.has(error.code ?? "")) return NextResponse.json({ error: AR.notReady, reason: "not_ready" }, { status: 503 });
      console.error("[firm/reviews-visibility PATCH] rpc failed:", error.message, error.code);
      return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
    }

    return NextResponse.json({ publicReviews: data === true, changedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[firm/reviews-visibility PATCH] Unexpected error:", err);
    return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
  }
}
