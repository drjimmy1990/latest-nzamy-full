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
 *
 * Owner item 9 (batch l8): then, for a SIGNED-IN caller, the library's
 * per-account-type switch (library_access_by_account_type, plus the per-account
 * exceptions): a locked account gets a 403 with the owner's message and code
 * `library_account_locked` (src/lib/library/accountAccessServer.ts). A guest is
 * never asked, so the public pages are unchanged. `{ accountLock: false }`
 * skips it: /api/library/stats (counts only, for the marketing widgets) and the
 * lawyers' AI tools that also read the library (ai/runs passes it for every tool
 * but the library assistant — owner item 9.7).
 */

import { NextResponse } from "next/server";
import {
  getLibraryStatus,
  requireAdmin,
  LIBRARY_CLOSED_DEFAULT_MESSAGE,
} from "@/lib/access-control";
import { libraryAccountGate } from "@/lib/library/accountAccessServer";

/**
 * Returns a 503 response when the library is closed to this caller, or `null`
 * when the request may proceed.
 *
 * Cost note: the common (open) case costs exactly one settings lookup — the
 * admin check runs only once the library is already known to be closed.
 */
export async function libraryGate(opts: { accountLock?: boolean } = {}): Promise<NextResponse | null> {
  const state = await getLibraryStatus();
  if (!state.closed) return opts.accountLock === false ? null : libraryAccountGate();

  // Closed — admins still get through.
  const admin = await requireAdmin();
  if (admin.isAdmin) return null; // an admin's account is never locked either

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
