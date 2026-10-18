import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFullLibraryAccess } from "@/lib/access-control";
import { isAuthUnavailable, authUnavailableResponse } from "@/lib/auth/apiAuth";

/**
 * GET /api/v1/library/access — does THIS caller have the full library?
 * ─────────────────────────────────────────────────────────────────────────────
 * `{ hasFullAccess: boolean }`, by the server's rule (hasFullLibraryAccess: a
 * Pro+ tier, an active library grant, or an admin; owner ٢٠٥/٢٠٩). For client
 * pages that do not load /api/library/init, whose `viewer.hasFullAccess` is the
 * same answer: the /laws/subscribe redeem CTA and the /laws invitation banner
 * (src/lib/library/useLibraryFullAccess.ts). The client's own feature gate is
 * tier-only, so it told a library subscriber to redeem a code.
 *
 * A guest gets false with a 200: there is nothing to sign in for here. When the
 * session cannot be checked at all it is the shared 503 (never a 401). A failed
 * read answers false (fail closed, as the library routes do) rather than a 500.
 *
 * Not behind libraryGate(), like /api/v1/library/status: it returns a flag
 * about the caller and no library content.
 *
 * It says nothing about the library assistant, which has its own rule (Pro+ or
 * an admin, src/app/api/ai/_libraryAiAccess.ts; owner ٢٠٧).
 */

// Per viewer and per request: never from a cache.
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (isAuthUnavailable(user, authError)) {
      const res = authUnavailableResponse();
      res.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
      return res;
    }

    const hasFullAccess = await hasFullLibraryAccess(user?.id ?? null);
    return NextResponse.json({ hasFullAccess }, { headers: NO_STORE });
  } catch (err) {
    console.error("[library access] full-access read failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ hasFullAccess: false }, { headers: NO_STORE });
  }
}
