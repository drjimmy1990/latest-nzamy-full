import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { OffersReadError, loadOffersForUser } from "@/lib/offers/offersServer";

/**
 * GET /api/v1/offers — the offers meant for the signed-in user right now
 * (owner item 5): `{ offers: OfferCardDto[], popupId, sessionKey }`.
 *
 *   - offers: every ACTIVE offer whose audience is this account type
 *     (advocate lawyer / consultant / firm / individual / corporate) and
 *     verification state, that he has not already bought, inside its window
 *     on the SERVER's clock, with a seat left — the founder offer reads the
 *     founder campaign's window and counter. Highest priority first. The
 *     «العروض» section, its badge and the /pricing strip show these.
 *   - popupId: the ONE offer the popup may show (the highest-priority one
 *     whose last dismissal is older than its return delay), or null.
 *   - sessionKey: changes at every sign-in; the browser shows at most one
 *     popup per key (never again in the same session).
 *
 * The tables are server-only (RLS, no session grant, 20261128_50): the
 * session only proves who is asking; the service client reads. Before the
 * migration runs the answer is an empty list. A failed read is a 503 — the
 * browser then shows nothing rather than a guess. Per viewer, never cached.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, { error: "سجّل الدخول لعرض العروض" });
    if (auth instanceof NextResponse) {
      auth.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
      return auth;
    }
    const db = await createServiceClient();
    const reply = await loadOffersForUser(db, auth.user, new Date());
    return NextResponse.json(reply, { headers: NO_STORE });
  } catch (err) {
    console.error("[offers GET] failed:", err instanceof OffersReadError || err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر تحميل العروض الآن" }, { status: 503, headers: NO_STORE });
  }
}
