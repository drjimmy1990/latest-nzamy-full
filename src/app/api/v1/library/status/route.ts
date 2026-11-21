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
 *
 * Owner item 9 (batch l8): `accountLock` — {message} when THIS signed-in
 * account's type (or its own exception) has the library locked, else null (a
 * guest, an admin, an open account). LibraryGuard then shows the owner's
 * message instead of any library page, /laws/subscribe included. The
 * enforcement is libraryGate() on every library route.
 *
 * Register 14 items 8 / 48 (batch l9, 20261129_40): `readQuota` also carries
 * the daily warning (warnAt, 30 — `warn` once today's full-text opens reach
 * it), the 7-day count and cap (weekUsed / weekLimit, 150; `overWeekly`) and
 * when the 7-day window lets one more in (weekResetsAt). `pointsLock` —
 * {code, message, balance, minPoints, topupHref} when this subscriber's
 * balance is below library_min_points_to_browse (src/lib/library/
 * pointsGate.ts), else null. Admins are counted like everyone (file 19).
 *
 * Owner 06 ج6 + ٩٣ (batch l12): `pointsLow` — {code, message, balance,
 * minPoints, questionPoints, topupHref} when this subscriber is gated, still
 * open, and ONE library-assistant question (its registry price) would take
 * him below the minimum; the assistant screens show it before he asks
 * (LibraryPointsLowNotice). Else null. Nothing is refused because of it.
 */

import { NextResponse } from "next/server";
import {
  getLibraryStatus,
  requireAdmin,
  LIBRARY_CLOSED_DEFAULT_MESSAGE,
} from "@/lib/access-control";
import { createClient } from "@/lib/supabase/server";
import { libraryReadQuotaHit } from "@/lib/library/readQuotaServer";
import { LIBRARY_LOCK_SUPPORT_PATH, LIBRARY_READ_QUOTA, libraryLockMessageAr } from "@/lib/library/readQuota";
import { libraryFullAccessState } from "@/lib/access-control";
import { libraryPointsLow, libraryPointsLowBeforeQuestion, type LibraryPointsLock, type LibraryPointsLow } from "@/lib/library/pointsGate";
import { aiToolPointRange } from "@/lib/ai/toolPointsDisplay";
import { viewerLibraryAccountLocked } from "@/lib/library/accountAccessServer";
import { LIBRARY_ACCOUNT_LOCKED_AR } from "@/lib/library/accountAccess";

/** The library assistant's price for one question (the registry's highest, never a typed number); null if unknown. */
function libraryQuestionPoints(): number | null {
  try {
    const n = aiToolPointRange("library-assistant")[1];
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** The caller's own lock and today's quota; nulls when unknown (never throws). */
async function callerReadState() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { securityLock: null, readQuota: null, pointsLock: null, pointsLow: null };
    const [row, full] = await Promise.all([
      libraryReadQuotaHit(user.id, null),
      libraryFullAccessState(user.id).catch(() => null),
    ]);
    const pointsLock: LibraryPointsLock | null = full?.pointsLock ?? null;
    const gate = full?.pointsGate ?? null;
    const question = libraryQuestionPoints();
    const pointsLow: LibraryPointsLow | null =
      gate && question !== null && libraryPointsLowBeforeQuestion(gate.balance, gate.minPoints, question)
        ? libraryPointsLow(gate.balance, gate.minPoints, question)
        : null;
    if (!row || row.status === "exempt") return { securityLock: null, readQuota: null, pointsLock, pointsLow };
    if (row.status === "locked") {
      return {
        securityLock: {
          reference: row.lockReference,
          lockedUntil: row.lockedUntil,
          message: libraryLockMessageAr(row.lockReference, row.lockedUntil),
          support: LIBRARY_LOCK_SUPPORT_PATH,
        },
        readQuota: null,
        pointsLock,
        pointsLow,
      };
    }
    const warnAt = row.warnAt ?? LIBRARY_READ_QUOTA.warnDailyDocs;
    return {
      securityLock: null,
      readQuota: {
        usedToday: row.usedToday,
        dailyLimit: row.dayLimit,
        resetsAt: row.resetsAt,
        overDaily: row.dayLimit > 0 && row.usedToday >= row.dayLimit,
        warnAt,
        // The warning needs the 20261129_40 answer (warn_at): without it no banner.
        warn: row.warnAt != null && row.usedToday >= warnAt,
        weekUsed: row.weekUsed ?? null,
        weekLimit: row.weekLimit ?? null,
        overWeekly: row.weekUsed != null && row.weekLimit != null && row.weekLimit > 0 && row.weekUsed >= row.weekLimit,
        weekResetsAt: row.weekResetsAt ?? null,
      },
      pointsLock,
      pointsLow,
    };
  } catch {
    return { securityLock: null, readQuota: null, pointsLock: null, pointsLow: null };
  }
}

// Always evaluated per request: a cached response would keep the UI showing a
// closure (or an opening) that is no longer true.
export const dynamic = "force-dynamic";

export async function GET() {
  const [state, readState, accountLocked] = await Promise.all([
    getLibraryStatus(),
    callerReadState(),
    viewerLibraryAccountLocked().catch(() => false),
  ]);

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
      /** Owner item 9: this account's library is locked for its type, or null. */
      accountLock: accountLocked ? { message: LIBRARY_ACCOUNT_LOCKED_AR } : null,
      /** Register 14 item 48: this subscriber's balance is below the library minimum, or null. */
      pointsLock: accountLocked ? null : readState.pointsLock,
      /** 06 ج6 (l12): one library-assistant question away from the lock, or null. */
      pointsLow: accountLocked ? null : readState.pointsLow,
    },
    // Per caller now (the lock and the quota): never shared by a cache.
    { headers: { "Cache-Control": "private, no-store, must-revalidate" } },
  );
}
