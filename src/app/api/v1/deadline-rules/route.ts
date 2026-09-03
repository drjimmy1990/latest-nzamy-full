import { NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";

/**
 * /api/v1/deadline-rules — Phase 5 (رادار المهل).
 *
 * Backed by `public.deadline_rules` (migration 20260904_phase5_deadline_radar.sql):
 * platform defaults (`owner_user_id` null, readable by any signed-in user)
 * plus a lawyer's/firm's own overrides. RLS decides what a caller sees; this
 * route never adds its own scoping on top. Every seeded platform rule ships
 * `verified_by_owner = false` — a caller MUST render «قاعدة افتراضية — تحتاج
 * مراجعتك» beside any rule this list returns with that flag false; this
 * route only reports it honestly, it never launders it.
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

/**
 * GET /api/v1/deadline-rules → { data: DeadlineRule[], total }
 * Every rule RLS returns for this caller (platform + own/firm), active
 * first, ordered by code.
 */
export async function GET() {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const { data, error, count } = await supabase
      .from("deadline_rules")
      .select(RULE_SELECT, { count: "exact" })
      .order("active", { ascending: false })
      .order("code", { ascending: true });

    if (error) {
      console.error("[deadline-rules GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل قواعد المهل." }, { status: 500 });
    }

    const rows = (data ?? []) as RuleRow[];
    return NextResponse.json({ data: rows.map(toDto), total: count ?? rows.length });
  } catch (err) {
    console.error("[deadline-rules GET] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
