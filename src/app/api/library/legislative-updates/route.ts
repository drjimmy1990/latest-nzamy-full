import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { libraryGate } from "@/lib/library-gate";
import { isMissingColumnError } from "@/lib/library/optionalColumn";
import { hijriTodayKey, LEGISLATIVE_UPDATES_LIMIT, LEGISLATIVE_UPDATES_READ, shapeLegislativeUpdates } from "@/lib/library/legislativeUpdates";

/**
 * GET /api/library/legislative-updates — the laws with the newest «آخر تحديث
 * تشريعي» (owner TODO P1-12; the /laws «أحدث التحديثات التشريعية» card).
 *
 * The same for every viewer: title, slug and the date ALONE (owner ٣١٨).
 * issue_date_hijri, latest_update and catalogue_recency_key are locked for the
 * anon key, so this read runs as the service role; only latest_update's DATE
 * is read (a JSON-path alias, as /api/library/init does — its instrument text
 * carries review notes) and the key is ordered by, never sent. Before
 * 20261025_40 (no recency key) or on a failed read the list is empty and the
 * card is not shown: never an invented item.
 */

export const dynamic = "force-dynamic";

const COLUMNS = "slug, title, status, issue_date_hijri, latest_update_date:latest_update->>date_hijri";
const HEADERS = { "Cache-Control": "private, max-age=300" };

export async function GET() {
  const gate = await libraryGate();
  if (gate) return gate;
  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .schema("library")
      .from("laws")
      .select(COLUMNS)
      .order("catalogue_recency_key", { ascending: false, nullsFirst: false })
      .order("slug", { ascending: true })
      .limit(LEGISLATIVE_UPDATES_READ);
    if (error) {
      if (!isMissingColumnError(error, "catalogue_recency_key")) {
        console.error("[library/legislative-updates] read failed:", error.code ?? "no-code", error.message);
      }
      return NextResponse.json({ items: [] }, { headers: HEADERS });
    }
    const rows = (Array.isArray(data) ? data : []) as unknown as Array<Record<string, unknown>>;
    return NextResponse.json({ items: shapeLegislativeUpdates(rows, LEGISLATIVE_UPDATES_LIMIT, hijriTodayKey()) }, { headers: HEADERS });
  } catch (err) {
    console.error("[library/legislative-updates] threw:", err);
    return NextResponse.json({ items: [] }, { headers: HEADERS });
  }
}
