import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { resolveCallerFirm } from "@/lib/auth/firmMembershipAccess";
import {
  HEARINGS_SELECT,
  hearingCaseInfosFor,
  hearingNamesFor,
  toDto,
  type HearingRow,
} from "@/app/api/v1/lawyer/hearings/_shared";

/**
 * GET /api/v1/firm/hearings?scope=mine|firm — N13 (batch l12; owner RAW [11]):
 * the firm's «جلساتي / كل جلسات المكتب».
 *
 *   scope=mine (default)  the caller's own hearings and the ones assigned to him;
 *   scope=firm            every hearing of the caller's firm that RLS lets him
 *                         read — «حسب الصلاحية»: a trainee or a secretary (and,
 *                         by the firm_case_scope setting, the office roles) sees
 *                         only what is assigned to him, a restricted case's
 *                         hearings only its team (case_visible, 20261129_10 /
 *                         20261201_10 / 20261202_80). Nothing is read with the
 *                         service role.
 * Each row carries the linked case's columns for the Word / print table.
 *
 *   200 { data: HearingDto[], total, scope }      404 no firm on this account
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { data: firm, error: firmError } = await resolveCallerFirm(supabase, user.id);
    if (firmError) {
      console.error("[firm/hearings GET] firm lookup failed:", firmError.code);
      return NextResponse.json({ error: "تعذّر تحميل جلسات المكتب." }, { status: 500 });
    }
    if (!firm) return NextResponse.json({ error: "لا يوجد مكتب مرتبط بهذا الحساب." }, { status: 404 });

    const params = new URL(request.url).searchParams;
    const scope = params.get("scope") === "firm" ? "firm" : "mine";
    const limitParam = Number(params.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 300;

    let query = supabase.from("hearings").select(HEARINGS_SELECT, { count: "exact" });
    query = scope === "firm"
      ? query.eq("firm_id", firm.id)
      : query.or(`owner_user_id.eq.${user.id},assignee_user_id.eq.${user.id}`);
    const { data, error, count } = await query
      .order("hearing_date", { ascending: true })
      .order("hearing_time", { ascending: true, nullsFirst: false })
      .limit(limit);
    if (error) {
      console.error("[firm/hearings GET] query failed:", error.code);
      return NextResponse.json({ error: "تعذّر تحميل جلسات المكتب." }, { status: 500 });
    }
    const rows = (data ?? []) as HearingRow[];
    const [names, caseInfos] = await Promise.all([hearingNamesFor(supabase, user.id, rows), hearingCaseInfosFor(supabase, rows)]);
    return NextResponse.json(
      { data: rows.map((row) => toDto(row, user.id, names, caseInfos)), total: count ?? rows.length, scope },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    console.error("[firm/hearings GET] threw:", (err as { name?: string } | null)?.name ?? "error");
    return NextResponse.json({ error: "تعذّر تحميل جلسات المكتب." }, { status: 500 });
  }
}
