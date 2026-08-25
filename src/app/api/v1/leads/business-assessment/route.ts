import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { recordEvent, RequestEvent } from "@/lib/events";
import {
  MAX_BODY_BYTES,
  buildLeadRow,
  isHoneypotTripped,
  leadReference,
  validateBusinessLead,
} from "./lead";

/**
 * POST /api/v1/leads/business-assessment — the «التقييم القانوني المجاني» lead.
 *
 * WHY THIS ROUTE EXISTS AT ALL, INSTEAD OF POSTING TO /api/v1/service-requests
 * /services/business is a public page and this is its primary call to action,
 * used twice on it. POST /api/v1/service-requests returns 401 without a session
 * and derives `requester_user_id` from `auth.uid()`, so routing the form there
 * would mean "register before we assess you for free" — which is not a lead at
 * all, it is a signup wall wearing a lead's clothes. The form previously
 * discarded everything it collected; making it require an account would have
 * traded one lost lead for another.
 *
 * A public write endpoint pays for that with care, all of it here:
 *   • Nothing from the body reaches the database. `validateBusinessLead` returns
 *     a fresh whitelist-built object and `buildLeadRow` builds the row from it,
 *     so `status`, `receiver`, `payment` and `requester_user_id` are set here
 *     and can never be supplied by the caller (asserted in ./lead.test.ts).
 *   • Every string is length-capped, and the body is size-capped before it is
 *     even read.
 *   • A honeypot field plus a per-IP rate limit (both below).
 *   • It never reveals whether an address already has an account: no lookup
 *     against `profiles` or `auth.users` happens anywhere in this file, and the
 *     success response is byte-identical whoever submits.
 *
 * The row is written with the SERVICE-ROLE client because `service_requests`
 * has no INSERT policy that an anonymous caller could satisfy — the same reason
 * /api/v1/contact uses it. That makes the whitelist above load-bearing rather
 * than belt-and-braces: RLS is not standing behind it.
 */

/**
 * Best-effort per-IP throttle: 5 submissions per 10 minutes.
 *
 * Stated plainly so nobody mistakes it for more than it is: this Map lives in
 * ONE server instance's memory. It resets on deploy and is not shared between
 * instances, so on a multi-instance deployment the real ceiling is 5 × the
 * number of instances. It is abuse friction — enough to stop a naive script
 * hammering one endpoint — and NOT a security boundary. The durable protection
 * is the whitelist and the length caps above, which hold no matter how many
 * requests arrive. A real limiter belongs in shared storage or at the edge; see
 * `skipped`.
 */
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const recentByIp = new Map<string, number[]>();

/**
 * The caller's address, or null when no proxy header carries one.
 *
 * null, NOT a `"unknown"` placeholder. A placeholder is a single shared bucket:
 * every unidentifiable visitor would count against the same five submissions,
 * turning the limiter into a global 5-per-10-minutes cap that starts rejecting
 * genuine leads on the very page whose defect was losing leads. An
 * unidentifiable caller is therefore not throttled at all — the whitelist and
 * the length caps, which do not depend on identifying anyone, still apply.
 */
function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || null;
}

/** Returns true when this IP has already spent its allowance. */
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (recentByIp.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (hits.length >= RATE_LIMIT_MAX) {
    recentByIp.set(ip, hits);
    return true;
  }

  hits.push(now);
  recentByIp.set(ip, hits);

  // Opportunistic sweep so the Map cannot grow without bound on a long-lived
  // instance being scanned from many addresses.
  if (recentByIp.size > 5000) {
    for (const [key, times] of recentByIp) {
      if (times.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) recentByIp.delete(key);
    }
  }

  return false;
}

export async function POST(request: NextRequest) {
  try {
    const ip = clientIp(request);
    if (ip && isRateLimited(ip)) {
      return NextResponse.json(
        { error: "تم استلام عدة طلبات من نفس الجهاز. انتظر قليلاً ثم حاول مرة أخرى." },
        { status: 429 },
      );
    }

    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "حجم الطلب كبير جداً." }, { status: 413 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "تعذّر قراءة بيانات الطلب." }, { status: 400 });
    }

    // A tripped honeypot is answered with a plain 400, NOT with a fabricated
    // "success" the way the usual bot-silencing recipe suggests. Reporting a
    // success that never happened is the exact defect this whole change
    // removes, and it costs a real visitor nothing: the field is off-screen and
    // unlabelled, so no human can fill it.
    if (isHoneypotTripped(body)) {
      console.error(`[business-assessment POST] honeypot tripped ip=${ip ?? "(unresolved)"}`);
      return NextResponse.json({ error: "تعذّر إرسال الطلب، حاول مرة أخرى." }, { status: 400 });
    }

    const check = validateBusinessLead(body);
    if (!check.ok) {
      return NextResponse.json({ error: check.errors.join(" ") }, { status: 400 });
    }

    // If the visitor happens to be signed in, tie the lead to their account so
    // it shows up in «طلباتي» and they can follow it. Best-effort and never
    // fatal: the overwhelmingly common case on a public marketing page is no
    // session at all, and `service_requests.requester_user_id` is nullable
    // (20260518_client_workflow_backend_ready.sql).
    let requesterUserId: string | null = null;
    try {
      const userClient = await createClient();
      const { data } = await userClient.auth.getUser();
      requesterUserId = data.user?.id ?? null;
    } catch {
      requesterUserId = null;
    }

    const id = crypto.randomUUID();
    const row = buildLeadRow(check.value, {
      id,
      requesterUserId,
      sourcePath: "/services/business",
    });

    const admin = await createServiceClient();
    const { error } = await admin.from("service_requests").insert(row);

    if (error) {
      console.error(
        "[business-assessment POST] Supabase error:",
        error.message,
        error.details,
        error.hint,
        error.code,
      );
      // The client is told plainly that nothing was saved. It must never be
      // shown the confirmation screen on this branch.
      return NextResponse.json(
        { error: "تعذّر إرسال طلبك، حاول مرة أخرى أو تواصل معنا مباشرة." },
        { status: 500 },
      );
    }

    // Audit trail, same event vocabulary every other order uses. Best-effort by
    // construction — recordEvent swallows its own failures (see src/lib/events.ts)
    // — so a lost event can never undo a saved lead.
    await recordEvent({
      supabase: admin,
      requestId: id,
      event: RequestEvent.SERVICE_REQUEST_CREATED,
      actorName: check.value.contactName,
    });

    return NextResponse.json({ success: true, reference: leadReference(id) }, { status: 201 });
  } catch (err) {
    console.error("[business-assessment POST] Unexpected error:", err);
    return NextResponse.json(
      { error: "تعذّر إرسال طلبك، حاول مرة أخرى أو تواصل معنا مباشرة." },
      { status: 500 },
    );
  }
}
