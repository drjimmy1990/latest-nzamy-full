/**
 * library-gate.ts — Global open/close gate for the legal library
 * ─────────────────────────────────────────────────────────────────────────────
 * Enforces platform_settings.library_status at the API layer, so "closed" means
 * the DATA IS NOT SERVED — not merely that navigation is hidden. Hiding UI while
 * the endpoints still answer would leave the entire corpus one fetch away.
 *
 * Usage — first statement of any library content route:
 *
 *   import { libraryGate } from "@/lib/library-gate";
 *
 *   export async function GET(req: NextRequest) {
 *     const gate = await libraryGate();
 *     if (gate) return gate;
 *     ...
 *   }
 *
 * Admins bypass the gate so they can verify content while it is closed to the
 * public.
 */

import { NextResponse } from "next/server";
import {
  getLibraryStatus,
  requireAdmin,
  LIBRARY_CLOSED_DEFAULT_MESSAGE,
} from "@/lib/access-control";

/**
 * Returns a 503 response when the library is closed to this caller, or `null`
 * when the request may proceed.
 *
 * Cost note: the common (open) case costs exactly one settings lookup — the
 * admin check runs only once the library is already known to be closed.
 */
export async function libraryGate(): Promise<NextResponse | null> {
  const state = await getLibraryStatus();
  if (!state.closed) return null;

  // Closed — admins still get through.
  const admin = await requireAdmin();
  if (admin.isAdmin) return null;

  return NextResponse.json(
    {
      error: state.message || LIBRARY_CLOSED_DEFAULT_MESSAGE,
      libraryClosed: true,
    },
    {
      status: 503,
      headers: {
        // Never let an intermediary cache the closure, or the library would stay
        // dark for those clients after it is reopened.
        "Cache-Control": "no-store, must-revalidate",
        // Advisory for crawlers: this is temporary, do not treat as permanent.
        "Retry-After": "3600",
      },
    },
  );
}
