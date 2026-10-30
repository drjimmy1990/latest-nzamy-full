import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { createServiceClient } from "@/lib/supabase/server";
import { isUuid, lockDbError, parseLiftLockBody, toLockDto, type LockRow } from "@/lib/library/securityLockAdmin";

/**
 * POST /api/v1/admin/library-security-locks/[id]/lift { note?, resetToday? }
 * Owner note ١٣ C09 «فك الحظر بضغطة زر»: closes the lock (the row is kept,
 * with who and when) and, unless resetToday is false, clears the user's
 * counted documents for today — otherwise his next read after a quota-breach
 * lock would open a new one at once. requireStaff("settings.write"), audited.
 * Lifting a lock that is already lifted returns it unchanged.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;

    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "معرّف القفل غير صالح." }, { status: 400 });

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const parsed = parseLiftLockBody(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const service = await createServiceClient();
    const { data, error } = await service.rpc("library_security_lock_lift", {
      p_lock: id,
      p_admin: gate.userId,
      p_note: parsed.value.note,
      p_reset_today: parsed.value.resetToday,
    });
    if (error) {
      const mapped = lockDbError(error);
      if (mapped.status === 500) console.error("[admin/library-security-locks lift] failed:", error.code);
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }
    const row = (Array.isArray(data) ? data[0] : data) as LockRow | null;
    if (!row) return NextResponse.json({ error: "القفل غير موجود." }, { status: 404 });

    await logAdminAction({
      actorId: gate.userId,
      action: "library_security_lock_lifted",
      targetType: "library_security_lock",
      targetId: row.id,
      after: { user_id: row.user_id, reference: row.reference, lifted_at: row.lifted_at, reset_today: parsed.value.resetToday },
    });

    return NextResponse.json({ data: toLockDto(row, new Map(), Date.now()) });
  } catch (err) {
    console.error("[admin/library-security-locks lift] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
