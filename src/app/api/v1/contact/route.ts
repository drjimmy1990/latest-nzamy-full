import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { validateContactPayload } from "./_validate";

/**
 * POST /api/v1/contact — Public contact / partner intake.
 *
 * Accepts { name, email, phone?, subject?, message, kind? } and inserts a row
 * into public.contact_messages via the service-role client (the table has a
 * public insert policy too, but we use service-role so the write never depends
 * on the caller's session and to keep the payload shape locked server-side).
 *
 * Contract (UAT-CONTACT-001) — enforced by `validateContactPayload` in
 * `./_validate.ts`:
 *   `email` and `message` required · `email` must match the shared e-mail regex
 *   · `phone` OPTIONAL, but a non-empty value must be a Saudi mobile and is
 *   stored/forwarded as E.164 (`+9665XXXXXXXX`), never as typed · `name` ≤ 120,
 *   `subject` ≤ 200, `message` ≤ 5000 characters (after trimming).
 *   400 { error: "<Arabic>" } on any failure · 200 { success: true } otherwise.
 *
 * Best-effort: after a successful insert, if N8N_WEBHOOK_BASE_URL is set, POSTs
 * the message to `${base}/contact` for the notification workflow. That call is
 * wrapped in try/catch and never fails the request.
 *
 * The contact_messages table may not yet exist on the remote DB — on insert
 * error we log and still return an error status, but any unexpected throw is
 * caught and reported cleanly.
 */
export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Required fields, e-mail shape, optional-but-well-formed Saudi mobile and
    // the length caps all live in `_validate.ts` so they can be unit-tested
    // without a request object. UAT-CONTACT-001.
    const validation = validateContactPayload(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { name, email, phoneE164, subject, message, kind } = validation.value;

    const supabase = await createServiceClient();
    const { error } = await supabase.from("contact_messages").insert({
      name: name || null,
      email,
      phone: phoneE164,
      subject: subject || null,
      message,
      kind,
      status: "new",
      metadata: {},
    });

    if (error) {
      console.error(
        "[contact POST] Supabase error:",
        error.message,
        error.details,
        error.hint,
        error.code,
      );
      return NextResponse.json(
        { error: "تعذّر إرسال رسالتك، حاول مرة أخرى" },
        { status: 500 },
      );
    }

    // Best-effort push to n8n (inert unless N8N_WEBHOOK_BASE_URL is set). Never
    // fails the request.
    const base = process.env.N8N_WEBHOOK_BASE_URL;
    if (base) {
      try {
        await fetch(`${base.replace(/\/$/, "")}/contact`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name || null,
            email,
            phone: phoneE164,
            subject: subject || null,
            message,
            kind,
            timestamp: new Date().toISOString(),
          }),
        });
      } catch (e) {
        console.error(
          "[contact POST] n8n dispatch failed:",
          (e as Error).message,
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[contact POST] Unexpected error:", err);
    return NextResponse.json(
      { error: "تعذّر إرسال رسالتك، حاول مرة أخرى" },
      { status: 500 },
    );
  }
}
