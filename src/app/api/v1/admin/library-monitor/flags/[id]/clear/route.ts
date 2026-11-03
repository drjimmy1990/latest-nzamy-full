import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { createServiceClient } from "@/lib/supabase/server";
import { isMigrationMissing, isUuid } from "@/lib/library/securityLockAdmin";
import {
  FLAG_SELECT,
  MONITOR_MIGRATION_MISSING_AR,
  parseClearFlagBody,
  toFlagDto,
  type FlagRow,
} from "@/lib/library/monitorAdmin";
import { peopleFor } from "@/lib/library/monitorAdminServer";

/**
 * «نشاط المكتبة» — close a review flag («إغلاق المراجعة»): the row stays,
 * with who closed it and why. By default it also removes the automatic
 * slow-down the flag put on the reader (an admin's own limit is never
 * touched). A library lock is NOT lifted here: that is «قفل المكتبة»'s own
 * button, so lifting it stays one deliberate, separately audited act.
 *
 * POST { note?, liftSlow? } — requireStaff("settings.write"), audited.
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;

    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const parsed = parseClearFlagBody(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const service = await createServiceClient();
    const { data, error } = await service
      .from("library_review_flags")
      .update({ cleared_at: new Date().toISOString(), cleared_by: gate.userId, clear_note: parsed.value.note })
      .eq("id", id)
      .is("cleared_at", null)
      .select(FLAG_SELECT)
      .maybeSingle();
    if (error) {
      if (isMigrationMissing(error.code)) return NextResponse.json({ error: MONITOR_MIGRATION_MISSING_AR }, { status: 503 });
      console.error("[admin/library-monitor/flags clear] update failed:", error.code);
      return NextResponse.json({ error: "تعذّر إغلاق المراجعة." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "المراجعة غير موجودة أو أُغلقت من قبل." }, { status: 404 });
    const row = data as FlagRow;

    let slowRemoved = false;
    if (parsed.value.liftSlow) {
      const { data: removed, error: removeError } = await service
        .from("library_user_limits")
        .delete()
        .eq("user_id", row.user_id)
        .eq("source", "auto_slow")
        .select("user_id");
      if (removeError) console.error("[admin/library-monitor/flags clear] slow removal failed:", removeError.code);
      slowRemoved = !removeError && Array.isArray(removed) && removed.length > 0;
    }

    await logAdminAction({
      actorId: gate.userId,
      action: "library_review_flag_cleared",
      targetType: "library_review_flag",
      targetId: row.id,
      after: { user_id: row.user_id, reference: row.reference, note: row.clear_note, slow_removed: slowRemoved },
    });

    const people = await peopleFor([row.user_id, gate.userId]);
    return NextResponse.json({ data: toFlagDto(row, people), slowRemoved });
  } catch (err) {
    console.error("[admin/library-monitor/flags clear] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
