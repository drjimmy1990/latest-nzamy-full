import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { isUuid } from "@/lib/admin/viewAsCore";

/**
 * PATCH /api/v1/admin/users/[id]/suspension-appeal  { appealId, note }
 * — owner س٢١٥: the administration REJECTS a waiting appeal against a
 * suspension, with a short note (kept on the appeal and in the audit row).
 * Accepting an appeal is lifting the suspension (PATCH /api/v1/admin/users/[id]
 * { status: "active" }), which closes the waiting appeals as «lifted».
 *
 * Gate: requireStaff("users.suspend") — the action that suspends and lifts.
 * Audited (suspension_appeal_rejected).
 */

export const dynamic = "force-dynamic";

const NOTE_MAX = 1000;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff("users.suspend");
  if (!gate.ok) return gate.response;

  const { id: userId } = await params;
  if (!isUuid(userId)) return NextResponse.json({ error: "معرّف المستخدم غير صالح" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const src = (body ?? {}) as { appealId?: unknown; note?: unknown };
  const appealId = typeof src.appealId === "string" ? src.appealId : "";
  if (!isUuid(appealId)) return NextResponse.json({ error: "معرّف الاعتراض غير صالح" }, { status: 400 });
  const note = typeof src.note === "string" ? src.note.trim() : "";
  if (note.length < 3) return NextResponse.json({ error: "اكتب سبب رفض الاعتراض." }, { status: 400 });
  if (note.length > NOTE_MAX) return NextResponse.json({ error: "سبب الرفض طويل جداً." }, { status: 400 });

  try {
    const admin = await createServiceClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await admin
      .from("account_suspension_appeals")
      .update({ status: "rejected", decided_at: nowIso, decided_by: gate.userId, decision_note: note })
      .eq("id", appealId)
      .eq("user_id", userId)
      .eq("status", "new")
      .select("id, freeze_id");
    if (error) {
      console.error("[admin/users/suspension-appeal] update failed:", error.code, error.message);
      return NextResponse.json({ error: "تعذّر حفظ القرار، حاول مرة أخرى" }, { status: 500 });
    }
    const row = Array.isArray(data) && data.length > 0 ? (data[0] as { id: string; freeze_id: string }) : null;
    if (!row) return NextResponse.json({ error: "الاعتراض غير موجود أو سبق البتّ فيه" }, { status: 404 });

    await logAdminAction({
      actorId: gate.userId,
      action: "suspension_appeal_rejected",
      targetType: "profile",
      targetId: userId,
      before: { appeal_id: row.id, status: "new" },
      after: { appeal_id: row.id, status: "rejected", note },
      metadata: { freeze_id: row.freeze_id },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/users/suspension-appeal] PATCH error:", err);
    return NextResponse.json({ error: "تعذّر حفظ القرار، حاول مرة أخرى" }, { status: 500 });
  }
}
