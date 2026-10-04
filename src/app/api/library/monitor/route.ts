import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { libraryGate } from "@/lib/library-gate";
import { getUserTier, TIER_RANK } from "@/lib/access-control";
import {
  buildLatest,
  buildRecentlyEffective,
  buildUpcoming,
  hijriYearTokens,
  likeYearClauses,
  maskOfficialDates,
  saudiHijriToday,
  type MonitorLawRow,
  type MonitorOrderRow,
} from "@/lib/library/monitorFeed";

/**
 * GET /api/library/monitor — the live feed behind «راصد التشريعات».
 *
 * Reads ONLY library.laws and library.decrees_circulars — never
 * library.articles, which is being locked to the server. Selects titles,
 * kinds, statuses and dates; no issuing instrument, decree number, gazette
 * number or official link leaves this route (see monitorFeed.ts).
 *
 * Response: { upcoming, recentlyEffective, latest, today, ordersAvailable }.
 * Every date column in both tables is Hijri TEXT in mixed shapes, so each
 * query is narrowed server-side by year tokens (`like *1448*`, both digit
 * systems) and the rest is parsed and sorted in monitorFeed.ts.
 *
 * issue_date_hijri / publication_date_hijri are column-locked for the anon key
 * (migration 20261004_01) — selecting OR filtering on them needs the column —
 * so the two laws reads run as the service role; maskOfficialDates is the
 * mask. The orders read stays on the request client.
 *
 * PostgREST caps a response at 1,000 rows; every prefilter below returns a
 * few hundred at most (probed 2026-09-28: 71 effective dates ≥ 1447, 288 laws
 * issued ≥ 1447).
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const FAILED = "تعذّر تحميل راصد التشريعات من المكتبة — حاول مجدداً بعد قليل.";

const LAW_COLUMNS = "slug, title, type, status, issue_date_hijri, publication_date_hijri, effective_date_hijri";
const ORDER_COLUMNS = "id, title, instrument_ar, date";

/** Effective dates up to this many Hijri years ahead count as «قيد النفاذ». */
const UPCOMING_YEARS_AHEAD = 5;

export async function GET() {
  const gate = await libraryGate();
  if (gate) return gate;

  try {
    const now = new Date();
    const todayHijri = saudiHijriToday(now);
    if (!todayHijri) {
      // No Umm al-Qura data in this runtime: every day count would be wrong,
      // so say so rather than return an empty «upcoming» that looks true.
      console.error("[library/monitor] Umm al-Qura calendar unavailable in this runtime");
      return NextResponse.json({ error: FAILED }, { status: 503, headers: NO_STORE });
    }

    const supabase = await createClient();

    // T28-22: the same subscriber rule as the law page, the catalogue and the
    // countdown (tier pro and above) — issue and gazette dates are theirs.
    let userId: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }
    const isSubscriber = userId
      ? (TIER_RANK[await getUserTier(userId)] ?? 0) >= TIER_RANK.pro
      : false;

    const y = todayHijri.year;

    const effectiveTokens = hijriYearTokens(y - 1, y + UPCOMING_YEARS_AHEAD);
    const latestTokens = hijriYearTokens(y - 1, y);

    const serverOnly = await createServiceClient();
    const [effectiveRes, latestLawsRes, ordersRes] = await Promise.all([
      serverOnly
        .schema("library")
        .from("laws")
        .select(LAW_COLUMNS)
        .or(`${likeYearClauses(["effective_date_hijri"], effectiveTokens)},status.eq.deferred_effective`)
        .limit(1000),
      serverOnly
        .schema("library")
        .from("laws")
        .select(LAW_COLUMNS)
        .or(likeYearClauses(["issue_date_hijri", "publication_date_hijri"], latestTokens))
        .limit(1000),
      supabase
        .schema("library")
        .from("decrees_circulars")
        .select(ORDER_COLUMNS)
        .or(likeYearClauses(["date"], latestTokens))
        .limit(1000),
    ]);

    if (effectiveRes.error || latestLawsRes.error) {
      const err = effectiveRes.error ?? latestLawsRes.error;
      console.error("[library/monitor] laws query failed:", err?.message, err?.code);
      return NextResponse.json({ error: FAILED }, { status: 503, headers: NO_STORE });
    }
    if (ordersRes.error) {
      console.error("[library/monitor] orders query failed:", ordersRes.error.message, ordersRes.error.code);
    }

    const effectiveRows = (effectiveRes.data ?? []) as MonitorLawRow[];
    const latestLawRows = (latestLawsRes.data ?? []) as MonitorLawRow[];
    const orderRows = ordersRes.error ? [] : ((ordersRes.data ?? []) as MonitorOrderRow[]);

    return NextResponse.json(
      {
        upcoming: maskOfficialDates(buildUpcoming(effectiveRows, now), isSubscriber),
        recentlyEffective: maskOfficialDates(buildRecentlyEffective(effectiveRows, now), isSubscriber),
        latest: maskOfficialDates(buildLatest(latestLawRows, orderRows, todayHijri), isSubscriber),
        officialMetaLocked: !isSubscriber,
        today: `${todayHijri.year}/${String(todayHijri.month).padStart(2, "0")}/${String(todayHijri.day).padStart(2, "0")}`,
        // false when the orders table could not be read: the page says the
        // «أحدث الإصدارات» list is laws-only this time instead of implying
        // there were no new orders.
        ordersAvailable: !ordersRes.error,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("[library/monitor] unexpected error:", error);
    return NextResponse.json({ error: FAILED }, { status: 503, headers: NO_STORE });
  }
}
