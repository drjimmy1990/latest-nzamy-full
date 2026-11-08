import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse } from "@/lib/auth/apiAuth";
import { toDeviceList } from "@/lib/library/deviceLimit";
import { currentDeviceHash, readLibraryDevices } from "@/lib/library/deviceLimitServer";

/**
 * GET /api/v1/library/devices — «أجهزتي» (owner ٤٢٧): the signed-in user's
 * authorised library devices, newest first, with `current` on the device
 * making this request. Never the hash.
 *
 * { enabled, limit, devices: [{ id, label, firstSeen, lastSeen, current }], available }
 * available: false before 20261108_20 runs (an empty list, not an error).
 */
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (isAuthUnavailable(user, error)) return authUnavailableResponse();
    if (!user) return NextResponse.json({ error: "يرجى تسجيل الدخول" }, { status: 401, headers: NO_STORE });

    const read = await readLibraryDevices(user.id);
    if (!read.ok) {
      if (read.missing) {
        return NextResponse.json({ enabled: false, limit: 2, devices: [], available: false }, { headers: NO_STORE });
      }
      return NextResponse.json({ error: "تعذّر تحميل أجهزتك." }, { status: 500, headers: NO_STORE });
    }
    const hash = await currentDeviceHash();
    return NextResponse.json(
      { ...read.settings, devices: toDeviceList(read.rows, hash), available: true },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[library devices GET] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500, headers: NO_STORE });
  }
}
