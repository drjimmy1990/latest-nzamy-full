import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { officePlanRefusal } from "@/lib/auth/assertOfficePlan";
import { restrictionErrorResponse, restrictionFeatureMissing } from "./_restriction";

/**
 * /api/v1/cases/[id]/restriction — N01-19 «قضية مقيّدة» (migration
 * 20261125_40_restricted_cases.sql).
 *
 * GET  → `{ data: { firmCase, restricted, canChange } }`
 * POST `{ restricted: boolean }` → `{ data: { restricted } }`
 *
 * A restricted FIRM case is read only by its filer, its lead, its case team
 * (active members), the firm owner, active managing partners and platform
 * admins — public.case_visible() behind RESTRICTIVE policies. Every read here
 * goes through the caller's RLS client, so a member who may not see the case
 * gets the same 404 as for a case that does not exist. The write is the
 * SECURITY DEFINER RPC public.set_case_restricted, which makes its own check
 * (firm owner, managing partner, or the case's lead/filer while active in the
 * firm); the route never trusts the body for who may do it.
 *
 *   404  the case is unreadable to the caller
 *   503  20261125_40 has not run on this database yet
 */

export const dynamic = "force-dynamic";

async function readCase(supabase: SupabaseClient, id: string) {
  return supabase.from("service_requests").select("id, firm_id, is_restricted").eq("id", id).maybeSingle();
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id } = await context.params;

    const { data: row, error } = await readCase(supabase, id);
    if (error) {
      if (restrictionFeatureMissing(error.code)) {
        return NextResponse.json({ error: "تقييد القضايا غير مفعّل بعد على هذه المنصة." }, { status: 503 });
      }
      console.error("[cases/restriction GET] read failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر قراءة حالة القضية." }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "القضية غير موجودة أو لا تملك صلاحية قراءتها." }, { status: 404 });
    }
    const caseRow = row as { firm_id: string | null; is_restricted: boolean | null };
    if (!caseRow.firm_id) {
      return NextResponse.json({ data: { firmCase: false, restricted: false, canChange: false } });
    }

    const can = await supabase.rpc("can_restrict_case", { p_request: id });
    if (can.error) {
      if (restrictionFeatureMissing(can.error.code)) {
        return NextResponse.json({ error: "تقييد القضايا غير مفعّل بعد على هذه المنصة." }, { status: 503 });
      }
      console.error("[cases/restriction GET] can_restrict_case failed:", can.error.message, can.error.code);
      return NextResponse.json({ error: "تعذّر قراءة حالة القضية." }, { status: 500 });
    }

    return NextResponse.json({
      data: { firmCase: true, restricted: caseRow.is_restricted === true, canChange: can.data === true },
    });
  } catch (err) {
    console.error("[cases/restriction GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر قراءة حالة القضية." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    // l19 review (access N9): the case team and «قضية مقيّدة» belong to the paid
    // team («أعضاء الفريق وصلاحياتهم» — the firm plans; ق٢٦-٤ / ق٢٦-٥).
    const officeLocked = await officePlanRefusal(auth.supabase, "team", auth.userType);
    if (officeLocked) return officeLocked;
    const { supabase } = auth;
    const { id } = await context.params;

    const body = (await request.json().catch(() => null)) as { restricted?: unknown } | null;
    if (typeof body?.restricted !== "boolean") {
      return NextResponse.json({ error: "حدّد هل تُقيَّد القضية أم تُفتح للمكتب." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("set_case_restricted", {
      p_request: id,
      p_restricted: body.restricted,
    });
    if (error) {
      const mapped = restrictionErrorResponse(error.code);
      if (mapped.status === 500) {
        console.error("[cases/restriction POST] rpc failed:", error.message, error.code);
      }
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    return NextResponse.json({ data: { restricted: data === true } });
  } catch (err) {
    console.error("[cases/restriction POST] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر حفظ حالة التقييد." }, { status: 500 });
  }
}
