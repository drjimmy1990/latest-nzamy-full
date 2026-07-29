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
 */

import { NextResponse } from "next/server";
import {
  getLibraryStatus,
  requireAdmin,
  LIBRARY_CLOSED_DEFAULT_MESSAGE,
} from "@/lib/access-control";

// Always evaluated per request: a cached response would keep the UI showing a
// closure (or an opening) that is no longer true.
export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getLibraryStatus();

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
    },
    { headers: { "Cache-Control": "no-store, must-revalidate" } },
  );
}
