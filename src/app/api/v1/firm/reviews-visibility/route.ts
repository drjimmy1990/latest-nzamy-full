import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { FIRM_TEAM_VIEW_ROLES, resolveCallerFirm } from "@/lib/auth/firmMembershipAccess";

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
 *
 * D-53 (l16, 20261206_70): the firm's ACTIVE managing partner may switch it
 * too (set_firm_public_reviews admits him), and the members who read the
 * office (FIRM_TEAM_VIEW_ROLES) may read it.
 */

const AR = {
  readFailed: "تعذّر قراءة إعداد ظهور التقييمات.",
  saveFailed: "تعذّر حفظ إعداد ظهور التقييمات.",
  notReady: "إعداد ظهور التقييمات غير مفعّل بعد على الخادم.",
  noFirm: "لا يوجد مكتب مرتبط بهذا الحساب.",
  ownerOnly: "تغيير ظهور التقييمات متاح لحساب المكتب وللشريك المدير فقط.",
  viewersOnly: "غير مصرح — صلاحيات غير كافية",
  badBody: "حدّد هل تُعرض التقييمات علناً أم لا.",
} as const;

const MISSING = new Set(["42703", "PGRST204", "PGRST202", "42883"]);

export async function GET() {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    // The owner account's own firm, or (D-53) the firm of an active member
    // whose role reads the office.
    const { data: callerFirm, error: callerError } = await resolveCallerFirm(supabase, user.id);
    if (callerError) {
      console.error("[firm/reviews-visibility GET] firm lookup failed:", callerError.message, callerError.code);
      return NextResponse.json({ error: AR.readFailed }, { status: 500 });
    }
    if (!callerFirm) return NextResponse.json({ error: AR.noFirm }, { status: 404 });
    if (!callerFirm.isOwner && !FIRM_TEAM_VIEW_ROLES.has(callerFirm.role)) {
      return NextResponse.json({ error: AR.viewersOnly }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("firm_profiles")
      .select("public_reviews, public_reviews_changed_at")
      .eq("id", callerFirm.id)
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
    // The database decides: the firm account or its active managing partner
    // (set_firm_public_reviews, 20261206_70); anyone else gets 42501 → 403.
    const auth = await assertRole();
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
