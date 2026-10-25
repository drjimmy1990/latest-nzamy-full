import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { describeActivityEvent } from "@/lib/events";
import { hydrateAuthorNames, type CaseNoteRow } from "@/app/api/v1/cases/[id]/notes/_shared";
import { keepFirmMemberEvents, membershipKey } from "@/lib/activity/officeActivityScope";

/**
 * GET /api/v1/lawyer/activity/office[?actor=<uuid>&before=<ISO>]
 *
 * «نشاط المكتب وفريق العمل» — tab 2 of /dashboard/lawyer/activity (N3.7,
 * owner §٤٥ axes 1 and 4). The firm-wide activity_events of every firm the
 * caller is an ACTIVE member of. /api/v1/firm/activity is not reused: it
 * resolves the firm from firm_profiles.owner_user_id, so it serves the firm
 * account only, not a lawyer or assistant who belongs to a firm.
 *
 * Session client: activity_events' own policy (can_access_case_row(owner,
 * firm)) already limits rows to the caller's active firms; the membership
 * read below only tells "no firm" (→ { member: false }, the tab is hidden)
 * from "a firm with no activity yet".
 */

const PAGE_SIZE = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Row {
  id: number;
  kind: string;
  firm_id: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  case_request_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;

    const { data: memberships, error: memberError } = await supabase
      .from("firm_members")
      .select("firm_id")
      .eq("user_id", user.id)
      .eq("status", "active");
    if (memberError) {
      console.error("[lawyer/activity/office] membership read failed:", memberError.message, memberError.code);
      return NextResponse.json({ error: "تعذّر التحقق من عضويتك في المكتب." }, { status: 500 });
    }
    const firmIds = [...new Set(((memberships ?? []) as Array<{ firm_id: string }>).map((m) => m.firm_id))];
    if (firmIds.length === 0) return NextResponse.json({ member: false, members: [], data: [], nextCursor: null });

    // Only events whose ACTOR is an active member of the event's OWN firm. The
    // activity_events INSERT policy (20260903_phase1) checks actor/owner =
    // auth.uid() and nothing about firm_id, so any session can write a row
    // carrying another firm's firm_id. The query narrows on both lists; the
    // (firm, actor) pair test below is the rule — a member of firm A only
    // could otherwise plant a row under firm B for a reader of both.
    const { data: coMembers, error: coError } = await supabase
      .from("firm_members")
      .select("firm_id, user_id")
      .in("firm_id", firmIds)
      .eq("status", "active");
    if (coError) {
      console.error("[lawyer/activity/office] co-member read failed:", coError.message, coError.code);
      return NextResponse.json({ error: "تعذّر تحميل نشاط المكتب." }, { status: 500 });
    }
    const coRows = ((coMembers ?? []) as Array<{ firm_id: string; user_id: string }>).filter((m) => firmIds.includes(m.firm_id));
    const memberIds = [...new Set(coRows.map((m) => m.user_id))];
    const activePairs = new Set(coRows.map((m) => membershipKey(m.firm_id, m.user_id)));

    const actor = request.nextUrl.searchParams.get("actor");
    const rawBefore = request.nextUrl.searchParams.get("before");
    const before = rawBefore && !Number.isNaN(Date.parse(rawBefore)) ? new Date(Date.parse(rawBefore)).toISOString() : null;

    let query = supabase
      .from("activity_events")
      .select("id, kind, firm_id, actor_user_id, actor_name, case_request_id, payload, created_at")
      .in("firm_id", firmIds)
      .in("actor_user_id", memberIds);
    if (actor && UUID_RE.test(actor)) query = query.eq("actor_user_id", actor);
    if (before) query = query.lt("created_at", before);

    const { data, error } = await query.order("created_at", { ascending: false }).limit(PAGE_SIZE);
    if (error) {
      console.error("[lawyer/activity/office] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل نشاط المكتب." }, { status: 500 });
    }
    const page = (data ?? []) as Row[];
    const rows = keepFirmMemberEvents(page, activePairs);
    // Names for the rows AND for the «حسب العضو» filter (owner §٤٥ axis 4).
    const names = await hydrateAuthorNames(memberIds.map((id) => ({ author_user_id: id })) as unknown as CaseNoteRow[]);

    return NextResponse.json({
      member: true,
      members: memberIds
        .map((id) => ({ id, name: names.get(id) ?? null }))
        .filter((m): m is { id: string; name: string } => !!m.name)
        .sort((a, b) => a.name.localeCompare(b.name, "ar")),
      data: rows.map((r) => {
        const d = describeActivityEvent({ kind: r.kind, payload: r.payload });
        return {
          id: String(r.id),
          title: d.title,
          badge: d.badge,
          actorUserId: r.actor_user_id,
          actorName: (r.actor_user_id && names.get(r.actor_user_id)) || r.actor_name || null,
          caseRequestId: r.case_request_id,
          createdAt: r.created_at,
        };
      }),
      // The cursor follows the page as read, so a dropped row never ends paging early.
      nextCursor: page.length === PAGE_SIZE ? page[page.length - 1].created_at : null,
    });
  } catch (err) {
    console.error("[lawyer/activity/office] unexpected:", err);
    return NextResponse.json({ error: "تعذّر تحميل نشاط المكتب." }, { status: 500 });
  }
}
