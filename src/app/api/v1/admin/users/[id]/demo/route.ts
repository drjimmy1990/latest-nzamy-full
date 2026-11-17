import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { isUuid } from "@/lib/admin/viewAsCore";

/**
 * PATCH /api/v1/admin/users/[id]/demo  { isDemo: boolean }
 * — S3 / R11: mark or unmark a demo account (profiles.is_demo, 20261125_50).
 * The database does the rest: a demo account writes only into its own
 * sandbox, never pays, never holds a founder seat, is capped (5 cases,
 * 5 consultations, 10 clients) and is never listed; flagging un-lists it.
 *
 * Only the service role may change the flag (a BEFORE trigger refuses anon /
 * authenticated), so this route is the one place it is written. Gate:
 * requireStaff("users.change_type") — it changes what the account may do.
 * Audited (demo_flag_update) with the value before and after.
 */

export const dynamic = "force-dynamic";

const MISSING_COLUMN_AR = "وضع الحساب التجريبي غير مفعّل بعد في قاعدة البيانات (الترحيل 20261125_50)";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff("users.change_type");
  if (!gate.ok) return gate.response;

  const { id: targetId } = await params;
  if (!isUuid(targetId)) return NextResponse.json({ error: "معرّف المستخدم غير صالح" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const isDemo = (body as { isDemo?: unknown } | null)?.isDemo;
  if (typeof isDemo !== "boolean") {
    return NextResponse.json({ error: "isDemo يجب أن يكون true أو false" }, { status: 400 });
  }
  if (targetId === gate.userId && isDemo) {
    return NextResponse.json({ error: "لا يمكنك جعل حسابك أنت حساباً تجريبياً" }, { status: 400 });
  }

  try {
    const admin = await createServiceClient();
    const { data: before, error: readErr } = await admin.from("profiles").select("*").eq("id", targetId).maybeSingle();
    if (readErr) {
      console.error("[admin/users/demo] reading the profile failed:", readErr.code);
      return NextResponse.json({ error: "تعذّر إتمام العملية، حاول مرة أخرى" }, { status: 500 });
    }
    if (!before) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    if (!("is_demo" in (before as Record<string, unknown>))) {
      return NextResponse.json({ error: MISSING_COLUMN_AR }, { status: 503 });
    }
    const wasDemo = (before as { is_demo?: unknown }).is_demo === true;
    if (wasDemo === isDemo) return NextResponse.json({ success: true, isDemo, changed: false });

    const { error } = await admin.from("profiles").update({ is_demo: isDemo }).eq("id", targetId);
    if (error) {
      if (error.code === "42703" || error.code === "PGRST204") {
        return NextResponse.json({ error: MISSING_COLUMN_AR }, { status: 503 });
      }
      console.error("[admin/users/demo] update failed:", error.code, error.message);
      return NextResponse.json({ error: "تعذّر إتمام العملية، حاول مرة أخرى" }, { status: 500 });
    }

    await logAdminAction({
      actorId: gate.userId,
      action: "demo_flag_update",
      targetType: "user",
      targetId,
      before: { is_demo: wasDemo },
      after: { is_demo: isDemo },
    });
    return NextResponse.json({ success: true, isDemo, changed: true });
  } catch (err) {
    console.error("[admin/users/demo] failed:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "تعذّر إتمام العملية، حاول مرة أخرى" }, { status: 500 });
  }
}
