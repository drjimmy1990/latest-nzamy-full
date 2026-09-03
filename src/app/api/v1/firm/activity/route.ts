import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { describeActivityEvent } from "@/lib/events";

/**
 * GET /api/v1/firm/activity
 *
 * Backs /dashboard/firm/activity, which used to render a five-row literal
 * array (`EVENTS` — fabricated actors like «الشريك المدير», «مدير القسم»)
 * with its own toast admitting it: "هذه أحداث mock/local فقط حتى ربط
 * AdminAuditEvent وFirmAuditEvent". `activity_events` (Phase 1,
 * migration 20260903_phase1_case_tables.sql) IS that table now.
 *
 * Firm-wide, not personal: `firm_id` is resolved from `firm_profiles.
 * owner_user_id = caller`, not the `firm_members` lookup the lawyer-side
 * hearings/tasks routes use — this page is reached by the FIRM ACCOUNT
 * (UserTypeGuard allowedTypes=["firm","admin"] on /dashboard/firm/layout.tsx),
 * not by an individual lawyer who happens to belong to one.
 *
 * A caller with no firm row (should not happen behind the guard, but not
 * asserted) gets an empty feed, not an error — same "genuinely empty, not
 * unreadable" distinction every other list route in this codebase makes.
 */

const PAGE_SIZE = 30;

interface FirmActivityRow {
  id: number;
  kind: string;
  actor_name: string | null;
  case_request_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await assertRole(["firm", "admin"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const { data: firm, error: firmError } = await supabase
      .from("firm_profiles")
      .select("id")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (firmError) {
      console.error("[firm/activity GET] firm_profiles lookup failed:", firmError.message);
      return NextResponse.json({ error: firmError.message }, { status: 500 });
    }

    if (!firm) {
      // No firm row for this account — a real state (nothing to show yet),
      // not a failure. Same contract as an empty list anywhere else here.
      return NextResponse.json({ items: [] });
    }

    const rawBefore = request.nextUrl.searchParams.get("before");
    const before = rawBefore && !Number.isNaN(Date.parse(rawBefore)) ? rawBefore : null;

    let query = supabase
      .from("activity_events")
      .select("id, kind, actor_name, case_request_id, payload, created_at")
      .eq("firm_id", firm.id);
    if (before) query = query.lt("created_at", before);

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE)
      .returns<FirmActivityRow[]>();

    if (error) {
      console.error("[firm/activity GET] activity_events query failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    const items = rows.map((row) => {
      const described = describeActivityEvent({ kind: row.kind, payload: row.payload });
      return {
        id: row.id,
        badge: described.badge,
        title: described.title,
        actorName: row.actor_name || null,
        caseHref: row.case_request_id ? `/dashboard/firm/cases/${row.case_request_id}` : null,
        createdAt: row.created_at,
      };
    });

    return NextResponse.json({
      items,
      nextCursor: rows.length === PAGE_SIZE ? rows[rows.length - 1].created_at : null,
    });
  } catch (err) {
    console.error("[firm/activity GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
