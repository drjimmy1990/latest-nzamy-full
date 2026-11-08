import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { frozenAccountResponse } from "@/lib/auth/apiAuth";
import { currentDeviceHash, revokeLibraryDevice } from "@/lib/library/deviceLimitServer";

/**
 * POST /api/v1/library/devices/sign-out — called by logout()
 * (src/hooks/useUser.ts) just before supabase.auth.signOut(): signing out
 * frees this device's library slot (owner ٤٢٧). Reads the httpOnly device
 * cookie, so only the browser that holds it can release it. The cookie itself
 * stays: the same browser keeps the same id when it signs in again.
 *
 * Always answers 200 { released: n } (0 when there is nothing to release, no
 * session, or the migration is not applied): logout never waits on, or fails
 * because of, this call.
 */
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const hash = await currentDeviceHash();
    if (!user || !hash) return NextResponse.json({ released: 0 }, { headers: NO_STORE });
    // D6: a frozen account (a pending deletion) writes nothing — its sign-out
    // still goes on (this answer never fails it).
    if (frozenAccountResponse(user)) return NextResponse.json({ released: 0 }, { headers: NO_STORE });
    const result = await revokeLibraryDevice(user.id, { deviceHash: hash }, "sign_out", user.id);
    return NextResponse.json({ released: result.ok ? result.count : 0 }, { headers: NO_STORE });
  } catch (err) {
    console.error("[library devices sign-out] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ released: 0 }, { headers: NO_STORE });
  }
}
