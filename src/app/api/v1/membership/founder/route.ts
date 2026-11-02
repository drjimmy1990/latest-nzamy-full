import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { isMissingLibraryGrantsTable, type LibraryGrantRow } from "@/lib/libraryAccess";
import { FOUNDER_CAMPAIGN_ID } from "@/lib/membership/founderPlan";
import {
  founderMembershipView,
  NOT_A_FOUNDER,
  type FounderCreditRow,
  type FounderSeatRow,
} from "@/lib/membership/founderMembershipView";

/**
 * GET /api/v1/membership/founder — the signed-in user's lawyer founder
 * membership (P3 Task 6), for the dashboard card and the AI tools' «ادفع من
 * رصيد باقة المؤسس» choice:
 *
 *   { member, endsAt, credits: { drafting_work: { total, remaining },
 *     independent_output: { total, remaining } }, libraryUntil }
 *
 * Reads with the USER client under RLS (20261101_10: "founder seats: owner
 * reads own", "membership credits: owner reads own"; 20261019_10: "own
 * library grants"), each query also filtered to the session's own id. A
 * non-member — or a database where 20261101_10 has not run — answers
 * member: false with zeros and nulls. Any other failed read of the seat or
 * the credits answers 503, so a paying founder is never told he is not one.
 * Per viewer, never cached.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };
const SIGN_IN = { error: "سجّل الدخول لعرض عضويتك" };
const UNAVAILABLE = { error: "تعذّر تحميل عضويتك الآن — حاول بعد قليل" };

const isMissingTable = (code: string | undefined) => code === "42P01" || code === "PGRST205";

export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, SIGN_IN);
    if (auth instanceof NextResponse) {
      auth.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
      return auth;
    }
    const userId = auth.user.id;
    const now = new Date();

    const seatRead = await supabase
      .from("founder_seats")
      .select("id, status, ends_at")
      .eq("user_id", userId)
      .eq("campaign_id", FOUNDER_CAMPAIGN_ID)
      .eq("status", "active")
      .maybeSingle();
    if (seatRead.error) {
      if (isMissingTable(seatRead.error.code)) return NextResponse.json(NOT_A_FOUNDER, { headers: NO_STORE });
      console.error("[membership/founder] seat read failed:", seatRead.error.code, seatRead.error.message);
      return NextResponse.json(UNAVAILABLE, { status: 503, headers: NO_STORE });
    }
    const seat = (seatRead.data ?? null) as FounderSeatRow | null;
    if (!seat) return NextResponse.json(NOT_A_FOUNDER, { headers: NO_STORE });

    const [creditsRead, grantsRead] = await Promise.all([
      supabase
        .from("membership_credits")
        .select("seat_id, kind, total, remaining, ends_at")
        .eq("user_id", userId)
        .eq("seat_id", seat.id),
      supabase
        .from("library_access_grants")
        .select("id, plan_ref, source, starts_at, ends_at")
        .eq("user_id", userId)
        .gt("ends_at", now.toISOString())
        .order("starts_at", { ascending: true })
        .limit(50),
    ]);
    if (creditsRead.error) {
      console.error("[membership/founder] credits read failed:", creditsRead.error.code, creditsRead.error.message);
      return NextResponse.json(UNAVAILABLE, { status: 503, headers: NO_STORE });
    }
    // The library date is secondary: a failed read leaves it null, never the card.
    if (grantsRead.error && !isMissingLibraryGrantsTable(grantsRead.error.code)) {
      console.error("[membership/founder] library grants read failed:", grantsRead.error.code, grantsRead.error.message);
    }

    const view = founderMembershipView({
      seat,
      credits: (creditsRead.data ?? []) as FounderCreditRow[],
      grants: grantsRead.error ? [] : ((grantsRead.data ?? []) as LibraryGrantRow[]),
      now,
    });
    return NextResponse.json(view, { headers: NO_STORE });
  } catch (err) {
    console.error("[membership/founder] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(UNAVAILABLE, { status: 503, headers: NO_STORE });
  }
}
