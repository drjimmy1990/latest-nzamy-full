import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { createServiceClient } from "@/lib/supabase/server";
import { isMissingDeviceSchema, isUuidString, toDeviceList } from "@/lib/library/deviceLimit";
import { forgetLibraryDevices, readLibraryDevices } from "@/lib/library/deviceLimitServer";

/**
 * A user's library devices on the admin user page (owner ٤٢٧).
 *
 * GET  — any admin (requireStaff("read")): { enabled, limit, devices, available }.
 * POST — «إعادة تعيين الأجهزة»: revokes every active device of the user
 *        (the rows are kept, with who and when), so his next devices register
 *        afresh. requireStaff("library.lock_lift") — the same library-ops
 *        permission as lifting a library lock (super admin and operations).
 *        Audited.
 */
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireStaff("read");
    if (!gate.ok) return gate.response;
    const { id } = await context.params;
    if (!isUuidString(id)) return NextResponse.json({ error: "معرّف المستخدم غير صالح." }, { status: 400 });

    const read = await readLibraryDevices(id);
    if (!read.ok) {
      if (read.missing) return NextResponse.json({ enabled: false, limit: 2, devices: [], available: false }, { headers: NO_STORE });
      return NextResponse.json({ error: "تعذّر تحميل الأجهزة." }, { status: 500 });
    }
    return NextResponse.json({ ...read.settings, devices: toDeviceList(read.rows, null), available: true }, { headers: NO_STORE });
  } catch (err) {
    console.error("[admin/users library-devices GET] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireStaff("library.lock_lift");
    if (!gate.ok) return gate.response;
    const { id } = await context.params;
    if (!isUuidString(id)) return NextResponse.json({ error: "معرّف المستخدم غير صالح." }, { status: 400 });

    // Both ids null + admin_reset = every active device of the user.
    const service = await createServiceClient();
    const { data, error } = await service.rpc("library_device_revoke", {
      p_user: id,
      p_device_id: null,
      p_device_hash: null,
      p_reason: "admin_reset",
      p_actor: gate.userId,
    });
    if (error) {
      const missing = isMissingDeviceSchema(error.code);
      if (!missing) console.error("[admin/users library-devices POST] revoke failed:", error.code ?? "no-code");
      return NextResponse.json(
        { error: missing ? "شغّل ملف الترحيل 20261108_20_library_device_limit.sql أولاً" : "تعذّر إعادة تعيين الأجهزة." },
        { status: missing ? 503 : 500 },
      );
    }
    forgetLibraryDevices(id);
    const revoked = typeof data === "number" ? data : 0;
    await logAdminAction({
      actorId: gate.userId,
      action: "library_devices_reset",
      targetType: "user",
      targetId: id,
      after: { revoked },
    });
    return NextResponse.json({ revoked }, { headers: NO_STORE });
  } catch (err) {
    console.error("[admin/users library-devices POST] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
