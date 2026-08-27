import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordEvent, namespaceEvent, RequestEvent } from "@/lib/events";

/**
 * How many timeline events one read returns.
 *
 * ── WHY A CAP WAS ADDED RATHER THAN REPORTED ────────────────────────────────
 *
 * This route had NO `.limit()` and NO `.range()` — it asked for every event on
 * a request. That is not the same as being uncapped: PostgREST enforces its
 * own `max-rows` on the hosted project, and when it trims a response it says
 * nothing. So the cap existed, it just lived somewhere this code could not see
 * or report, which is the worst of both.
 *
 * And the old query ordered `created_at` ASCENDING, so the rows an invisible
 * cap dropped were the NEWEST ones. A timeline does not look truncated when it
 * loses its tail — it looks finished. A reader would have concluded that
 * nothing had happened on the request since whatever the last surviving event
 * was.
 *
 * 500 is far above any real request's timeline (recordEvent writes one row per
 * status change, note and notification callback; the busiest order in the tree
 * carries a couple of dozen) and matches the ceiling /api/v1/lawyer/finance
 * already uses for the same "one practice cannot time the route out" reason.
 */
const EVENTS_PAGE = 500;

/**
 * GET /api/v1/service-requests/[id]/events — Get timeline events for a request.
 *
 * Returns `{ data, total }`, `data` oldest-first as it always was, `total` the
 * exact number of events on the request. Read newest-first and reversed, so
 * that a truncated read keeps the RECENT end of the timeline and loses the
 * ancient one — the opposite of what the unbounded query did. When nothing is
 * truncated the two orderings return the identical array, and `total` says
 * which case the caller is in.
 *
 * No caller exists in the tree today (nothing fetches this path — grep), so
 * there is no screen to put a notice on. `total` is here for the caller that
 * eventually arrives, so it cannot inherit an unreported cap.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: requestId } = await context.params;

  const { data, count, error } = await supabase
    .from("request_events")
    .select("*", { count: "exact" })
    .eq("request_id", requestId)
    // Newest first so the cap bites the oldest end, with the bigserial `id` as
    // the tie-break for two events written inside the same millisecond — the
    // same pair of keys /api/v1/admin/service-orders orders by, and without it
    // the reversal below would leave same-instant events in an arbitrary order
    // that could flip between reads.
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(EVENTS_PAGE);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    // Back to oldest-first: the shape callers read is a timeline, and only the
    // WHICH-rows question changed, not the order they arrive in.
    //
    // A non-array stays a non-array. `?? []` here would turn "the driver
    // returned no rows object" into "this request has no events" — the exact
    // substitution listRead.ts exists to stop — so the absence is passed
    // through and listFromApi() reads it as unreadable, as it should.
    data: Array.isArray(data) ? [...data].reverse() : data,
    total: typeof count === "number" ? count : null,
  });
}

/**
 * POST /api/v1/service-requests/[id]/events — Add an event to a request
 * Body: { event, details? }
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: requestId } = await context.params;
  const body = await request.json();

  if (!body.event) {
    return NextResponse.json(
      { error: "event is required" },
      { status: 400 },
    );
  }

  // Verify the request exists
  const { data: serviceRequest, error: reqError } = await supabase
    .from("service_requests")
    .select("id")
    .eq("id", requestId)
    .single();

  if (reqError || !serviceRequest) {
    return NextResponse.json(
      { error: "Service request not found" },
      { status: 404 },
    );
  }

  // F7 — record via the shared helper for a consistent insert shape. Force
  // namespacing through `namespaceEvent` so legacy free-text events (e.g.
  // `client_consultation_created`) are mapped to the canonical vocabulary
  // before being persisted. Unknown strings are still inserted (we never drop
  // audit data) but a warning is logged so unmapped events surface for triage.
  const namespaced = namespaceEvent(body.event, RequestEvent.SERVICE_REQUEST_CREATED);
  if (namespaced === body.event && !body.event.includes(".")) {
    console.warn(
      "[events POST] unmapped event string inserted verbatim — add it to namespaceEvent:",
      "event=", body.event,
      "request_id=", requestId,
    );
  }
  await recordEvent({
    supabase,
    requestId,
    event: namespaced,
    actorUserId: user.id,
    ...(typeof body.actor_name === "string" ? { actorName: body.actor_name } : {}),
  });

  // Re-fetch the latest event for this request so we can return the created row.
  const { data, error } = await supabase
    .from("request_events")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
