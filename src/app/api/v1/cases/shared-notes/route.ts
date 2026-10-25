import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { liveRowsOnly } from "@/lib/services/archivedRows";

/**
 * GET /api/v1/cases/shared-notes?ids=<id>,<id>,… — owner decision ١٦٩:
 * «تظهر في جدول القضية كعلامة 📝 ملاحظة مشتركة». For each case id, how many
 * SHARED notes (`case_team` or `firm`) the caller can read on it.
 *
 * The count is whatever case_notes RLS admits (20261017_41): a note shared
 * with a case team the caller is not on is not counted, so the marker never
 * promises a note the case page would not show. Private notes are not counted
 * — they are nobody's shared note, the author's own included.
 *
 * Response: `{ data: Record<caseId, number> }` (cases with none are absent).
 * Ids are read in batches of 50 so the PostgREST URL stays short.
 */

const MAX_IDS = 200;
const BATCH = 50;

export async function GET(request: NextRequest) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const raw = request.nextUrl.searchParams.get("ids") ?? "";
    const ids = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
    if (ids.length === 0) return NextResponse.json({ data: {} });
    if (ids.length > MAX_IDS) {
      return NextResponse.json({ error: `الحد الأقصى ${MAX_IDS} قضية في الطلب الواحد.` }, { status: 400 });
    }

    const counts: Record<string, number> = {};
    for (let i = 0; i < ids.length; i += BATCH) {
      // Archived notes (N3.9) are nobody's shared note any more.
      const batch = ids.slice(i, i + BATCH);
      const { data, error } = await liveRowsOnly((excludeArchived) => {
        const q = supabase
          .from("case_notes")
          .select("request_id")
          .in("request_id", batch)
          .in("visibility", ["case_team", "firm"]);
        return excludeArchived ? q.is("deleted_at", null) : q;
      });
      if (error) {
        console.error("[cases/shared-notes GET] query failed:", error.message, error.code);
        return NextResponse.json({ error: "تعذّر قراءة الملاحظات المشتركة." }, { status: 500 });
      }
      for (const row of (data ?? []) as Array<{ request_id: string }>) {
        counts[row.request_id] = (counts[row.request_id] ?? 0) + 1;
      }
    }
    return NextResponse.json({ data: counts });
  } catch (err) {
    console.error("[cases/shared-notes GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر قراءة الملاحظات المشتركة." }, { status: 500 });
  }
}
