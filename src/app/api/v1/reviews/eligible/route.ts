import { NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/reviews/eligible — the caller's own completed, assigned
 * requests that have no review yet. A left-anti-join done as two queries: the
 * candidate requests (RLS-scoped, "own" pinned by `requester_user_id`), then
 * which of those ids already carry a review (RLS already restricts that read
 * to `status = 'active'` rows — see the caveat in ../mine/route.ts — which is
 * exactly right here TODAY: POST always inserts `active`, so any review row
 * that exists for one of these ids IS visible and excludes it).
 *
 * KNOWN GAP, not just a symmetry note: unlike ../mine/route.ts (where the
 * status gap only HIDES a row from its own subject), here it would produce a
 * WRONG list. If a review's status is ever moved off `active` (no code path
 * does this yet — no moderation feature exists), this anti-join stops seeing
 * it, the request it belongs to reappears here as "still eligible", and a
 * client who picks it back up gets a 409 from POST /api/v1/reviews (`uq_reviews_request`
 * has no status predicate — the DB still considers that request reviewed).
 */

interface EligibleRow {
  id: string;
  assigned_to: string;
  title: string;
  updated_at: string;
}

export async function GET() {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const { data, error } = await supabase
      .from("service_requests")
      .select("id, assigned_to, title, updated_at")
      .eq("requester_user_id", user.id)
      .eq("status", "completed")
      .not("assigned_to", "is", null)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[reviews/eligible GET] service_requests query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل الطلبات القابلة للتقييم." }, { status: 500 });
    }

    const rows = (data ?? []) as EligibleRow[];
    if (rows.length === 0) {
      return NextResponse.json({ data: [], total: 0 });
    }

    const requestIds = rows.map((r) => r.id);
    const { data: reviewed, error: reviewedErr } = await supabase
      .from("reviews")
      .select("request_id")
      .in("request_id", requestIds);

    if (reviewedErr) {
      console.error("[reviews/eligible GET] reviews query failed:", reviewedErr.message, reviewedErr.code);
      return NextResponse.json({ error: "تعذّر تحميل الطلبات القابلة للتقييم." }, { status: 500 });
    }

    const reviewedIds = new Set((reviewed ?? []).map((r) => r.request_id as string));
    const pending = rows.filter((r) => !reviewedIds.has(r.id));

    if (pending.length === 0) {
      return NextResponse.json({ data: [], total: 0 });
    }

    const lawyerIds = [...new Set(pending.map((r) => r.assigned_to))];
    const admin = await createServiceClient();
    const { data: lawyers, error: lawyersErr } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", lawyerIds);
    if (lawyersErr) {
      console.error("[reviews/eligible GET] lawyer names lookup failed:", lawyersErr.message, lawyersErr.code);
    }
    const nameMap = new Map((lawyers ?? []).map((l) => [l.id, l.display_name as string | null]));

    const result = pending.map((r) => ({
      requestId: r.id,
      lawyerUserId: r.assigned_to,
      lawyerName: nameMap.get(r.assigned_to) ?? "محامٍ",
      titleAr: r.title,
      // service_requests has no completed_at column (see the explicit
      // warning at src/app/api/v1/service-requests/[id]/route.ts:30 that
      // `updated_at` is NOT a substitute for a real event timestamp). It is
      // the best available signal here — the PATCH route that transitions a
      // request to `completed` does set `updated_at` at that moment — but it
      // is not guaranteed never to move again afterward for an unrelated
      // reason. A precise value would mean reading `request_events` for the
      // completion event instead; not done here to keep this to one query.
      completedAt: r.updated_at,
    }));

    return NextResponse.json({ data: result, total: result.length });
  } catch (err) {
    console.error("[reviews/eligible GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل الطلبات القابلة للتقييم." }, { status: 500 });
  }
}
