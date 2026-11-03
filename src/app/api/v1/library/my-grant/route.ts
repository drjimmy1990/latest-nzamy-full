import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse } from "@/lib/auth/apiAuth";
import {
  libraryCoverage,
  libraryDaysLeft,
  libraryEndsAtAr,
  isMissingLibraryGrantsTable,
  type LibraryGrantRow,
} from "@/lib/libraryAccess";
import { LIBRARY_PLAN_LABEL_AR } from "@/lib/libraryAccessAdmin";
import { libraryPurchaseEligibility } from "@/lib/library/libraryPurchaseEligibility";

/**
 * GET /api/v1/library/my-grant — the signed-in user's library-only
 * subscription, for «اشتراك المكتبة: ساري حتى [التاريخ]» (owner note ١٨ C05),
 * and whether his account type may BUY the library (LIVE-F05).
 *
 *   { signedIn: false }                                    — a guest
 *   { signedIn: true,
 *     grant: null | { status: 'active' | 'upcoming', startsAt, endsAt,
 *                     endsAtAr, daysLeft, planRef, planLabel, nextStartsAt },
 *     purchase: { eligible: true } | { eligible: false, reason, messageAr } }
 *
 * `endsAt` is the end of the CONTIGUOUS chain of stacked grants
 * (libraryCoverage): a user who renewed early is shown his real last day.
 * Never sent: the admin's reason / notes, who granted, the order — the user
 * sees his date and plan only.
 *
 * Reads with the service role, filtered to the caller's own id (the id comes
 * from the session, never from the request). A missing table (the SQL not
 * run) or a failed read answers grant: null, never a 500 — the card then
 * shows nothing. Per viewer, never cached.
 */

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
    if (!user) return NextResponse.json({ signedIn: false }, { headers: NO_STORE });

    const admin = await createServiceClient();
    const now = new Date();

    const [grantsRead, profileRead] = await Promise.all([
      admin
        .from("library_access_grants")
        .select("id, plan_ref, source, starts_at, ends_at")
        .eq("user_id", user.id)
        .gt("ends_at", now.toISOString())
        .order("starts_at", { ascending: true })
        .limit(50),
      admin.from("profiles").select("user_type").eq("id", user.id).maybeSingle(),
    ]);

    let grant = null;
    if (grantsRead.error) {
      if (!isMissingLibraryGrantsTable(grantsRead.error.code)) {
        console.error("[library/my-grant] grants read failed:", grantsRead.error.code);
      }
    } else {
      const c = libraryCoverage((grantsRead.data ?? []) as LibraryGrantRow[], now);
      if (c.status !== "none") {
        grant = {
          status: c.status,
          startsAt: c.startsAt,
          endsAt: c.endsAt,
          endsAtAr: libraryEndsAtAr(c.endsAt),
          daysLeft: libraryDaysLeft(c.endsAt, now),
          planRef: c.planRef,
          planLabel: LIBRARY_PLAN_LABEL_AR[c.planRef] ?? null,
          nextStartsAt: c.nextStartsAt,
        };
      }
    }

    if (profileRead.error) console.error("[library/my-grant] profile read failed:", profileRead.error.code);
    const purchase = libraryPurchaseEligibility(
      profileRead.error ? null : (profileRead.data as { user_type?: unknown } | null)?.user_type,
    );

    return NextResponse.json({ signedIn: true, grant, purchase }, { headers: NO_STORE });
  } catch (err) {
    console.error("[library/my-grant] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ signedIn: true, grant: null, purchase: null }, { headers: NO_STORE });
  }
}
