import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { createServiceClient } from "@/lib/supabase/server";
import { isMigrationMissing, isUuid } from "@/lib/library/securityLockAdmin";
import { LIMIT_SELECT, MONITOR_MIGRATION_MISSING_AR } from "@/lib/library/monitorAdmin";

/**
 * «نشاط المكتبة» — remove a reader's own limit (an admin's or an automatic
 * slow-down): the reader is back on the settings' caps within a minute.
 *
 * DELETE — requireStaff("settings.write"), audited with the removed row.
 */

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;

    const { userId } = await params;
    if (!isUuid(userId)) return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });

    const service = await createServiceClient();
    const { data, error } = await service
      .from("library_user_limits")
      .delete()
      .eq("user_id", userId)
      .select(LIMIT_SELECT);
    if (error) {
      if (isMigrationMissing(error.code)) return NextResponse.json({ error: MONITOR_MIGRATION_MISSING_AR }, { status: 503 });
      console.error("[admin/library-monitor/user-limits DELETE] delete failed:", error.code);
      return NextResponse.json({ error: "تعذّر إزالة الحد الخاص." }, { status: 500 });
    }
    const removed = Array.isArray(data) ? data[0] ?? null : null;
    if (!removed) return NextResponse.json({ error: "لا يوجد حد خاص لهذا المستخدم." }, { status: 404 });

    await logAdminAction({
      actorId: gate.userId,
      action: "library_user_limit_removed",
      targetType: "library_user_limit",
      targetId: userId,
      before: removed,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/library-monitor/user-limits DELETE] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
