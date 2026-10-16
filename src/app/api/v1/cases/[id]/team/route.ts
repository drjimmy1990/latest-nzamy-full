import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { createServiceClient } from "@/lib/supabase/server";
import { FIRM_ROLE_LABEL } from "@/constants/firmProfileReadiness";
import type { FirmRole } from "@/types/firmBackendReady";
import { buildCaseTeamDto, isTeamFeatureMissing, noTeamDto } from "./_team";

/**
 * /api/v1/cases/[id]/team — owner decision ١٦٩ («فريق القضية»), migration
 * 20261017_41_notes_visibility_case_team.sql.
 *
 * GET  → `{ data: CaseTeamDto }` (see `_team.ts`): who reads a «فريق القضية»
 *        note on this case, who a «كل المكتب» note reaches, and — for whoever
 *        may manage the team — the active colleagues who can still be added.
 * POST `{ userId }` → adds one active member of the case's firm.
 *
 * Every read and write goes through the caller's RLS client: the team list is
 * `public.case_team_user_ids` (empty unless the caller is an active member of
 * the case's firm), the add is the "case team addable by case managers"
 * policy (lead, filer or firm owner; the person added must be an active member
 * of the case's firm). The service client is used for display names only, for
 * ids those reads already returned — the same split `cases/[id]/notes` makes.
 *
 *   404  the case is unreadable to the caller
 *   503  20261017_41 has not run on this database yet
 */

async function readCase(supabase: SupabaseClient, id: string) {
  return supabase.from("service_requests").select("id, firm_id").eq("id", id).maybeSingle();
}

async function displayNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return names;
  try {
    const service = await createServiceClient();
    const { data, error } = await service.from("profiles").select("id, display_name").in("id", unique);
    if (error) {
      console.error("[cases/team] profile names failed:", error.message, error.code);
      return names;
    }
    for (const p of (data ?? []) as Array<{ id: string; display_name: string | null }>) {
      if (p.display_name) names.set(p.id, p.display_name);
    }
  } catch (err) {
    console.error("[cases/team] profile names threw:", err);
  }
  return names;
}

const roleLabel = (role: string) => FIRM_ROLE_LABEL[role as FirmRole];

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    const { data: caseRow, error: caseError } = await readCase(supabase, id);
    if (caseError) {
      console.error("[cases/team GET] case lookup failed:", caseError.message, caseError.code);
      return NextResponse.json({ error: "تعذّر تحميل فريق القضية." }, { status: 500 });
    }
    if (!caseRow) {
      return NextResponse.json({ error: "القضية غير موجودة أو لا تملك صلاحية قراءتها." }, { status: 404 });
    }
    const firmId = (caseRow as { firm_id: string | null }).firm_id;
    if (!firmId) return NextResponse.json({ data: noTeamDto() });

    const [teamRes, manageRes, membersRes] = await Promise.all([
      supabase.rpc("case_team_user_ids", { p_request: id }),
      supabase.rpc("can_manage_case_team", { p_request: id }),
      supabase.from("firm_members").select("user_id, role").eq("firm_id", firmId).eq("status", "active"),
    ]);
    for (const res of [teamRes, manageRes, membersRes]) {
      if (res.error) {
        if (isTeamFeatureMissing(res.error.code)) {
          return NextResponse.json({ error: "فريق القضية غير مفعّل بعد على هذه المنصة." }, { status: 503 });
        }
        console.error("[cases/team GET] read failed:", res.error.message, res.error.code);
        return NextResponse.json({ error: "تعذّر تحميل فريق القضية." }, { status: 500 });
      }
    }

    const teamRows = (teamRes.data ?? []) as Array<{ user_id: string; via: string }>;
    const memberRows = (membersRes.data ?? []) as Array<{ user_id: string; role: string | null }>;
    const canManage = manageRes.data === true;
    const names = await displayNames([
      ...teamRows.map((r) => r.user_id),
      ...(canManage ? memberRows.map((m) => m.user_id) : []),
    ]);

    return NextResponse.json({
      data: buildCaseTeamDto({ firmId, callerId: user.id, canManage, teamRows, memberRows, names, roleLabel }),
    });
  } catch (err) {
    console.error("[cases/team GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل فريق القضية." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    const body = (await request.json().catch(() => null)) as { userId?: unknown } | null;
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(userId)) {
      return NextResponse.json({ error: "اختر عضوًا من المكتب لإضافته." }, { status: 400 });
    }

    const { data: caseRow, error: caseError } = await readCase(supabase, id);
    if (caseError) {
      console.error("[cases/team POST] case lookup failed:", caseError.message, caseError.code);
      return NextResponse.json({ error: "تعذّر إضافة العضو إلى فريق القضية." }, { status: 500 });
    }
    if (!caseRow) {
      return NextResponse.json({ error: "القضية غير موجودة أو لا تملك صلاحية قراءتها." }, { status: 404 });
    }
    const firmId = (caseRow as { firm_id: string | null }).firm_id;
    if (!firmId) {
      return NextResponse.json({ error: "هذه القضية ليست ضمن مكتب، فلا فريق لها." }, { status: 400 });
    }

    const { error } = await supabase
      .from("case_team_members")
      .insert({ request_id: id, user_id: userId, firm_id: firmId, added_by: user.id });
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "هذا العضو في فريق القضية مسبقًا." }, { status: 409 });
      }
      if (error.code === "42501") {
        return NextResponse.json(
          { error: "لا يضيف إلى فريق القضية إلا المحامي المسؤول أو منشئ القضية أو صاحب المكتب، ولا يُضاف إلا عضو نشط في مكتب القضية." },
          { status: 403 },
        );
      }
      if (isTeamFeatureMissing(error.code)) {
        return NextResponse.json({ error: "فريق القضية غير مفعّل بعد على هذه المنصة." }, { status: 503 });
      }
      console.error("[cases/team POST] insert failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر إضافة العضو إلى فريق القضية." }, { status: 500 });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[cases/team POST] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر إضافة العضو إلى فريق القضية." }, { status: 500 });
  }
}
