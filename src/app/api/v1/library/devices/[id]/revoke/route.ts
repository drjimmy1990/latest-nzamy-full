import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse, frozenAccountResponse } from "@/lib/auth/apiAuth";
import { isUuidString } from "@/lib/library/deviceLimit";
import { currentDeviceHash, readLibraryDevices, revokeLibraryDevice } from "@/lib/library/deviceLimitServer";

/**
 * POST /api/v1/library/devices/[id]/revoke — «تسجيل خروج هذا الجهاز» (owner
 * ٤٢٧). Revokes one of the signed-in user's OWN devices; the id of another
 * user's device revokes nothing (library_device_revoke matches user and id).
 *
 * This is how the owner's «سجّل الخروج من أحد أجهزته المصرحة» works from a
 * refused third device: it frees a slot without holding the other device
 * (an owner question in the B1 report). The user is always the session's,
 * never the body's.
 */
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (isAuthUnavailable(user, error)) return authUnavailableResponse();
    if (!user) return NextResponse.json({ error: "يرجى تسجيل الدخول" }, { status: 401, headers: NO_STORE });
    // D6: a frozen account (a pending deletion) writes nothing.
    const frozen = frozenAccountResponse(user);
    if (frozen) return frozen;

    const { id } = await context.params;
    if (!isUuidString(id)) return NextResponse.json({ error: "معرّف الجهاز غير صالح." }, { status: 400, headers: NO_STORE });

    // 'self' when the user signs this very device out, 'other_device' otherwise.
    let reason: "self" | "other_device" = "other_device";
    const hash = await currentDeviceHash();
    if (hash) {
      const read = await readLibraryDevices(user.id);
      if (read.ok && read.rows.some((r) => r.id === id && r.device_hash === hash)) reason = "self";
    }

    const result = await revokeLibraryDevice(user.id, { deviceId: id }, reason, user.id);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.missing ? "هذه الميزة غير مفعّلة بعد." : "تعذّر تسجيل خروج الجهاز." },
        { status: result.missing ? 503 : 500, headers: NO_STORE },
      );
    }
    if (result.count === 0) return NextResponse.json({ error: "الجهاز غير موجود." }, { status: 404, headers: NO_STORE });
    return NextResponse.json({ revoked: result.count }, { headers: NO_STORE });
  } catch (err) {
    console.error("[library devices revoke] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500, headers: NO_STORE });
  }
}
