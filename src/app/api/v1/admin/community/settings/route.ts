import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { COMMUNITY_REVIEW_SETTING_KEY, prepublishReviewOn } from "@/lib/community/review";

/**
 * PATCH /api/v1/admin/community/settings — switch the community's review
 * before publishing on or off (owner ٤٢: «مراجعة قبل النشر في الأسابيع
 * الأولى»; batch l7 decision 13, default ON).
 *
 * Body: { prepublishReview: boolean }
 *
 * Writes platform_settings.community_prepublish_review (jsonb true/false),
 * which the review trigger of 20261127_60 reads on every new post or answer.
 * Switching it off does NOT publish what is already pending: those rows stay
 * in the queue until a reviewer decides. Needs settings.write; one audit row.
 * The row is created by 20261127_60 — before it runs there is nothing to
 * switch, and the route says so (409) rather than inventing the row.
 */
export async function PATCH(request: NextRequest) {
  try {
    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;

    let body: { prepublishReview?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    if (typeof body.prepublishReview !== "boolean") {
      return NextResponse.json({ error: "قيمة prepublishReview يجب أن تكون true أو false" }, { status: 400 });
    }

    const admin = await createServiceClient();
    const { data: existing, error: readError } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", COMMUNITY_REVIEW_SETTING_KEY)
      .maybeSingle();
    if (readError) {
      console.error("[admin/community/settings PATCH] read failed:", readError.code);
      return NextResponse.json({ error: "تعذّرت قراءة الإعداد" }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json(
        { error: "إعداد المراجعة قبل النشر غير موجود بعد — شغّل ملف الترحيل 20261127_60 أولاً." },
        { status: 409 },
      );
    }

    const { error: writeError } = await admin
      .from("platform_settings")
      .update({ value: body.prepublishReview, updated_by: gate.userId, updated_at: new Date().toISOString() })
      .eq("key", COMMUNITY_REVIEW_SETTING_KEY);
    if (writeError) {
      console.error("[admin/community/settings PATCH] write failed:", writeError.code);
      return NextResponse.json({ error: "تعذّر حفظ الإعداد" }, { status: 500 });
    }

    await logAdminAction({
      actorId: gate.userId,
      action: "community_prepublish_review_set",
      targetType: "platform_setting",
      targetId: COMMUNITY_REVIEW_SETTING_KEY,
      before: { prepublishReview: prepublishReviewOn(existing.value) },
      after: { prepublishReview: body.prepublishReview },
      metadata: { key: COMMUNITY_REVIEW_SETTING_KEY },
    });

    return NextResponse.json({ data: { prepublishReview: body.prepublishReview } });
  } catch (err) {
    console.error("[admin/community/settings PATCH] unexpected:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر حفظ الإعداد" }, { status: 500 });
  }
}
