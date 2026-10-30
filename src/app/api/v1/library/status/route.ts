/**
 * GET /api/v1/library/status — Is the legal library open?
 * ─────────────────────────────────────────────────────────────────────────────
 * Public, unauthenticated. Client pages call this to decide whether to render
 * library content or the closure notice.
 *
 * Deliberately lives under /api/v1/ rather than /api/library/ so it is NOT
 * gated by libraryGate() — a status endpoint that returns 503 when closed
 * could never tell the UI why it was closed.
 *
 * This endpoint reports status ONLY. It never returns library content, so it is
 * safe to leave open. Enforcement lives in the content routes themselves.
 *
 * Owner note ١٣ C07 / C09: for a signed-in caller it also says whether HIS
 * library reading is locked (`securityLock`: the SEC- reference and until
 * when) and where he stands on today's document quota (`readQuota`), so
 * LibraryGuard can show the honest notice instead of a reader that fails.
 * Both are null for a guest, an admin, or while 20261030_80 is not applied
 * (libraryReadQuotaHit fails open). The enforcement is in src/proxy.ts.
 */

import { NextResponse } from "next/server";
import {
  getLibraryStatus,
  requireAdmin,
  LIBRARY_CLOSED_DEFAULT_MESSAGE,
} from "@/lib/access-control";
import { createClient } from "@/lib/supabase/server";
import { libraryReadQuotaHit } from "@/lib/library/readQuotaServer";
import { LIBRARY_LOCK_SUPPORT_PATH, libraryLockMessageAr } from "@/lib/library/readQuota";

/** The caller's own lock and today's quota; nulls when unknown (never throws). */
async function callerReadState() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { securityLock: null, readQuota: null };
    const row = await libraryReadQuotaHit(user.id, null);
    if (!row || row.status === "exempt") return { securityLock: null, readQuota: null };
    if (row.status === "locked") {
      return {
        securityLock: {
          reference: row.lockReference,
          lockedUntil: row.lockedUntil,
          message: libraryLockMessageAr(row.lockReference),
          support: LIBRARY_LOCK_SUPPORT_PATH,
        },
        readQuota: null,
      };
    }
    return {
      securityLock: null,
      readQuota: {
        usedToday: row.usedToday,
        dailyLimit: row.dayLimit,
        resetsAt: row.resetsAt,
        overDaily: row.dayLimit > 0 && row.usedToday >= row.dayLimit,
      },
    };
  } catch {
    return { securityLock: null, readQuota: null };
  }
}

// Always evaluated per request: a cached response would keep the UI showing a
// closure (or an opening) that is no longer true.
export const dynamic = "force-dynamic";

export async function GET() {
  const [state, readState] = await Promise.all([getLibraryStatus(), callerReadState()]);

  // Admins keep access while closed, so the client needs to know that the
  // server would let THIS caller through — otherwise an admin sees the public
  // closure notice even though every API call they make succeeds.
  let isAdmin = false;
  if (state.closed) {
    const admin = await requireAdmin();
    isAdmin = admin.isAdmin;
  }

  return NextResponse.json(
    {
      status: state.status,
      closed: state.closed,
      message: state.closed ? state.message || LIBRARY_CLOSED_DEFAULT_MESSAGE : null,
      isAdmin,
      /** What this caller actually experiences, after the admin bypass. */
      effectiveStatus: state.closed && !isAdmin ? "closed" : "open",
      /** Owner note ١٣ C09: this caller's library lock, or null. */
      securityLock: readState.securityLock,
      /** Owner note ١٣ C07: this caller's distinct documents today, or null. */
      readQuota: readState.readQuota,
    },
    // Per caller now (the lock and the quota): never shared by a cache.
    { headers: { "Cache-Control": "private, no-store, must-revalidate" } },
  );
}
