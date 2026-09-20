import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  daysUntilEffectiveDate,
  saudiCalendarDate,
} from "@/lib/services/enactmentCountdown";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const today = saudiCalendarDate();
    const { data, error } = await supabase
      .schema("library")
      .from("laws")
      .select(
        "slug, title, title_en, issuing_instrument, publication_date_hijri, effective_date_hijri, effective_date_gregorian, gazette_issue_number",
      )
      .not("effective_date_gregorian", "is", null)
      .gt("effective_date_gregorian", today)
      .order("effective_date_gregorian", { ascending: true })
      .limit(12);

    if (error) {
      console.error("[library/enactments] query failed:", error.message, error.code);
      return NextResponse.json(
        { error: "تعذّر تحميل بيانات النفاذ الموثقة." },
        { status: 503 },
      );
    }

    const items = (data ?? []).flatMap((row) => {
      const effectiveDate = row.effective_date_gregorian as string | null;
      const daysRemaining = effectiveDate
        ? daysUntilEffectiveDate(effectiveDate)
        : null;
      if (daysRemaining === null) return [];
      return [{
        slug: row.slug,
        title: row.title,
        titleEn: row.title_en,
        issuingInstrument: row.issuing_instrument,
        publicationDateHijri: row.publication_date_hijri,
        effectiveDateHijri: row.effective_date_hijri,
        effectiveDateGregorian: effectiveDate,
        gazetteIssueNumber: row.gazette_issue_number,
        daysRemaining,
      }];
    });

    return NextResponse.json({ data: items, source: "library.laws" });
  } catch (error) {
    console.error("[library/enactments] unexpected error:", error);
    return NextResponse.json(
      { error: "تعذّر تحميل بيانات النفاذ الموثقة." },
      { status: 503 },
    );
  }
}
