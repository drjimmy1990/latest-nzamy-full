import { NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import type { HolidayRule } from "@/lib/services/deadlineEngine";

/**
 * /api/v1/court-holidays — Phase 5 (رادار المهل).
 *
 * Backed by `public.court_holidays` (migration 20260904_phase5_deadline_radar.sql),
 * readable by any signed-in user. Returned in `deadlineEngine.ts`'s
 * `HolidayRule` shape (camelCase) so a caller can hand this list straight to
 * `resolveHolidayDates` without a translation step — the same shape the
 * calculator page and this route's own POST-side computation both consume.
 * Hijri recurrences are NOT resolved here; only the API route that computes
 * a due date resolves them, with `hijriResolved` reported alongside.
 */

interface HolidayRow {
  id: string;
  title_ar: string;
  kind: string;
  greg_month: number | null;
  greg_day: number | null;
  hijri_month: number | null;
  hijri_day: number | null;
  length_days: number;
  start_date: string | null;
  end_date: string | null;
  approximate: boolean;
  active: boolean;
}

function toDto(row: HolidayRow): HolidayRule {
  return {
    id: row.id,
    titleAr: row.title_ar,
    kind: row.kind as HolidayRule["kind"],
    gregMonth: row.greg_month,
    gregDay: row.greg_day,
    hijriMonth: row.hijri_month,
    hijriDay: row.hijri_day,
    lengthDays: row.length_days,
    startDate: row.start_date,
    endDate: row.end_date,
    approximate: row.approximate,
    active: row.active,
  };
}

const HOLIDAY_SELECT =
  "id, title_ar, kind, greg_month, greg_day, hijri_month, hijri_day, length_days, start_date, end_date, approximate, active";

/** GET /api/v1/court-holidays → { data: HolidayRule[], total } — active rows only. */
export async function GET() {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const { data, error, count } = await supabase
      .from("court_holidays")
      .select(HOLIDAY_SELECT, { count: "exact" })
      .eq("active", true)
      .order("title_ar", { ascending: true });

    if (error) {
      console.error("[court-holidays GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل العطل الرسمية." }, { status: 500 });
    }

    const rows = (data ?? []) as HolidayRow[];
    return NextResponse.json({ data: rows.map(toDto), total: count ?? rows.length });
  } catch (err) {
    console.error("[court-holidays GET] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
