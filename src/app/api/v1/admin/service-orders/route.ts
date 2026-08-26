import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";

/**
 * Task 7 (owner س١١) — the only evidence the app ever has that an outbound
 * notice reached the client is the n8n callback
 * (`src/app/api/v1/n8n/callback/route.ts`), which writes
 * `notification.${channel}_${status}` into `request_events`. That table has NO
 * metadata column (see `src/lib/events.ts`), so the event NAME is the entire
 * signal and the channel has to be read off the prefix.
 *
 * Only the WhatsApp channel is surfaced here because the admin UI names
 * WhatsApp explicitly; a future `notification.sms_*` row must never be
 * rendered under a WhatsApp label.
 */
const WHATSAPP_EVENT_PREFIX = "notification.whatsapp_";

/**
 * GET /api/v1/admin/service-orders — the AI service fulfillment queue.
 * Query: ?status=pending_assignment|in_review|completed|cancelled  ?service=draft|...
 * service_requests has no admin RLS policy, so this uses the service-role
 * client behind requireAdmin().
 *
 * Each row also carries `whatsappNotice`: the latest WhatsApp delivery status
 * n8n reported back for that ORDER, or `null` when nothing ever reported back.
 *
 * It is deliberately raw: it carries NO indication of which outbound message
 * it answers, because the callback cannot say. Its body is
 * orderId/channel/status and `request_events` has no metadata column to hold
 * more, while every order gets an intake dispatch at creation
 * (`service_request.created` → /new-request) on top of any later one. A
 * consumer that wants to claim a specific message reached the client must
 * therefore check `at` against that message's own timestamp first — the admin
 * queue compares it with `metadata.deliverable.deliveredAt` and shows the
 * no-claim state whenever the confirmation does not postdate it. Rendering
 * this field as a bare "sent ✓" would attribute an intake confirmation to
 * whatever the reader happens to be looking at.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.isAdmin) {
    return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const service = searchParams.get("service");
  // Owner item ١٣ — «كل واحد يشوف اللي عليه». `unassigned` is a real value,
  // not the absence of the parameter: the queue needs a chip for «غير موجّه»
  // (the work nobody has taken yet) that is distinct from «الكل».
  const assignee = searchParams.get("assignee");

  const admin = await createServiceClient();
  let query = admin
    .from("service_requests")
    .select("*")
    .eq("receiver", "ai_workspace")
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);
  if (service) query = query.eq("metadata->>service", service);
  if (assignee === "unassigned") query = query.is("assigned_to", null);
  else if (assignee) query = query.eq("assigned_to", assignee);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // No PostgREST FK from service_requests to profiles — enrich separately.
  //
  // One query for BOTH sides of the row: the client who asked (requester_user_id)
  // and the team member it was routed to (assigned_to). Resolving the assignee
  // separately would double the round-trips for no reason, and leaving it
  // unresolved would print a raw UUID on the card — the same failure the
  // Arabic label map exists to prevent.
  const orders = rows ?? [];
  const userIds = [
    ...new Set(
      [
        ...orders.map((o) => o.requester_user_id),
        ...orders.map((o) => o.assigned_to),
      ].filter(Boolean),
    ),
  ] as string[];
  let profileMap = new Map<string, Record<string, unknown>>();
  if (userIds.length > 0) {
    const { data: profs } = await admin
      .from("profiles").select("id, display_name, email, phone, user_type").in("id", userIds);
    profileMap = new Map((profs ?? []).map((p) => [p.id as string, p]));
  }

  /**
   * The name to put on the card for a routed order. Many admin profiles carry
   * no display_name at all, so it degrades name → email → the id itself
   * rather than to an empty string: an order routed to someone unnamed still
   * has to read as routed.
   */
  function assigneeLabel(userId: unknown): { id: string; name: string } | null {
    if (typeof userId !== "string" || !userId) return null;
    const p = profileMap.get(userId);
    const name =
      (typeof p?.display_name === "string" && p.display_name.trim()) ||
      (typeof p?.email === "string" && p.email.trim()) ||
      userId;
    return { id: userId, name };
  }

  // Task 7 — same shape as the profiles enrichment above and for the same
  // reason: ONE query for every visible order, never one per order. This queue
  // renders up to 200 rows (the .limit(200) above), so per-row lookups would
  // be 200 round-trips.
  //
  // `.in()` is safe at this size: 200 ids is well under the point where the
  // PostgREST query string starts getting truncated.
  const requestIds = orders.map((o) => String(o.id));
  const noticeMap = new Map<string, { status: string; at: string }>();
  if (requestIds.length > 0) {
    const { data: events, error: eventsError } = await admin
      .from("request_events")
      .select("id, request_id, event, created_at")
      .in("request_id", requestIds)
      .like("event", "notification.%")
      // Newest first, with the bigserial id as the tie-break for two events
      // written inside the same millisecond. `id` is only ever used to order
      // here — it is a bigserial and arrives as a JSON number, never a string.
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(2000);

    if (eventsError) {
      // Deliberately NOT a 500: losing this lookup must not take the whole
      // queue down. The order then falls back to the "no confirmation yet"
      // state, which asserts nothing — a lost lookup can never read as a
      // successful send. Same reasoning if the .limit() above ever truncates.
      console.error(
        "[admin service-orders] notification events lookup failed:",
        eventsError.message,
      );
    }

    for (const row of events ?? []) {
      const event = String(row.event ?? "");
      if (!event.startsWith(WHATSAPP_EVENT_PREFIX)) continue;
      const key = String(row.request_id ?? "");
      // Rows arrive newest-first, so the first one seen per order is the latest.
      if (!key || noticeMap.has(key)) continue;
      noticeMap.set(key, {
        status: event.slice(WHATSAPP_EVENT_PREFIX.length),
        at: String(row.created_at ?? ""),
      });
    }
  }

  return NextResponse.json({
    success: true,
    data: orders.map((o) => ({
      ...o,
      profile: profileMap.get(o.requester_user_id as string) ?? null,
      assignee: assigneeLabel(o.assigned_to),
      whatsappNotice: noticeMap.get(String(o.id)) ?? null,
    })),
  });
}
