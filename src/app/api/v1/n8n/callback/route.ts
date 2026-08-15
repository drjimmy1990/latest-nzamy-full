import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { recordEvent } from "@/lib/events";

const VALID_STATUSES = new Set(["sent", "failed", "read"]);

/**
 * POST /api/v1/n8n/callback — n8n reports outbound delivery status.
 * Authenticated by the shared X-Webhook-Secret (the same value the app sends
 * outbound, see `src/lib/n8n/dispatch.ts`), NOT by a user session: n8n has no
 * session. Fails CLOSED — a missing/unset `N8N_WEBHOOK_SECRET` rejects every
 * call rather than accepting unauthenticated ones (an empty string is also
 * falsy, so `.env.example`'s default of `N8N_WEBHOOK_SECRET=` rejects too).
 *
 * `orderId` and `status` are only ever attributed to `request_events` via
 * `actorName: "n8n"` — there is no `actorUserId` because n8n is not an
 * `auth.users` row (see the note on `recordEvent` in `src/lib/events.ts`).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { orderId?: string; channel?: string; status?: string; messageId?: string; error?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  const status = typeof body.status === "string" ? body.status : "";
  const channel = typeof body.channel === "string" ? body.channel : "whatsapp";

  if (!orderId || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "orderId and a valid status are required" }, { status: 400 });
  }

  const admin = await createServiceClient();
  const { data: order } = await admin
    .from("service_requests").select("id").eq("id", orderId).maybeSingle();
  if (!order) return NextResponse.json({ error: "unknown order" }, { status: 404 });

  await recordEvent({
    supabase: admin,
    requestId: orderId,
    event: `notification.${channel}_${status}`,
    actorName: "n8n",
  });

  return NextResponse.json({ ok: true });
}
