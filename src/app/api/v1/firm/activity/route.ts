import { NextResponse, type NextRequest } from "next/server";
import { DB_ERROR_AR } from "@/lib/api/dbError";
import { assertRole } from "@/lib/auth/assertRole";
import { describeActivityEvent, type ActivityBadge } from "@/lib/events";
import { aiRunActivityItem, readAiRunActivity, type AiRunActivityRow } from "@/lib/ai/aiRunActivity";
import { mergeActivityPage } from "@/lib/activity/activityPage";

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
 *
 * Owner answer ٤٤٤ part 1 (2026-11-08): the AI runs made by the FIRM ACCOUNT
 * itself show here too — `ai_runs` rows with `user_id = <this account>`, read
 * through the session client (the "own ai runs" policy, 20261027_10) by the
 * same readAiRunActivity() the lawyer log uses. Runs made by the firm's
 * MEMBERS are NOT merged in: each stays in that member's own log (merging is
 * the later item «23»). So the read below is keyed on `user.id`, never on the
 * firm's member list. A failed AI read degrades (`degraded: true`) instead of
 * failing the hearings/tasks feed.
 */

const PAGE_SIZE = 30;

interface FirmFeedItem {
  id: number | string;
  badge: ActivityBadge;
  title: string;
  description?: string;
  actorName: string | null;
  caseHref: string | null;
  href: string | null;
  createdAt: string;
}

function firmAiRunItem(row: AiRunActivityRow): FirmFeedItem {
  const item = aiRunActivityItem(row);
  return {
    id: item.id,
    badge: item.badge,
    title: item.title,
    ...(item.description ? { description: item.description } : {}),
    actorName: null,
    caseHref: null,
    href: item.requestHref,
    createdAt: item.createdAt,
  };
}

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

    const rawBefore = request.nextUrl.searchParams.get("before");
    const before = rawBefore && !Number.isNaN(Date.parse(rawBefore)) ? rawBefore : null;

    // The firm account's OWN runs — user.id, never a member's (owner ٤٤٤).
    const aiRes = await readAiRunActivity(supabase, user.id, before, PAGE_SIZE);
    const aiItems = aiRes.rows.map(firmAiRunItem);

    const { data: firm, error: firmError } = await supabase
      .from("firm_profiles")
      .select("id")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (firmError) {
      console.error("[firm/activity GET] firm_profiles lookup failed:", firmError.message);
      return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
    }

    if (!firm) {
      // No firm row for this account — a real state (nothing to show yet),
      // not a failure. Same contract as an empty list anywhere else here.
      // The account's own AI runs exist with or without that row.
      const { page, nextCursor } = mergeActivityPage([{ items: aiItems, full: aiRes.rows.length === PAGE_SIZE }], PAGE_SIZE);
      return NextResponse.json({ items: page, degraded: aiRes.degraded, nextCursor });
    }

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
      return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
    }

    const rows = data ?? [];
    const eventItems: FirmFeedItem[] = rows.map((row) => {
      const described = describeActivityEvent({ kind: row.kind, payload: row.payload });
      const caseHref = row.case_request_id ? `/dashboard/firm/cases/${row.case_request_id}` : null;
      return {
        id: row.id,
        badge: described.badge,
        title: described.title,
        actorName: row.actor_name || null,
        caseHref,
        href: caseHref,
        createdAt: row.created_at,
      };
    });
    // Two streams merged: the next page exists when either came back full OR
    // the merge itself overflowed the page (two half-full streams), and the
    // cursor never skips or repeats a row of either (src/lib/activity/
    // activityPage.ts) — the same helper as /api/v1/lawyer/activity.
    const { page, nextCursor } = mergeActivityPage(
      [
        { items: eventItems, full: rows.length === PAGE_SIZE },
        { items: aiItems, full: aiRes.rows.length === PAGE_SIZE },
      ],
      PAGE_SIZE,
    );

    return NextResponse.json({ items: page, degraded: aiRes.degraded, nextCursor });
  } catch (err) {
    console.error("[firm/activity GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
