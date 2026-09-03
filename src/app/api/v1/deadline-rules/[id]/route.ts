import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";

/**
 * /api/v1/deadline-rules/[id] — Phase 5 (رادار المهل).
 *
 * PATCH { verifiedByOwner } only. A PLATFORM rule (`owner_user_id` null) is
 * the platform's own legal claim — only the owner of the platform (a
 * practising lawyer, `userType === 'admin'`) may confirm one, never a tenant
 * lawyer just because RLS lets them read it. A lawyer's/firm's OWN rule is
 * theirs to confirm. Either way `verified_at` is stamped (or cleared, when
 * un-verifying) here, not left for the client to guess at.
 */

interface RuleRow {
  id: string;
  code: string;
  owner_user_id: string | null;
  firm_id: string | null;
  title_ar: string;
  description_ar: string;
  source_ar: string;
  trigger_kind: string;
  period_days: number;
  calendar: string;
  count_from_next_day: boolean;
  roll_forward_if_holiday: boolean;
  applies_to_degrees: string[];
  is_platform_default: boolean;
  verified_by_owner: boolean;
  verified_at: string | null;
  active: boolean;
}

function toDto(row: RuleRow) {
  return {
    id: row.id,
    code: row.code,
    ownerUserId: row.owner_user_id,
    firmId: row.firm_id,
    titleAr: row.title_ar,
    descriptionAr: row.description_ar,
    sourceAr: row.source_ar,
    triggerKind: row.trigger_kind,
    periodDays: row.period_days,
    calendar: row.calendar,
    countFromNextDay: row.count_from_next_day,
    rollForwardIfHoliday: row.roll_forward_if_holiday,
    appliesToDegrees: row.applies_to_degrees ?? [],
    isPlatformDefault: row.is_platform_default,
    verifiedByOwner: row.verified_by_owner,
    verifiedAt: row.verified_at,
    active: row.active,
  };
}

const RULE_SELECT =
  "id, code, owner_user_id, firm_id, title_ar, description_ar, source_ar, trigger_kind, period_days, calendar, count_from_next_day, roll_forward_if_holiday, applies_to_degrees, is_platform_default, verified_by_owner, verified_at, active";

function dbErrorResponse(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code;
  if (code === "23505") return { status: 409, message: "تعارض في حفظ القاعدة." };
  if (code === "23514") return { status: 400, message: "بيانات القاعدة غير صالحة." };
  if (code === "42501") return { status: 403, message: "غير مصرح لك بهذا الإجراء." };
  return { status: 500, message: "تعذّر تحديث القاعدة." };
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, userType, supabase } = auth;
    const { id } = await context.params;

    const body = (await request.json()) as { verifiedByOwner?: boolean };
    if (typeof body.verifiedByOwner !== "boolean") {
      return NextResponse.json({ error: "verifiedByOwner مطلوب (true/false)." }, { status: 400 });
    }

    const { data: existing, error: fetchError } = await supabase
      .from("deadline_rules")
      .select("id, owner_user_id, firm_id")
      .eq("id", id)
      .maybeSingle();
    if (fetchError) {
      console.error("[deadline-rules/[id] PATCH] lookup failed:", fetchError.message, fetchError.code);
    }
    if (!existing) {
      return NextResponse.json({ error: "القاعدة غير موجودة" }, { status: 404 });
    }

    if (existing.owner_user_id === null) {
      if (userType !== "admin") {
        return NextResponse.json({ error: "اعتماد القواعد الافتراضية لصاحب المنصّة فقط" }, { status: 403 });
      }
    } else if (existing.owner_user_id !== user.id && userType !== "admin") {
      // Not the creating user or an admin — a firm colleague may still confirm
      // a firm-owned rule, matching the table's own RLS update policy
      // (can_access_case_row, which grants access via an active firm_members row).
      let firmAuthorized = false;
      if (existing.firm_id) {
        const { data: membership, error: membershipError } = await supabase
          .from("firm_members")
          .select("firm_id")
          .eq("user_id", user.id)
          .eq("status", "active")
          .eq("firm_id", existing.firm_id)
          .limit(1)
          .maybeSingle();
        if (membershipError) {
          console.error("[deadline-rules/[id] PATCH] firm_members lookup failed:", membershipError.message, membershipError.code);
        }
        firmAuthorized = !!membership;
      }
      if (!firmAuthorized) {
        return NextResponse.json({ error: "غير مصرح لك بهذا الإجراء." }, { status: 403 });
      }
    }

    const { data, error } = await supabase
      .from("deadline_rules")
      .update({
        verified_by_owner: body.verifiedByOwner,
        verified_at: body.verifiedByOwner ? new Date().toISOString() : null,
      })
      .eq("id", id)
      .select(RULE_SELECT)
      .single();

    if (error || !data) {
      const { status, message } = dbErrorResponse(error);
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ data: toDto(data as RuleRow) });
  } catch (err) {
    console.error("[deadline-rules/[id] PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
