import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertRole } from "@/lib/auth/assertRole";
import { bucketFirmMemberWorkload, type FirmMemberWorkloadCounts } from "@/lib/services/firmMemberWorkload";

/**
 * /api/v1/firm/members/workload — sibling of `../route.ts` and
 * `../[memberId]/route.ts` (see those files' headers for the table/RLS
 * shape). This route answers ONE question those don't: how much of the
 * firm's real work sits with each member right now.
 *
 * Backs the rebuild of `team/[id]/page.tsx` and `team/workload/page.tsx`,
 * which used to render `MOCK_TEAM` — invented ratings, a gamified points
 * system, and `utilizationRate`/`deadlineAdherence` percentages nothing
 * measures. Every number this route returns comes from a count over an
 * RLS-visible table; see `@/lib/services/firmMemberWorkload` for exactly
 * which predicate backs each one, and — important — the documented gap in
 * `assignedRequests` (it under-counts by construction; read that file before
 * trusting the number in a UI copy).
 *
 * ── WHY ALL-OR-NOTHING ───────────────────────────────────────────────────
 * A member's three counts render together on both screens. If one of the
 * three source tables failed to read, returning the other two as real and
 * silently zeroing the third is exactly the `catch { return [] }` defect
 * `listRead.ts` exists to end — a lawyer with hearings the query for some
 * reason couldn't reach must not read «٠ جلسات قادمة». So this route fails
 * the WHOLE response (`{ error }`, not `{ data: [...] }` with a hole in it)
 * the moment any one of the three reads errors, and the two screens show
 * every number as unreadable together rather than mixing real and invented
 * zeros in the same row.
 *
 * GET only — this route computes, it does not write.
 * Response: `{ data: FirmMemberWorkloadCounts[], total }`, one entry per
 * `firm_members` row in the caller's own firm (active, invited, suspended —
 * same set `GET /api/v1/firm/members` returns), all-zero where nothing
 * matched.
 */

/** Same predicate `/api/v1/lawyer/dashboard/summary`'s `saudiToday()` uses. */
function saudiToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Duplicated from `../route.ts` on purpose — see that file's own copy. */
async function resolveOwnFirm(supabase: SupabaseClient, userId: string) {
  return supabase
    .from("firm_profiles")
    .select("id, owner_user_id")
    .eq("owner_user_id", userId)
    .maybeSingle();
}

// Same order of magnitude as `/api/v1/lawyer/tasks`'s own cap
// (`Math.min(limitParam, 1000)`) — chosen to stay under PostgREST's
// `db-max-rows`, which truncates a `.limit()` above it SILENTLY (no error,
// just fewer rows than asked for). A truncated LIST at least gets a
// truncation notice from `total`; a truncated COUNT has nothing to compare
// against and would just be a wrong number displayed as a right one — see
// the `=== ROW_LIMIT` check below, which turns that silent case into an
// honest failure instead.
const ROW_LIMIT = 1000;

export async function GET(_request: NextRequest) {
  try {
    const auth = await assertRole(["firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const { data: firm, error: firmError } = await resolveOwnFirm(supabase, user.id);
    if (firmError) {
      console.error("[firm/members/workload GET] firm_profiles lookup failed:", firmError.message, firmError.code);
      return NextResponse.json({ error: "تعذّر تحميل أعباء عمل الفريق." }, { status: 500 });
    }
    if (!firm) {
      return NextResponse.json({ error: "لا يوجد مكتب مرتبط بهذا الحساب." }, { status: 404 });
    }

    const { data: memberRows, error: membersError } = await supabase
      .from("firm_members")
      .select("id, user_id")
      .eq("firm_id", firm.id);
    if (membersError) {
      console.error("[firm/members/workload GET] firm_members query failed:", membersError.message, membersError.code);
      return NextResponse.json({ error: "تعذّر تحميل أعباء عمل الفريق." }, { status: 500 });
    }
    const members = (memberRows ?? []) as { id: string; user_id: string }[];
    if (members.length === 0) {
      return NextResponse.json({ data: [], total: 0 });
    }

    const today = saudiToday();

    const [tasksRes, hearingsRes, requestsRes] = await Promise.all([
      supabase.from("tasks").select("owner_user_id, status").eq("firm_id", firm.id).limit(ROW_LIMIT),
      supabase.from("hearings").select("owner_user_id, status, hearing_date").eq("firm_id", firm.id).limit(ROW_LIMIT),
      supabase.from("service_requests").select("assigned_to").eq("firm_id", firm.id).not("assigned_to", "is", null).limit(ROW_LIMIT),
    ]);

    if (tasksRes.error) {
      console.error("[firm/members/workload GET] tasks query failed:", tasksRes.error.message, tasksRes.error.code);
      return NextResponse.json({ error: "تعذّر تحميل أعباء عمل الفريق." }, { status: 500 });
    }
    if (hearingsRes.error) {
      console.error("[firm/members/workload GET] hearings query failed:", hearingsRes.error.message, hearingsRes.error.code);
      return NextResponse.json({ error: "تعذّر تحميل أعباء عمل الفريق." }, { status: 500 });
    }
    if (requestsRes.error) {
      console.error("[firm/members/workload GET] service_requests query failed:", requestsRes.error.message, requestsRes.error.code);
      return NextResponse.json({ error: "تعذّر تحميل أعباء عمل الفريق." }, { status: 500 });
    }

    // A read that came back with EXACTLY `ROW_LIMIT` rows may have been
    // truncated by PostgREST's own row cap — silently, with no error and no
    // `total` to compare against, unlike a paginated list. Answering with a
    // count built from a truncated read would be a wrong number presented as
    // a right one, so this fails the whole response instead, same as an
    // actual query error above.
    if (
      (tasksRes.data?.length ?? 0) === ROW_LIMIT ||
      (hearingsRes.data?.length ?? 0) === ROW_LIMIT ||
      (requestsRes.data?.length ?? 0) === ROW_LIMIT
    ) {
      console.error("[firm/members/workload GET] a read hit ROW_LIMIT — counts would be truncated, refusing to answer with them");
      return NextResponse.json({ error: "تعذّر تحميل أعباء عمل الفريق." }, { status: 500 });
    }

    const data: FirmMemberWorkloadCounts[] = bucketFirmMemberWorkload(
      members,
      {
        tasks: (tasksRes.data ?? []) as { owner_user_id: string | null; status: string }[],
        hearings: (hearingsRes.data ?? []) as { owner_user_id: string | null; status: string; hearing_date: string }[],
        requests: (requestsRes.data ?? []) as { assigned_to: string | null }[],
      },
      today,
    );

    return NextResponse.json({ data, total: data.length });
  } catch (err) {
    console.error("[firm/members/workload GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل أعباء عمل الفريق." }, { status: 500 });
  }
}
