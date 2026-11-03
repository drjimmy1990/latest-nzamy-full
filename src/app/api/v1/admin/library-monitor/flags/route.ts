import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { createServiceClient } from "@/lib/supabase/server";
import { isMigrationMissing } from "@/lib/library/securityLockAdmin";
import { FLAG_SELECT, MONITOR_MIGRATION_MISSING_AR, toFlagDto, type FlagRow } from "@/lib/library/monitorAdmin";
import { peopleFor } from "@/lib/library/monitorAdminServer";

/**
 * «نشاط المكتبة» — accounts «قيد المراجعة» (public.library_review_flags,
 * 20261031_10), newest first. Any admin (requireStaff("read")).
 *
 * GET ?state=open|all
 */

export const dynamic = "force-dynamic";
const MAX_ROWS = 200;

export async function GET(request: NextRequest) {
  try {
    const gate = await requireStaff("read");
    if (!gate.ok) return gate.response;

    const state = new URL(request.url).searchParams.get("state") === "all" ? "all" : "open";
    const service = await createServiceClient();
    let query = service
      .from("library_review_flags")
      .select(FLAG_SELECT)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);
    if (state === "open") query = query.is("cleared_at", null);

    const { data, error } = await query;
    if (error) {
      if (isMigrationMissing(error.code)) {
        return NextResponse.json({ data: [], migrationMissing: true, message: MONITOR_MIGRATION_MISSING_AR });
      }
      console.error("[admin/library-monitor/flags GET] query failed:", error.code);
      return NextResponse.json({ error: "تعذّر تحميل قائمة المراجعة." }, { status: 500 });
    }
    const rows = (data ?? []) as FlagRow[];
    const people = await peopleFor(rows.flatMap((r) => [r.user_id, r.cleared_by ?? ""]));
    return NextResponse.json(
      { data: rows.map((r) => toFlagDto(r, people)), migrationMissing: false },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    console.error("[admin/library-monitor/flags GET] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
