import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getUserTier, TIER_RANK } from "@/lib/access-control";
import { libraryGate } from "@/lib/library-gate";
import { TIER_SHAPED_CACHE_CONTROL } from "@/app/api/library/laws/[slug]/_official-meta";
import { RECENT_ENACTMENT_WINDOW_DAYS } from "@/lib/services/enactmentCountdown";
import { hijriYearTokens, likeYearClauses, saudiHijriToday } from "@/lib/library/monitorFeed";
import { splitEnactments, type EnactmentRow } from "@/lib/library/enactmentFeed";

export const dynamic = "force-dynamic";

/**
 * issuing_instrument, publication_date_hijri and gazette_issue_number are
 * column-locked for the anon key (migration 20261004_01): the read runs as the
 * service role and `base()` below masks them for a non-subscriber (T28-22).
 */
const ENACTMENT_COLUMNS =
  "slug, title, title_en, status, issuing_instrument, publication_date_hijri, effective_date_hijri, effective_date_gregorian, gazette_issue_number";
const LIST_LIMIT = 12;
/** Effective dates up to this many Hijri years ahead count as upcoming. */
const UPCOMING_YEARS_AHEAD = 5;

/**
 * GET /api/library/enactments
 *
 *   data    — upcoming: effective AFTER today (Saudi date), soonest first,
 *             ≤ 12, each with `daysRemaining` (≥ 1). Unchanged shape.
 *   recent  — T28-27 (owner option ب): effective today or in the
 *             RECENT_ENACTMENT_WINDOW_DAYS (14) days before, newest first,
 *             ≤ 12, each with `daysSinceEffective` (0..14). A law effective
 *             TODAY is here (day 0), not in `data`.
 *   officialMetaLocked — T28-22: true for a non-subscriber, whose items carry
 *             `issuingInstrument: null` and `gazetteIssueNumber: null`.
 *   recentWindowDays, source.
 *
 * Tier-shaped, so `Cache-Control: private, no-store`.
 */
export async function GET() {
  const gate = await libraryGate();
  if (gate) return gate;

  try {
    const supabase = await createClient();

    let userId: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }
    // T28-22: the same subscriber rule as the law page and the catalogue
    // (tier pro and above).
    const isSubscriber = userId
      ? (TIER_RANK[await getUserTier(userId)] ?? 0) >= TIER_RANK.pro
      : false;

    // One clock for both lists, so a request that straddles Saudi midnight
    // cannot put the same law in both or in neither.
    const now = new Date();
    const todayHijri = saudiHijriToday(now);
    if (!todayHijri) {
      // No Umm al-Qura data in this runtime: every day count would be wrong.
      console.error("[library/enactments] Umm al-Qura calendar unavailable in this runtime");
      return NextResponse.json(
        { error: "تعذّر تحميل بيانات النفاذ الموثقة." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    // `effective_date_gregorian` is empty on every law (2026-09-28); the dates
    // are Hijri text in mixed shapes. Narrow by Hijri year tokens (last year
    // → UPCOMING_YEARS_AHEAD), then resolve and split in enactmentFeed.ts —
    // the same prefilter and parser as /api/library/monitor.
    const y = todayHijri.year;
    const tokens = hijriYearTokens(y - 1, y + UPCOMING_YEARS_AHEAD);
    const serverOnly = await createServiceClient();
    const { data, error } = await serverOnly
      .schema("library")
      .from("laws")
      .select(ENACTMENT_COLUMNS)
      .or(`${likeYearClauses(["effective_date_hijri"], tokens)},effective_date_gregorian.not.is.null`)
      .limit(1000);

    if (error) {
      console.error("[library/enactments] query failed:", error.message, error.code);
      return NextResponse.json(
        { error: "تعذّر تحميل بيانات النفاذ الموثقة." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const split = splitEnactments((data ?? []) as EnactmentRow[], now, LIST_LIMIT);

    const base = (row: EnactmentRow, effectiveDate: string) => ({
      slug: row.slug,
      title: row.title,
      titleEn: row.title_en,
      issuingInstrument: isSubscriber ? row.issuing_instrument : null,
      // Gazette publication date — subscriber data like the gazette number.
      publicationDateHijri: isSubscriber ? row.publication_date_hijri : null,
      effectiveDateHijri: row.effective_date_hijri,
      effectiveDateGregorian: effectiveDate,
      gazetteIssueNumber: isSubscriber ? row.gazette_issue_number : null,
    });

    const items = split.upcoming.map((row) => ({
      ...base(row, row.effectiveIso),
      daysRemaining: row.daysRemaining,
    }));

    const recentItems = split.recent.map((row) => ({
      ...base(row, row.effectiveIso),
      daysSinceEffective: row.daysSinceEffective,
    }));

    return NextResponse.json(
      {
        data: items,
        recent: recentItems,
        recentWindowDays: RECENT_ENACTMENT_WINDOW_DAYS,
        officialMetaLocked: !isSubscriber,
        source: "library.laws",
      },
      { headers: { "Cache-Control": TIER_SHAPED_CACHE_CONTROL } },
    );
  } catch (error) {
    console.error("[library/enactments] unexpected error:", error);
    return NextResponse.json(
      { error: "تعذّر تحميل بيانات النفاذ الموثقة." },
      { status: 503 },
    );
  }
}
