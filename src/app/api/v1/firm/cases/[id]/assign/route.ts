import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { resolveCallerFirm } from "@/lib/auth/firmMembershipAccess";
import { createServiceClient } from "@/lib/supabase/server";
import { recordNotification } from "@/lib/notify";
import { FIRM_CASE_ASSIGN_ROLES, FIRM_CASE_ASSIGNEE_ROLES } from "../../_caseAssign";

/**
 * /api/v1/firm/cases/[id]/assign — owner package 13 Nov, N03-40
 * («إسناد القضية إلى محامٍ في المكتب»).
 *
 * A case is a `service_requests` row; the lawyer it is assigned to is
 * `assigned_to` — the column the firm's workload («القضايا المسندة»), the
 * lawyer's case list and the chat already read. No new column.
 *
 * WHO: the caller's firm role must be on the «توزيع القضايا» rule
 * (managing_partner, partner, senior_lawyer — entityRouteAccess.ts), the firm
 * owner included.
 *
 * WHICH CASES: only a row whose `firm_id` is the caller's firm — a case filed
 * inside the firm by a member. A case routed to the firm from outside
 * (a client's request, `firm_id` null, `assigned_to` = the firm account) is
 * refused (409): re-pointing it would drop the firm account's only access path
 * to it and change the lawyer the client deals with. Reported as a gap.
 *
 * TO WHOM: an ACTIVE member of the same firm in a legal role
 * (FIRM_CASE_ASSIGNEE_ROLES).
 *
 * HOW: `assigned_to` is locked against session writes by
 * trg_00_service_requests_session_guard (20261018_04), so after the checks
 * above the write goes through the service client, scoped to `id` AND the
 * caller's `firm_id`. The new assignee is notified.
 *
 * GET  → { assignee: { userId, name } | null, options: [{ userId, name }],
 *          canAssign, assignable, reason? }
 * POST → body { assigneeUserId } → { assignee: { userId, name } }
 */

interface CaseRow {
  id: string;
  title: string | null;
  firm_id: string | null;
  assigned_to: string | null;
}

async function loadContext(supabase: Parameters<typeof resolveCallerFirm>[0], userId: string, caseId: string) {
  const { data: callerFirm, error: firmError } = await resolveCallerFirm(supabase, userId);
  if (firmError) return { error: NextResponse.json({ error: "تعذّر قراءة عضوية المكتب." }, { status: 500 }) };
  if (!callerFirm) return { error: NextResponse.json({ error: "لا يوجد مكتب مرتبط بهذا الحساب." }, { status: 404 }) };

  // Read through the caller's own client: RLS decides whether he sees the case at all.
  const { data: row, error: caseError } = await supabase
    .from("service_requests")
    .select("id, title, firm_id, assigned_to")
    .eq("id", caseId)
    .maybeSingle();
  if (caseError) {
    console.error("[firm/cases/assign] case read failed:", caseError.message, caseError.code);
    return { error: NextResponse.json({ error: "تعذّر قراءة القضية." }, { status: 500 }) };
  }
  if (!row) return { error: NextResponse.json({ error: "القضية غير موجودة." }, { status: 404 }) };
  return { callerFirm, row: row as CaseRow };
}

/** Active members of the firm in a legal role, with their names (service role: profiles RLS is own-row only). */
async function readAssignees(firmId: string): Promise<{ userId: string; name: string | null }[]> {
  const svc = await createServiceClient();
  const { data, error } = await svc
    .from("firm_members")
    .select("user_id, role")
    .eq("firm_id", firmId)
    .eq("status", "active");
  if (error) {
    console.error("[firm/cases/assign] roster read failed:", error.message, error.code);
    return [];
  }
  const ids = Array.from(new Set(
    ((data ?? []) as { user_id?: unknown; role?: unknown }[])
      .filter((r) => typeof r.user_id === "string" && typeof r.role === "string" && FIRM_CASE_ASSIGNEE_ROLES.has(r.role))
      .map((r) => r.user_id as string),
  ));
  if (ids.length === 0) return [];
  const names: Record<string, string> = {};
  const { data: profiles, error: nameError } = await svc.from("profiles").select("id, display_name").in("id", ids);
  if (nameError) console.error("[firm/cases/assign] names read failed:", nameError.message, nameError.code);
  for (const p of (profiles ?? []) as { id: string; display_name: string | null }[]) {
    if (p.display_name?.trim()) names[p.id] = p.display_name.trim();
  }
  return ids.map((userId) => ({ userId, name: names[userId] ?? null }));
}

const NOT_FIRM_CASE_AR = "هذه القضية ليست مسجّلة باسم المكتب (وصلت من خارج المكتب أو أُنشئت قبل الانضمام إليه)، فلا تُسند من هنا.";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    const ctx = await loadContext(supabase, user.id, id);
    if ("error" in ctx) return ctx.error;
    const { callerFirm, row } = ctx;

    const canAssign = auth.userType === "admin" || FIRM_CASE_ASSIGN_ROLES.has(callerFirm.role);
    const assignable = row.firm_id === callerFirm.id;
    const options = canAssign && assignable ? await readAssignees(callerFirm.id) : [];

    let assignee: { userId: string; name: string | null } | null = null;
    if (row.assigned_to) {
      const known = options.find((o) => o.userId === row.assigned_to);
      if (known) assignee = known;
      else if (assignable) {
        // A former member or the firm account: name it only if he is on this firm's roster (any status).
        const svc = await createServiceClient();
        const { data: onRoster } = await svc
          .from("firm_members").select("user_id").eq("firm_id", callerFirm.id).eq("user_id", row.assigned_to).maybeSingle();
        let name: string | null = null;
        if (onRoster) {
          const { data: p } = await svc.from("profiles").select("display_name").eq("id", row.assigned_to).maybeSingle();
          name = (p?.display_name as string | null | undefined)?.trim() || null;
        }
        assignee = { userId: row.assigned_to, name };
      }
    }

    return NextResponse.json({
      assignee,
      options,
      canAssign,
      assignable,
      ...(assignable ? {} : { reason: NOT_FIRM_CASE_AR }),
    });
  } catch (err) {
    console.error("[firm/cases/assign GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر قراءة إسناد القضية." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    const body = await request.json().catch(() => null) as { assigneeUserId?: unknown } | null;
    const assigneeUserId = typeof body?.assigneeUserId === "string" ? body.assigneeUserId.trim() : "";
    if (!assigneeUserId) return NextResponse.json({ error: "اختر المحامي المسؤول." }, { status: 400 });

    const ctx = await loadContext(supabase, user.id, id);
    if ("error" in ctx) return ctx.error;
    const { callerFirm, row } = ctx;

    if (auth.userType !== "admin" && !FIRM_CASE_ASSIGN_ROLES.has(callerFirm.role)) {
      return NextResponse.json({ error: "إسناد القضايا للشريك المدير والشركاء والمحامين الأوائل." }, { status: 403 });
    }
    if (row.firm_id !== callerFirm.id) {
      return NextResponse.json({ error: NOT_FIRM_CASE_AR }, { status: 409 });
    }
    const options = await readAssignees(callerFirm.id);
    const target = options.find((o) => o.userId === assigneeUserId);
    if (!target) {
      return NextResponse.json({ error: "المحامي المختار ليس عضواً نشطاً في المكتب." }, { status: 400 });
    }
    if (row.assigned_to === target.userId) {
      return NextResponse.json({ assignee: target });
    }

    const svc = await createServiceClient();
    const { data: updated, error: updateError } = await svc
      .from("service_requests")
      .update({ assigned_to: target.userId })
      .eq("id", row.id)
      .eq("firm_id", callerFirm.id)
      .select("id")
      .maybeSingle();
    if (updateError) {
      console.error("[firm/cases/assign POST] update failed:", updateError.message, updateError.code);
      return NextResponse.json({ error: "تعذّر إسناد القضية." }, { status: 500 });
    }
    if (!updated) return NextResponse.json({ error: "القضية غير موجودة." }, { status: 404 });

    if (target.userId !== user.id) {
      await recordNotification({
        userId: target.userId,
        title: "أُسندت إليك قضية",
        body: (row.title ?? "").trim() || "قضية من قضايا المكتب",
        href: `/dashboard/firm/cases/${encodeURIComponent(row.id)}`,
      });
    }
    return NextResponse.json({ assignee: target });
  } catch (err) {
    console.error("[firm/cases/assign POST] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر إسناد القضية." }, { status: 500 });
  }
}
