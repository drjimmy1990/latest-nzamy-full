import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { describeRequestEvent, type ActivityBadge } from "@/lib/events";

const PAGE_SIZE = 30;

/** One feed row, already rendered in Arabic — the client never sees a raw event token. */
interface ActivityItem {
  id: string;
  badge: ActivityBadge;
  title: string;
  description?: string;
  requestId: string | null;
  requestHref: string | null;
  requestTitle: string | null;
  serviceTitleAr: string | null;
  createdAt: string;
}

interface EmbeddedRequest {
  title: string | null;
  status: string | null;
  receiver: string | null;
  metadata: Record<string, unknown> | null;
}

interface EventRow {
  id: number;
  event: string;
  created_at: string;
  request_id: string | null;
  service_requests: EmbeddedRequest | null;
}

interface AuditRow {
  id: number;
  action: string;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
}

/**
 * PostgREST returns a many-to-one embed as an object, but the shape flips to a
 * single-element array when it can't prove the relationship is to-one. Accept
 * both so a schema-cache quirk can't blank out every service name.
 */
function firstEmbed(value: EmbeddedRequest | EmbeddedRequest[] | null): EmbeddedRequest | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

/**
 * GET /api/v1/lawyer/activity[?before=<ISO timestamp>]
 * Auth required (lawyer/firm/admin). Returns the unified activity feed for this
 * user: `{ items, stats, nextCursor }`. `before` is the `createdAt` of the last
 * row the client already holds (see `nextCursor`).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const uid = user.id;
    const participant = `requester_user_id.eq.${uid},assigned_to.eq.${uid}`;

    // Cursor pagination. A malformed `before` is ignored rather than rejected
    // so a stale bookmark still renders the first page. Rows sharing an exact
    // timestamp with the cursor are skipped — acceptable here, and the only
    // alternative (a keyset on (created_at, id)) needs a composite index.
    const rawBefore = request.nextUrl.searchParams.get("before");
    const before = rawBefore && !Number.isNaN(Date.parse(rawBefore)) ? rawBefore : null;

    // Scope by the REQUEST, not by who acted on it. Filtering on
    // `actor_user_id` was the whole bug: the admin console claims and delivers
    // as the ADMIN, so every pick-up and every delivery of this user's own
    // orders carried the admin's id and never reached him. Note the predicate
    // is an OR — `assigned_to` alone would be wrong (claiming reassigns it to
    // the admin), and `requester_user_id` alone would drop the work a lawyer
    // receives rather than raises.
    //
    // This is deliberately ONE query rather than a union of an actor query and
    // a requester query: two independently-limited streams merged and sliced
    // silently drop rows on page 2 onwards, because the cursor advances past
    // rows the slice discarded. It also loses nothing — the predicate here is
    // exactly the "participants read request events" policy
    // (20260518_client_workflow_backend_ready.sql), `request_events.request_id`
    // is NOT NULL with an FK to service_requests, so no readable row sits
    // outside it, and any event this user actored is on a request he
    // participates in by definition. RLS still enforces the same thing
    // independently: this is the RLS-bound client from assertRole, never a
    // service-role one.
    const eventFilter = supabase
      .from("request_events")
      .select(
        "id, event, created_at, request_id, service_requests!inner(title, status, receiver, metadata)",
      )
      .or(participant, { referencedTable: "service_requests" });
    const eventQuery = (before ? eventFilter.lt("created_at", before) : eventFilter)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE)
      .returns<EventRow[]>();

    // B6 — admin_audit_events uses `actor_id` (NOT actor_user_id). It has no
    // user-facing SELECT policy, so for a lawyer this is normally empty; it is
    // kept so the feed stays correct the day one is added.
    const auditFilter = supabase
      .from("admin_audit_events")
      .select("id, action, target_type, target_id, created_at")
      .eq("actor_id", uid);
    const auditQuery = (before ? auditFilter.lt("created_at", before) : auditFilter)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE)
      .returns<AuditRow[]>();

    // Four exact head-counts for the stat cards — nothing derived, nothing
    // estimated. Scoped with the same participant predicate as the feed, so a
    // lawyer who receives work rather than raising it still sees real numbers.
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const myRequests = () =>
      supabase
        .from("service_requests")
        .select("id", { count: "exact", head: true })
        .or(participant);

    const [eventRes, auditRes, monthRes, activeRes, completedRes, totalRes] = await Promise.all([
      eventQuery,
      auditQuery,
      myRequests().gte("created_at", monthStart),
      myRequests().in("status", ["pending_assignment", "assigned", "in_review"]),
      myRequests().eq("status", "completed"),
      myRequests(),
    ]);

    // A failed query here used to be invisible: `data` came back null and the
    // page rendered an empty feed with a 200. Log it instead.
    if (eventRes.error) {
      console.error("[lawyer/activity GET] request_events query failed:", eventRes.error.message);
    }
    if (auditRes.error) {
      console.error("[lawyer/activity GET] audit query failed:", auditRes.error.message);
    }

    const items: ActivityItem[] = [];

    for (const row of eventRes.data ?? []) {
      const sr = firstEmbed(row.service_requests);
      const serviceTitleAr =
        typeof sr?.metadata?.serviceTitleAr === "string" ? sr.metadata.serviceTitleAr : null;
      const described = describeRequestEvent({
        event: row.event,
        status: sr?.status ?? null,
        requestId: row.request_id,
        serviceTitleAr,
        requestTitle: sr?.title ?? null,
      });
      items.push({
        id: `event:${row.id}`,
        badge: described.badge,
        title: described.title,
        ...(described.description ? { description: described.description } : {}),
        requestId: row.request_id,
        // /ai/orders/[id] is the page that renders an ai_workspace order (and
        // the one /ai/orders already links to). Other receivers have no
        // verified destination, so those rows stay unlinked rather than
        // pointing somewhere that 404s.
        requestHref:
          row.request_id && sr?.receiver === "ai_workspace" ? `/ai/orders/${row.request_id}` : null,
        requestTitle: sr?.title ?? null,
        serviceTitleAr,
        createdAt: row.created_at,
      });
      // NOTE: `metadata` is read here and dropped — only serviceTitleAr leaves
      // this route, so the team's `metadata.internalNotes` never reaches the
      // client (same guarantee stripInternalNotes() gives the other read paths).
    }

    for (const row of auditRes.data ?? []) {
      items.push({
        id: `audit:${row.id}`,
        badge: "notice",
        // `action` is a free-text English admin label — never rendered.
        title: "إجراء إداري مسجَّل على حسابكم",
        requestId: row.target_type === "service_request" ? row.target_id : null,
        // An audit row is not proof the target is an ai_workspace order.
        requestHref: null,
        requestTitle: null,
        serviceTitleAr: null,
        createdAt: row.created_at,
      });
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const page = items.slice(0, PAGE_SIZE);

    return NextResponse.json({
      items: page,
      stats: {
        ordersThisMonth: monthRes.count ?? 0,
        ordersActive: activeRes.count ?? 0,
        ordersCompleted: completedRes.count ?? 0,
        ordersTotal: totalRes.count ?? 0,
      },
      // Only the events stream can actually page (the audit stream is empty
      // under RLS); stop once it stops returning a full page.
      nextCursor:
        (eventRes.data?.length ?? 0) === PAGE_SIZE && page.length > 0
          ? page[page.length - 1].createdAt
          : null,
    });
  } catch (err) {
    console.error("[lawyer/activity GET] Unexpected error:", err);
    return NextResponse.json({ items: [], stats: null, nextCursor: null });
  }
}
