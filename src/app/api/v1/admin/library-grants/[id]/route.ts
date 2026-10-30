import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { recordNotification } from "@/lib/notify";
import { libraryEndsAtAr } from "@/lib/libraryAccess";
import { grantRpcError, isUuid, parseGrantChangeBody } from "@/lib/libraryAccessAdmin";

/**
 * PATCH /api/v1/admin/library-grants/[id] — revoke a library grant, or move
 * its end (owner note ١٨ C04). Body:
 *   { action: "revoke", reason }
 *   { action: "adjust", reason, newEndsAt }   (ISO; the page sends the end of
 *                                              the picked day in Riyadh)
 * The reason is MANDATORY (parseGrantChangeBody, and again in the database).
 *
 * The write is ONE database function each (20261030_65), under the user's
 * grant lock: public.library_grant_revoke / library_grant_adjust_end. Their
 * rule, documented in the migration: revoke and end change touch THIS grant
 * only — the user's later stacked grants never move (a gap may open); a
 * lengthening that would run into another live grant is refused.
 *
 * Gate: requireStaff("entitlements.grant") before anything is read. Audited
 * (logAdminAction, with the before / after window and the reason) only after
 * the write succeeded; the holder gets an in-app notice.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff("entitlements.grant");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "المنحة غير موجودة" }, { status: 404 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  const parsed = parseGrantChangeBody((raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const change = parsed.value;

  try {
    const admin = await createServiceClient();
    const { data, error } =
      change.action === "revoke"
        ? await admin.rpc("library_grant_revoke", { p_grant: id, p_actor: gate.userId, p_reason: change.reason })
        : await admin.rpc("library_grant_adjust_end", {
            p_grant: id,
            p_actor: gate.userId,
            p_new_end: change.newEndsAt,
            p_reason: change.reason,
          });
    if (error) {
      const mapped = grantRpcError(error);
      if (mapped.status >= 500) console.error("[admin/library-grants] change failed:", error.code, error.message);
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    const result = (data ?? {}) as {
      user_id?: string;
      before?: { starts_at?: string; ends_at?: string };
      after?: { starts_at?: string; ends_at?: string };
    };

    await logAdminAction({
      actorId: gate.userId,
      action: change.action === "revoke" ? "library_grant_revoked" : "library_grant_adjusted",
      targetType: "library_grant",
      targetId: id,
      before: result.before ?? null,
      after: result.after ?? null,
      metadata: { user_id: result.user_id ?? null, reason: change.reason },
    });

    if (typeof result.user_id === "string") {
      const untilAr = libraryEndsAtAr(result.after?.ends_at);
      await recordNotification({
        userId: result.user_id,
        title: change.action === "revoke" ? "تم إيقاف منحة المكتبة القانونية" : "تم تعديل اشتراك المكتبة القانونية",
        body:
          change.action === "revoke"
            ? "أوقفت الإدارة إحدى منح اشتراك المكتبة القانونية على حسابك. للاستفسار تواصل معنا."
            : untilAr
              ? `أصبح تاريخ انتهاء هذه المنحة ${untilAr}.`
              : "عدّلت الإدارة تاريخ انتهاء منحة المكتبة القانونية.",
        href: "/settings?tab=subscription",
      });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error("[admin/library-grants] change threw:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر تنفيذ العملية على منحة المكتبة" }, { status: 500 });
  }
}
